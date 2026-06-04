import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, Crosshair, Unlock, Hash, FolderPlus, Plus, Trash2, GripVertical,
  ChevronDown, ChevronRight, Video, Image as ImageIcon, Music, Camera, Moon,
  PauseCircle, Repeat, Wand2, FolderOpen, Folder, CalendarClock, Type,
  Settings2, Wifi, XSquare, GitBranch, Hourglass, CornerDownRight, StopCircle,
  Layers, ArrowRight, Ear, Lock, Ban, Play, Square, Pause, AlertCircle, Key, MonitorUp, Lightbulb
} from 'lucide-react';

// Local helper for formatting time remaining
const formatTime = (timeInSeconds) => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";
  const m = Math.floor(timeInSeconds / 60);
  const s = Math.floor(timeInSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const AudioVisualizer = React.memo(({ isPlaying, isPaused, type }) => {
  if (!isPlaying || ['image', 'goto', 'pause', 'blackout', 'counter', 'transition', 'group', 'time', 'text', 'msc', 'osc', 'stop', 'conditional', 'timer'].includes(type)) return null;
  return (
    <div className="flex items-end gap-[2px] h-3 ml-3 shrink-0" title={isPaused ? "Audio Paused" : "Audio Playing"}>
      <div className="w-[3px] bg-green-500 rounded-t-sm origin-bottom" style={{ animation: `meter 0.4s ease-in-out infinite alternate ${isPaused ? 'paused' : 'running'}`, height: '100%' }} />
      <div className="w-[3px] bg-green-500 rounded-t-sm origin-bottom" style={{ animation: `meter 0.6s ease-in-out infinite alternate 0.2s ${isPaused ? 'paused' : 'running'}`, height: '100%' }} />
      <div className="w-[3px] bg-green-500 rounded-t-sm origin-bottom" style={{ animation: `meter 0.5s ease-in-out infinite alternate 0.4s ${isPaused ? 'paused' : 'running'}`, height: '100%' }} />
    </div>
  );
});

const AutoAdvanceTimer = React.memo(({ cue, isPlaying, isPaused }) => {
  const [timeLeft, setTimeLeft] = useState(cue.duration || 0);

  useEffect(() => {
    if (cue.followAction !== 'auto-follow') return;
    if (!isPlaying || (isPaused && cue.type !== 'pause') || cue.duration <= 0) {
      setTimeLeft(cue.duration || 0);
      return;
    }
    const startTime = Date.now();
    const totalMs = cue.duration * 1000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setTimeLeft(Math.max(0, (totalMs - elapsed) / 1000));
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, isPaused, cue.followAction, cue.duration]);

  if (cue.followAction !== 'auto-follow' || !cue.duration || cue.duration <= 0) return null;
  return (
    <span className="ml-2 text-[9px] font-mono text-green-400 border border-green-800/50 bg-green-900/30 px-1.5 py-0.5 rounded whitespace-nowrap" title="Follow Timer">
      ⏱ {(isPlaying && !isPaused && cue.duration > 0) ? timeLeft.toFixed(1) : (cue.duration || 0)}s
    </span>
  );
});

const CueRow = React.memo(({
  cue, isSelected, isPlaying, isStopping, indentLevel, draggedCueId, dragOverCueId,
  handleCueClick, handleContextMenu, handleDragStart, handleDragOverCue, handleDropCue, handleDragEnd,
  setCues, stopCue, mediaTime, isPaused
}) => {
  return (
    <div 
      data-cue-id={cue.id} onClick={(e) => handleCueClick(e, cue.id)} 
      onContextMenu={(e) => handleContextMenu(e, cue.id)}
      draggable onDragStart={(e) => handleDragStart(e, cue.id)} onDragOver={(e) => handleDragOverCue(e, cue.id)}
      onDrop={(e) => handleDropCue(e, cue.id)} onDragEnd={handleDragEnd}
      className={`flex items-center px-2 py-3 text-sm border-b cursor-pointer select-none transition-colors ${isSelected ? 'bg-blue-900/40 border-blue-800/50' : 'hover:bg-gray-800/50'} ${isPlaying ? 'text-green-400' : isStopping ? 'text-yellow-500' : 'text-gray-300'} ${cue.groupId ? 'border-l-2 border-l-gray-700 rounded-l-none bg-gray-950/30' : ''} ${draggedCueId === cue.id ? 'opacity-40 border-dashed' : ''} ${dragOverCueId === cue.id ? 'bg-blue-900/60 shadow-[inset_0_3px_0_#3b82f6]' : ''}`} 
      style={{ marginLeft: `${indentLevel * 24}px` }}
    >
      <div className="w-6 flex justify-center text-gray-600 cursor-grab"><GripVertical className="w-4 h-4" /></div>
      <div className="w-6 flex justify-center">{cue.type === 'group' ? (<button onClick={(e) => { e.stopPropagation(); setCues(prev => prev.map(c => c.id === cue.id ? {...c, isExpanded: !c.isExpanded} : c)); }} className="hover:text-white">{cue.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>) : (isSelected && <ChevronRight className="w-4 h-4 text-blue-400" />)}</div>
      <div className="w-10 font-mono opacity-50 truncate">{cue.number}</div>
      <div className="w-10 flex items-center justify-center gap-1">
        {cue.type === 'video' ? <Video className="w-4 h-4" /> : cue.type === 'image' ? <ImageIcon className="w-4 h-4" /> : cue.type === 'audio' ? <Music className="w-4 h-4" /> : cue.type === 'camera' ? <Camera className="w-4 h-4" /> : cue.type === 'blackout' ? <Moon className="w-4 h-4" /> : cue.type === 'pause' ? <PauseCircle className="w-4 h-4" /> : cue.type === 'counter' ? <Repeat className="w-4 h-4" /> : cue.type === 'transition' ? <Wand2 className="w-4 h-4 text-pink-500" /> : cue.type === 'group' ? (cue.isExpanded ? <FolderOpen className="w-4 h-4 text-blue-400" /> : <Folder className="w-4 h-4 text-blue-400" />) : cue.type === 'time' ? <CalendarClock className="w-4 h-4 text-orange-400" /> : cue.type === 'text' ? <Type className="w-4 h-4 text-yellow-200" /> : cue.type === 'msc' ? <Settings2 className="w-4 h-4 text-purple-400" /> : cue.type === 'osc' ? <Wifi className="w-4 h-4 text-cyan-400" /> : cue.type === 'projector' ? <MonitorUp className="w-4 h-4 text-emerald-500" /> : cue.type === 'stop' ? <XSquare className="w-4 h-4 text-red-500" /> : cue.type === 'state-changer' ? <Key className="w-4 h-4 text-teal-500" /> : cue.type === 'conditional' ? <GitBranch className="w-4 h-4 text-emerald-400" /> : cue.type === 'timer' ? <Hourglass className="w-4 h-4 text-teal-400" /> : <CornerDownRight className="w-4 h-4 text-blue-400" />}
        {cue.type !== 'goto' && cue.type !== 'pause' && cue.type !== 'counter' && cue.type !== 'transition' && cue.type !== 'group' && cue.type !== 'time' && cue.type !== 'msc' && cue.type !== 'osc' && cue.type !== 'projector' && cue.type !== 'stop' && cue.type !== 'state-changer' && cue.type !== 'conditional' && (cue.triggerBehavior === 'stop-others' ? <StopCircle className="w-3 h-3 text-red-500 opacity-60" /> : <Layers className="w-3 h-3 text-blue-500 opacity-60" />)}
      </div>
      
      <div className={`flex-1 flex items-center font-medium truncate pr-2 ${cue.disabled ? 'opacity-50' : ''}`}>
        <span className={`${cue.type === 'group' ? 'font-bold text-blue-100' : ''} ${cue.disabled ? 'line-through' : ''}`}>{cue.name}</span>
        
        {/* FEEDBACK TAGS */}
        {(cue.type === 'video' || cue.type === 'audio') && (isPlaying || isStopping) && mediaTime && mediaTime.duration > 0 && (
          <span className="ml-2 text-[9px] font-mono text-cyan-400 border border-cyan-800/50 bg-cyan-900/30 px-1.5 py-0.5 rounded whitespace-nowrap" title="Media Time Remaining">
            -{formatTime(mediaTime.duration - mediaTime.current)}
          </span>
        )}

        {cue.type === 'camera' && (
          <button onClick={(e) => { e.stopPropagation(); setCues(prev => prev.map(c => c.id === cue.id ? {...c, cameraLive: !c.cameraLive} : c)); }} className={`ml-2 text-[9px] font-mono border px-1.5 py-0.5 rounded whitespace-nowrap transition-colors ${cue.cameraLive ? 'text-red-400 border-red-800/50 bg-red-900/30' : 'text-gray-500 border-gray-700 bg-gray-800/50'}`} title="Toggle Live Camera Feed">
            {cue.cameraLive ? '● LIVE' : '○ MUTED'}
          </button>
        )}
        
        {cue.followAction === 'auto-follow' && <ArrowRight className="w-3 h-3 text-green-500 ml-2 flex-shrink-0" title="Auto-follows to next cue on end" />}
        
        {cue.type === 'conditional' && cue.conditionRunMode === 'continuous' && isPlaying && <Ear className="w-3 h-3 text-emerald-500 ml-2 flex-shrink-0 animate-pulse" title="Listening for condition..." />}
        
        {cue.lockedBy && (
          <span className="ml-2 text-[9px] font-mono text-yellow-400 border border-yellow-800/50 bg-yellow-900/30 px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-1" title={`Locked by Cue ${cue.lockedBy}`}>
            <Lock className="w-2.5 h-2.5" /> Locked by {cue.lockedBy}
          </span>
        )}

        {cue.disabled && (
          <span className="ml-2 text-[9px] font-mono text-gray-400 border border-gray-700/50 bg-gray-800/80 px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-1" title="Cue is disabled">
            <Ban className="w-2.5 h-2.5" /> Disabled
          </span>
        )}

        <AutoAdvanceTimer cue={cue} isPlaying={isPlaying} isPaused={isPaused && !cue.lockedBy} />
        <AudioVisualizer isPlaying={isPlaying || isStopping} isPaused={isPaused && !cue.lockedBy} type={cue.type} />
      </div>
      <div className="w-12 flex justify-end">{(isPlaying && cue.type !== 'msc' && cue.type !== 'osc' && cue.type !== 'stop' && cue.type !== 'state-changer' && cue.type !== 'conditional') ? (cue.lockedBy ? <Lock className="w-4 h-4 text-yellow-500/50" /> : <button onClick={(e) => { e.stopPropagation(); stopCue(cue.id); }} className="hover:scale-110" title="Soft Stop"><Play className="w-4 h-4 text-green-500 fill-green-500" /></button>) : (isStopping) ? (cue.lockedBy ? <Lock className="w-4 h-4 text-yellow-500/50" /> : <button onClick={(e) => { e.stopPropagation(); setCues(prev => { const getDescendantIds = (parentId, list) => { let ids = []; for (const c of list) { if (c.groupId === parentId) { ids.push(c.id); ids.push(...getDescendantIds(c.id, list)); } } return ids; }; let idsToStop = [cue.id]; if (cue.type === 'group') { idsToStop.push(...getDescendantIds(cue.id, prev)); } return prev.map(c => idsToStop.includes(c.id) && !c.lockedBy ? {...c, state: 'stopped'} : c); }); }} className="hover:scale-110" title="Hard Stop"><Square className="w-4 h-4 text-yellow-500 fill-yellow-500 animate-pulse" /></button>) : <Square className="w-4 h-4 opacity-30" />}</div>
    </div>
  );
}, (prev, next) => {
  return prev.cue.id === next.cue.id && prev.cue.state === next.cue.state && prev.cue.name === next.cue.name && prev.cue.number === next.cue.number && prev.cue.disabled === next.cue.disabled && prev.cue.lockedBy === next.cue.lockedBy && prev.cue.cameraLive === next.cue.cameraLive && prev.cue.isExpanded === next.cue.isExpanded && prev.isSelected === next.isSelected && prev.isPlaying === next.isPlaying && prev.isStopping === next.isStopping && prev.draggedCueId === next.draggedCueId && prev.dragOverCueId === next.dragOverCueId && prev.mediaTime?.current === next.mediaTime?.current && prev.mediaTime?.duration === next.mediaTime?.duration && prev.isPaused === next.isPaused;
});

const CueList = React.memo(function CueList({
  autoScroll, setAutoScroll,
  cues, setCues, selectedCueIds, setSelectedCueIds, lastSelectedId, setLastSelectedId, 
  getNativeFilePath, folderInputRef, isVisible, getIndent, handleCueClick, 
  mediaTimes, isPaused, setIsPaused, globalPause, setGlobalPause, stopCue, handleGo, 
  handleStopAll, handleRenumberCues, clipboardCues, setClipboardCues,
  isRecording, toggleRecording
}) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [jumpToCue, setJumpToCue] = useState('');
  const [draggedCueId, setDraggedCueId] = useState(null);
  const [dragOverCueId, setDragOverCueId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const getDescendantIds = useCallback((parentId, cueList) => {
      let ids = [];
      for (const c of cueList) {
          if (c.groupId === parentId) {
              ids.push(c.id);
              ids.push(...getDescendantIds(c.id, cueList));
          }
      }
      return ids;
  }, []);

  const handleCopy = useCallback(() => {
      let idsToCopy = new Set();
      selectedCueIds.forEach(id => {
          idsToCopy.add(id);
          const descendants = getDescendantIds(id, cues);
          descendants.forEach(d => idsToCopy.add(d));
      });
      const cuesToCopy = cues.filter(c => idsToCopy.has(c.id));
      setClipboardCues(cuesToCopy);
  }, [cues, selectedCueIds, getDescendantIds, setClipboardCues]);

  const handlePaste = useCallback(() => {
      if (!clipboardCues || clipboardCues.length === 0) return;

      setCues(prev => {
          const idMap = {};
          const newCues = clipboardCues.map(c => {
              const newId = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9);
              idMap[c.id] = newId;
              return { ...c, id: newId };
          });

          let insertIdx = prev.length;
          let rootGroupId = null;
          if (lastSelectedId) {
              const targetCue = prev.find(c => c.id === lastSelectedId);
              if (targetCue) {
                  insertIdx = prev.findIndex(c => c.id === lastSelectedId) + 1;
                  rootGroupId = targetCue.type === 'group' ? targetCue.id : targetCue.groupId;
              }
          }

          newCues.forEach(c => {
              if (c.groupId && idMap[c.groupId]) {
                  c.groupId = idMap[c.groupId];
              } else {
                  c.groupId = rootGroupId;
              }
          });

          const startingNum = prev.length;
          const updatedNewCues = newCues.map((c, i) => ({ ...c, number: (startingNum + i + 1).toString() }));

          const nextCues = [...prev];
          nextCues.splice(insertIdx, 0, ...updatedNewCues);
          return nextCues;
      });
  }, [clipboardCues, lastSelectedId, setCues]);

  const handleDelete = useCallback(() => {
      let idsToDelete = new Set();
      selectedCueIds.forEach(id => {
          idsToDelete.add(id);
          const descendants = getDescendantIds(id, cues);
          descendants.forEach(d => idsToDelete.add(d));
      });
      
      const remaining = cues.filter(c => !idsToDelete.has(c.id));
      setCues(remaining);
      setSelectedCueIds(remaining.length > 0 ? [remaining[0].id] : []);
      setLastSelectedId(remaining.length > 0 ? remaining[0].id : null);
  }, [cues, selectedCueIds, getDescendantIds, setCues, setSelectedCueIds, setLastSelectedId]);

  const handleContextMenu = useCallback((e, id) => {
    e.preventDefault();
    if (!selectedCueIds.includes(id)) {
      setSelectedCueIds([id]);
      setLastSelectedId(id);
    }
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [selectedCueIds, setSelectedCueIds, setLastSelectedId]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleConvertToSequence = useCallback(() => {
    if (selectedCueIds.length <= 1) {
        setContextMenu(null);
        return;
    }
    
    setCues(prev => {
      const selected = prev.filter(c => selectedCueIds.includes(c.id));
      if (selected.length === 0) return prev;
      
      const firstCue = selected[0];
      
      // Clean the cues for the sequence wrapper (strip global IDs and states)
      const children = selected.map((c, idx) => {
          const { id, groupId, state, triggerTime, isSynthetic, ...cleanCue } = c;
          return { 
              ...cleanCue, 
              // Assign a default 1-second stagger so they don't all fire at exactly 0.0
              startTime: idx * 1.0 
          };
      });
      
      const sequenceCue = {
          id: `seq-${Date.now()}`,
          number: firstCue.number, 
          name: `Sequence (${selected.length} Items)`,
          type: 'sequence',
          state: 'idle',
          children: children
      };
      
      // Remove the original cues and splice the new sequence into the first cue's original position
      const filteredCues = prev.filter(c => !selectedCueIds.includes(c.id));
      const originalIndex = prev.findIndex(c => c.id === firstCue.id);
      
      if (originalIndex > -1) {
          filteredCues.splice(originalIndex, 0, sequenceCue);
      } else {
          filteredCues.push(sequenceCue);
      }
      
      return filteredCues;
    });
    
    setSelectedCueIds([]);
    setContextMenu(null);
  }, [selectedCueIds, setCues, setSelectedCueIds]);

  const handleJumpToCue = (e) => {
    if (e.key === 'Enter') {
      const target = cues.find(c => String(c.number) === jumpToCue);
      if (target) { 
        setSelectedCueIds([target.id]); setLastSelectedId(target.id); 
        const el = document.querySelector(`[data-cue-id="${target.id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      setJumpToCue('');
    }
  };

  const handleDragStart = (e, id) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDraggedCueId(id); };
  const handleDragOverCue = (e, id) => { 
    e.preventDefault(); 
    if (draggedCueId && draggedCueId !== id) {
       const rect = e.currentTarget.getBoundingClientRect();
       const y = e.clientY - rect.top;
       let position = 'inside';
       const targetCue = cues.find(c => c.id === id);
       if (targetCue && targetCue.type === 'group') {
           if (y < rect.height * 0.25) position = 'before';
           else if (y > rect.height * 0.75) position = 'after';
       } else {
           if (y < rect.height / 2) position = 'before';
           else position = 'after';
       }
       setDragOverCueId(`${id}-${position}`); 
    }
  };
  const handleDragEnd = () => { setDraggedCueId(null); setDragOverCueId(null); };

  const handleDropCue = (e, targetId) => {
    e.preventDefault(); 
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      return; // Let the parent's onDrop handle file uploads
    }
    e.stopPropagation(); 
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== targetId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let position = 'inside';
      const targetCue = cues.find(c => c.id === targetId);
      if (targetCue && targetCue.type === 'group') {
          if (y < rect.height * 0.25) position = 'before';
          else if (y > rect.height * 0.75) position = 'after';
      } else {
          if (y < rect.height / 2) position = 'before';
          else position = 'after';
      }

      setCues(prev => {
        const oldIdx = prev.findIndex(c => c.id === draggedId);
        const newIdx = prev.findIndex(c => c.id === targetId);
        if (oldIdx === -1 || newIdx === -1) return prev;

        const getDescendantIds = (parentId) => {
            let ids = [];
            for (const c of prev) {
                if (c.groupId === parentId) {
                    ids.push(c.id);
                    ids.push(...getDescendantIds(c.id));
                }
            }
            return ids;
        };
        
        const descendantIds = getDescendantIds(draggedId);
        const draggedIds = [draggedId, ...descendantIds];

        // Prevent dropping a folder into itself or its own children
        if (draggedIds.includes(targetId)) return prev;

        const newCues = prev.filter(c => !draggedIds.includes(c.id));
        const movedCues = prev.filter(c => draggedIds.includes(c.id)).map(c => ({ ...c }));
        const movedCue = movedCues.find(c => c.id === draggedId);
        const dropTarget = prev[newIdx];

        let insertIdx = newCues.findIndex(c => c.id === dropTarget.id);

        if (position === 'inside') {
            movedCue.groupId = dropTarget.id;
            insertIdx += 1;
        } else {
            movedCue.groupId = dropTarget.groupId;
            if (position === 'after') {
                const isDescendant = (childId, ancestorId) => {
                     let curr = prev.find(c => c.id === childId);
                     while (curr && curr.groupId) {
                         if (curr.groupId === ancestorId) return true;
                         curr = prev.find(c => c.id === curr.groupId);
                     }
                     return false;
                };
                
                let lastIdx = insertIdx;
                for (let i = insertIdx + 1; i < newCues.length; i++) {
                    if (isDescendant(newCues[i].id, dropTarget.id)) {
                        lastIdx = i;
                    } else {
                        break;
                    }
                }
                insertIdx = lastIdx + 1;
            }
        }

        if (insertIdx === -1) insertIdx = newCues.length; 

        newCues.splice(insertIdx, 0, ...movedCues);
        return newCues;
      });
    }
    setDraggedCueId(null); setDragOverCueId(null);
  };

  return (
    <div className={`h-full w-full flex flex-col border-r border-gray-800 relative transition-colors ${isDraggingFile ? 'bg-blue-900/20' : 'bg-gray-900'}`}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true); }}
      onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingFile(false); }}
      onDrop={(e) => {
        e.preventDefault(); setIsDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const files = Array.from(e.dataTransfer.files);
          const newCues = files.map((file, idx) => {
            let type = 'video';
            if (file.type.startsWith('audio/')) type = 'audio';
            else if (file.type.startsWith('image/')) type = 'image';
            else {
              const name = file.name.toLowerCase();
              if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg')) type = 'audio';
              else if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) type = 'image';
            }
            const url = getNativeFilePath(file); 
            return {
              id: Date.now().toString() + '-' + idx, number: '', type, name: file.name, url, state: 'stopped',
              loop: false, triggerBehavior: 'stop-others', fadeTargetCue: '', followAction: type === 'image' ? 'none' : 'auto-follow', duration: 0,
              fadeInTime: 1.0, fadeOutTime: 1.0, volume: 1, targetDisplay: 'all', groupId: null, cameraLive: true,
              scaleX: 100, scaleY: 100, keepAspect: true, posX: 50, posY: 50, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0,
              outlineEnabled: false, outlineColor: '#ffffff', outlineWidth: 2, warpEnabled: false, warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
              mediaSyncOffset: 0, mediaIn: 0, mediaOut: 0, holdAtEnd: false, colorFilterEnabled: false, hue: 0, saturation: 100, brightness: 100
            };
          });
          setCues(prev => {
            const startingNum = prev.length;
            let insertIdx = prev.length;
            let groupId = null;
            if (lastSelectedId) {
                const targetCue = prev.find(c => c.id === lastSelectedId);
                if (targetCue) {
                    insertIdx = prev.findIndex(c => c.id === lastSelectedId) + 1;
                    groupId = targetCue.type === 'group' ? targetCue.id : targetCue.groupId;
                }
            }
            const updatedNewCues = newCues.map((c, i) => ({ ...c, number: (startingNum + i + 1).toString(), groupId }));
            const nextCues = [...prev];
            nextCues.splice(insertIdx, 0, ...updatedNewCues);
            return nextCues;
          });
        }
      }}
    >
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none border-2 border-blue-500">
          <div className="flex flex-col items-center gap-2 text-blue-400"><Plus className="w-10 h-10 animate-bounce" /><span className="font-bold tracking-widest">DROP MEDIA TO ADD CUES</span></div>
        </div>
      )}
      <div className="flex flex-col shrink-0 bg-gray-800/50 border-b border-gray-800">
         <div className="flex justify-between items-center pr-2 pl-40 py-2">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cue List</div>
              <div className="flex items-center bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 ml-2">
                 <Search className="w-3 h-3 text-gray-500 mr-1" />
                 <input type="text" placeholder="Jump to..." value={jumpToCue} onChange={(e) => setJumpToCue(e.target.value)} onKeyDown={handleJumpToCue} className="bg-transparent border-none text-[10px] text-gray-200 w-16 outline-none" />
              </div>
            </div>
            <div className="flex gap-1">
              <button 
                onClick={() => {
                  setAutoScroll(!autoScroll);
                  if (!autoScroll && selectedCueIds.length > 0) {
                     const el = document.querySelector(`[data-cue-id="${selectedCueIds[0]}"]`); 
                     if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                  }
                }} 
                className={`p-1 rounded transition-colors ${autoScroll ? 'text-blue-400 bg-blue-900/40 border border-blue-800/50' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`} 
                title="Toggle Auto-Scroll to Playhead"
              >
                <Crosshair className="w-4 h-4" />
              </button>
              <button onClick={() => setCues(prev => prev.map(c => ({ ...c, lockedBy: null, disabled: false })))} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="Reset All States (Unlock & Enable)"><Unlock className="w-4 h-4" /></button>
              <button onClick={handleRenumberCues} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="Renumber All Cues"><Hash className="w-4 h-4" /></button>
              <button onClick={() => folderInputRef.current?.click()} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="Add Folder"><FolderPlus className="w-4 h-4" /></button>
              <button onClick={() => { 
                  const newId = Date.now().toString(); 
                  setCues(prev => {
                      const newCue = { id: newId, number: (prev.length + 1).toString(), type: 'video', name: 'New Cue', description: '', url: '', state: 'stopped', loop: false, triggerBehavior: 'overlap', fadeTargetCue: '', followAction: 'none', duration: 0, fadeInTime: 0, fadeOutTime: 0, volume: 1, targetDisplay: 'all', groupId: null, cameraLive: true, scaleX: 100, scaleY: 100, keepAspect: true, posX: 50, posY: 50, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, outlineEnabled: false, outlineColor: '#ffffff', outlineWidth: 2, warpEnabled: false, warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], mediaSyncOffset: 0, mediaIn: 0, mediaOut: 0, holdAtEnd: false, colorFilterEnabled: false, hue: 0, saturation: 100, brightness: 100 };
                      let insertIdx = prev.length;
                      if (lastSelectedId) {
                          const targetCue = prev.find(c => c.id === lastSelectedId);
                          if (targetCue) {
                              insertIdx = prev.findIndex(c => c.id === lastSelectedId) + 1;
                              newCue.groupId = targetCue.type === 'group' ? targetCue.id : targetCue.groupId;
                          }
                      }
                      const nextCues = [...prev];
                      nextCues.splice(insertIdx, 0, newCue);
                      return nextCues;
                  }); 
                  setSelectedCueIds([newId]); 
                  setLastSelectedId(newId); 
              }} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"><Plus className="w-4 h-4" /></button>
              <button onClick={handleDelete} className="p-1 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
         </div>
      </div>
      
      <div 
        className="flex-1 overflow-y-auto custom-scrollbar pb-24"
        onWheel={() => { if (autoScroll) setAutoScroll(false); }}
        onTouchMove={() => { if (autoScroll) setAutoScroll(false); }}
      >
        {cues.map((cue) => {
          if (!isVisible(cue.id)) return null;
          const isSelected = selectedCueIds.includes(cue.id); const isPlaying = cue.state === 'playing'; const isStopping = cue.state === 'stopping';
          const indentLevel = getIndent(cue.id);
          const mediaTime = mediaTimes[cue.id];

          return (
            <CueRow
              key={cue.id} cue={cue} isSelected={isSelected} isPlaying={isPlaying} isStopping={isStopping}
              indentLevel={indentLevel} draggedCueId={draggedCueId} dragOverCueId={dragOverCueId}
              handleCueClick={handleCueClick} handleContextMenu={handleContextMenu}
              handleDragStart={handleDragStart} handleDragOverCue={handleDragOverCue}
              handleDropCue={handleDropCue} handleDragEnd={handleDragEnd}
              setCues={setCues} stopCue={stopCue} mediaTime={mediaTime} isPaused={isPaused}
            />
          );
        })}
      </div>

      <div className="p-4 bg-gray-950 border-t border-gray-800 flex gap-2 shrink-0">
        <button onClick={handleGo} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded shadow-lg shadow-green-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2 text-xl tracking-widest"><Play className="w-6 h-6 fill-current" /> GO</button>
        <button onClick={() => setIsPaused(!isPaused)} className={`px-5 font-bold rounded active:scale-95 transition-colors flex items-center justify-center gap-1 ${isPaused ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-gray-800 text-yellow-500'}`}><Pause className={`w-6 h-6 ${isPaused ? 'fill-current' : ''}`} /></button>
        <button onClick={handleStopAll} className="px-5 bg-red-900 hover:bg-red-800 text-red-200 font-bold rounded active:scale-95 transition-transform flex flex-col items-center justify-center gap-1"><AlertCircle className="w-6 h-6" /></button>
        <button onClick={toggleRecording} className={`px-4 font-bold rounded flex items-center justify-center gap-2 transition-colors ${isRecording ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
          <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
          {isRecording ? 'REC' : 'Record'}
        </button>
      </div>

      {contextMenu && (
        <div 
          className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded shadow-xl py-1 w-48 text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className="w-full text-left px-4 py-2 hover:bg-blue-600 text-gray-200 transition-colors" onClick={handleCopy}>Copy</button>
          <button className="w-full text-left px-4 py-2 hover:bg-blue-600 text-gray-200 transition-colors disabled:opacity-50 disabled:hover:bg-transparent" disabled={!clipboardCues || clipboardCues.length === 0} onClick={handlePaste}>Paste</button>
          <div className="h-px bg-gray-700 my-1"></div>
          {selectedCueIds.length > 1 && (
              <button 
                  onClick={handleConvertToSequence} 
                  className="w-full text-left px-4 py-2 text-xs text-purple-300 hover:bg-purple-900/50 hover:text-purple-100 flex items-center gap-2"
              >
                  <Layers className="w-3.5 h-3.5" />
                  Convert to Sequence
              </button>
          )}
          <button className="w-full text-left px-4 py-2 hover:bg-red-600 text-red-400 hover:text-white transition-colors" onClick={handleDelete}>Delete</button>
        </div>
      )}
    </div>
  );
});

export default CueList;