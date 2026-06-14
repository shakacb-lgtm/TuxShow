import React, { useState, useEffect } from 'react';
import { 
  Activity, ChevronDown, Edit3, Database, Clock, Palette, Maximize, Crop, 
  Wand2, Type, Hourglass, Bold, Italic, CornerDownRight, Repeat, Wifi, Save, Volume2, SlidersHorizontal,
  Settings2, XSquare, CalendarClock, FolderOpen, GitBranch, X, MonitorUp, Lightbulb, Layers,
  Play, Pause, Square, Languages, AlertTriangle
} from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary.jsx';
import { glslEngine } from './glslFilterEngine.js';

// Local helper for formatting time inside the MediaInfoBox
const formatTime = (timeInSeconds) => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";
  const m = Math.floor(timeInSeconds / 60);
  const s = Math.floor(timeInSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const MediaInfoBox = React.memo(({ cue }) => {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!cue || !cue.url || !['video', 'audio', 'image'].includes(cue.type)) {
      setInfo(null);
      return;
    }
    
    let isMounted = true;
    let retries = 0;

    const checkInfo = () => {
       if (!isMounted) return;
       const el = document.getElementById(`master-${cue.type === 'video' ? 'vid' : (cue.type === 'audio' ? 'aud' : 'img')}-${cue.id}`);
       if (!el && retries < 20) { retries++; setTimeout(checkInfo, 500); return; }
       
       let res = 'N/A'; let duration = 'N/A';
       
       if (el) {
           if (cue.type === 'video' && el.readyState >= 1) { res = `${el.videoWidth}x${el.videoHeight}`; duration = formatTime(el.duration); }
           else if (cue.type === 'image' && el.complete && el.naturalWidth) { res = `${el.naturalWidth}x${el.naturalHeight}`; }
           else if (cue.type === 'audio' && el.readyState >= 1) { duration = formatTime(el.duration); }
           else if (retries < 20) { retries++; setTimeout(checkInfo, 500); return; }
       }
       
       let pathname = cue.url;
       try { if (cue.url.startsWith('file://')) { const urlObj = new URL(cue.url); pathname = decodeURIComponent(urlObj.pathname); } } catch(e) {}
       
       let filename = pathname.split(/[/\\]/).pop() || '';
       const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
       const ext = extMatch ? extMatch[1].toUpperCase() : 'UNKNOWN';
       const pathStr = pathname.substring(0, pathname.lastIndexOf(filename)) || '/';
       
       setInfo({ filename, path: pathStr, res, duration, ext, type: cue.type });
    };
    
    checkInfo();
    return () => { isMounted = false; };
  }, [cue]);

  if (!info) return null;

  return (
      <div className="col-span-2 bg-gray-950/80 border border-gray-800 p-3 rounded mt-2 text-[10px] text-gray-400 font-mono relative overflow-hidden flex gap-4">
         <div className="absolute right-0 top-0 text-[40px] font-bold text-gray-800/30 leading-none pointer-events-none select-none -mt-2 -mr-1">{info.ext}</div>
         <div className="flex-1 space-y-1 relative z-10">
             <div className="flex items-center gap-2 border-b border-gray-800 pb-1.5 mb-1.5 text-gray-300 font-bold uppercase tracking-wider">
                 <Activity className="w-3 h-3 text-blue-500" /> Media Information
             </div>
             <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                 <div className="truncate col-span-2" title={info.filename}><span className="text-gray-500">File:</span> <span className="text-gray-200">{info.filename}</span></div>
                 <div><span className="text-gray-500">Type:</span> <span className="text-blue-300">{info.type.toUpperCase()} / {info.ext}</span></div>
                 <div className="truncate" title={info.path}><span className="text-gray-500">Path:</span> {info.path}</div>
                 {info.type !== 'audio' && <div><span className="text-gray-500">Resolution:</span> <span className="text-gray-200">{info.res}</span></div>}
                 {info.type !== 'image' && <div><span className="text-gray-500">Length:</span> <span className="text-gray-200">{info.duration}</span></div>}
                 <div><span className="text-gray-500">Decoder:</span> <span className="text-gray-400 italic">Native Browser</span></div>
             </div>
         </div>
         {(info.type === 'image' || info.type === 'video') && (
           <div className="w-32 bg-black/50 rounded border border-gray-800 flex items-center justify-center shrink-0 z-10 overflow-hidden" title="Media Thumbnail">
              {info.type === 'image' ? (
                 <img src={cue.url} className="w-full h-full object-contain opacity-80 hover:opacity-100 transition-opacity" alt="Thumb" onError={(e) => console.error(`[InspectorPanel] Failed to load image thumbnail from URL: ${cue.url}`, e)} />
              ) : (
                 <video src={`${cue.url}#t=0.5`} className="w-full h-full object-contain opacity-80 hover:opacity-100 transition-opacity" preload="metadata" onError={(e) => console.error(`[InspectorPanel] Failed to load video thumbnail from URL: ${cue.url}`, e)} />
              )}
           </div>
         )}
      </div>
  );
});

const LiveMediaRow = ({ activeCue, setCues }) => {
    const [progress, setProgress] = React.useState(0);
    const [duration, setDuration] = React.useState(0);
    const [isPaused, setIsPaused] = React.useState(false);
    const isDragging = React.useRef(false);

    // Sync directly with the DOM element's time updates
    React.useEffect(() => {
        const elId = `master-${activeCue.type === 'video' ? 'vid' : 'aud'}-${activeCue.id}`;
        const el = document.getElementById(elId);
        if (!el) return;

        const onTimeUpdate = () => {
            if (!isDragging.current) setProgress(el.currentTime);
            if (el.duration && duration !== el.duration) setDuration(el.duration);
        };
        const onPlay = () => setIsPaused(false);
        const onPause = () => setIsPaused(true);

        // Initial sync
        setProgress(el.currentTime);
        setDuration(el.duration || 0);
        setIsPaused(el.paused);

        el.addEventListener('timeupdate', onTimeUpdate);
        el.addEventListener('play', onPlay);
        el.addEventListener('pause', onPause);

        return () => {
            el.removeEventListener('timeupdate', onTimeUpdate);
            el.removeEventListener('play', onPlay);
            el.removeEventListener('pause', onPause);
        };
    }, [activeCue.id, activeCue.type, duration]);

    const togglePause = () => {
        const elId = `master-${activeCue.type === 'video' ? 'vid' : 'aud'}-${activeCue.id}`;
        const el = document.getElementById(elId);
        if (el) {
            if (el.paused) el.play();
            else el.pause();
        }
    };

    const handleScrub = (e) => {
        const newTime = parseFloat(e.target.value);
        setProgress(newTime);
        const elId = `master-${activeCue.type === 'video' ? 'vid' : 'aud'}-${activeCue.id}`;
        const el = document.getElementById(elId);
        if (el) el.currentTime = newTime;
    };

    const stopCue = () => {
        setCues(prev => prev.map(c => c.id === activeCue.id ? { ...c, state: 'stopped' } : c));
    };

    return (
        <div className="bg-gray-900 border border-green-900/50 rounded-lg p-3 shadow-sm animate-fade-in mb-3">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 truncate pr-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'}`}></div>
                    <span className="text-xs font-bold text-gray-200 truncate">{activeCue.number} - {activeCue.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button 
                        onClick={togglePause} 
                        className="p-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-300 transition-colors"
                        title={isPaused ? "Play" : "Pause locally"}
                    >
                        {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                        onClick={stopCue} 
                        className="p-1.5 bg-red-900/40 hover:bg-red-800 border border-red-800 rounded text-red-300 transition-colors"
                        title="Kill Cue"
                    >
                        <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] text-gray-400 w-8 text-right shrink-0 font-mono">{formatTime(progress)}</span>
                <input 
                    type="range" min="0" max={duration || 1} step="0.01" 
                    value={progress}
                    onMouseDown={() => isDragging.current = true}
                    onMouseUp={() => isDragging.current = false}
                    onChange={handleScrub}
                    className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <span className="text-[9px] text-gray-400 w-8 shrink-0 font-mono">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <input 
                    type="range" min="0" max="1" step="0.01" 
                    defaultValue={activeCue.volume !== undefined ? activeCue.volume : 1}
                    onChange={(e) => {
                        const elId = `master-${activeCue.type === 'video' ? 'vid' : 'aud'}-${activeCue.id}`;
                        const el = document.getElementById(elId);
                        if (el) el.volume = parseFloat(e.target.value);
                    }}
                    className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
            </div>
        </div>
    );
};

const PluginAccordion = React.memo(({ plugin, activeCue, cues, setCues, selectedCueIds, updateSelectedCues }) => {
  const [isOpen, setIsOpen] = useState(false);
  const PluginComponent = plugin.renderTab;

  return (
    <div className="space-y-3 bg-gray-950/40 p-3 rounded border border-gray-800">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between outline-none cursor-pointer"
      >
        <h4 className="text-[10px] font-bold text-purple-500 uppercase tracking-wider flex items-center gap-2">
          {plugin.icon && <span className="flex items-center justify-center w-4 h-4">{plugin.icon}</span>}
          {plugin.name}
        </h4>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="pt-3 border-t border-gray-800 mt-2">
          <ErrorBoundary>
            <PluginComponent 
              activeCue={activeCue} 
              cues={cues}
              setCues={setCues}
              selectedCueIds={selectedCueIds}
              updateSelectedCues={updateSelectedCues}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
});

const parseSubtitleText = (text, extension) => {
  if (extension === 'csv') {
    const lines = text.split(/\r?\n/);
    const parsed = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      let val = '';
      if (line.includes(',')) {
        const parts = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current.trim());
        val = parts[parts.length - 1];
      } else {
        val = line;
      }
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
      }
      val = val.trim();
      if (val) parsed.push(val);
    }
    return parsed;
  } else {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawBlocks = normalized.split(/\n\s*\n/);
    const parsed = [];
    for (const block of rawBlocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      
      const arrowIndex = lines.findIndex(l => l.includes('-->'));
      if (arrowIndex !== -1) {
        const textLines = lines.slice(arrowIndex + 1);
        if (textLines.length > 0) {
          parsed.push(textLines.join('\n'));
        }
      } else {
        const firstLine = lines[0].toUpperCase();
        if (firstLine !== 'WEBVTT' && !/^\d+$/.test(lines[0]) && lines[0].length > 0) {
          parsed.push(lines.join('\n'));
        }
      }
    }
    return parsed;
  }
};

const areInspectorPropsEqual = (prevProps, nextProps) => {
  if (prevProps.videoDevices !== nextProps.videoDevices ||
      prevProps.hardwareDisplays !== nextProps.hardwareDisplays ||
      prevProps.setShowInspector !== nextProps.setShowInspector) {
    return false;
  }
  const prevSel = prevProps.selectedCueIds || [];
  const nextSel = nextProps.selectedCueIds || [];
  if (prevSel.length !== nextSel.length || !prevSel.every((id, i) => id === nextSel[i])) {
    return false;
  }
  for (const id of nextSel) {
    const prevCue = prevProps.cues.find(c => c.id === id);
    const nextCue = nextProps.cues.find(c => c.id === id);
    if (!prevCue || !nextCue) return false;
    
    // Compare properties of selected cues
    const keys = Object.keys(nextCue);
    for (const key of keys) {
      if (typeof nextCue[key] === 'object' && nextCue[key] !== null) {
        if (JSON.stringify(prevCue[key]) !== JSON.stringify(nextCue[key])) {
          return false;
        }
      } else {
        if (prevCue[key] !== nextCue[key]) {
          return false;
        }
      }
    }
  }
  if (prevProps.activeCues?.length !== nextProps.activeCues?.length) {
    return false;
  }
  return true;
};

