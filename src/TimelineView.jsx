import React from 'react';
import { Activity, Clock, ArrowRight } from 'lucide-react';

const TimelineView = React.memo(({ cues, selectedCueIds, setSelectedCueIds, setLastSelectedId, scrollCueIntoView }) => {
  const playingCues = cues.filter(c => c.state === 'playing' || c.state === 'stopping');
  let targetGroup = null;
  let targetSingle = null;

  // 1. Prioritize showing the group of the actively playing cue
  if (playingCues.length > 0) {
    const latestCue = playingCues.reduce((latest, current) => (current.triggerTime || 0) > (latest.triggerTime || 0) ? current : latest);
    const groupId = latestCue.type === 'group' ? latestCue.id : latestCue.groupId;
    targetGroup = cues.find(c => c.id === groupId && c.type === 'group');
    if (!targetGroup && latestCue.type !== 'group') targetSingle = latestCue;
  }

  // 2. If nothing is playing, fallback to the selected cue (or parent of selected cue)
  if (!targetGroup && !targetSingle) {
    const selectedId = selectedCueIds[0];
    const selectedCue = cues.find(c => c.id === selectedId);
    if (selectedCue && selectedCue.type === 'group') {
      targetGroup = selectedCue;
    } else if (selectedCue) {
      if (selectedCue.groupId) targetGroup = cues.find(c => c.id === selectedCue.groupId);
      if (!targetGroup) targetSingle = selectedCue;
    }
  }

  if (!targetGroup && !targetSingle) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-600 bg-gray-950">
        <Activity className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-bold tracking-widest uppercase">Timeline View</p>
        <p className="text-xs mt-2 text-center max-w-[250px]">Play a sequence or select a Cue to visualize its timeline.</p>
      </div>
    );
  }

  let timelineData = [];
  let headerName = "";
  let headerMode = "";

  if (targetGroup) {
    const children = cues.filter(c => c.groupId === targetGroup.id);
    if (children.length === 0) return <div className="flex-1 flex items-center justify-center text-sm text-gray-600 bg-gray-950">Group is empty.</div>;

    let currentTime = 0;
    timelineData = children.map(child => {
       const startTime = targetGroup.groupMode === 'fire-all' ? 0 : currentTime;
       const dur = parseFloat(child.duration) || 0;
       const visDuration = dur > 0 ? dur : 5; 
       
       if (targetGroup.groupMode !== 'fire-all' && child.followAction === 'auto-follow') {
           currentTime += dur;
       }
       return { ...child, startTime, visDuration };
    });
    headerName = targetGroup.name;
    headerMode = targetGroup.groupMode;
  } else if (targetSingle) {
    const dur = parseFloat(targetSingle.duration) || 0;
    const visDuration = dur > 0 ? dur : 5;
    timelineData = [{ ...targetSingle, startTime: 0, visDuration }];
    headerName = targetSingle.name;
    headerMode = "single cue";
  }

  const maxTime = Math.max(...timelineData.map(d => d.startTime + d.visDuration), 15);
  const PIXELS_PER_SEC = 50;

  return (
    <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden relative">
      <div className="bg-gray-900 border-b border-gray-800 flex items-center pr-4 pl-40 py-3 shrink-0 justify-between">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" /> Sequence: {headerName}
        </h3>
        <span className="text-[10px] text-gray-500 font-mono tracking-widest">MODE: {headerMode.toUpperCase()}</span>
      </div>
      
      <div className="flex-1 overflow-auto relative custom-scrollbar bg-[#0a0a0a]">
        {/* Time Ruler */}
        <div className="sticky top-0 z-20 h-6 bg-gray-900/90 backdrop-blur border-b border-gray-800 flex" style={{ width: Math.max(800, maxTime * PIXELS_PER_SEC + 100) }}>
           {Array.from({ length: Math.ceil(maxTime) + 2 }).map((_, i) => (
             <div key={`ruler-${i}`} className="absolute h-full border-l border-gray-700 text-[9px] text-gray-500 pl-1" style={{ left: i * PIXELS_PER_SEC }}>
               {i}s
             </div>
           ))}
        </div>

        {/* Tracks Area */}
        <div className="relative pt-2 pb-8" style={{ width: Math.max(800, maxTime * PIXELS_PER_SEC + 100), height: (timelineData.length * 45) + 40 }}>
           {timelineData.map((d, i) => (
             <div 
               key={d.id} 
               onClick={() => {
                 setSelectedCueIds([d.id]);
                 setLastSelectedId(d.id);
                 scrollCueIntoView(d.id);
               }}
               className={`absolute h-8 rounded flex flex-col justify-center px-2 overflow-hidden shadow-md text-[10px] font-semibold tracking-wider text-white border transition-opacity ${d.state === 'playing' ? 'bg-green-600 border-green-500 z-10' : d.state === 'stopping' ? 'bg-yellow-600 border-yellow-500 z-10' : 'bg-blue-900/60 border-blue-700 hover:bg-blue-800/80 cursor-pointer'}`}
               style={{ left: d.startTime * PIXELS_PER_SEC, width: d.visDuration * PIXELS_PER_SEC, top: (i * 45) + 8 }}
               title={`${d.number} - ${d.name} (${d.visDuration}s)`}
             >
               <div className="w-full relative z-10 flex justify-between items-center gap-2 overflow-hidden">
                 <span className="truncate">{d.name}</span>
                 <div className="flex items-center gap-1 shrink-0">
                   <span className="opacity-50">{d.type}</span>
                   {d.followAction === 'auto-follow' && <ArrowRight className="w-3 h-3 text-green-300 opacity-90" title="Auto-follows to next cue on end" />}
                 </div>
               </div>
               {/* Visual Fade Overlays */}
               {d.fadeInTime > 0 && <div className="absolute top-0 left-0 bottom-0 bg-black/40 border-r border-white/20" style={{ width: d.fadeInTime * PIXELS_PER_SEC, clipPath: 'polygon(0 100%, 100% 100%, 100% 0)' }} />}
               {d.fadeOutTime > 0 && <div className="absolute top-0 right-0 bottom-0 bg-black/40 border-l border-white/20" style={{ width: d.fadeOutTime * PIXELS_PER_SEC, clipPath: 'polygon(0 100%, 100% 100%, 0 0)' }} />}
             </div>
           ))}
        </div>
      </div>
    </div>
  );
});

export default TimelineView;