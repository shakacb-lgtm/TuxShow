/**
 * TUXSHOW TIMELINE WORKER
 * The "Brain" of the operation. Offloads recursive cue evaluation, polling, 
 * and heavy mathematical interpolation from the main UI thread.
 */

let cues = [];
let oscValues = {};
let trackers = {};
let mainThreadTimeOffset = 0;
let sequenceTimers = {}; // NEW: Tracks active sequence containers
let hadActiveAnimates = false;

const evaluateCue = (cueId, currentCues, depth = 0) => {
    if (depth > 10) return [];
    const cue = currentCues.find(c => String(c.id) === String(cueId));
    if (!cue || cue.disabled) return [];

    if ((cue.type === 'audio' || cue.type === 'image') && cue.groupId && cue.state === 'playing') {
        const siblings = currentCues.filter(c => String(c.groupId) === String(cue.groupId));
        const myIndex = siblings.findIndex(c => String(c.id) === String(cue.id));
        const nextNonPlaying = siblings.slice(myIndex + 1).find(c => c.state !== 'playing');
        if (nextNonPlaying) return evaluateCue(nextNonPlaying.id, currentCues, depth + 1);
        return [];
    }

    if (cue.type === 'sequence') return [cue];

    if (cue.type === 'goto') {
        if (cue.gotoMode === 'random') {
            const val1 = parseFloat(cue.targetCueRangeMin); const val2 = parseFloat(cue.targetCueRangeMax);
            if (!isNaN(val1) && !isNaN(val2)) { const validCues = currentCues.filter(c => { const num = parseFloat(c.number); return !isNaN(num) && num >= Math.min(val1, val2) && num <= Math.max(val1, val2); }); if (validCues.length > 0) return evaluateCue(validCues[Math.floor(Math.random() * validCues.length)].id, currentCues, depth + 1); } return [];
        } else {
            const targetNum = String(cue.targetCueNumber || '').trim();
            if (!targetNum) return [];
            const target = currentCues.find(c => String(c.number) === targetNum);
            return target ? evaluateCue(target.id, currentCues, depth + 1) : [];
        }
    }
    if (cue.type === 'counter') return [cue]; 
    if (cue.type === 'conditional') {
        if (cue.conditionRunMode === 'continuous') return [cue];
        let conditionMet = false;
        if (cue.conditionType === 'osc-value') {
            const val = oscValues[cue.conditionOscPath];
            if (val !== undefined && val !== null && String(val) === String(cue.conditionOscValue)) conditionMet = true;
        } else {
            const targetNum = String(cue.conditionTargetCue || '').trim();
            const target = targetNum ? currentCues.find(c => String(c.number) === targetNum) : null;
            if (target && target.state === (cue.conditionState || 'playing')) conditionMet = true;
        }
        const nextNum = String(conditionMet ? (cue.trueTargetCue || '') : (cue.falseTargetCue || '')).trim();
        if (!nextNum) return [];
        const nextCue = currentCues.find(c => String(c.number) === nextNum);
        return nextCue ? evaluateCue(nextCue.id, currentCues, depth + 1) : [];
    }
    if (cue.type === 'group') {
        const children = currentCues.filter(c => String(c.groupId) === String(cue.id)); if (children.length === 0) return [cue];
        if (cue.groupMode === 'fire-first') return [cue, ...evaluateCue(children[0].id, currentCues, depth + 1)];
        else return [cue, ...children.flatMap(child => evaluateCue(child.id, currentCues, depth + 1))];
    }
    return [cue];
};

// --- MESSAGE BROKER ---
self.onmessage = (e) => {
    try {
        const { action, payload } = e.data;
        
        if (action === 'SYNC_STATE') {
            if (payload.cues) cues = payload.cues;
            if (payload.oscValues) oscValues = payload.oscValues;
            if (payload.trackers) trackers = payload.trackers;
            if (payload.mainTime) mainThreadTimeOffset = performance.now() - payload.mainTime;
        } 
        else if (action === 'EVALUATE_GO') {
            const targetIds = payload.targetIds;
            const source = payload.source;
            let resolvedCues = [];
            let mutations = {};
            
            if (Array.isArray(targetIds)) {
                targetIds.forEach(id => {
                    const cue = cues.find(c => String(c.id) === String(id));
                    if (cue && cue.type === 'counter') {
                        const current = (mutations[cue.id]?.counterCurrent ?? cue.counterCurrent) || 0;
                        if (current + 1 >= (cue.counterLimit || 1)) {
                            mutations[cue.id] = { counterCurrent: 0 };
                            const target = cues.find(c => String(c.number) === String(cue.targetCueNumber));
                            if (target) resolvedCues.push(...evaluateCue(target.id, cues));
                        } else {
                            mutations[cue.id] = { counterCurrent: current + 1 };
                            resolvedCues.push(cue);
                        }
                    } else if (cue) {
                        resolvedCues.push(...evaluateCue(id, cues));
                    }
                });
            }
            
            self.postMessage({
                type: 'CUES_RESOLVED',
                payload: { source, resolvedCues, mutations, targetIds }
            });
        }
    } catch (error) {
        console.error("Timeline Worker Evaluation Error:", error);
    }
};