const Inspector = React.memo(function Inspector({ 
  cues, setCues, selectedCueIds, activeCues, isMixed, getSharedVal, updateSelectedCues, 
  getNativeFilePath, videoDevices, hardwareDisplays, setEditingMaskCueId, setEditingWarpCueId,
  handleUrlBlur, setEditingPathCueId, mediaTimes, setShowInspector
}) {
  const [pluginPanels, setPluginPanels] = useState([]);
  const [inspectorMode, setInspectorMode] = useState('edit'); // 'edit' or 'live'
  const [focusedFields, setFocusedFields] = useState({});
  const [localHeaders, setLocalHeaders] = useState('');
  const [localBody, setLocalBody] = useState('');
  const [headersError, setHeadersError] = useState(false);
  const [bodyError, setBodyError] = useState(false);

  const sharedHeaders = getSharedVal('webhookHeaders', '');
  const sharedBody = getSharedVal('webhookBody', '');

  useEffect(() => {
    setLocalHeaders(sharedHeaders);
    setHeadersError(false);
  }, [sharedHeaders, selectedCueIds]);

  useEffect(() => {
    setLocalBody(sharedBody);
    setBodyError(false);
  }, [sharedBody, selectedCueIds]);

  const handleHeadersChange = (val) => {
    setLocalHeaders(val);
    if (!val.trim()) {
      setHeadersError(false);
      updateSelectedCues('webhookHeaders', val);
      return;
    }
    try {
      JSON.parse(val);
      setHeadersError(false);
      updateSelectedCues('webhookHeaders', val);
    } catch (e) {
      setHeadersError(true);
    }
  };

  const handleBodyChange = (val) => {
    setLocalBody(val);
    if (!val.trim()) {
      setBodyError(false);
      updateSelectedCues('webhookBody', val);
      return;
    }
    try {
      JSON.parse(val);
      setBodyError(false);
      updateSelectedCues('webhookBody', val);
    } catch (e) {
      setBodyError(true);
    }
  };

  useEffect(() => {
    if (window.tuxShowRegistry && window.tuxShowRegistry.subscribe) {
      return window.tuxShowRegistry.subscribe(setPluginPanels);
    }
  }, []);

  return (
    <div className="w-[400px] border-l border-gray-800 bg-gray-900 flex flex-col shrink-0 overflow-hidden h-full">
      <div className="bg-gray-800/50 px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase flex items-center justify-between tracking-widest">
        <div className="flex items-center gap-2"><Edit3 className="w-4 h-4" /> Inspector</div>
        <button onClick={() => setShowInspector(false)} className="hover:text-white p-1 -mr-1 rounded hover:bg-gray-700"><X className="w-4 h-4"/></button>
      </div>
      
      {/* INSPECTOR MODE TABS */}
      <div className="flex border-b border-gray-800 shrink-0">
          <button
              onClick={() => setInspectorMode('edit')}
              className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${inspectorMode === 'edit' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-900/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'}`}
          >
              <Settings2 className="w-3.5 h-3.5" />
              Edit Selection
          </button>
          <button
              onClick={() => setInspectorMode('live')}
              className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${inspectorMode === 'live' ? 'text-green-400 border-b-2 border-green-500 bg-green-900/10' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'}`}
          >
              <Activity className="w-3.5 h-3.5" />
              Live Media
          </button>
      </div>

      {inspectorMode === 'edit' && (
        <>
        {activeCues.length > 0 ? (
        <div className="p-4 flex flex-col gap-y-4 overflow-y-auto custom-scrollbar pb-12">
          
          {/* SECTION 1: Basics & Routing */}
          <div className="space-y-3 bg-gray-950/40 p-3 rounded border border-gray-800">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Cue Number & Type</label>
              <div className="flex gap-2">
                <input type="text" value={isMixed('number') ? '' : getSharedVal('number', '')} placeholder={isMixed('number') ? '<Locked>' : ''} disabled={activeCues.length > 1} onChange={(e) => updateSelectedCues('number', e.target.value)} className={`w-16 bg-gray-950 border border-gray-700 focus:border-blue-500 transition-colors rounded px-2 py-1.5 text-sm outline-none ${activeCues.length > 1 ? 'opacity-50 cursor-not-allowed text-gray-500' : 'text-gray-200'}`} />
                <select value={isMixed('type') ? 'mixed' : getSharedVal('type', 'video')} onChange={(e) => {
                    const newType = e.target.value;
                    setCues(prev => prev.map(c => {
                       if (selectedCueIds.includes(c.id)) {
                          let newUrl = c.url;
                          if (newType === 'camera' && newUrl && (newUrl.includes('w3schools') || newUrl.startsWith('file://'))) newUrl = '';
                          let extraProps = {};
                          if (newType === 'text') extraProps = { 
                            textContent: c.textContent || 'NEW TITLE', textColor: c.textColor || '#ffffff', textScale: c.textScale || 120, 
                            textAlign: c.textAlign || 'center', fontFamily: c.fontFamily || 'sans-serif', fontWeight: c.fontWeight || 'bold', 
                            fontStyle: c.fontStyle || 'normal', textX: c.textX ?? 50, textY: c.textY ?? 50, textShadowEnabled: c.textShadowEnabled || false, 
                            textShadowColor: c.textShadowColor || '#000000', textShadowBlur: c.textShadowBlur ?? 10, textShadowOffsetX: c.textShadowOffsetX ?? 5, 
                            textShadowOffsetY: c.textShadowOffsetY ?? 5, textSmoothing: c.textSmoothing ?? true 
                          };
                          else if (newType === 'timer') extraProps = {
                            timerDuration: c.timerDuration || 60, timerStyle: c.timerStyle || 'countdown', timerFormat: c.timerFormat || 'MM:SS', timerVisible: c.timerVisible ?? true,
                            textColor: c.textColor || '#ffffff', textScale: c.textScale || 120, textAlign: c.textAlign || 'center', fontFamily: c.fontFamily || 'sans-serif', fontWeight: c.fontWeight || 'bold', fontStyle: c.fontStyle || 'normal', textX: c.textX ?? 50, textY: c.textY ?? 50, textShadowEnabled: c.textShadowEnabled || false, textShadowColor: c.textShadowColor || '#000000', textShadowBlur: c.textShadowBlur ?? 10, textShadowOffsetX: c.textShadowOffsetX ?? 5, textShadowOffsetY: c.textShadowOffsetY ?? 5, textSmoothing: c.textSmoothing ?? true 
                          }
                          else if (newType === 'conditional') extraProps = { conditionRunMode: c.conditionRunMode || 'immediate', conditionType: c.conditionType || 'cue-state', conditionTargetCue: c.conditionTargetCue || '', conditionState: c.conditionState || 'playing', conditionOscPath: c.conditionOscPath || '/tuxshow/sensor', conditionOscValue: c.conditionOscValue || '1', trueTargetCue: c.trueTargetCue || '', falseTargetCue: c.falseTargetCue || '' };
                          else if (newType === 'osc') extraProps = { oscIp: c.oscIp || '127.0.0.1', oscPort: c.oscPort || 53000, oscAddress: c.oscAddress || '/tuxshow/go', oscArgs: c.oscArgs || '' };
                          else if (newType === 'msc') extraProps = { mscDevice: c.mscDevice || '0', mscCommand: c.mscCommand || 'GO', mscCue: c.mscCue || '1' };
                          else if (newType === 'goto') extraProps = { gotoMode: c.gotoMode || 'specific', targetCueNumber: c.targetCueNumber || '', targetCueRangeMin: c.targetCueRangeMin || '', targetCueRangeMax: c.targetCueRangeMax || '' };
                          else if (newType === 'counter') extraProps = { targetCueNumber: c.targetCueNumber || '', counterLimit: c.counterLimit || 1, counterCurrent: 0 };
                          else if (newType === 'transition') extraProps = { duration: c.duration || 1.0, transitionType: c.transitionType || 'wipe-up' };
                          else if (newType === 'stop') extraProps = { targetCueNumber: c.targetCueNumber || '' };
                          else if (newType === 'state-changer') extraProps = { stateChangeMode: 'lock', targetCueNumber: c.targetCueNumber || '' };
                          else if (newType === 'time') extraProps = { scheduleTime: c.scheduleTime || '', scheduleDate: c.scheduleDate || '' };
                          else if (newType === 'group') extraProps = { groupMode: c.groupMode || 'fire-all' };
                          else if (newType === 'animate') extraProps = { animTargetCue: '', animProperty: 'posX', animStartValue: 0, animEndValue: 100, duration: 2.0 };
                          else if (newType === 'dmx') extraProps = { dmxChannel: 1, dmxEndValue: 255, duration: 2.0 };
                          else if (newType === 'sequence') extraProps = { children: [] };
                          else if (newType === 'select') extraProps = { targetCueNumber: c.targetCueNumber || '' };
                          else if (newType === 'memo') extraProps = { memoColor: c.memoColor || 'yellow' };
                          else if (newType === 'webhook') extraProps = {
                            webhookUrl: c.webhookUrl || '',
                            webhookMethod: c.webhookMethod || 'GET',
                            webhookHeaders: c.webhookHeaders || '',
                            webhookBody: c.webhookBody || ''
                          };
                          else if (newType === 'surtitle') extraProps = {
                            surtitleFilePath: c.surtitleFilePath || '',
                            surtitleLines: c.surtitleLines || [],
                            currentLineIndex: c.currentLineIndex ?? -1,
                            textColor: c.textColor || '#ffffff',
                            textScale: c.textScale || 100,
                            textAlign: c.textAlign || 'center',
                            fontFamily: c.fontFamily || 'sans-serif',
                            fontWeight: c.fontWeight || 'bold',
                            fontStyle: c.fontStyle || 'normal',
                            textX: c.textX ?? 50,
                            textY: c.textY ?? 85,
                            textShadowEnabled: c.textShadowEnabled ?? true,
                            textShadowColor: c.textShadowColor || '#000000',
                            textShadowBlur: c.textShadowBlur ?? 15,
                            textShadowOffsetX: c.textShadowOffsetX ?? 5,
                            textShadowOffsetY: c.textShadowOffsetY ?? 5,
                            duration: c.duration || 0.5
                          };
                          
                          if (['video','image','camera','text','timer','surtitle'].includes(newType)) {
                              extraProps = { ...extraProps, scaleX: c.scaleX ?? 100, scaleY: c.scaleY ?? 100, keepAspect: c.keepAspect ?? true, posX: c.posX ?? 50, posY: c.posY ?? 50, cropTop: c.cropTop ?? 0, cropBottom: c.cropBottom ?? 0, cropLeft: c.cropLeft ?? 0, cropRight: c.cropRight ?? 0, outlineEnabled: c.outlineEnabled ?? false, outlineColor: c.outlineColor ?? '#ffffff', outlineWidth: c.outlineWidth ?? 2, warpEnabled: c.warpEnabled ?? false, warpPins: c.warpPins || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], shaderBlurRadius: c.shaderBlurRadius ?? 5.0, shaderNoiseIntensity: c.shaderNoiseIntensity ?? 0.5, shaderNoiseSpeed: c.shaderNoiseSpeed ?? 1.0 };
                          }
                          return { ...c, type: newType, url: newUrl, ...extraProps };
                       }
                       return c;
                    }));
                }} className="flex-1 bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none transition-colors">
                  {isMixed('type') && <option value="mixed" disabled hidden>-- Mixed Types --</option>}
                  <option value="video">Video Media</option><option value="audio">Audio Only</option><option value="image">Image Graphic</option><option value="camera">Live Capture</option><option value="text">Text / Title</option><option value="timer">Canvas Timer</option><option value="surtitle">Surtitle / Captions</option><option value="blackout">Stage Blackout</option><option value="pause">Pause Show</option><option value="goto">GoTo Pointer</option><option value="counter">Loop Counter</option><option value="transition">Scene Transition</option><option value="time">Time / Scheduled</option><option value="conditional">Conditional (If/Then)</option><option value="stop">Targeted Stop</option><option value="state-changer">State Changer</option><option value="select">Select Cue (No Fire)</option><option value="memo">Memo / Operator Note</option><option value="msc">MSC (MIDI Show Control)</option><option value="osc">OSC (Open Sound Control)</option><option value="projector">Projector Control</option><option value="dmx">DMX Lighting</option><option value="webhook">IoT Webhook</option><option value="sequence">Sequence / Timeline</option><option value="group">Group / Folder</option><option value="animate">Animate / Tween</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Cue Name</label>
              <input type="text" value={isMixed('name') ? '' : getSharedVal('name', '')} placeholder={isMixed('name') ? '<Multiple Cues Selected>' : ''} disabled={activeCues.length > 1} onChange={(e) => updateSelectedCues('name', e.target.value)} className={`w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none transition-colors ${activeCues.length > 1 ? 'opacity-50 cursor-not-allowed text-gray-500' : 'text-gray-200'}`} />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Parent Group</label>
              <select value={isMixed('groupId') ? 'mixed' : (getSharedVal('groupId', '') || '')} onChange={(e) => updateSelectedCues('groupId', e.target.value === '' ? null : e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none transition-colors">
                {isMixed('groupId') && <option value="mixed" disabled hidden>-- Mixed Groups --</option>}
                <option value="">None (Root Level)</option>
                {cues.filter(c => c.type === 'group' && !selectedCueIds.includes(c.id)).map(g => (<option key={g.id} value={g.id}>Group {g.number}: {g.name}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-6 pt-2 border-t border-gray-800">
              <label className="flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer hover:text-white transition-colors font-bold uppercase tracking-wider">
                <input type="checkbox" checked={!!getSharedVal('lockedBy')} onChange={(e) => updateSelectedCues('lockedBy', e.target.checked ? 'Manual' : null)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-yellow-500 focus:ring-yellow-500 cursor-pointer" /> Lock Object
              </label>
              <label className="flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer hover:text-white transition-colors font-bold uppercase tracking-wider">
                <input type="checkbox" checked={getSharedVal('disabled', false)} onChange={(e) => {
                    const disabled = e.target.checked;
                    setCues(prev => prev.map(c => selectedCueIds.includes(c.id) ? { ...c, disabled, state: disabled && (c.state === 'playing' || c.state === 'stopping') && !c.lockedBy ? ((c.fadeOutTime > 0 && c.state === 'playing') ? 'stopping' : 'completed') : c.state } : c));
                }} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-red-500 focus:ring-red-500 cursor-pointer" /> Disable Object
              </label>
            </div>
          
            {(!['group', 'goto', 'pause', 'counter', 'transition', 'time', 'msc', 'osc', 'stop', 'state-changer', 'conditional', 'select', 'memo'].includes(getSharedVal('type'))) && (
              <div className="pt-2 border-t border-gray-800">
                <label className="block text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Output Routing</label>
                <select value={isMixed('targetDisplay') ? 'mixed' : getSharedVal('targetDisplay', 'all')} onChange={(e) => updateSelectedCues('targetDisplay', e.target.value)} className="w-full bg-blue-950/20 border border-blue-800/40 rounded px-2 py-1.5 text-sm font-mono text-blue-200 outline-none focus:border-blue-500">
                  {isMixed('targetDisplay') && <option value="mixed" disabled hidden>-- Mixed Displays --</option>}
                  <option value="all">All Displays</option>
                  <option value="webrtc">Virtual WebRTC Output Only</option>
                  {hardwareDisplays.map(d => (<option key={d.id} value={d.id}>{d.label} {d.isPrimary ? '(Primary)' : ''}</option>))}
                </select>
              </div>
            )}

            <div className="pt-2 border-t border-gray-800">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-2"><Edit3 className="w-3 h-3"/> Notes / Description</label>
              <textarea value={isMixed('description') ? '' : getSharedVal('description', '')} placeholder={isMixed('description') ? '<Multiple Values>' : 'Enter media details or cue notes here...'} onChange={(e)=>updateSelectedCues('description', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none h-16 custom-scrollbar resize-y transition-colors" />
            </div>
          </div>
          
          {/* SECTION 2: Source & Content */}
          <div className="space-y-3 bg-gray-950/40 p-3 rounded border border-gray-800">
            <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-wider flex items-center gap-2 mb-2"><Database className="w-4 h-4"/> Content Source</h4>

            {['video', 'audio', 'image'].includes(getSharedVal('type')) && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Media URL</label>
                  <div className="flex gap-2">
                    <input type="text" value={isMixed('url') ? '' : getSharedVal('url', '')} placeholder={isMixed('url') ? '<Multiple Values>' : ''} onChange={(e) => updateSelectedCues('url', e.target.value)} className="flex-1 bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none transition-colors" />
                    <button onClick={() => { const input = document.createElement('input'); input.type='file'; input.onchange=(e)=>{const file=e.target.files[0]; if(file){ updateSelectedCues('url', getNativeFilePath(file)); updateSelectedCues('name', file.name); }}; input.click(); }} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors cursor-pointer">Browse</button>
                  </div>
                </div>
                {!isMixed('url') && activeCues.length === 1 && <MediaInfoBox cue={activeCues[0]} />}
                
                {['video', 'audio'].includes(getSharedVal('type')) && activeCues.length === 1 && mediaTimes[activeCues[0].id] && mediaTimes[activeCues[0].id].duration > 0 && Number.isFinite(mediaTimes[activeCues[0].id].duration) && (
                   <div className="bg-gray-950 p-3 rounded border border-gray-800">
                     <div className="flex justify-between items-end mb-1">
                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Live Playhead (Scrub)</label>
                        <span className="text-xs font-mono text-blue-400">{formatTime(mediaTimes[activeCues[0].id].current)} / {formatTime(mediaTimes[activeCues[0].id].duration)}</span>
                     </div>
                     <input type="range" min="0" max={mediaTimes[activeCues[0].id].duration} step="0.1" value={mediaTimes[activeCues[0].id].current} onChange={(e) => { const el = document.getElementById(`master-${activeCues[0].type === 'video' ? 'vid' : 'aud'}-${activeCues[0].id}`); if (el) { el.currentTime = parseFloat(e.target.value); } }} className="w-full accent-blue-500 cursor-pointer" />
                   </div>
                )}

                {['video', 'image'].includes(getSharedVal('type')) && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Live WebGL Filter</label>
                        <select 
                            value={isMixed('shaderId') ? '' : getSharedVal('shaderId', '')} 
                            onChange={(e) => updateSelectedCues('shaderId', e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500"
                        >
                            <option value="">None (Passthrough)</option>
                            <option value="grayscale">Dramatic Grayscale</option>
                            <option value="invert">Color Invert</option>
                            <option value="blur">Blur (Gaussian)</option>
                            <option value="noise">Noise / Film Grain</option>
                            <option value="edge">Edge Detection (Sobel)</option>
                            {glslEngine && Object.keys(glslEngine.customShaders || {}).map(key => {
                                if (['invert', 'grayscale'].includes(key)) return null;
                                const label = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                return (
                                    <option key={key} value={key}>{label}</option>
                                );
                            })}
                        </select>
                        
                        {getSharedVal('shaderId') === 'blur' && (
                            <div className="mt-2 flex items-center gap-2 animate-fade-in">
                                <label className="text-[9px] text-gray-400 font-bold uppercase w-16">Radius</label>
                                <input type="range" min="1" max="20" step="0.5" value={isMixed('shaderBlurRadius') ? 5 : getSharedVal('shaderBlurRadius', 5.0)} onChange={(e) => updateSelectedCues('shaderBlurRadius', parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                                <span className="text-xs text-gray-500 w-8 text-right">{getSharedVal('shaderBlurRadius', 5.0)}</span>
                            </div>
                        )}
                        {getSharedVal('shaderId') === 'noise' && (
                            <div className="mt-2 space-y-2 animate-fade-in">
                                <div className="flex items-center gap-2">
                                    <label className="text-[9px] text-gray-400 font-bold uppercase w-16">Intensity</label>
                                    <input type="range" min="0" max="1" step="0.05" value={isMixed('shaderNoiseIntensity') ? 0.5 : getSharedVal('shaderNoiseIntensity', 0.5)} onChange={(e) => updateSelectedCues('shaderNoiseIntensity', parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                                    <span className="text-xs text-gray-500 w-8 text-right">{getSharedVal('shaderNoiseIntensity', 0.5)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-[9px] text-gray-400 font-bold uppercase w-16">Speed</label>
                                    <input type="range" min="0" max="5" step="0.1" value={isMixed('shaderNoiseSpeed') ? 1.0 : getSharedVal('shaderNoiseSpeed', 1.0)} onChange={(e) => updateSelectedCues('shaderNoiseSpeed', parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                                    <span className="text-xs text-gray-500 w-8 text-right">{getSharedVal('shaderNoiseSpeed', 1.0)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
              </div>
            )}
            
            {getSharedVal('type') === 'camera' && (
              <div className="flex flex-col gap-3">
                 <div>
                    <label className="block text-[10px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Hardware Capture Device</label>
                    <select value={isMixed('url') ? 'mixed' : (getSharedVal('url', '').startsWith('http') || getSharedVal('url', '').startsWith('rtsp') || getSharedVal('url', '').startsWith('webrtc') ? '' : getSharedVal('url', ''))} onChange={(e) => updateSelectedCues('url', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm font-mono text-gray-200 outline-none">
                      {isMixed('url') && <option value="mixed" disabled hidden>-- Mixed Devices --</option>}
                      <option value="">Default System Camera</option>
                      <option value="mobile-camera">Mobile App Camera (PWA)</option>
                      {videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera (${d.deviceId.slice(0,5)}...)`}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="block text-[10px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Network Stream URL</label>
                    <input list="url-history" type="text" placeholder={isMixed('url') ? '<Multiple Values>' : "webrtc://127.0.0.1:8554/display1"} value={isMixed('url') ? '' : (!getSharedVal('url', '').includes('://') && getSharedVal('url', '').length > 15 ? '' : getSharedVal('url', ''))} onChange={(e) => updateSelectedCues('url', e.target.value)} onBlur={(e) => handleUrlBlur(e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-xs font-mono text-gray-200 outline-none" />
                 </div>
              </div>
            )}

            {getSharedVal('type') === 'surtitle' && (
               <div className="space-y-3 pb-3 border-b border-gray-800 mb-3 animate-fade-in">
                 <div>
                   <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">Load Subtitle File (.srt, .vtt, .csv)</label>
                   <div className="flex gap-2">
                     <input 
                       type="file" 
                       accept=".srt,.vtt,.csv" 
                       onChange={(e) => {
                         const file = e.target.files?.[0];
                         if (file) {
                           const reader = new FileReader();
                           reader.onload = (event) => {
                             const text = event.target.result;
                             const ext = file.name.split('.').pop().toLowerCase();
                             const parsedLines = parseSubtitleText(text, ext);
                             updateSelectedCues('surtitleFilePath', file.name);
                             updateSelectedCues('surtitleLines', parsedLines);
                             updateSelectedCues('currentLineIndex', -1);
                             
                             activeCues.forEach(c => {
                               if (c.name === 'New Cue' || !c.name) {
                                 updateSelectedCues('name', file.name);
                               }
                             });
                           };
                           reader.readAsText(file);
                         }
                       }}
                       className="hidden" 
                       id="surtitle-file-upload" 
                     />
                     <label htmlFor="surtitle-file-upload" className="flex-1 text-center bg-gray-950 hover:bg-gray-800 border border-gray-700 hover:border-gray-500 rounded px-2 py-2 text-xs font-mono text-emerald-400 cursor-pointer transition-all flex items-center justify-center gap-1.5">
                       <FolderOpen className="w-3.5 h-3.5" />
                       {getSharedVal('surtitleFilePath') ? getSharedVal('surtitleFilePath') : 'Choose Subtitle File...'}
                     </label>
                   </div>
                 </div>

                 <div>
                   <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">Crossfade Duration (seconds)</label>
                   <input 
                     type="number" 
                     step="0.1" 
                     min="0" 
                     value={isMixed('duration') ? '' : getSharedVal('duration', 0.5)} 
                     onChange={(e) => updateSelectedCues('duration', parseFloat(e.target.value) || 0)} 
                     className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded px-2 py-1.5 text-sm outline-none text-gray-200" 
                   />
                 </div>

                 {getSharedVal('surtitleLines') && getSharedVal('surtitleLines').length > 0 && (
                   <div>
                     <div className="flex justify-between items-center mb-1">
                       <label className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Parsed Subtitle Lines</label>
                       <span className="text-[9px] font-mono text-gray-500">
                         {getSharedVal('currentLineIndex', -1) >= 0 ? `Line ${getSharedVal('currentLineIndex') + 1} of ${getSharedVal('surtitleLines').length}` : 'Not Started'}
                       </span>
                     </div>
                     <div className="bg-gray-950 border border-gray-800 rounded h-40 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                       {getSharedVal('surtitleLines').map((line, idx) => {
                         const isActive = getSharedVal('currentLineIndex', -1) === idx;
                         return (
                           <div 
                             key={idx}
                             onClick={() => updateSelectedCues('currentLineIndex', idx)}
                             className={`text-xs p-1.5 rounded cursor-pointer transition-colors border select-none ${
                               isActive 
                                 ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 font-semibold shadow-[0_0_8px_rgba(16,185,129,0.15)]' 
                                 : 'bg-gray-900/40 border-transparent text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                             }`}
                           >
                             <div className="flex items-start gap-1.5">
                               <span className={`font-mono text-[9px] px-1 rounded shrink-0 ${isActive ? 'bg-emerald-800/80 text-white' : 'bg-gray-800 text-gray-500'}`}>
                                 {idx + 1}
                               </span>
                               <span className="break-words leading-tight whitespace-pre-wrap">{line}</span>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                     <div className="flex gap-2 mt-2">
                       <button 
                         onClick={() => updateSelectedCues('currentLineIndex', -1)} 
                         className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs py-1.5 rounded border border-gray-700 active:scale-95 transition-all"
                       >
                         Reset to Ready
                       </button>
                       <button 
                         onClick={() => {
                           const curr = getSharedVal('currentLineIndex', -1);
                           const lines = getSharedVal('surtitleLines', []);
                           if (curr < lines.length - 1) {
                             updateSelectedCues('currentLineIndex', curr + 1);
                           }
                         }} 
                         disabled={getSharedVal('currentLineIndex', -1) >= getSharedVal('surtitleLines', []).length - 1}
                         className="flex-1 bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-300 disabled:opacity-40 disabled:hover:bg-emerald-900/50 text-xs py-1.5 rounded border border-emerald-800/40 active:scale-95 transition-all"
                       >
                         Next Line
                       </button>
                     </div>
                   </div>
                 )}
               </div>
             )}

             {(getSharedVal('type') === 'text' || getSharedVal('type') === 'timer' || getSharedVal('type') === 'surtitle') && (
              <div className="space-y-3">
                {getSharedVal('type') === 'timer' && (
                  <div className="flex flex-col gap-3 pb-2 border-b border-gray-800 mb-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-teal-400 mb-1 font-bold uppercase tracking-wider">Direction</label>
                        <select value={isMixed('timerStyle') ? 'mixed' : getSharedVal('timerStyle', 'countdown')} onChange={(e)=>updateSelectedCues('timerStyle', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-teal-500 rounded px-2 py-1.5 text-sm outline-none">
                          <option value="countdown">Countdown</option><option value="countup">Count Up</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] text-teal-400 mb-1 font-bold uppercase tracking-wider">Format</label>
                        <select value={isMixed('timerFormat') ? 'mixed' : getSharedVal('timerFormat', 'MM:SS')} onChange={(e)=>updateSelectedCues('timerFormat', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-teal-500 rounded px-2 py-1.5 text-sm outline-none">
                          <option value="MM:SS">MM:SS</option><option value="MM:SS.ms">MM:SS.ms</option><option value="HH:MM:SS">HH:MM:SS</option><option value="SS.ms">SS.ms</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-teal-400 mb-1 font-bold uppercase tracking-wider">Duration (s)</label>
                      <input type="number" min="0" value={isMixed('timerDuration') ? '' : getSharedVal('timerDuration', 60)} onChange={(e)=>updateSelectedCues('timerDuration', parseFloat(e.target.value)||0)} className="w-full bg-gray-950 border border-gray-700 focus:border-teal-500 rounded px-2 py-1.5 text-sm outline-none" />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-[10px] text-teal-400 font-bold uppercase tracking-wider cursor-pointer">
                        <input type="checkbox" checked={getSharedVal('timerVisible', true)} onChange={(e)=>updateSelectedCues('timerVisible', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-teal-500 focus:ring-teal-500" />
                        Show Timer on Projection Screen
                      </label>
                    </div>
                  </div>
                )}

                {getSharedVal('type') === 'text' && (
                  <div>
                    <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Content</label>
                    <textarea value={getSharedVal('textContent')} placeholder={isMixed('textContent') ? '<Multiple Values>' : ''} onChange={(e)=>updateSelectedCues('textContent', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none h-16 custom-scrollbar" />
                  </div>
                )}

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Color</label>
                    <input type="color" value={getSharedVal('textColor', '#ffffff')} onChange={(e)=>updateSelectedCues('textColor', e.target.value)} className="w-full bg-transparent h-8 cursor-pointer" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Size</label>
                    <input type="number" min="10" value={isMixed('textScale') ? '' : (getSharedVal('textScale') || 100)} placeholder={isMixed('textScale') ? '---' : ''} onChange={(e)=>updateSelectedCues('textScale', parseInt(e.target.value)||100)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Align</label>
                    <select value={isMixed('textAlign') ? 'mixed' : getSharedVal('textAlign', 'center')} onChange={(e)=>updateSelectedCues('textAlign', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none">
                       {isMixed('textAlign') && <option value="mixed" disabled hidden>Mixed</option>}
                       <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex gap-2 items-end">
                  <div className="flex-[2]">
                    <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Font</label>
                    <select value={isMixed('fontFamily') ? 'mixed' : getSharedVal('fontFamily', 'sans-serif')} onChange={(e)=>updateSelectedCues('fontFamily', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none">
                       {isMixed('fontFamily') && <option value="mixed" disabled hidden>Mixed</option>}
                       <option value="sans-serif">Sans-Serif</option><option value="serif">Serif</option><option value="monospace">Monospace</option><option value="Impact">Impact</option><option value="Courier New">Courier New</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1 pb-0.5">
                    <button onClick={() => updateSelectedCues('fontWeight', getSharedVal('fontWeight', 'bold') === 'bold' ? 'normal' : 'bold')} className={`p-1.5 rounded border transition-colors ${getSharedVal('fontWeight', 'bold') === 'bold' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-950 border-gray-700 text-gray-400 hover:bg-gray-800'}`} title="Bold"><Bold className="w-4 h-4"/></button>
                    <button onClick={() => updateSelectedCues('fontStyle', getSharedVal('fontStyle', 'normal') === 'italic' ? 'normal' : 'italic')} className={`p-1.5 rounded border transition-colors ${getSharedVal('fontStyle', 'normal') === 'italic' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-950 border-gray-700 text-gray-400 hover:bg-gray-800'}`} title="Italic"><Italic className="w-4 h-4"/></button>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-gray-800 space-y-3">
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={getSharedVal('textShadowEnabled', false)} onChange={(e) => updateSelectedCues('textShadowEnabled', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-blue-500 focus:ring-blue-500" />
                      Drop Shadow
                    </label>
                    <label className="flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={getSharedVal('textSmoothing', true)} onChange={(e) => updateSelectedCues('textSmoothing', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-blue-500 focus:ring-blue-500" />
                      Anti-Aliasing
                    </label>
                  </div>
                  {getSharedVal('textShadowEnabled') && (
                    <div className="flex gap-2 items-center bg-gray-950 p-2 rounded border border-gray-800">
                       <div className="w-8">
                         <input type="color" value={getSharedVal('textShadowColor', '#000000')} onChange={(e)=>updateSelectedCues('textShadowColor', e.target.value)} className="w-full bg-transparent h-6 cursor-pointer border-none p-0" />
                       </div>
                       <div className="flex-1 flex flex-col gap-1">
                         <label className="text-[9px] text-gray-500 font-bold uppercase leading-none">Blur</label>
                         <input type="range" min="0" max="50" value={isMixed('textShadowBlur') ? 10 : (getSharedVal('textShadowBlur') ?? 10)} onChange={(e) => updateSelectedCues('textShadowBlur', parseFloat(e.target.value))} className="w-full accent-blue-500" />
                       </div>
                       <div className="flex-1 flex flex-col gap-1">
                         <label className="text-[9px] text-gray-500 font-bold uppercase leading-none">Off X</label>
                         <input type="range" min="-50" max="50" value={isMixed('textShadowOffsetX') ? 5 : (getSharedVal('textShadowOffsetX') ?? 5)} onChange={(e) => updateSelectedCues('textShadowOffsetX', parseFloat(e.target.value))} className="w-full accent-blue-500" />
                       </div>
                       <div className="flex-1 flex flex-col gap-1">
                         <label className="text-[9px] text-gray-500 font-bold uppercase leading-none">Off Y</label>
                         <input type="range" min="-50" max="50" value={isMixed('textShadowOffsetY') ? 5 : (getSharedVal('textShadowOffsetY') ?? 5)} onChange={(e) => updateSelectedCues('textShadowOffsetY', parseFloat(e.target.value))} className="w-full accent-blue-500" />
                       </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {getSharedVal('type') === 'select' && (
              <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Target Cue Number to Select</label>
                    <input type="text" value={isMixed('targetCueNumber') ? '' : getSharedVal('targetCueNumber', '')} placeholder={isMixed('targetCueNumber') ? '<Multiple Values>' : 'e.g. 1.5'} onChange={(e)=>updateSelectedCues('targetCueNumber', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-teal-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
              </div>
            )}

            {getSharedVal('type') === 'memo' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1 font-bold uppercase tracking-wider">Note Color / Level</label>
                  <select 
                    value={isMixed('memoColor') ? 'mixed' : getSharedVal('memoColor', 'yellow')} 
                    onChange={(e) => updateSelectedCues('memoColor', e.target.value)} 
                    className="w-full bg-gray-950 border border-gray-700 focus:border-yellow-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none transition-colors"
                  >
                    {isMixed('memoColor') && <option value="mixed" disabled hidden>Mixed Colors</option>}
                    <option value="yellow">Yellow (Attention)</option>
                    <option value="red">Red (Danger / Standby)</option>
                    <option value="orange">Orange (Warning)</option>
                    <option value="blue">Blue (Info)</option>
                    <option value="green">Green (Safe / Ready)</option>
                  </select>
                </div>
                {(() => {
                  const mCol = getSharedVal('memoColor', 'yellow');
                  const colorMap = {
                    red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', label: 'Danger / Standby' },
                    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', label: 'Warning' },
                    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', label: 'Information' },
                    green: { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', label: 'Safe / Ready' },
                    yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', label: 'Attention / Note' }
                  };
                  const style = colorMap[mCol] || colorMap.yellow;
                  return (
                    <div className={`p-3 rounded border ${style.bg} ${style.border} space-y-1`}>
                      <p className={`font-semibold text-xs ${style.text}`}>{style.label} Cue</p>
                      <p className="text-[11px] text-gray-300 leading-relaxed">
                        This is an organizational note for the operator. Triggering it immediately passes through and auto-advances to the next cue.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {getSharedVal('type') === 'goto' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1 font-bold uppercase tracking-wider">Mode</label>
                    <select value={isMixed('gotoMode') ? 'mixed' : getSharedVal('gotoMode', 'specific')} onChange={(e)=>updateSelectedCues('gotoMode', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none">
                      <option value="specific">Specific Cue</option>
                      <option value="random">Random Cue in Range</option>
                    </select>
                  </div>
                  {getSharedVal('gotoMode', 'specific') === 'specific' ? (
                    <div>
                      <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Target Cue Number</label>
                      <input type="text" value={isMixed('targetCueNumber') ? '' : getSharedVal('targetCueNumber', '')} onChange={(e)=>updateSelectedCues('targetCueNumber', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none" placeholder="e.g. 1.5" />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Min Cue #</label>
                        <input type="text" value={isMixed('targetCueRangeMin') ? '' : getSharedVal('targetCueRangeMin', '')} onChange={(e)=>updateSelectedCues('targetCueRangeMin', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Max Cue #</label>
                        <input type="text" value={isMixed('targetCueRangeMax') ? '' : getSharedVal('targetCueRangeMax', '')} onChange={(e)=>updateSelectedCues('targetCueRangeMax', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {getSharedVal('type') === 'counter' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-orange-400 mb-1 font-bold uppercase tracking-wider">Target Cue #</label>
                    <input type="text" value={isMixed('targetCueNumber') ? '' : getSharedVal('targetCueNumber', '')} onChange={(e)=>updateSelectedCues('targetCueNumber', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-orange-500 rounded px-2 py-1.5 text-sm outline-none" placeholder="e.g. 1.5" />
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] text-orange-400 mb-1 font-bold uppercase tracking-wider">Limit (Times)</label>
                    <input type="number" min="1" value={isMixed('counterLimit') ? '' : getSharedVal('counterLimit', 1)} onChange={(e)=>updateSelectedCues('counterLimit', parseInt(e.target.value)||1)} className="w-full bg-gray-950 border border-gray-700 focus:border-orange-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                </div>
                {!isMixed('counterCurrent') && (
                  <div className="text-[10px] text-gray-500 italic flex items-center justify-between">
                      <span>Currently looped: <span className="font-mono text-gray-300 bg-gray-950 px-1 py-0.5 rounded border border-gray-800">{getSharedVal('counterCurrent', 0)} / {getSharedVal('counterLimit', 1)}</span> times.</span>
                      <button onClick={() => updateSelectedCues('counterCurrent', 0)} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">Reset</button>
                  </div>
                )}
              </div>
            )}

            {getSharedVal('type') === 'osc' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-cyan-400 mb-1 font-bold uppercase tracking-wider">Target IP Address</label>
                    <input type="text" placeholder="127.0.0.1" value={isMixed('oscIp') ? '' : getSharedVal('oscIp', '127.0.0.1')} onChange={(e)=>updateSelectedCues('oscIp', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-cyan-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] text-cyan-400 mb-1 font-bold uppercase tracking-wider">Port</label>
                    <input type="number" placeholder="53000" value={isMixed('oscPort') ? '' : getSharedVal('oscPort', 53000)} onChange={(e)=>updateSelectedCues('oscPort', parseInt(e.target.value)||53000)} className="w-full bg-gray-950 border border-gray-700 focus:border-cyan-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div>
                     <label className="block text-[10px] text-cyan-400 mb-1 font-bold uppercase tracking-wider">OSC Address Path</label>
                     <input type="text" placeholder="/eos/go" value={isMixed('oscAddress') ? '' : getSharedVal('oscAddress', '/tuxshow/go')} onChange={(e)=>updateSelectedCues('oscAddress', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-cyan-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                  </div>
                  <div>
                     <label className="block text-[10px] text-cyan-400 mb-1 font-bold uppercase tracking-wider">Arguments (comma separated)</label>
                     <input type="text" placeholder="1, 1.5, start" value={isMixed('oscArgs') ? '' : getSharedVal('oscArgs', '')} onChange={(e)=>updateSelectedCues('oscArgs', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-cyan-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                  </div>
                </div>
              </div>
            )}

            {getSharedVal('type') === 'webhook' && (
              <div className="space-y-3 animate-fade-in mt-4">
                <div>
                  <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider flex items-center justify-between">
                    <span>URL Endpoint</span>
                    {isMixed('webhookUrl') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" title="Cues have conflicting URLs" />}
                  </label>
                  <input
                    type="text"
                    placeholder={isMixed('webhookUrl') ? '' : "https://api.example.com/endpoint"}
                    value={isMixed('webhookUrl') ? (focusedFields['webhookUrl'] ? '' : '<Multiple Values>') : getSharedVal('webhookUrl', '')}
                    onFocus={() => setFocusedFields(prev => ({ ...prev, webhookUrl: true }))}
                    onBlur={() => setFocusedFields(prev => ({ ...prev, webhookUrl: false }))}
                    onChange={(e) => {
                      if (isMixed('webhookUrl') && !focusedFields['webhookUrl']) return;
                      updateSelectedCues('webhookUrl', e.target.value);
                    }}
                    className={`w-full bg-gray-950 border rounded px-2 py-1.5 text-sm outline-none font-mono transition-colors ${
                      isMixed('webhookUrl') 
                        ? (focusedFields['webhookUrl'] ? 'border-emerald-500 text-gray-200' : 'border-amber-600/50 text-amber-500 italic') 
                        : 'border-gray-700 focus:border-emerald-500 text-gray-200'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider flex items-center justify-between">
                    <span>HTTP Method</span>
                    {isMixed('webhookMethod') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" title="Cues have conflicting methods" />}
                  </label>
                  <select
                    value={isMixed('webhookMethod') ? 'mixed' : getSharedVal('webhookMethod', 'GET')}
                    onChange={(e) => updateSelectedCues('webhookMethod', e.target.value)}
                    className={`w-full bg-gray-950 border rounded px-2 py-1.5 text-sm outline-none transition-colors ${
                      isMixed('webhookMethod') ? 'border-amber-600/50 text-amber-500 italic' : 'border-gray-700 focus:border-emerald-500 text-gray-200'
                    }`}
                  >
                    {isMixed('webhookMethod') && <option value="mixed" disabled hidden>-- Mixed --</option>}
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider flex items-center justify-between">
                    <span>Custom Headers (JSON Object)</span>
                    {isMixed('webhookHeaders') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" title="Cues have conflicting headers" />}
                  </label>
                  <textarea
                    placeholder={isMixed('webhookHeaders') ? '' : '{ "Authorization": "Bearer token", "Accept": "application/json" }'}
                    value={isMixed('webhookHeaders') ? (focusedFields['webhookHeaders'] ? '' : '<Multiple Values>') : (localHeaders !== null ? localHeaders : '')}
                    onFocus={() => setFocusedFields(prev => ({ ...prev, webhookHeaders: true }))}
                    onBlur={() => setFocusedFields(prev => ({ ...prev, webhookHeaders: false }))}
                    onChange={(e) => {
                      if (isMixed('webhookHeaders') && !focusedFields['webhookHeaders']) return;
                      handleHeadersChange(e.target.value);
                    }}
                    className={`w-full bg-gray-950 border rounded px-2 py-1.5 text-sm outline-none font-mono h-20 resize-y transition-colors ${
                      headersError 
                        ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-gray-200' 
                        : isMixed('webhookHeaders') 
                          ? (focusedFields['webhookHeaders'] ? 'border-emerald-500 text-gray-200' : 'border-amber-600/50 text-amber-500 italic') 
                          : 'border-gray-700 focus:border-emerald-500 text-gray-200'
                    }`}
                  />
                  {headersError && <div className="text-[10px] text-red-400 mt-1">⚠️ Invalid JSON format (saving disabled)</div>}
                </div>
                {['POST', 'PUT', 'PATCH'].includes(getSharedVal('webhookMethod', 'GET')) && (
                  <div>
                    <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Request Body (Payload)</span>
                      {isMixed('webhookBody') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" title="Cues have conflicting payloads" />}
                    </label>
                    <textarea
                      placeholder={isMixed('webhookBody') ? '' : '{ "status": "on" }'}
                      value={isMixed('webhookBody') ? (focusedFields['webhookBody'] ? '' : '<Multiple Values>') : (localBody !== null ? localBody : '')}
                      onFocus={() => setFocusedFields(prev => ({ ...prev, webhookBody: true }))}
                      onBlur={() => setFocusedFields(prev => ({ ...prev, webhookBody: false }))}
                      onChange={(e) => {
                        if (isMixed('webhookBody') && !focusedFields['webhookBody']) return;
                        handleBodyChange(e.target.value);
                      }}
                      className={`w-full bg-gray-950 border rounded px-2 py-1.5 text-sm outline-none font-mono h-24 resize-y transition-colors ${
                        bodyError 
                          ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-gray-200' 
                          : isMixed('webhookBody') 
                            ? (focusedFields['webhookBody'] ? 'border-emerald-500 text-gray-200' : 'border-amber-600/50 text-amber-500 italic') 
                            : 'border-gray-700 focus:border-emerald-500 text-gray-200'
                      }`}
                    />
                    {bodyError && <div className="text-[10px] text-red-400 mt-1">⚠️ Invalid JSON format (saving disabled)</div>}
                  </div>
                )}
              </div>
            )}

            {getSharedVal('type') === 'msc' && (
              <div className="flex gap-2">
                <div className="w-20">
                  <label className="block text-[10px] text-purple-400 mb-1 font-bold uppercase tracking-wider">Device ID</label>
                  <input type="number" min="0" max="127" placeholder="0" value={isMixed('mscDevice') ? '' : getSharedVal('mscDevice', '0')} onChange={(e)=>updateSelectedCues('mscDevice', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-purple-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-purple-400 mb-1 font-bold uppercase tracking-wider">Command</label>
                  <select value={isMixed('mscCommand') ? 'mixed' : getSharedVal('mscCommand', 'GO')} onChange={(e)=>updateSelectedCues('mscCommand', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-purple-500 rounded px-2 py-1.5 text-sm outline-none">
                    <option value="GO">GO</option>
                    <option value="STOP">STOP</option>
                    <option value="RESUME">RESUME</option>
                    <option value="LOAD">LOAD</option>
                    <option value="ALL_OFF">ALL_OFF</option>
                    <option value="RESTORE">RESTORE</option>
                    <option value="RESET">RESET</option>
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-[10px] text-purple-400 mb-1 font-bold uppercase tracking-wider">Q Number</label>
                  <input type="text" placeholder="1" value={isMixed('mscCue') ? '' : getSharedVal('mscCue', '1')} onChange={(e)=>updateSelectedCues('mscCue', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-purple-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                </div>
              </div>
            )}

            {getSharedVal('type') === 'projector' && (
              <div className="space-y-4 animate-fade-in mt-4">
                <div className="flex items-center gap-2 mb-2 border-b border-gray-800 pb-2">
                    <MonitorUp className="w-4 h-4 text-emerald-500" />
                    <h3 className="font-bold text-gray-200 text-sm">Projector Control</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Target IP</label>
                        <input type="text" value={getSharedVal('projectorIp', '')} onChange={(e) => updateSelectedCues('projectorIp', e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono" placeholder="192.168.1.50" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Port</label>
                        <input type="number" value={getSharedVal('projectorPort', 4352)} onChange={(e) => updateSelectedCues('projectorPort', parseInt(e.target.value) || 4352)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono" />
                    </div>
                </div>
                
                <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Protocol / Profile</label>
                    <div className="flex gap-2">
                        <select value={getSharedVal('projectorProtocol', 'pjlink')} onChange={(e) => {
                            updateSelectedCues('projectorProtocol', e.target.value);
                            if (e.target.value === 'pjlink') updateSelectedCues('projectorPort', 4352);
                        }} className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-500">
                            <option value="pjlink">Standard PJLink</option>
                            <option value="tcp">Custom Profile (TCP / JSON)</option>
                        </select>
                        {getSharedVal('projectorProtocol') === 'tcp' && (
                            <button onClick={async () => {
                                try {
                                    const { ipcRenderer } = window.require('electron');
                                    const { canceled, filePaths } = await ipcRenderer.invoke('show-open-dialog', { filters: [{ name: 'JSON Profiles', extensions: ['json'] }] });
                                    if (!canceled && filePaths.length > 0) {
                                        const result = await ipcRenderer.invoke('read-show-file', filePaths[0]);
                                        if (result.success) {
                                            const profile = JSON.parse(result.data);
                                            updateSelectedCues('projectorProfileData', profile);
                                            if (profile.port) updateSelectedCues('projectorPort', profile.port);
                                        }
                                    }
                                } catch(e) { console.error("Failed to load profile", e); }
                            }} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs font-semibold text-gray-300 transition-colors">Load .json</button>
                        )}
                    </div>
                </div>
  
                {getSharedVal('projectorProtocol', 'pjlink') === 'pjlink' && (
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">PJLink Password (Optional)</label>
                        <input type="password" value={getSharedVal('projectorPassword', '')} onChange={(e) => updateSelectedCues('projectorPassword', e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono" placeholder="Leave blank if unsecured" />
                    </div>
                )}
                
                <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Command</label>
                    <div className="flex gap-2">
                        <select value={getSharedVal('projectorPayload', '')} onChange={(e) => updateSelectedCues('projectorPayload', e.target.value)} className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-500 font-mono">
                            <option value="">-- Select Command --</option>
                            {getSharedVal('projectorProtocol', 'pjlink') === 'pjlink' ? (
                                <>
                                    <option value="%1AVMT 11">Shutter Close (AVMT 11)</option>
                                    <option value="%1AVMT 10">Shutter Open (AVMT 10)</option>
                                    <option value="%1POWR 1">Power On (POWR 1)</option>
                                    <option value="%1POWR 0">Power Off (POWR 0)</option>
                                    <option value="%1FREZ 1">Freeze Image On (FREZ 1)</option>
                                    <option value="%1FREZ 0">Freeze Image Off (FREZ 0)</option>
                                </>
                            ) : (
                                getSharedVal('projectorProfileData', { commands: [] }).commands?.map((cmd, idx) => (
                                    <option key={idx} value={cmd.payload}>{cmd.name}</option>
                                ))
                            )}
                        </select>
                        <button 
                            onClick={() => {
                                try {
                                    const { ipcRenderer } = window.require('electron');
                                    ipcRenderer.send('fire-projector-cue', { 
                                        ip: getSharedVal('projectorIp'), port: getSharedVal('projectorPort'), protocol: getSharedVal('projectorProtocol'), 
                                        payload: getSharedVal('projectorPayload'), password: getSharedVal('projectorPassword') 
                                    });
                                } catch (e) {}
                            }}
                            disabled={!getSharedVal('projectorIp') || !getSharedVal('projectorPayload')}
                            className="px-4 py-1.5 bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 rounded text-xs font-bold text-emerald-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            TEST
                        </button>
                    </div>
                </div>
              </div>
            )}

            {getSharedVal('type') === 'dmx' && (
              <div className="space-y-4 animate-fade-in mt-4">
                <div className="flex items-center gap-2 mb-2 border-b border-gray-800 pb-2">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    <h3 className="font-bold text-gray-200 text-sm">DMX Lighting Control</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">DMX Channel</label>
                        <input type="number" min="1" max="512" value={isMixed('dmxChannel') ? '' : getSharedVal('dmxChannel', 1)} onChange={(e) => updateSelectedCues('dmxChannel', parseInt(e.target.value) || 1)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-yellow-500" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Target Value (0-255)</label>
                        <input type="number" min="0" max="255" value={isMixed('dmxEndValue') ? '' : getSharedVal('dmxEndValue', 255)} onChange={(e) => updateSelectedCues('dmxEndValue', parseInt(e.target.value) || 0)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-yellow-500" />
                    </div>
                </div>
              </div>
            )}

            {getSharedVal('type') === 'sequence' && (
              <div className="space-y-4 animate-fade-in mt-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-purple-500" />
                        <h3 className="font-bold text-gray-200 text-sm">Sequence Editor</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button 
                            onClick={async () => {
                                try {
                                    const { ipcRenderer } = window.require('electron');
                                    const currentData = getSharedVal('children', []);
                                    const result = await ipcRenderer.invoke('save-sequence-snippet', currentData);
                                    if (result.success) console.log('Snippet saved to:', result.filePath);
                                } catch (e) {
                                    console.error("[InspectorPanel] Save snippet failed:", e);
                                }
                            }}
                            className="px-2 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded text-[9px] uppercase font-bold text-gray-300 transition-colors flex items-center gap-1"
                            title="Save as .TSSnip"
                        >
                            <Save className="w-3 h-3" /> Save
                        </button>
                        <button 
                            onClick={async () => {
                                try {
                                    const { ipcRenderer } = window.require('electron');
                                    const result = await ipcRenderer.invoke('load-sequence-snippet');
                                    if (result.success && Array.isArray(result.data)) {
                                        updateSelectedCues('children', result.data);
                                    } else if (result.error) {
                                        alert("Failed to load snippet. File may be corrupted.");
                                    }
                                } catch (e) {
                                    console.error("[InspectorPanel] Load snippet failed:", e);
                                }
                            }}
                            className="px-2 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded text-[9px] uppercase font-bold text-gray-300 transition-colors flex items-center gap-1"
                            title="Load .TSSnip file"
                        >
                            <FolderOpen className="w-3 h-3" /> Load
                        </button>
                        <button 
                            onClick={() => {
                                updateSelectedCues('children', [
                                    { type: 'video', url: 'https://sample.com/vid.webm', startTime: 0, duration: 5, layer: 1 },
                                    { type: 'dmx', dmxChannel: 1, dmxEndValue: 255, startTime: 1.5, duration: 3 }
                                ]);
                            }}
                            className="px-2 py-1 bg-purple-900/50 hover:bg-purple-800 border border-purple-700 rounded text-[9px] uppercase font-bold text-purple-200 transition-colors ml-1"
                        >
                            Template
                        </button>
                    </div>
                </div>
                
                <div className="bg-gray-900 border border-purple-900/50 rounded-lg p-2 shadow-inner">
                    <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">
                        Edit child cues as a raw JSON array. The background worker assigns synthetic IDs and fires them relative to their <strong>startTime</strong> in seconds.
                    </p>
                    <textarea 
                        key={JSON.stringify(getSharedVal('children', []))}
                        className="w-full h-64 bg-black border border-gray-700 rounded p-2 text-xs text-green-400 font-mono outline-none focus:border-purple-500 whitespace-pre overflow-auto"
                        defaultValue={JSON.stringify(getSharedVal('children', []), null, 2)}
                        onBlur={(e) => {
                            try {
                                const parsed = JSON.parse(e.target.value);
                                updateSelectedCues('children', parsed);
                                e.target.classList.remove('border-red-500');
                                e.target.classList.add('border-gray-700');
                            } catch (err) {
                                e.target.classList.remove('border-gray-700');
                                e.target.classList.add('border-red-500');
                            }
                        }}
                        spellCheck="false"
                    />
                </div>
              </div>
            )}

            {getSharedVal('type') === 'stop' && (
              <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-red-400 mb-1 font-bold uppercase tracking-wider">Target Cue Number to Stop</label>
                    <input type="text" value={isMixed('targetCueNumber') ? '' : getSharedVal('targetCueNumber', '')} placeholder={isMixed('targetCueNumber') ? '<Multiple Values>' : 'e.g. 1.5'} onChange={(e)=>updateSelectedCues('targetCueNumber', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-red-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
              </div>
            )}

            {getSharedVal('type') === 'time' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-orange-400 mb-1 font-bold uppercase tracking-wider">Trigger Time (24hr)</label>
                    <input type="time" value={isMixed('scheduleTime') ? '' : getSharedVal('scheduleTime', '')} onChange={(e)=>updateSelectedCues('scheduleTime', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-orange-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-orange-400 mb-1 font-bold uppercase tracking-wider">Trigger Date (Optional)</label>
                    <input type="date" value={isMixed('scheduleDate') ? '' : getSharedVal('scheduleDate', '')} onChange={(e)=>updateSelectedCues('scheduleDate', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-orange-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                </div>
                <p className="text-[9px] text-gray-500 italic">* Cue must be in a 'Playing' state to monitor the system clock and trigger its auto-follow action.</p>
              </div>
            )}

            {getSharedVal('type') === 'group' && (
              <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Group Playback Mode</label>
                    <select value={isMixed('groupMode') ? 'mixed' : getSharedVal('groupMode', 'fire-all')} onChange={(e)=>updateSelectedCues('groupMode', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none">
                      {isMixed('groupMode') && <option value="mixed" disabled hidden>Mixed Modes</option>}
                      <option value="fire-all">Fire All Children Simultaneously</option>
                      <option value="fire-first">Enter Group (Fire First Child Only)</option>
                    </select>
                  </div>
              </div>
            )}

            {getSharedVal('type') === 'conditional' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="w-1/3">
                    <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">Run Mode</label>
                    <select value={isMixed('conditionRunMode') ? 'mixed' : getSharedVal('conditionRunMode', 'immediate')} onChange={(e)=>updateSelectedCues('conditionRunMode', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded px-2 py-1.5 text-sm outline-none">
                      {isMixed('conditionRunMode') && <option value="mixed" disabled hidden>Mixed</option>}
                      <option value="immediate">Evaluate Once on GO</option>
                      <option value="continuous">Keep Listening</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">Evaluation Type</label>
                    <select value={isMixed('conditionType') ? 'mixed' : getSharedVal('conditionType', 'cue-state')} onChange={(e)=>updateSelectedCues('conditionType', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded px-2 py-1.5 text-sm outline-none">
                      {isMixed('conditionType') && <option value="mixed" disabled hidden>Mixed</option>}
                      <option value="cue-state">Check Another Cue's State</option>
                      <option value="osc-value">Check Incoming OSC Value</option>
                    </select>
                  </div>
                </div>

                {getSharedVal('conditionType') === 'cue-state' ? (
                   <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">Target Cue #</label>
                        <input type="text" value={isMixed('conditionTargetCue') ? '' : getSharedVal('conditionTargetCue', '')} onChange={(e)=>updateSelectedCues('conditionTargetCue', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded px-2 py-1.5 text-sm outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">Is Currently</label>
                        <select value={isMixed('conditionState') ? 'mixed' : getSharedVal('conditionState', 'playing')} onChange={(e)=>updateSelectedCues('conditionState', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded px-2 py-1.5 text-sm outline-none">
                           <option value="playing">Playing</option><option value="stopped">Stopped</option><option value="completed">Completed</option>
                        </select>
                      </div>
                   </div>
                ) : (
                   <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">OSC Path</label>
                        <input type="text" placeholder="/tuxshow/sensor" value={isMixed('conditionOscPath') ? '' : getSharedVal('conditionOscPath', '/tuxshow/sensor')} onChange={(e)=>updateSelectedCues('conditionOscPath', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                      </div>
                      <div className="w-24">
                        <label className="block text-[10px] text-emerald-400 mb-1 font-bold uppercase tracking-wider">Matches</label>
                        <input type="text" value={isMixed('conditionOscValue') ? '' : getSharedVal('conditionOscValue', '1')} onChange={(e)=>updateSelectedCues('conditionOscValue', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded px-2 py-1.5 text-sm outline-none font-mono" />
                      </div>
                   </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-800">
                  <div className="flex-1">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">
                      {getSharedVal('conditionRunMode', 'immediate') === 'continuous' ? 'When TRUE: Fire Cue #' : 'If TRUE: Fire Cue #'}
                    </label>
                    <input type="text" value={isMixed('trueTargetCue') ? '' : getSharedVal('trueTargetCue', '')} onChange={(e)=>updateSelectedCues('trueTargetCue', e.target.value)} className="w-full bg-gray-950 border border-green-700/50 focus:border-green-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  {getSharedVal('conditionRunMode', 'immediate') !== 'continuous' && (
                    <div className="flex-1">
                      <label className="block text-[10px] text-red-400 mb-1 font-bold uppercase tracking-wider">If FALSE: Fire Cue #</label>
                      <input type="text" value={isMixed('falseTargetCue') ? '' : getSharedVal('falseTargetCue', '')} onChange={(e)=>updateSelectedCues('falseTargetCue', e.target.value)} className="w-full bg-gray-950 border border-red-700/50 focus:border-red-500 rounded px-2 py-1.5 text-sm outline-none" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {getSharedVal('type') === 'state-changer' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="block text-[10px] text-teal-400 mb-1 font-bold uppercase tracking-wider">Action</label>
                    <select value={isMixed('stateChangeMode') ? 'mixed' : getSharedVal('stateChangeMode', 'lock')} onChange={(e)=>updateSelectedCues('stateChangeMode', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-teal-500 rounded px-2 py-1.5 text-sm outline-none">
                      {isMixed('stateChangeMode') && <option value="mixed" disabled hidden>Mixed Modes</option>}
                      <option value="default-all">Default All States</option>
                      <option value="lock">Lock Object</option>
                      <option value="unlock">Unlock Object</option>
                      <option value="disable">Disable Object</option>
                      <option value="enable">Enable Object</option>
                    </select>
                  </div>
                  {getSharedVal('stateChangeMode', 'lock') !== 'default-all' && (
                    <div className="flex-1">
                      <label className="block text-[10px] text-teal-400 mb-1 font-bold uppercase tracking-wider">Target Cue Number</label>
                      <input type="text" value={isMixed('targetCueNumber') ? '' : getSharedVal('targetCueNumber', '')} placeholder={isMixed('targetCueNumber') ? '<Multiple Values>' : 'e.g. 1.5'} onChange={(e)=>updateSelectedCues('targetCueNumber', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-teal-500 rounded px-2 py-1.5 text-sm outline-none" />
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* SECTION 3: Trigger & Timing */}
          <div className="space-y-3 bg-gray-950/40 p-3 rounded border border-gray-800">
            <h4 className="text-[10px] font-bold text-green-500 uppercase tracking-wider flex items-center gap-2 mb-2"><Clock className="w-4 h-4"/> Trigger & Timing</h4>

            {(!['group', 'time', 'osc', 'msc', 'goto', 'counter', 'pause', 'conditional', 'stop', 'state-changer', 'select', 'memo'].includes(getSharedVal('type'))) && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">On Trigger</label>
                    <select value={isMixed('triggerBehavior') ? 'mixed' : getSharedVal('triggerBehavior', 'overlap')} onChange={(e) => updateSelectedCues('triggerBehavior', e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 outline-none">
                      {isMixed('triggerBehavior') && <option value="mixed" disabled hidden>Mixed Behavior</option>}
                      <option value="overlap">Overlap (Play on top)</option><option value="stop-others">Hard Stop</option><option value="fade-target">Fade Target</option>
                    </select>
                  </div>
                  {getSharedVal('triggerBehavior') === 'fade-target' && (
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Target Cue #</label>
                      <input type="text" value={isMixed('fadeTargetCue') ? '' : getSharedVal('fadeTargetCue', '')} onChange={(e) => updateSelectedCues('fadeTargetCue', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm outline-none text-gray-200" placeholder="Auto (Prev Cue)" title="Leave blank to fade the most recently played cue" />
                    </div>
                  )}
                </div>

                <div className="flex gap-2 items-center bg-gray-900/50 p-2 rounded border border-gray-800">
                  <div className="w-1/3">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">Duration (s)</label>
                    <input type="number" step="0.5" min="0" value={isMixed('duration') ? '' : getSharedVal('duration', 0)} placeholder={isMixed('duration') ? '---' : ''} onChange={(e) => updateSelectedCues('duration', parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">Follow Action</label>
                    <select value={isMixed('followAction') ? 'mixed' : getSharedVal('followAction', 'none')} onChange={(e) => updateSelectedCues('followAction', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none">
                      {isMixed('followAction') && <option value="mixed" disabled hidden>Mixed Actions</option>}
                      <option value="none">None (Wait for GO)</option>
                      <option value="auto-follow">Auto-Follow (Trigger Next)</option>
                    </select>
                  </div>
                </div>
                
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-green-400 cursor-pointer mt-1 hover:text-green-300 transition-colors" title="Keep rendering media after completion until hard stopped">
                   <input type="checkbox" checked={getSharedVal('holdAtEnd', false)} onChange={(e) => updateSelectedCues('holdAtEnd', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-green-500 focus:ring-green-500" /> 
                   Hold at End
                </label>

                {['video', 'audio'].includes(getSharedVal('type')) && (
                  <div className="flex flex-col gap-3 pt-2 border-t border-gray-800">
                    <div className="flex gap-4 items-center bg-gray-900/30 p-2 rounded border border-gray-800/60">
                      <div className="flex-1">
                        <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Volume Level</label>
                        <div className="flex items-center gap-2">
                          <input type="range" min="0" max="1" step="0.05" value={isMixed('volume') ? 1 : (getSharedVal('volume') ?? 1)} onChange={(e) => updateSelectedCues('volume', parseFloat(e.target.value))} className="flex-1 accent-blue-500 cursor-pointer" />
                          <span className="text-xs font-mono text-gray-400 w-8 text-right">{isMixed('volume') ? '--' : `${Math.round((getSharedVal('volume') ?? 1) * 100)}%`}</span>
                        </div>
                      </div>
                      <div className="flex items-center pt-3">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-400 cursor-pointer hover:text-blue-300 transition-colors" title="Loop playback continuously">
                          <input type="checkbox" checked={getSharedVal('loop', false)} onChange={(e) => updateSelectedCues('loop', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-blue-500 focus:ring-blue-500" />
                          Continuous Loop
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col bg-gray-900/30 p-2 rounded border border-gray-800/60">
                      <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Media Sync Offset (ms)</label>
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <input type="range" min="-5000" max="5000" step="100" value={isMixed('mediaSyncOffset') ? 0 : (getSharedVal('mediaSyncOffset') || 0)} onChange={(e) => updateSelectedCues('mediaSyncOffset', parseInt(e.target.value))} className="flex-1 accent-blue-500 cursor-pointer" />
                        <span className="text-xs font-mono text-gray-400 w-10 text-right">{getSharedVal('mediaSyncOffset') || 0}</span>
                      </div>
                      <span className="text-[8px] text-gray-600 italic mt-0.5">&gt; 0 skips into track. &lt; 0 delays fire.</span>
                    </div>
                  </div>
                )}

                {getSharedVal('type') !== 'transition' && (
                  <div className="flex gap-2 pt-2 border-t border-gray-800">
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400 mb-1 font-bold uppercase tracking-wider">Fade In (s)</label>
                      <input type="number" step="0.5" min="0" value={isMixed('fadeInTime') ? '' : getSharedVal('fadeInTime', 0)} placeholder={isMixed('fadeInTime') ? '---' : ''} onChange={(e) => updateSelectedCues('fadeInTime', parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-400 mb-1 font-bold uppercase tracking-wider">Fade Out (s)</label>
                      <input type="number" step="0.5" min="0" value={isMixed('fadeOutTime') ? '' : getSharedVal('fadeOutTime', 0)} placeholder={isMixed('fadeOutTime') ? '---' : ''} onChange={(e) => updateSelectedCues('fadeOutTime', parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm outline-none" />
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {getSharedVal('type') === 'pause' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 items-center bg-gray-900/50 p-2 rounded border border-gray-800">
                  <div className="w-1/3">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">Pre-Wait (s)</label>
                    <input type="number" step="0.5" min="0" value={isMixed('duration') ? '' : getSharedVal('duration', 0)} placeholder={isMixed('duration') ? '---' : ''} onChange={(e) => updateSelectedCues('duration', parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">Follow Action</label>
                    <select value={isMixed('followAction') ? 'mixed' : getSharedVal('followAction', 'none')} onChange={(e) => updateSelectedCues('followAction', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none">
                      {isMixed('followAction') && <option value="mixed" disabled hidden>Mixed Actions</option>}
                      <option value="none">None (Wait for GO)</option>
                      <option value="auto-follow">Auto-Resume (Trigger Next)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {getSharedVal('type') === 'transition' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <div className="w-1/3">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">Duration (s)</label>
                    <input type="number" step="0.5" min="0" value={isMixed('duration') ? '' : getSharedVal('duration', 0)} placeholder={isMixed('duration') ? '---' : ''} onChange={(e) => updateSelectedCues('duration', parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 rounded px-2 py-1.5 text-sm outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">Follow Action</label>
                    <select value={isMixed('followAction') ? 'mixed' : getSharedVal('followAction', 'none')} onChange={(e) => updateSelectedCues('followAction', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none">
                      {isMixed('followAction') && <option value="mixed" disabled hidden>Mixed Actions</option>}
                      <option value="none">None (Wait for GO)</option>
                      <option value="auto-follow">Auto-Follow (Trigger Next)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {getSharedVal('type') === 'memo' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 items-center bg-gray-900/50 p-2 rounded border border-gray-800">
                  <div className="flex-1">
                    <label className="block text-[10px] text-green-400 mb-1 font-bold uppercase tracking-wider">Follow Action</label>
                    <select value={isMixed('followAction') ? 'mixed' : getSharedVal('followAction', 'none')} onChange={(e) => updateSelectedCues('followAction', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-green-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none">
                      {isMixed('followAction') && <option value="mixed" disabled hidden>Mixed Actions</option>}
                      <option value="none">None (Wait for GO)</option>
                      <option value="auto-follow">Auto-Follow (Trigger Next)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: Visuals & Effects */}
          {(['video', 'image', 'camera', 'text', 'timer', 'transition', 'animate'].includes(getSharedVal('type'))) && (
            <div className="space-y-3 bg-gray-950/40 p-3 rounded border border-gray-800">
              <h4 className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2 mb-2"><Palette className="w-4 h-4"/> Visuals & Effects</h4>

              {['video', 'image', 'camera', 'text', 'timer'].includes(getSharedVal('type')) && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider w-16">Opacity</label>
                      <input type="range" min="0" max="1" step="0.05" value={isMixed('customOpacity') ? 1 : (getSharedVal('customOpacity') ?? 1)} onChange={(e) => updateSelectedCues('customOpacity', parseFloat(e.target.value))} className="flex-1 accent-blue-500" />
                      <span className="text-xs text-gray-400 w-8 text-right">{isMixed('customOpacity') ? '--' : `${Math.round((getSharedVal('customOpacity') ?? 1) * 100)}%`}</span>
                  </div>

                  {['video', 'image', 'camera'].includes(getSharedVal('type')) && (
                    <div className="space-y-3 pt-3 border-t border-gray-800">
                      <label className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer font-bold uppercase tracking-wider">
                        <input type="checkbox" checked={getSharedVal('colorFilterEnabled', false)} onChange={(e) => updateSelectedCues('colorFilterEnabled', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-yellow-500 focus:ring-yellow-500" /> 
                        Color Correction (HSB)
                      </label>
                      {getSharedVal('colorFilterEnabled') && (
                        <div className="flex flex-col gap-2 bg-gray-950 p-2 rounded border border-gray-800">
                          <div className="flex items-center gap-2">
                              <label className="text-[9px] text-gray-400 font-bold uppercase w-16">Hue (deg)</label>
                              <input type="range" min="0" max="360" value={isMixed('hue') ? 0 : getSharedVal('hue', 0)} onChange={(e) => updateSelectedCues('hue', parseInt(e.target.value))} className="flex-1 accent-yellow-500" />
                              <span className="text-xs text-gray-500 w-8 text-right">{getSharedVal('hue', 0)}°</span>
                          </div>
                          <div className="flex items-center gap-2">
                              <label className="text-[9px] text-gray-400 font-bold uppercase w-16">Sat. %</label>
                              <input type="range" min="0" max="200" value={isMixed('saturation') ? 100 : getSharedVal('saturation', 100)} onChange={(e) => updateSelectedCues('saturation', parseInt(e.target.value))} className="flex-1 accent-yellow-500" />
                              <span className="text-xs text-gray-500 w-8 text-right">{getSharedVal('saturation', 100)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                              <label className="text-[9px] text-gray-400 font-bold uppercase w-16">Bright %</label>
                              <input type="range" min="0" max="200" value={isMixed('brightness') ? 100 : getSharedVal('brightness', 100)} onChange={(e) => updateSelectedCues('brightness', parseInt(e.target.value))} className="flex-1 accent-yellow-500" />
                              <span className="text-xs text-gray-500 w-8 text-right">{getSharedVal('brightness', 100)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3 pt-3 border-t border-gray-800">
                      <div className="flex items-center gap-4">
                          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Maximize className="w-3 h-3"/> Geometry & Crop</h4>
                          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                              <input type="checkbox" checked={getSharedVal('keepAspect', true)} onChange={(e)=>updateSelectedCues('keepAspect', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-blue-500 focus:ring-blue-500"/> Keep Aspect
                          </label>
                      </div>
                      
                      <div className="flex gap-2">
                          <div className="flex-1">
                             <label className="text-[9px] text-gray-500 font-bold uppercase">Scale X %</label>
                             <input type="number" value={isMixed('scaleX') ? '' : getSharedVal('scaleX', 100)} onChange={(e)=> {
                                 const v = e.target.value === '' ? '' : (parseFloat(e.target.value)||0);
                                 if (getSharedVal('keepAspect', true)) { setCues(prev => prev.map(c => selectedCueIds.includes(c.id) ? {...c, scaleX: v, scaleY: v} : c)); } 
                                 else updateSelectedCues('scaleX', v);
                             }} className="w-full bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm rounded outline-none focus:border-blue-500"/>
                          </div>
                          <div className="flex-1">
                             <label className="text-[9px] text-gray-500 font-bold uppercase">Scale Y %</label>
                             <input type="number" value={isMixed('scaleY') ? '' : getSharedVal('scaleY', 100)} onChange={(e)=> {
                                 const v = e.target.value === '' ? '' : (parseFloat(e.target.value)||0);
                                 if (getSharedVal('keepAspect', true)) { setCues(prev => prev.map(c => selectedCueIds.includes(c.id) ? {...c, scaleX: v, scaleY: v} : c)); } 
                                 else updateSelectedCues('scaleY', v);
                             }} disabled={getSharedVal('keepAspect', true)} className="w-full bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm rounded outline-none disabled:opacity-50 focus:border-blue-500"/>
                          </div>
                          <div className="flex-1">
                             <label className="text-[9px] text-gray-500 font-bold uppercase">Pos X %</label>
                             <input type="number" value={isMixed('posX') ? '' : getSharedVal('posX', 50)} onChange={(e)=> updateSelectedCues('posX', e.target.value === '' ? '' : (parseFloat(e.target.value)||0))} className="w-full bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm rounded outline-none focus:border-blue-500"/>
                          </div>
                          <div className="flex-1">
                             <label className="text-[9px] text-gray-500 font-bold uppercase">Pos Y %</label>
                             <input type="number" value={isMixed('posY') ? '' : getSharedVal('posY', 50)} onChange={(e)=> updateSelectedCues('posY', e.target.value === '' ? '' : (parseFloat(e.target.value)||0))} className="w-full bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm rounded outline-none focus:border-blue-500"/>
                          </div>
                      </div>

                      <div className="bg-gray-950 p-2 rounded border border-gray-800">
                          <label className="text-[9px] text-gray-400 font-bold uppercase block text-center mb-1">Crop Bounds %</label>
                          <div className="flex justify-center items-center gap-1">
                              <input type="number" value={isMixed('cropLeft') ? '' : getSharedVal('cropLeft', 0)} onChange={e=>updateSelectedCues('cropLeft', e.target.value === '' ? '' : (parseFloat(e.target.value)||0))} className="w-12 bg-gray-900 border border-gray-700 px-1 py-1 text-xs rounded text-center focus:border-blue-500 outline-none" title="Left"/>
                              <div className="flex flex-col gap-1">
                                <input type="number" value={isMixed('cropTop') ? '' : getSharedVal('cropTop', 0)} onChange={e=>updateSelectedCues('cropTop', e.target.value === '' ? '' : (parseFloat(e.target.value)||0))} className="w-12 bg-gray-900 border border-gray-700 px-1 py-1 text-xs rounded text-center focus:border-blue-500 outline-none" title="Top"/>
                                <div className="w-12 h-6 border border-gray-600 rounded bg-gray-800 flex items-center justify-center text-[8px] font-bold text-gray-500 tracking-widest">IMG</div>
                                <input type="number" value={isMixed('cropBottom') ? '' : getSharedVal('cropBottom', 0)} onChange={e=>updateSelectedCues('cropBottom', e.target.value === '' ? '' : (parseFloat(e.target.value)||0))} className="w-12 bg-gray-900 border border-gray-700 px-1 py-1 text-xs rounded text-center focus:border-blue-500 outline-none" title="Bottom"/>
                              </div>
                              <input type="number" value={isMixed('cropRight') ? '' : getSharedVal('cropRight', 0)} onChange={e=>updateSelectedCues('cropRight', e.target.value === '' ? '' : (parseFloat(e.target.value)||0))} className="w-12 bg-gray-900 border border-gray-700 px-1 py-1 text-xs rounded text-center focus:border-blue-500 outline-none" title="Right"/>
                          </div>
                      </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-gray-800">
                     <label className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer font-bold uppercase tracking-wider">
                         <input type="checkbox" checked={getSharedVal('outlineEnabled', false)} onChange={e=>updateSelectedCues('outlineEnabled', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-blue-500 focus:ring-blue-500" /> Image Outline
                     </label>
                     {getSharedVal('outlineEnabled') && (
                         <div className="flex gap-2 items-center bg-gray-950 p-2 rounded border border-gray-800">
                           <input type="color" value={getSharedVal('outlineColor', '#ffffff')} onChange={e=>updateSelectedCues('outlineColor', e.target.value)} className="w-8 h-6 p-0 border-none bg-transparent cursor-pointer"/>
                           <label className="text-[9px] text-gray-400 font-bold uppercase w-12">Width</label>
                           <input type="number" value={getSharedVal('outlineWidth', 2)} onChange={e=>updateSelectedCues('outlineWidth', parseFloat(e.target.value)||1)} className="flex-1 bg-gray-900 border border-gray-700 px-2 py-1 text-xs rounded outline-none focus:border-blue-500"/>
                         </div>
                     )}
                  </div>

                  <div className="space-y-3 pt-3 border-t border-gray-800">
                    <label className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer font-bold uppercase tracking-wider">
                       <input type="checkbox" checked={getSharedVal('maskEnabled', false)} onChange={(e) => updateSelectedCues('maskEnabled', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-blue-500 focus:ring-blue-500" /> 
                       Enable Mask
                    </label>
                    {getSharedVal('maskEnabled') && (
                      <button 
                        disabled={activeCues.length > 1} 
                        onClick={() => activeCues.length === 1 && setEditingMaskCueId(selectedCueIds[0])} 
                        className={`w-full py-1.5 rounded text-xs font-semibold transition-colors ${activeCues.length > 1 ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-blue-900/50 border border-blue-700 hover:bg-blue-800 text-blue-300'}`}
                      >
                        {activeCues.length > 1 ? 'Select Single Cue to Edit Mask' : 'Edit Mask Shape'}
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 pt-3 border-t border-gray-800">
                    <label className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer font-bold uppercase tracking-wider">
                       <input type="checkbox" checked={getSharedVal('warpEnabled', false)} onChange={e=>updateSelectedCues('warpEnabled', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-blue-500 focus:ring-blue-500" /> 
                       Perspective Warp
                    </label>
                    {getSharedVal('warpEnabled') && (
                        <button disabled={activeCues.length > 1} onClick={() => activeCues.length === 1 && setEditingWarpCueId(selectedCueIds[0])} className="w-full px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800 border border-blue-700 rounded text-[10px] uppercase font-bold tracking-wider text-blue-200 transition-colors disabled:opacity-50">Edit Corner Pins</button>
                    )}
                  </div>

                  <div className="space-y-3 pt-3 border-t border-gray-800">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-[10px] text-gray-300 cursor-pointer font-bold uppercase tracking-wider">
                         <input type="checkbox" checked={getSharedVal('chromaKeyEnabled', false)} onChange={(e) => updateSelectedCues('chromaKeyEnabled', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-green-500 focus:ring-green-500" /> 
                         Chroma Key
                      </label>
                      {getSharedVal('chromaKeyEnabled') && (
                        <input type="color" value={getSharedVal('chromaKeyColor', '#00ff00')} onChange={(e)=>updateSelectedCues('chromaKeyColor', e.target.value)} className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" />
                      )}
                    </div>
                    {getSharedVal('chromaKeyEnabled') && (
                      <div className="flex flex-col gap-2 bg-gray-950 p-2 rounded border border-gray-800">
                        <div className="flex items-center gap-2">
                           <label className="text-[9px] font-bold uppercase text-gray-400 w-16">Similarity</label>
                           <input type="range" min="0" max="1" step="0.01" value={isMixed('chromaKeySimilarity') ? 0.4 : getSharedVal('chromaKeySimilarity', 0.4)} onChange={(e) => updateSelectedCues('chromaKeySimilarity', parseFloat(e.target.value))} className="flex-1 accent-green-500" />
                        </div>
                        <div className="flex items-center gap-2">
                           <label className="text-[9px] font-bold uppercase text-gray-400 w-16">Smooth</label>
                           <input type="range" min="0" max="1" step="0.01" value={isMixed('chromaKeySmoothness') ? 0.1 : getSharedVal('chromaKeySmoothness', 0.1)} onChange={(e) => updateSelectedCues('chromaKeySmoothness', parseFloat(e.target.value))} className="flex-1 accent-green-500" />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {getSharedVal('type') === 'transition' && (
                <div className="flex flex-col gap-2">
                  <label className="block text-[10px] font-bold text-pink-500 uppercase tracking-wider mb-1 flex items-center gap-2"><Wand2 className="w-3 h-3"/> Transition Style</label>
                  <select value={isMixed('transitionType') ? 'mixed' : getSharedVal('transitionType', 'wipe-up')} onChange={(e) => updateSelectedCues('transitionType', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-pink-500 rounded px-2 py-1.5 text-sm outline-none">
                    {isMixed('transitionType') && <option value="mixed" disabled hidden>Mixed Types</option>}
                    <optgroup label="Wipes">
                       <option value="wipe-up">Wipe Up</option><option value="wipe-down">Wipe Down</option>
                    </optgroup>
                    <optgroup label="Shapes">
                       <option value="iris-in">Iris In</option><option value="iris-out">Iris Out</option>
                       <option value="star-in">Star In</option><option value="star-out">Star Out</option>
                    </optgroup>
                    <optgroup label="Effects">
                       <option value="curtain-in">Curtain In</option><option value="curtain-out">Curtain Out</option>
                       <option value="ripple-in">Ripple In</option><option value="ripple-out">Ripple Out</option>
                       <option value="wind-left">Wind Left</option><option value="wind-right">Wind Right</option>
                    </optgroup>
                  </select>
                </div>
              )}

              {getSharedVal('type') === 'animate' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-indigo-400 mb-1 font-bold uppercase tracking-wider">Target Cue #</label>
                      <input type="text" value={isMixed('animTargetCue') ? '' : getSharedVal('animTargetCue', '')} onChange={(e)=>updateSelectedCues('animTargetCue', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 rounded px-2 py-1.5 text-sm outline-none" placeholder="e.g. 1.5" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-indigo-400 mb-1 font-bold uppercase tracking-wider">Property</label>
                      <select value={isMixed('animProperty') ? 'mixed' : getSharedVal('animProperty', 'posX')} onChange={(e)=>updateSelectedCues('animProperty', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 rounded px-2 py-1.5 text-sm outline-none">
                        <option value="posX">Pos X %</option>
                        <option value="posY">Pos Y %</option>
                        <option value="scaleX">Scale X %</option>
                        <option value="scaleY">Scale Y %</option>
                        <option value="customOpacity">Opacity (0 to 1)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-indigo-400 mb-1 font-bold uppercase tracking-wider">Start Value</label>
                      <input type="number" step="any" value={isMixed('animStartValue') ? '' : getSharedVal('animStartValue', 0)} onChange={(e)=>updateSelectedCues('animStartValue', parseFloat(e.target.value)||0)} className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 rounded px-2 py-1.5 text-sm outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-indigo-400 mb-1 font-bold uppercase tracking-wider">End Value</label>
                      <input type="number" step="any" value={isMixed('animEndValue') ? '' : getSharedVal('animEndValue', 100)} onChange={(e)=>updateSelectedCues('animEndValue', parseFloat(e.target.value)||0)} className="w-full bg-gray-950 border border-gray-700 focus:border-indigo-500 rounded px-2 py-1.5 text-sm outline-none" />
                    </div>
                  </div>
                  
                  <div className="pt-3 border-t border-gray-800 space-y-2">
                    <label className="flex items-start gap-2 text-[10px] font-bold tracking-wider uppercase text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={getSharedVal('animPathEnabled', false)} onChange={(e) => updateSelectedCues('animPathEnabled', e.target.checked)} className="w-3.5 h-3.5 bg-gray-900 border-gray-700 rounded text-indigo-500 focus:ring-indigo-500 mt-0.5" />
                      Follow Custom SVG Motion Path <br/><span className="text-[8px] text-gray-500 normal-case block mt-0.5">(Overrides Property/Values)</span>
                    </label>
                    {getSharedVal('animPathEnabled') && (
                      <button disabled={activeCues.length > 1} onClick={() => activeCues.length === 1 && setEditingPathCueId(selectedCueIds[0])} className="w-full px-3 py-1.5 bg-indigo-900/50 hover:bg-indigo-800 border border-indigo-700 rounded text-[10px] uppercase font-bold tracking-wider text-indigo-200 transition-colors disabled:opacity-50">
                        Draw Motion Path
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
          
          {/* SECTION 5: REGISTERED PLUGINS */}
          {pluginPanels.map(plugin => (
            <PluginAccordion 
              key={plugin.id} 
              plugin={plugin} 
              activeCue={activeCues[0]} 
              cues={cues}
              setCues={setCues}
              selectedCueIds={selectedCueIds}
              updateSelectedCues={updateSelectedCues}
            />
          ))}
          
          </div>

      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center text-sm text-gray-600">
            Select a cue to inspect.
          </div>
          {pluginPanels.length > 0 && (
            <div className="p-4 border-t border-gray-800 space-y-3 bg-gray-950/20 max-h-[300px] overflow-y-auto custom-scrollbar shrink-0">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Installed Plugins</h3>
              {pluginPanels.map(plugin => (
                <PluginAccordion 
                  key={plugin.id} 
                  plugin={plugin} 
                  activeCue={null}
                  cues={cues}
                  setCues={setCues}
                  selectedCueIds={selectedCueIds}
                  updateSelectedCues={updateSelectedCues}
                />
              ))}
            </div>
          )}
        </div>
      )}
        </>
      )}

        {inspectorMode === 'live' && (
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-950">
                <div className="mb-4">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Active Playback</h2>
                    <p className="text-[10px] text-gray-600">Adjust live volume or kill playing media without altering the saved cue settings.</p>
                </div>
                
                <div>
                    {cues.filter(c => c.state === 'playing' && ['audio', 'video'].includes(c.type)).map(activeCue => (
                        <LiveMediaRow key={`live-${activeCue.id}`} activeCue={activeCue} setCues={setCues} />
                    ))}

                    {cues.filter(c => c.state === 'playing' && ['audio', 'video'].includes(c.type)).length === 0 && (
                        <div className="text-center py-8 text-gray-600 border border-dashed border-gray-800 rounded-lg">
                            <Volume2 className="w-6 h-6 mx-auto mb-2 opacity-50" />
                            <p className="text-xs uppercase font-bold">No Media Playing</p>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
}, areInspectorPropsEqual);

export default Inspector;