// --- 100ms CONDITIONAL POLLING LOOP ---
setInterval(() => {
    const conditionalCues = cues.filter(c => c.type === 'conditional' && c.conditionRunMode === 'continuous' && c.state === 'playing');
    if (conditionalCues.length === 0) return;

    let firedSomething = false;
    let resolvedCues = [];
    let mutations = {};
    let consumedOscPaths = [];

    conditionalCues.forEach(cue => {
        let conditionMet = false;
        if (cue.conditionType === 'osc-value') {
            const val = oscValues[cue.conditionOscPath];
            if (val !== undefined && val !== null && String(val) === String(cue.conditionOscValue)) {
                conditionMet = true;
                consumedOscPaths.push(cue.conditionOscPath);
            }
        } else {
            const targetNum = String(cue.conditionTargetCue || '').trim();
            const target = targetNum ? cues.find(c => String(c.number) === targetNum) : null;
            if (target && target.state === (cue.conditionState || 'playing')) conditionMet = true;
        }

        if (conditionMet) {
            firedSomething = true;
            mutations[cue.id] = { state: 'stopped' };
            
            // NEW: Eagerly mutate local cue state
            const localCue = cues.find(c => String(c.id) === String(cue.id));
            if (localCue) localCue.state = 'stopped';
            
            const nextNum = String(cue.trueTargetCue || '').trim();
            if (nextNum) {
                const targetCue = cues.find(c => String(c.number) === nextNum);
                if (targetCue) resolvedCues.push(...evaluateCue(targetCue.id, cues));
            }
        }
    });

    if (firedSomething) {
        // NEW: Eagerly consume local OSC paths
        consumedOscPaths.forEach(p => { oscValues[p] = null; });
        
        self.postMessage({ type: 'CONDITION_MET', payload: { resolvedCues, mutations, consumedOscPaths } });
    }
}, 100);

// --- 60Hz MATH & TWEENING ENGINE ---
setInterval(() => {
    const activeAnimates = [];
    const activeSequences = [];
    for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        if (c.type === 'animate' && (c.state === 'playing' || c.state === 'completed')) {
            activeAnimates.push(c);
        } else if (c.type === 'sequence' && c.state === 'playing') {
            activeSequences.push(c);
        }
    }

    const animModifiers = {};
    const localNow = performance.now();
    
    const mainThreadNow = localNow - mainThreadTimeOffset;
    const seqFires = [];
    const seqMutations = {};

    activeSequences.forEach(seqCue => {
        const tracker = trackers[seqCue.id];
        if (!tracker || !tracker.start) return; // Wait for UI to confirm absolute start time

        if (!sequenceTimers[seqCue.id]) {
            sequenceTimers[seqCue.id] = {
                children: (seqCue.children || []).map((ch, idx) => ({ ...ch, _seqIndex: idx, _fired: false }))
            };
        }

        const timer = sequenceTimers[seqCue.id];
        const elapsed = (mainThreadNow - tracker.start) / 1000;
        let allFinished = true;

        timer.children.forEach(child => {
            const childDuration = parseFloat(child.duration) || 0;
            
            // Fire the child cue when its local timeline threshold is crossed
            if (!child._fired && elapsed >= (parseFloat(child.startTime) || 0)) {
                child._fired = true;
                // Tag it with a synthetic ID and its parent's ID so the UI can route it
                seqFires.push({ ...child, parentSequenceId: seqCue.id, id: `${seqCue.id}-child-${child._seqIndex}` });
            }
            
            // Keep the sequence alive until the last child finishes its duration
            if (elapsed < ((parseFloat(child.startTime) || 0) + childDuration)) {
                allFinished = false;
            }
        });

        // Auto-complete the sequence container when all children are finished
        if (allFinished && timer.children.length > 0) {
            seqMutations[seqCue.id] = { state: 'completed' };
            seqCue.state = 'completed'; // Eager local mutation
            delete sequenceTimers[seqCue.id];
        }
    });

    // Garbage collection for paused/stopped sequences
    Object.keys(sequenceTimers).forEach(seqId => {
        if (!activeSequences.find(c => String(c.id) === String(seqId))) delete sequenceTimers[seqId];
    });

    // Fire any resolved children over the message bridge
    if (seqFires.length > 0 || Object.keys(seqMutations).length > 0) {
        self.postMessage({ 
            type: 'SEQUENCE_TICK', 
            payload: { resolvedChildren: seqFires, mutations: seqMutations } 
        });
    }

    activeAnimates.forEach(anim => {
        if (anim.duration > 0 && anim.animTargetCue && !anim.animPathEnabled) {
            const tracker = trackers[anim.id];
            if (tracker) {
                const mainThreadNow = localNow - mainThreadTimeOffset;
                let p = (mainThreadNow - (tracker.animStart || tracker.start)) / (anim.duration * 1000);
                p = Math.max(0, Math.min(1, p));
                const startVal = parseFloat(anim.animStartValue) || 0;
                const endVal = parseFloat(anim.animEndValue) || 0;
                const currentVal = startVal + (endVal - startVal) * p;
                if (!animModifiers[anim.animTargetCue]) animModifiers[anim.animTargetCue] = {};
                animModifiers[anim.animTargetCue][anim.animProperty] = currentVal;
            }
        }
    });
    
    if (activeAnimates.length > 0) {
        self.postMessage({ type: 'ANIMATION_TICK', payload: animModifiers });
        hadActiveAnimates = true;
    } else if (hadActiveAnimates) {
        self.postMessage({ type: 'ANIMATION_TICK', payload: {} });
        hadActiveAnimates = false;
    }
}, 16);