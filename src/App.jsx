import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Video, Music, Settings, Maximize, AlertCircle, ChevronRight, Edit3, Plus, Trash2, Crosshair, ArrowRight, Layers, StopCircle, MonitorUp, MonitorDown, Grid3X3, RotateCcw, GripVertical, Image as ImageIcon, Clock, Save, FolderOpen, FilePlus, Pause, Activity, CornerDownRight, FolderPlus, FileText, Camera, Moon, PauseCircle, Search, Hash, Crop, X, Check, Repeat } from 'lucide-react';

// --- TIME FORMAT HELPER ---
const formatTime = (timeInSeconds) => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";
  const m = Math.floor(timeInSeconds / 60);
  const s = Math.floor(timeInSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// --- AUDIO VISUALIZER COMPONENT ---
const AudioVisualizer = ({ isPlaying, isPaused, type }) => {
  if (!isPlaying || type === 'image' || type === 'goto' || type === 'pause' || type === 'blackout' || type === 'counter') return null;
  return (
    <div className="flex items-end gap-[2px] h-3 ml-3 shrink-0" title={isPaused ? "Audio Paused" : "Audio Playing"}>
      <div className="w-[3px] bg-green-500 rounded-t-sm origin-bottom" style={{ animation: `meter 0.4s ease-in-out infinite alternate ${isPaused ? 'paused' : 'running'}`, height: '100%' }} />
      <div className="w-[3px] bg-green-500 rounded-t-sm origin-bottom" style={{ animation: `meter 0.6s ease-in-out infinite alternate 0.2s ${isPaused ? 'paused' : 'running'}`, height: '100%' }} />
      <div className="w-[3px] bg-green-500 rounded-t-sm origin-bottom" style={{ animation: `meter 0.5s ease-in-out infinite alternate 0.4s ${isPaused ? 'paused' : 'running'}`, height: '100%' }} />
    </div>
  );
};

// --- LIVE VIDEO STATS OVERLAY ---
const VideoStats = ({ videoId, name }) => {
  const [fps, setFps] = useState(0);
  const [res, setRes] = useState("Loading...");
  
  useEffect(() => {
    const video = document.getElementById(videoId);
    if (!video) return;
    let lastTime = 0;
    let lastFrames = 0;
    let animId;
    const check = (timestamp) => {
      if (!lastTime) lastTime = timestamp;
      if (video.readyState >= 2) {
        if (video.getVideoPlaybackQuality) {
           const quality = video.getVideoPlaybackQuality();
           const frames = quality.totalVideoFrames;
           if (timestamp - lastTime >= 1000) {
             setFps(Math.round(((frames - lastFrames) * 1000) / (timestamp - lastTime)));
             lastFrames = frames;
             lastTime = timestamp;
             setRes(`${video.videoWidth}x${video.videoHeight}`);
           }
        } else {
           setFps("N/A");
           setRes(`${video.videoWidth}x${video.videoHeight}`);
        }
      }
      animId = requestAnimationFrame(check);
    };
    animId = requestAnimationFrame(check);
    return () => cancelAnimationFrame(animId);
  }, [videoId]);

  return (
    <div className="bg-black/80 border border-gray-700 text-green-400 font-mono text-[10px] px-2.5 py-1.5 rounded shadow-lg flex flex-col backdrop-blur-md">
      <span className="text-gray-400 mb-1 border-b border-gray-700 pb-0.5 truncate max-w-[150px]">{name}</span>
      <span>FPS: {fps}</span>
      <span>RES: {res}</span>
    </div>
  );
};

// --- CANVAS SYNC COMPONENT ---
function VideoSyncCanvas({ videoId, width, height }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); 
    let animId;

    const loop = () => {
      const video = document.getElementById(videoId);
      if (video && video.readyState >= 2 && !video.paused && width > 0 && height > 0) {
        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch (e) {}
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animId);
  }, [videoId, width, height]);

  return <canvas ref={canvasRef} width={Math.max(1, Math.round(width || 1))} height={Math.max(1, Math.round(height || 1))} className="w-full h-full block" />;
}

// --- HARDWARE CAMERA STREAMER ---
const CameraMasterPlayer = ({ cue, isPaused }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    let stream = null;
    const startCamera = async () => {
      if ((cue.state === 'playing' || cue.state === 'stopping') && cue.cameraLive) {
        try {
          if (cue.url) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cue.url } } });
            } catch (fallbackErr) {
              stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
          } else {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
          
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            if (isPaused) videoRef.current.pause(); 
          }
        } catch (err) { 
          console.warn("Camera Warning: Could not start video source. Hardware may be in use or disconnected."); 
        }
      } else {
        if (videoRef.current && videoRef.current.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(t => t.stop());
          videoRef.current.srcObject = null;
        }
      }
    };
    startCamera();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [cue.state, cue.cameraLive, cue.url]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      if (isPaused) videoRef.current.pause();
      else videoRef.current.play().catch(e => console.log("Camera Autoplay Wait:", e));
    }
  }, [isPaused]);

  return <video id={`master-vid-${cue.id}`} ref={videoRef} autoPlay playsInline muted />;
};

// --- MASK EDITOR OVERLAY ---
const MaskEditorOverlay = ({ cue, onClose, onSave }) => {
  const [polygons, setPolygons] = useState([]); 
  const [currentPoints, setCurrentPoints] = useState([]); 
  const [mousePos, setMousePos] = useState(null);
  const [resolution, setResolution] = useState({ w: 1920, h: 1080 });
  const svgRef = useRef(null);
  const bgCanvasRef = useRef(null);

  useEffect(() => {
    let timeoutId;
    try {
      if (cue.type === 'video' || cue.type === 'camera') {
        const vid = document.getElementById(`master-vid-${cue.id}`);
        const tryCapture = () => {
          if (vid && vid.videoWidth && bgCanvasRef.current) {
            setResolution({ w: vid.videoWidth, h: vid.videoHeight });
            bgCanvasRef.current.width = vid.videoWidth; bgCanvasRef.current.height = vid.videoHeight;
            bgCanvasRef.current.getContext('2d').drawImage(vid, 0, 0, vid.videoWidth, vid.videoHeight);
          } else if (vid && !vid.videoWidth) {
            timeoutId = setTimeout(tryCapture, 100);
          }
        };
        tryCapture();
      } else if (cue.type === 'image') {
        const img = new Image();
        img.onload = () => {
          setResolution({ w: img.naturalWidth, h: img.naturalHeight });
          if (bgCanvasRef.current) {
            bgCanvasRef.current.width = img.naturalWidth; bgCanvasRef.current.height = img.naturalHeight;
            bgCanvasRef.current.getContext('2d').drawImage(img, 0, 0);
          }
        };
        img.src = cue.url;
      }
    } catch (e) { console.error("Failed to capture frame for mask:", e); }
    return () => clearTimeout(timeoutId);
  }, [cue]);

  const handleCanvasClick = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPoints([...currentPoints, { x, y }]);
  };

  const finishCurrentShape = () => {
    if (currentPoints.length >= 3) {
      setPolygons([...polygons, currentPoints]);
      setCurrentPoints([]);
    }
  };

  const handleSave = () => {
    const allPolygons = [...polygons];
    if (currentPoints.length >= 3) allPolygons.push(currentPoints);
    if (allPolygons.length === 0) { onSave(''); return; }
    
    const c = document.createElement('canvas');
    c.width = resolution.w; c.height = resolution.h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'black'; 
    
    allPolygons.forEach(poly => {
      ctx.beginPath();
      ctx.moveTo(poly[0].x * c.width, poly[0].y * c.height);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x * c.width, poly[i].y * c.height);
      ctx.closePath();
      ctx.fill();
    });
    onSave(c.toDataURL('image/png'));
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col">
      <div className="p-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center shadow-lg z-10">
        <h2 className="font-bold text-gray-200 flex items-center gap-2 text-lg"><Crop className="w-5 h-5 text-blue-500" /> Edit Mask Transparency</h2>
        <div className="flex gap-3">
          {currentPoints.length >= 3 && (<button onClick={finishCurrentShape} className="px-4 py-1.5 rounded bg-green-900/50 border border-green-700 hover:bg-green-800 text-green-300 text-sm font-semibold transition-colors flex items-center gap-2 animate-pulse"><Plus className="w-4 h-4"/> Next Shape</button>)}
          <button onClick={() => { setPolygons([]); setCurrentPoints([]); }} className="px-4 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold transition-colors flex items-center gap-2"><Trash2 className="w-4 h-4"/> Clear All</button>
          <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-700 hover:bg-gray-800 text-gray-300 text-sm font-semibold transition-colors flex items-center gap-2"><X className="w-4 h-4"/> Cancel</button>
          <button onClick={handleSave} className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg transition-colors flex items-center gap-2"><Check className="w-4 h-4"/> Apply Mask</button>
        </div>
      </div>
      
      <div className="flex-1 p-8 flex items-center justify-center relative bg-[#111] overflow-hidden" style={{ backgroundImage: 'linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' }}>
        <div className="absolute top-6 right-6 bg-black/80 backdrop-blur border border-gray-700 p-4 rounded shadow-2xl z-20 max-w-xs pointer-events-none">
          <h4 className="text-blue-400 font-bold text-sm mb-1 uppercase tracking-wider">Instructions</h4>
          <ul className="text-xs text-gray-300 space-y-1 list-disc pl-4">
            <li>Click to place mask points.</li>
            <li>Draw around the area you want to remain <b>visible</b>.</li>
            <li>Click <b>Next Shape</b> to add multiple areas.</li>
          </ul>
        </div>
        <div className="relative shadow-2xl border border-gray-700 bg-black" style={{ width: '100%', maxWidth: '85vw', maxHeight: '80vh', aspectRatio: `${resolution.w}/${resolution.h}` }}>
          <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full object-contain opacity-50 pointer-events-none" />
          <svg 
            ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full cursor-crosshair z-10" 
            onClick={handleCanvasClick} 
            onMouseMove={(e) => { const rect = svgRef.current.getBoundingClientRect(); setMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }); }} 
            onMouseLeave={() => setMousePos(null)}
          >
            {polygons.map((poly, idx) => (<polygon key={`poly-${idx}`} points={poly.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} fill="rgba(59, 130, 246, 0.4)" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />))}
            {currentPoints.length > 0 && (<polygon points={currentPoints.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="0.5" strokeDasharray="0.5 0.5" vectorEffect="non-scaling-stroke" />)}
            {currentPoints.map((p, i) => (<circle key={`pt-${i}`} cx={p.x * 100} cy={p.y * 100} r="1" fill="#60a5fa" />))}
            {currentPoints.length > 0 && mousePos && (<line x1={currentPoints[currentPoints.length - 1].x * 100} y1={currentPoints[currentPoints.length - 1].y * 100} x2={mousePos.x * 100} y2={mousePos.y * 100} stroke="rgba(59, 130, 246, 0.5)" strokeWidth="0.5" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />)}
          </svg>
        </div>
      </div>
    </div>
  );
};

// --- AFFINE TRIANGULATION MATH ---
function getAffineTransform(w, h, p0, p1, p2, type) {
  let a, b, c, d, tx, ty;
  if (type === 1) { 
    tx = p0.x; ty = p0.y;
    a = (p1.x - p0.x) / w; b = (p1.y - p0.y) / w;
    c = (p2.x - p0.x) / h; d = (p2.y - p0.y) / h;
  } else { 
    a = (p1.x - p2.x) / w; b = (p1.y - p2.y) / w;
    c = (p1.x - p0.x) / h; d = (p1.y - p0.y) / h;
    tx = p0.x - a * w; ty = p0.y - b * w;
  }
  return `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty})`;
}

const MEDIA = {
  video1: "https://www.w3schools.com/html/mov_bbb.mp4",
  video2: "https://media.w3.org/2010/05/sintel/trailer_hd.mp4",
  audio1: "https://www.w3schools.com/html/horse.mp3",
  audio2: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  image1: "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"
};

const getNativeFilePath = (file) => {
  try {
    const { webUtils } = window.require('electron');
    const nativePath = webUtils.getPathForFile(file);
    if (nativePath) return `file://${nativePath.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  } catch (e) {}
  return file.path ? `file://${file.path.replace(/#/g, '%23').replace(/\?/g, '%3F')}` : URL.createObjectURL(file);
};

const getFileInfo = (url, cueType) => {
  let fileName = 'Unknown'; let fileType = 'Unknown'; let displayPath = url || '';
  if (cueType === 'camera') return { fileName: 'Live Capture Feed', fileType: 'STREAM', displayPath: url ? `Hardware ID: ${url}` : 'Default System Camera' };
  if (cueType === 'blackout') return { fileName: 'Stage Blackout', fileType: 'ACTION', displayPath: 'Internal Video Engine' };
  if (cueType === 'pause') return { fileName: 'Pause Show', fileType: 'ACTION', displayPath: 'Internal Control Engine' };
  if (cueType === 'goto') return { fileName: 'GoTo Pointer', fileType: 'ACTION', displayPath: 'Internal Control Engine' };
  if (cueType === 'counter') return { fileName: 'Loop Counter', fileType: 'ACTION', displayPath: 'Internal Control Engine' };
  if (url) {
     try {
         const parts = decodeURIComponent(new URL(url).pathname).split('/');
         fileName = parts.pop() || 'Unknown';
         if (fileName.includes('.')) fileType = fileName.split('.').pop().toUpperCase();
         if (url.startsWith('file://')) displayPath = decodeURIComponent(new URL(url).pathname);
         else if (url.startsWith('blob:')) displayPath = 'Blob (Memory / Unsaved)';
     } catch (e) {
         const parts = url.split('/');
         fileName = parts.pop();
         if (fileName && fileName.includes('.')) fileType = fileName.split('.').pop().toUpperCase();
     }
  }
  return { fileName, fileType, displayPath };
};

const resolveCue = (cueId, cueList, depth = 0) => {
  if (depth > 10) return null; 
  const cue = cueList.find(c => c.id === cueId);
  if (!cue) return null;
  if (cue.type === 'goto') {
    if (cue.gotoMode === 'random') {
      const val1 = parseFloat(cue.targetCueRangeMin); const val2 = parseFloat(cue.targetCueRangeMax);
      if (!isNaN(val1) && !isNaN(val2)) {
         const minVal = Math.min(val1, val2); const maxVal = Math.max(val1, val2);
         const validCues = cueList.filter(c => { const num = parseFloat(c.number); return !isNaN(num) && num >= minVal && num <= maxVal; });
         if (validCues.length > 0) return resolveCue(validCues[Math.floor(Math.random() * validCues.length)].id, cueList, depth + 1);
      }
      return null;
    } else {
      const target = cueList.find(c => String(c.number) === String(cue.targetCueNumber));
      return target ? resolveCue(target.id, cueList, depth + 1) : null;
    }
  }
  return cue;
};

export default function App() {
  const [isProjector, setIsProjector] = useState(window.location.hash === '#projector' || window.name === 'ProjectorOutput');
  const [projectorActive, setProjectorActive] = useState(false);
  const projectorWinRef = useRef(null);

  useEffect(() => {
    const handleHash = () => setIsProjector(window.location.hash === '#projector' || window.name === 'ProjectorOutput');
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Listen for the Electron window closing manually
  useEffect(() => {
    try {
      const { ipcRenderer } = window.require('electron');
      const handleClosed = () => setProjectorActive(false);
      ipcRenderer.on('projector-closed', handleClosed);
      return () => { ipcRenderer.removeListener('projector-closed', handleClosed); };
    } catch (e) {}
  }, []);

  const [cues, setCues] = useState([
    { id: '1', number: '1', type: 'video', name: 'Background Loop', url: MEDIA.video1, state: 'stopped', loop: true, triggerBehavior: 'stop-others', endBehavior: 'none', fadeTime: 2.0, volume: 1, targetCueNumber: '', notes: 'Wait for house lights to fully dim.', cameraLive: true, maskEnabled: false, maskDataUrl: null },
    { id: '2', number: '2', type: 'audio', name: 'Ambient Music', url: MEDIA.audio2, state: 'stopped', loop: true, triggerBehavior: 'overlap', endBehavior: 'none', fadeTime: 5.0, volume: 0.5, targetCueNumber: '', notes: '', cameraLive: true, maskEnabled: false, maskDataUrl: null },
    { id: '3', number: '3', type: 'image', name: 'Overlay Graphic', url: MEDIA.image1, state: 'stopped', loop: false, triggerBehavior: 'overlap', endBehavior: 'none', fadeTime: 1.0, autoAdvance: true, advanceTime: 4, targetCueNumber: '', notes: '', cameraLive: true, maskEnabled: false, maskDataUrl: null },
    { id: '4', number: '4', type: 'camera', name: 'Stage Live Feed', url: '', state: 'stopped', loop: false, triggerBehavior: 'stop-others', endBehavior: 'none', fadeTime: 1.0, volume: 1, targetCueNumber: '', notes: 'Standby for guest speaker', cameraLive: true, maskEnabled: false, maskDataUrl: null },
    { id: '5', number: '5', type: 'goto', name: 'Randomize Intro Video', url: '', state: 'stopped', loop: false, triggerBehavior: 'overlap', endBehavior: 'none', fadeTime: 0, volume: 1, targetCueNumber: '', notes: '', cameraLive: true, maskEnabled: false, maskDataUrl: null, gotoMode: 'random', targetCueRangeMin: '1', targetCueRangeMax: '3' },
    { id: '6', number: '6', type: 'blackout', name: 'Fade to Black', url: '', state: 'stopped', loop: false, triggerBehavior: 'stop-others', endBehavior: 'none', fadeTime: 3.0, volume: 1, targetCueNumber: '', notes: 'Global 3 second hard stop.', cameraLive: true, maskEnabled: false, maskDataUrl: null },
    { id: '7', number: '7', type: 'counter', name: 'Repeat Loop 3 Times', url: '', state: 'stopped', loop: false, triggerBehavior: 'overlap', endBehavior: 'auto-follow', fadeTime: 0, volume: 1, targetCueNumber: '1', notes: 'Increment and proceed, or jump if limit reached.', cameraLive: true, maskEnabled: false, maskDataUrl: null, counterLimit: 3, counterCurrent: 0 },
  ]);
  
  const [selectedCueIds, setSelectedCueIds] = useState(['1']);
  const [lastSelectedId, setLastSelectedId] = useState('1'); 
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [editingMaskCueId, setEditingMaskCueId] = useState(null); 
  const [mediaTimes, setMediaTimes] = useState({}); 
  const [showNewModal, setShowNewModal] = useState(false); 
  const [isPaused, setIsPaused] = useState(false); 
  const [showStats, setShowStats] = useState(false); 
  const [metadata, setMetadata] = useState({}); 
  const [videoDevices, setVideoDevices] = useState([]); 
  const [jumpToValue, setJumpToValue] = useState(""); 
  
  const probedCues = useRef(new Set()); 
  const [gridSize, setGridSize] = useState({ x: 1, y: 1 });
  const [pins, setPins] = useState([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 450 });
  const advanceTimers = useRef({}); 
  const fadeIntervals = useRef({});
  const fadeStateTrackers = useRef({});
  const fileInputRef = useRef(null); 
  const folderInputRef = useRef(null); 
  const [gpuStatus, setGpuStatus] = useState("Probing Hardware..."); 

  const [draggedCueId, setDraggedCueId] = useState(null);
  const [dragOverCueId, setDragOverCueId] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const scrollCueIntoView = useCallback((cueId) => {
    const el = document.querySelector(`[data-cue-id="${cueId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  useEffect(() => {
    const actionCues = cues.filter(c => (c.type === 'pause' || c.type === 'counter') && c.state === 'playing');
    if (actionCues.length > 0) {
      if (actionCues.some(c => c.type === 'pause')) setIsPaused(true);
      setCues(prev => prev.map(c => (c.type === 'pause' || c.type === 'counter') && c.state === 'playing' ? { ...c, state: 'stopped' } : c));
      actionCues.forEach(ac => { if (ac.endBehavior === 'auto-follow') setTimeout(() => triggerNextCueAfter(ac.id), 0); });
    }
  }, [cues]); 

  useEffect(() => {
    if (!isProjector && navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => setVideoDevices(devices.filter(d => d.kind === 'videoinput'))).catch(e => console.warn(e));
    }
  }, [isProjector]);

  // BUGFIX: Split LocalStorage sync into two parts to prevent cyclic re-rendering
  // 1. Controller Mode: Send State
  useEffect(() => {
    if (!isProjector) {
      localStorage.setItem('mapper_state', JSON.stringify({ cues, pins, gridSize, isPaused }));
    }
  }, [cues, pins, gridSize, isPaused, isProjector]);

  // 2. Projector Mode: Receive State
  useEffect(() => {
    if (isProjector) {
      const handleStorage = (e) => {
        if (e.key === 'mapper_state') {
          try {
            const state = JSON.parse(e.newValue);
            if (state.cues) setCues(state.cues); 
            if (state.pins) setPins(state.pins);
            if (state.gridSize) setGridSize(state.gridSize);
            if (state.isPaused !== undefined) setIsPaused(state.isPaused);
          } catch (err) {}
        }
      };
      window.addEventListener('storage', handleStorage);
      
      const initial = localStorage.getItem('mapper_state');
      if (initial) {
        try {
          const state = JSON.parse(initial);
          if (state.cues) setCues(state.cues); 
          if (state.pins) setPins(state.pins);
          if (state.gridSize) setGridSize(state.gridSize);
          if (state.isPaused !== undefined) setIsPaused(state.isPaused);
        } catch (err) {}
      }
      return () => window.removeEventListener('storage', handleStorage);
    }
  }, [isProjector]);

  useEffect(() => {
    if (!isProjector) {
      try { const { ipcRenderer } = window.require('electron'); ipcRenderer.invoke('get-gpu-status').then(status => setGpuStatus(status)); } 
      catch (e) { setGpuStatus("Browser Mode (No Native GPU API)"); }
    }
  }, [isProjector]);

  const doVolumeFade = useCallback((el, startVol, endVol, durationSec) => {
    if (fadeIntervals.current[el.id]) clearInterval(fadeIntervals.current[el.id]);
    if (durationSec <= 0) { el.volume = Math.max(0, Math.min(1, endVol)); return; }
    const steps = 20; const interval = 1000 / steps; const totalSteps = Math.max(1, durationSec * steps);
    let step = 0; el.volume = Math.max(0, Math.min(1, startVol));
    fadeIntervals.current[el.id] = setInterval(() => {
      step++;
      el.volume = Math.max(0, Math.min(1, startVol + (endVol - startVol) * (step / totalSteps)));
      if (step >= totalSteps) { clearInterval(fadeIntervals.current[el.id]); el.volume = Math.max(0, Math.min(1, endVol)); }
    }, interval);
  }, []);

  const cuesRef = useRef(cues);
  useEffect(() => { cuesRef.current = cues; }, [cues]);

  useEffect(() => {
    cues.forEach(cue => {
      const trackKey = cue.id;
      const lastState = fadeStateTrackers.current[trackKey]?.state;
      const el = document.getElementById(`master-${cue.type === 'audio' ? 'aud' : (cue.type === 'image' ? 'img' : 'vid')}-${cue.id}`);

      if (cue.state === 'playing' && lastState !== 'playing') {
          fadeStateTrackers.current[trackKey] = { state: 'playing', start: performance.now(), duration: cue.fadeTime || 0 };
          if (el && cue.type !== 'image' && cue.type !== 'goto' && cue.type !== 'camera' && cue.type !== 'blackout' && cue.type !== 'pause' && cue.type !== 'counter') {
              if (cue.fadeTime > 0) doVolumeFade(el, 0, cue.volume !== undefined ? cue.volume : 1, cue.fadeTime);
              else el.volume = cue.volume !== undefined ? cue.volume : 1;
          }
      } 
      else if (cue.state === 'stopping' && lastState !== 'stopping') {
          fadeStateTrackers.current[trackKey] = { state: 'stopping', start: performance.now(), duration: cue.fadeTime || 0 };
          if (el && cue.type !== 'image' && cue.type !== 'goto' && cue.type !== 'camera' && cue.type !== 'blackout' && cue.type !== 'pause' && cue.type !== 'counter') {
              if (cue.fadeTime > 0) doVolumeFade(el, el.volume, 0, cue.fadeTime);
          }
          if (advanceTimers.current[`stop-${cue.id}`]) clearTimeout(advanceTimers.current[`stop-${cue.id}`]);
          advanceTimers.current[`stop-${cue.id}`] = setTimeout(() => {
              setCues(prev => prev.map(c => c.id === cue.id ? { ...c, state: 'stopped' } : c));
          }, (cue.fadeTime || 0) * 1000);
      } 
      else if (cue.state === 'stopped' && lastState !== 'stopped') {
          fadeStateTrackers.current[trackKey] = { state: 'stopped', start: 0, duration: 0 };
          if (advanceTimers.current[`stop-${cue.id}`]) { clearTimeout(advanceTimers.current[`stop-${cue.id}`]); delete advanceTimers.current[`stop-${cue.id}`]; }
          if (el && fadeIntervals.current[el.id]) clearInterval(fadeIntervals.current[el.id]);
      }
      if (cue.state === 'playing' && lastState === 'playing' && el && !fadeIntervals.current[el.id]) {
          el.volume = cue.volume !== undefined ? cue.volume : 1;
      }
    });
  }, [cues, doVolumeFade]);

  useEffect(() => {
    const masterCanvas = document.createElement('canvas');
    const layerCanvas = document.createElement('canvas');
    let animId;

    const renderLoop = () => {
      if (masterCanvas.width !== stageSize.w) masterCanvas.width = Math.max(1, stageSize.w);
      if (masterCanvas.height !== stageSize.h) masterCanvas.height = Math.max(1, stageSize.h);
      if (layerCanvas.width !== stageSize.w) layerCanvas.width = Math.max(1, stageSize.w);
      if (layerCanvas.height !== stageSize.h) layerCanvas.height = Math.max(1, stageSize.h);

      const masterCtx = masterCanvas.getContext('2d', { alpha: true });
      const layerCtx = layerCanvas.getContext('2d', { alpha: true });
      masterCtx.clearRect(0, 0, stageSize.w, stageSize.h);

      const currentCues = cuesRef.current.filter(c => c.state === 'playing' || c.state === 'stopping');
      
      currentCues.forEach(cue => {
        if (cue.type === 'audio' || cue.type === 'goto' || cue.type === 'pause' || cue.type === 'counter') return;

        let opacity = 1;
        const tracker = fadeStateTrackers.current[cue.id];
        if (tracker) {
          const elapsed = (performance.now() - tracker.start) / 1000;
          if (tracker.state === 'playing') opacity = tracker.duration > 0 ? Math.min(1, elapsed / tracker.duration) : 1;
          else if (tracker.state === 'stopping') opacity = tracker.duration > 0 ? Math.max(0, 1 - (elapsed / tracker.duration)) : 0;
        }

        if (cue.type === 'blackout') {
           masterCtx.globalAlpha = opacity;
           masterCtx.fillStyle = 'black'; masterCtx.fillRect(0, 0, stageSize.w, stageSize.h);
           masterCtx.globalAlpha = 1;
           return;
        }

        const mediaEl = document.getElementById(`master-${cue.type === 'image' ? 'img' : 'vid'}-${cue.id}`);
        if (!mediaEl) return;
        if (mediaEl instanceof HTMLVideoElement && mediaEl.readyState < 2) return;

        masterCtx.globalAlpha = opacity;

        if (cue.maskEnabled && cue.maskDataUrl) {
           const maskEl = document.getElementById(`master-mask-${cue.id}`);
           if (maskEl && maskEl.complete) {
              layerCtx.clearRect(0, 0, stageSize.w, stageSize.h);
              layerCtx.globalCompositeOperation = 'source-over';
              layerCtx.drawImage(maskEl, 0, 0, stageSize.w, stageSize.h);
              layerCtx.globalCompositeOperation = 'source-in';
              layerCtx.drawImage(mediaEl, 0, 0, stageSize.w, stageSize.h);
              masterCtx.drawImage(layerCanvas, 0, 0);
           } else masterCtx.drawImage(mediaEl, 0, 0, stageSize.w, stageSize.h);
        } else {
           masterCtx.drawImage(mediaEl, 0, 0, stageSize.w, stageSize.h);
        }
        masterCtx.globalAlpha = 1;
      });

      const viewPrefix = isProjector ? 'proj' : 'local';
      const quadW = stageSize.w / gridSize.x; const quadH = stageSize.h / gridSize.y;

      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
           const qIdx = y * gridSize.x + x;
           [1, 2].forEach(tri => {
             const canvas = document.getElementById(`quad-ctx-${viewPrefix}-${qIdx}-${tri}`);
             if (canvas) {
                if (canvas.width !== quadW) canvas.width = Math.max(1, quadW);
                if (canvas.height !== quadH) canvas.height = Math.max(1, quadH);
                canvas.getContext('2d', { alpha: false }).drawImage(masterCanvas, x * quadW, y * quadH, quadW, quadH, 0, 0, quadW, quadH);
             }
           });
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [stageSize, gridSize, isProjector]);

  useEffect(() => {
    cues.forEach(cue => {
      const probeKey = `${cue.id}-${cue.url}`;
      if (!probedCues.current.has(probeKey) && cue.url && cue.type !== 'goto' && cue.type !== 'camera' && cue.type !== 'blackout' && cue.type !== 'pause' && cue.type !== 'counter') {
        probedCues.current.add(probeKey);
        if (cue.type === 'image') {
          const img = new window.Image();
          img.onload = () => setMetadata(prev => ({ ...prev, [cue.id]: { resolution: `${img.naturalWidth}x${img.naturalHeight}`, status: 'Loaded' } }));
          img.onerror = () => setMetadata(prev => ({ ...prev, [cue.id]: { resolution: 'Error', status: 'Error' } }));
          img.src = cue.url;
        } else if (cue.type === 'video') {
          const vid = document.createElement('video');
          vid.onloadedmetadata = () => setMetadata(prev => ({ ...prev, [cue.id]: { resolution: `${vid.videoWidth}x${vid.videoHeight}`, duration: vid.duration, status: 'Loaded' } }));
          vid.onerror = () => setMetadata(prev => ({ ...prev, [cue.id]: { resolution: 'Error', duration: 0, status: 'Error' } }));
          vid.src = cue.url;
        } else if (cue.type === 'audio') {
          const aud = document.createElement('audio');
          aud.onloadedmetadata = () => setMetadata(prev => ({ ...prev, [cue.id]: { duration: aud.duration, status: 'Loaded' } }));
          aud.onerror = () => setMetadata(prev => ({ ...prev, [cue.id]: { duration: 0, status: 'Error' } }));
          aud.src = cue.url;
        }
      }
    });
  }, [cues]);

  const handleSaveShow = () => {
    const stateToSave = { cues: cues.map(c => ({ ...c, state: 'stopped' })), pins, gridSize, isPaused: false };
    const blob = new Blob([JSON.stringify(stateToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'show_workspace.TSW'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleLoadShow = (e) => {
    const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedState = JSON.parse(event.target.result);
        if (loadedState.cues) { 
          const hydratedCues = loadedState.cues.map(c => ({ ...c, cameraLive: c.cameraLive ?? true, maskEnabled: c.maskEnabled ?? false, maskDataUrl: c.maskDataUrl ?? null, counterLimit: c.counterLimit ?? 1, counterCurrent: c.counterCurrent ?? 0, gotoMode: c.gotoMode || 'specific', targetCueRangeMin: c.targetCueRangeMin || '', targetCueRangeMax: c.targetCueRangeMax || '' }));
          setCues(hydratedCues); 
          if (hydratedCues.length > 0) { setSelectedCueIds([hydratedCues[0].id]); setLastSelectedId(hydratedCues[0].id); }
        }
        if (loadedState.pins) setPins(loadedState.pins); if (loadedState.gridSize) setGridSize(loadedState.gridSize); setIsPaused(false); 
      } catch (err) { alert("Invalid or corrupted .TSW show file."); }
    };
    reader.readAsText(file); e.target.value = ''; 
  };

  const handleAddFolder = (e) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => { const name = file.name.toLowerCase(); return file.type.startsWith('audio/') || file.type.startsWith('video/') || file.type.startsWith('image/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.ogg') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg'); });
    validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const newCues = validFiles.map((file, idx) => {
      let type = 'video'; const name = file.name.toLowerCase();
      if (file.type.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg')) type = 'audio';
      else if (file.type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) type = 'image';
      return { id: Date.now().toString() + '-' + idx, number: '', type, name: file.name, url: getNativeFilePath(file), state: 'stopped', loop: false, triggerBehavior: 'stop-others', endBehavior: type === 'image' ? 'none' : 'auto-follow', fadeTime: 1.0, volume: 1, autoAdvance: false, advanceTime: 0, targetCueNumber: '', notes: '', cameraLive: true, maskEnabled: false, maskDataUrl: null, counterLimit: 1, counterCurrent: 0, gotoMode: 'specific', targetCueRangeMin: '', targetCueRangeMax: '' };
    });
    if (newCues.length > 0) { setCues(prev => { const updated = [...prev, ...newCues]; return updated.map((c, i) => ({ ...c, number: (i + 1).toString() })); }); }
    e.target.value = ''; 
  };

  const toggleProjectorWindow = () => { 
    try { 
      const { ipcRenderer } = window.require('electron'); 
      if (projectorActive) {
        ipcRenderer.send('close-projector');
        setProjectorActive(false);
      } else {
        ipcRenderer.send('spawn-projector'); 
        setProjectorActive(true);
      }
    } catch (e) { 
      if (window.location.protocol === 'blob:' || window.location.hostname.includes('googleusercontent')) {
        window.location.hash = 'projector';
        setIsProjector(true);
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(err => console.log("Browser prevented auto-fullscreen", err));
        }
      } else {
        if (projectorWinRef.current && !projectorWinRef.current.closed) {
          projectorWinRef.current.close();
          projectorWinRef.current = null;
          setProjectorActive(false);
        } else {
          const targetUrl = window.location.origin + window.location.pathname + '#projector';
          projectorWinRef.current = window.open(targetUrl, 'ProjectorOutput', 'width=1280,height=720'); 
          setProjectorActive(true);
          
          const checkClose = setInterval(() => {
            if (projectorWinRef.current && projectorWinRef.current.closed) {
              setProjectorActive(false);
              clearInterval(checkClose);
            }
          }, 500);
        }
      }
    } 
  };

  useEffect(() => {
    const observer = new ResizeObserver(entries => { if (entries[0]) setStageSize({ w: entries[0].contentRect.width, h: entries[0].contentRect.height }); });
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [isProjector]);

  const handleCueClick = (e, id) => {
    if (e.shiftKey && lastSelectedId) {
      const startIdx = cues.findIndex(c => c.id === lastSelectedId); const endIdx = cues.findIndex(c => c.id === id);
      const rangeIds = cues.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1).map(c => c.id);
      if (e.metaKey || e.ctrlKey) setSelectedCueIds(Array.from(new Set([...selectedCueIds, ...rangeIds])));
      else setSelectedCueIds(rangeIds);
    } else if (e.metaKey || e.ctrlKey) {
      if (selectedCueIds.includes(id)) setSelectedCueIds(selectedCueIds.filter(i => i !== id));
      else setSelectedCueIds([...selectedCueIds, id]);
      setLastSelectedId(id);
    } else { setSelectedCueIds([id]); setLastSelectedId(id); }
  };

  const handleJumpToCue = (e) => {
    if (e.key === 'Enter' && jumpToValue.trim()) {
       const foundCue = cues.find(c => String(c.number) === jumpToValue.trim());
       if (foundCue) { setSelectedCueIds([foundCue.id]); setLastSelectedId(foundCue.id); scrollCueIntoView(foundCue.id); setJumpToValue(""); e.target.blur(); }
    }
  };

  const handleGo = useCallback(() => {
    if (selectedCueIds.length === 0) return;
    setIsPaused(false); 
    setCues(prev => {
      let nextState = [...prev]; const resolvedCues = []; const mutations = {};
      const evaluateCue = (cueId, depth = 0) => {
        if (depth > 10) return null; const cue = prev.find(c => c.id === cueId); if (!cue) return null;
        if (cue.type === 'goto') {
          if (cue.gotoMode === 'random') {
             const val1 = parseFloat(cue.targetCueRangeMin); const val2 = parseFloat(cue.targetCueRangeMax);
             if (!isNaN(val1) && !isNaN(val2)) {
                const validCues = prev.filter(c => { const num = parseFloat(c.number); return !isNaN(num) && num >= Math.min(val1, val2) && num <= Math.max(val1, val2); });
                if (validCues.length > 0) return evaluateCue(validCues[Math.floor(Math.random() * validCues.length)].id, depth + 1);
             } return null;
          } else { const target = prev.find(c => String(c.number) === String(cue.targetCueNumber)); return target ? evaluateCue(target.id, depth + 1) : null; }
        }
        if (cue.type === 'counter') {
          const current = (mutations[cue.id]?.counterCurrent ?? cue.counterCurrent) || 0;
          if (current + 1 >= (cue.counterLimit || 1)) {
             mutations[cue.id] = { counterCurrent: 0 }; const target = prev.find(c => String(c.number) === String(cue.targetCueNumber)); return target ? evaluateCue(target.id, depth + 1) : null;
          } else { mutations[cue.id] = { counterCurrent: current + 1 }; return cue; }
        } return cue;
      };
      selectedCueIds.forEach(id => { const targetCue = evaluateCue(id); if (targetCue) resolvedCues.push(targetCue); });
      const resolvedIds = resolvedCues.map(c => c.id);
      if (resolvedIds.length === 0 && Object.keys(mutations).length === 0) return prev; 
      const hasHardStop = resolvedCues.some(c => c.triggerBehavior === 'stop-others');
      nextState = nextState.map(cue => {
        let updatedCue = { ...cue, ...(mutations[cue.id] || {}) };
        if (resolvedIds.includes(cue.id)) return { ...updatedCue, state: 'playing' };
        if (hasHardStop && !resolvedIds.includes(cue.id) && cue.state === 'playing') return cue.fadeTime > 0 ? { ...updatedCue, state: 'stopping' } : { ...updatedCue, state: 'stopped' };
        return updatedCue;
      });
      const lastTargetIndex = Math.max(...resolvedIds.map(id => prev.findIndex(c => c.id === id)));
      if (lastTargetIndex >= 0 && lastTargetIndex < prev.length - 1) { const nextSelectionId = prev[lastTargetIndex + 1].id; setTimeout(() => { setSelectedCueIds([nextSelectionId]); setLastSelectedId(nextSelectionId); scrollCueIntoView(nextSelectionId); }, 0); } 
      else if (lastTargetIndex === prev.length - 1) { const currentSelectionId = prev[lastTargetIndex].id; setTimeout(() => { setSelectedCueIds([currentSelectionId]); setLastSelectedId(currentSelectionId); scrollCueIntoView(currentSelectionId); }, 0); }
      return nextState;
    });
  }, [selectedCueIds, scrollCueIntoView]);

  const handleStopAll = useCallback(() => { setCues(prev => prev.map(cue => ({ ...cue, state: 'stopped' }))); setIsPaused(false); }, []);

  const stopCue = (id) => { setCues(prev => prev.map(cue => { if (cue.id === id) return { ...cue, state: cue.state === 'playing' && cue.fadeTime > 0 ? 'stopping' : 'stopped' }; return cue; })); };

  const triggerNextCueAfter = useCallback((currentCueId) => {
    setCues(prev => {
       const currentIndex = prev.findIndex(c => c.id === currentCueId);
       if (currentIndex >= 0 && currentIndex < prev.length - 1) {
          const nextCueRaw = prev[currentIndex + 1]; const mutations = {};
          const evaluateCue = (cueId, depth = 0) => {
            if (depth > 10) return null; const cue = prev.find(c => c.id === cueId); if (!cue) return null;
            if (cue.type === 'goto') {
              if (cue.gotoMode === 'random') {
                 const val1 = parseFloat(cue.targetCueRangeMin); const val2 = parseFloat(cue.targetCueRangeMax);
                 if (!isNaN(val1) && !isNaN(val2)) {
                    const validCues = prev.filter(c => { const num = parseFloat(c.number); return !isNaN(num) && num >= Math.min(val1, val2) && num <= Math.max(val1, val2); });
                    if (validCues.length > 0) return evaluateCue(validCues[Math.floor(Math.random() * validCues.length)].id, depth + 1);
                 } return null;
              } else { const target = prev.find(c => String(c.number) === String(cue.targetCueNumber)); return target ? evaluateCue(target.id, depth + 1) : null; }
            }
            if (cue.type === 'counter') {
              const current = (mutations[cue.id]?.counterCurrent ?? cue.counterCurrent) || 0;
              if (current + 1 >= (cue.counterLimit || 1)) { mutations[cue.id] = { counterCurrent: 0 }; const target = prev.find(c => String(c.number) === String(cue.targetCueNumber)); return target ? evaluateCue(target.id, depth + 1) : null; } 
              else { mutations[cue.id] = { counterCurrent: current + 1 }; return cue; }
            } return cue;
          };
          const nextCue = evaluateCue(nextCueRaw.id);
          if (!nextCue && Object.keys(mutations).length === 0) return prev; 
          let nextState = prev.map(cue => mutations[cue.id] ? { ...cue, ...mutations[cue.id] } : cue);
          if (nextCue) {
            if (nextCue.triggerBehavior === 'stop-others') nextState = nextState.map(c => c.id !== nextCue.id && c.state === 'playing' ? { ...c, state: c.fadeTime > 0 ? 'stopping' : 'stopped' } : c);
            nextState = nextState.map(c => c.id === nextCue.id ? { ...c, state: 'playing' } : c);
            setTimeout(() => { setSelectedCueIds(prevSelected => { if (prevSelected.length === 1 && prevSelected[0] === nextCueRaw.id) { const targetIndex = prev.findIndex(c => c.id === nextCueRaw.id); if (targetIndex >= 0 && targetIndex < prev.length - 1) { const pushedId = prev[targetIndex + 1].id; setLastSelectedId(pushedId); scrollCueIntoView(pushedId); return [pushedId]; } } return prevSelected; }); }, 0);
          } return nextState;
       } return prev;
    });
  }, [scrollCueIntoView]);

  const handleCueEnded = useCallback((endedCueId) => {
    setCues(prev => {
      const endedCue = prev.find(c => c.id === endedCueId);
      let nextState = prev.map(cue => cue.id === endedCueId ? { ...cue, state: 'stopped' } : cue);
      if (endedCue && endedCue.endBehavior === 'auto-follow') setTimeout(() => triggerNextCueAfter(endedCueId), 0);
      return nextState;
    });
  }, [triggerNextCueAfter]);

  useEffect(() => {
    cues.filter(c => c.state === 'playing' || c.state === 'stopping').forEach(cue => {
      if (cue.type === 'image' || cue.type === 'goto' || cue.type === 'camera' || cue.type === 'blackout' || cue.type === 'pause' || cue.type === 'counter') return;
      const el = document.getElementById(`master-${cue.type === 'video' ? 'vid' : 'aud'}-${cue.id}`);
      if (el) { if (isPaused) el.pause(); else el.play().catch(e => console.log("Auto-play prevented", e)); }
    });
  }, [isPaused, cues]);

  const handleMediaTimeUpdate = useCallback((id, target) => {
    const current = Math.floor(target.currentTime) || 0; const duration = isNaN(target.duration) || !isFinite(target.duration) ? 0 : Math.floor(target.duration);
    setMediaTimes(prev => prev[id]?.current === current && prev[id]?.duration === duration ? prev : { ...prev, [id]: { current, duration } });
  }, []);

  useEffect(() => {
    if (isProjector) return; 
    cues.forEach(cue => {
      if (cue.state === 'playing' && cue.autoAdvance && cue.advanceTime > 0 && !isPaused) {
        if (!advanceTimers.current[cue.id]) advanceTimers.current[cue.id] = setTimeout(() => { triggerNextCueAfter(cue.id); }, cue.advanceTime * 1000); 
      } else if (advanceTimers.current[cue.id]) { clearTimeout(advanceTimers.current[cue.id]); delete advanceTimers.current[cue.id]; }
    });
  }, [cues, isProjector, triggerNextCueAfter, isPaused]);

  const handleDragStart = (e, id) => { setDraggedCueId(id); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => e.target.classList.add('opacity-50'), 0); };
  const handleDragOver = (e, id) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCueId !== id) setDragOverCueId(id); };
  const handleDragLeave = (e, id) => { if (dragOverCueId === id) setDragOverCueId(null); };
  const handleDrop = (e, dropTargetId) => {
    e.preventDefault(); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) return; e.stopPropagation(); 
    if (!draggedCueId || draggedCueId === dropTargetId) { setDraggedCueId(null); setDragOverCueId(null); return; }
    setCues(prevCues => {
      const draggedIndex = prevCues.findIndex(c => c.id === draggedCueId); const dropIndex = prevCues.findIndex(c => c.id === dropTargetId);
      const newCues = [...prevCues]; const [draggedItem] = newCues.splice(draggedIndex, 1); newCues.splice(dropIndex, 0, draggedItem);
      return newCues.map((cue, index) => ({ ...cue, number: (index + 1).toString() }));
    });
    setDraggedCueId(null); setDragOverCueId(null);
  };
  const handleDragEnd = (e) => { e.target.classList.remove('opacity-50'); setDraggedCueId(null); setDragOverCueId(null); };

  const handlePinDrag = (index, e) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const newPins = [...pins]; newPins[index] = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) }; setPins(newPins);
  };
  const handleResetPins = useCallback(() => { const newPins = []; for (let y = 0; y <= gridSize.y; y++) { for (let x = 0; x <= gridSize.x; x++) { newPins.push({ x: x / gridSize.x, y: y / gridSize.y }); } } setPins(newPins); }, [gridSize]);
  const handleGridChange = (e) => { const [x, y] = e.target.value.split('x').map(Number); setGridSize({ x, y }); const newPins = []; for (let iy = 0; iy <= y; iy++) { for (let ix = 0; ix <= x; ix++) { newPins.push({ x: ix / x, y: iy / y }); } } setPins(newPins); };

  const quadW = stageSize.w / gridSize.x; const quadH = stageSize.h / gridSize.y; const quads = [];
  for (let y = 0; y < gridSize.y; y++) {
    for (let x = 0; x < gridSize.x; x++) {
      const tl = y * (gridSize.x + 1) + x; const tr = tl + 1; const bl = (y + 1) * (gridSize.x + 1) + x; const br = bl + 1;
      quads.push({ col: x, row: y, indices: [tl, tr, br, bl] });
    }
  }

  const activeMediaCues = cues.filter(c => c.state === 'playing' || c.state === 'stopping');
  const masterMediaPlayers = (
    <div style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: -999 }}>
      {activeMediaCues.map(cue => {
        if (cue.type === 'goto' || cue.type === 'blackout' || cue.type === 'pause' || cue.type === 'counter') return null;
        if (cue.type === 'image') return <img key={`master-img-${cue.id}`} id={`master-img-${cue.id}`} src={cue.url} />;
        if (cue.type === 'camera') return <CameraMasterPlayer key={`master-cam-${cue.id}`} cue={cue} isPaused={isPaused} />;
        return cue.type === 'video' ? (
          <video 
            key={`master-vid-${cue.id}`} id={`master-vid-${cue.id}`} src={cue.url} autoPlay playsInline loop={cue.loop} muted={!isProjector} 
            onEnded={() => (!cue.loop) ? handleCueEnded(cue.id) : undefined} 
            onTimeUpdate={(e) => handleMediaTimeUpdate(cue.id, e.target)} onLoadedMetadata={(e) => handleMediaTimeUpdate(cue.id, e.target)} onDurationChange={(e) => handleMediaTimeUpdate(cue.id, e.target)}
          />
        ) : (
          <audio 
            key={`master-aud-${cue.id}`} id={`master-aud-${cue.id}`} src={cue.url} autoPlay loop={cue.loop} muted={!isProjector} 
            onEnded={() => (!cue.loop) ? handleCueEnded(cue.id) : undefined} 
            onTimeUpdate={(e) => handleMediaTimeUpdate(cue.id, e.target)} onLoadedMetadata={(e) => handleMediaTimeUpdate(cue.id, e.target)} onDurationChange={(e) => handleMediaTimeUpdate(cue.id, e.target)}
          />
        )
      })}
      {activeMediaCues.filter(c => c.maskEnabled && c.maskDataUrl).map(cue => (
        <img key={`master-mask-${cue.id}`} id={`master-mask-${cue.id}`} src={cue.maskDataUrl} />
      ))}
    </div>
  );

  const activeCues = cues.filter(c => selectedCueIds.includes(c.id));
  const hasImage = activeCues.some(c => c.type === 'image');
  const hasGoto = activeCues.some(c => c.type === 'goto');
  const hasCounter = activeCues.some(c => c.type === 'counter');
  const hasCamera = activeCues.some(c => c.type === 'camera');
  const hasPause = activeCues.some(c => c.type === 'pause');
  const hasBlackout = activeCues.some(c => c.type === 'blackout');
  const hasFileMedia = activeCues.some(c => c.type === 'video' || c.type === 'audio' || c.type === 'image');
  const isOnlyBlackout = activeCues.length > 0 && activeCues.every(c => c.type === 'blackout');
  const isOnlyControl = activeCues.length > 0 && activeCues.every(c => c.type === 'goto' || c.type === 'pause' || c.type === 'counter');
  
  const getSharedVal = (field, fallback = '') => {
    if (activeCues.length === 0) return fallback; const val = activeCues[0][field];
    if (val === undefined || val === null) return fallback; return activeCues.every(c => c[field] === val) ? val : fallback;
  };
  const isMixed = (field) => { if (activeCues.length === 0) return false; const val = activeCues[0][field]; return !activeCues.every(c => c[field] === val); };
  const updateSelectedCues = (field, value) => { setCues(prev => prev.map(c => selectedCueIds.includes(c.id) ? { ...c, [field]: value } : c)); };

  const selectedDisplayNumbers = cues.filter(c => selectedCueIds.includes(c.id)).map(c => c.number).join(', ');
  const activeDisplayNumbers = cues.filter(c => c.state === 'playing' || c.state === 'stopping').map(c => c.number).join(', ');

  // =========================================================================
  // RENDER: PROJECTOR MODE 
  // =========================================================================
  if (isProjector) {
    return (
      <div className="w-screen h-screen bg-black overflow-hidden relative group">
        <style>{` @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } } `}</style>
        
        {/* IN-BROWSER EXIT BUTTON (Only shows on hover if in browser mode) */}
        {window.location.protocol === 'blob:' && (
           <button 
             onClick={() => {
               window.location.hash = '';
               setIsProjector(false);
               if (document.fullscreenElement) document.exitFullscreen();
             }} 
             className="absolute top-4 right-4 z-[10000] bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 rounded font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"
           >
             <X className="w-4 h-4" /> Exit Projector Screen
           </button>
        )}

        <div className="absolute inset-0 z-[9999] flex items-center justify-center text-white/30 font-mono tracking-widest text-sm bg-black/80 cursor-pointer pointer-events-auto transition-opacity duration-500" onClick={(e) => { const target = e.currentTarget; target.style.opacity = '0'; setTimeout(() => { if(target) target.style.display = 'none'; }, 500); }}>
           [ CLICK ANYWHERE TO INITIALIZE STAGE AUDIO/VIDEO ]
        </div>

        {masterMediaPlayers}
        <div ref={stageRef} className="absolute inset-0 pointer-events-none" />
        {activeMediaCues.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-gray-800 font-mono tracking-widest pointer-events-none">PROJECTOR STAGE</div>}
        {quads.map((quad, qIdx) => {
          const matrix = getAffineTransform(quadW, quadH, { x: pins[quad.indices[0]].x * stageSize.w, y: pins[quad.indices[0]].y * stageSize.h }, { x: pins[quad.indices[1]].x * stageSize.w, y: pins[quad.indices[1]].y * stageSize.h }, { x: pins[quad.indices[3]].x * stageSize.w, y: pins[quad.indices[3]].y * stageSize.h }, 1);
          const matrix2 = getAffineTransform(quadW, quadH, { x: pins[quad.indices[1]].x * stageSize.w, y: pins[quad.indices[1]].y * stageSize.h }, { x: pins[quad.indices[2]].x * stageSize.w, y: pins[quad.indices[2]].y * stageSize.h }, { x: pins[quad.indices[3]].x * stageSize.w, y: pins[quad.indices[3]].y * stageSize.h }, 2);
          return (
            <React.Fragment key={`quad-${qIdx}`}>
              <canvas id={`quad-ctx-proj-${qIdx}-1`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: matrix, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
              <canvas id={`quad-ctx-proj-${qIdx}-2`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: matrix2, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // =========================================================================
  // RENDER: CONTROLLER MODE
  // =========================================================================
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-600 relative">
      <style>{` @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } } @keyframes meter { 0% { transform: scaleY(0.2); } 100% { transform: scaleY(1); } } `}</style>
      
      {/* POPUP FULLSCREEN OVERLAYS */}
      {masterMediaPlayers}
      {editingMaskCueId && (
        <MaskEditorOverlay 
          cue={cues.find(c => c.id === editingMaskCueId)} onClose={() => setEditingMaskCueId(null)} 
          onSave={(dataUrl) => { setCues(prev => prev.map(c => c.id === editingMaskCueId ? { ...c, maskDataUrl: dataUrl, maskEnabled: dataUrl !== '' } : c)); setEditingMaskCueId(null); }} 
        />
      )}

      {showNewModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 p-6 rounded shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">Create New Show?</h3>
            <p className="text-sm text-gray-400 mb-6">This will clear your current workspace. Unsaved changes will be lost.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewModal(false)} className="px-4 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white text-sm font-semibold transition-colors">Cancel</button>
              <button onClick={() => {
                  setCues([]); setSelectedCueIds([]); setLastSelectedId(null); setGridSize({ x: 1, y: 1 });
                  setPins([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
                  setShowNewModal(false);
              }} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500 text-sm font-semibold transition-colors">Clear Workspace</button>
            </div>
          </div>
        </div>
      )}
      
      <header className="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-500" />
          <div className="flex flex-col">
            <h1 className="font-bold tracking-widest text-gray-200 leading-tight uppercase">TuxShow <span className="text-gray-500 font-normal tracking-normal text-sm ml-2 normal-case">Show Control</span></h1>
            <span className="text-[9px] text-blue-400/80 font-mono tracking-widest uppercase mt-0.5">{gpuStatus}</span>
          </div>
          
          <div className="flex items-center gap-1 border-l border-gray-800 pl-4 ml-2">
            <button onClick={() => setShowNewModal(true)} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><FilePlus className="w-3.5 h-3.5" /> New</button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><FolderOpen className="w-3.5 h-3.5" /> Load</button>
            <button onClick={handleSaveShow} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><Save className="w-3.5 h-3.5" /> Save</button>
            <input type="file" accept=".TSW" ref={fileInputRef} className="hidden" onChange={handleLoadShow} />
            <input type="file" webkitdirectory="true" directory="true" multiple ref={folderInputRef} className="hidden" onChange={handleAddFolder} />
          </div>

          <div className="flex items-center gap-5 ml-6 border-l border-gray-800 pl-6 h-8">
            <div className="flex flex-col">
              <span className="text-[8px] text-gray-500 uppercase font-bold tracking-tighter">Selected Cue</span>
              <span className="text-sm font-mono text-blue-400 leading-none">{selectedDisplayNumbers || 'None'}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] text-gray-500 uppercase font-bold tracking-tighter">Active Playhead</span>
              <span className="text-sm font-mono text-green-400 leading-none">{activeDisplayNumbers || 'Idle'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <button onClick={() => setShowStats(!showStats)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors ${showStats ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} title="Performance Stats"><Activity className="w-3.5 h-3.5" /> Stats</button>
           
           {isMappingMode && (
             <div className="flex items-center gap-3 mr-2 border-r border-gray-800 pr-5">
               <div className="flex items-center gap-1 bg-gray-900 rounded border border-gray-800 px-2 py-1">
                 <Grid3X3 className="w-4 h-4 text-blue-500" />
                 <select value={`${gridSize.x}x${gridSize.y}`} onChange={handleGridChange} className="bg-transparent text-gray-300 text-xs font-semibold outline-none cursor-pointer">
                   <option value="1x1">1x1 Mesh</option>
                   <option value="2x2">2x2 Mesh</option>
                   <option value="3x3">3x3 Mesh</option>
                   <option value="4x4">4x4 Mesh</option>
                 </select>
               </div>
               <button onClick={handleResetPins} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs font-semibold text-gray-300 transition-colors" title="Reset Surface">
                 <RotateCcw className="w-3 h-3 text-gray-400" /> Reset
               </button>
             </div>
           )}

           <button onClick={() => setIsMappingMode(!isMappingMode)} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors ${isMappingMode ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}><Crosshair className="w-4 h-4" /> {isMappingMode ? 'Exit Mapping' : 'Map Surface'}</button>
           
           <button onClick={toggleProjectorWindow} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors ${projectorActive ? 'bg-red-900 hover:bg-red-800 text-red-100' : 'bg-green-900 hover:bg-green-800 text-green-100'}`}>
             {projectorActive ? <MonitorDown className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />} 
             {projectorActive ? 'Close Projector Screen' : 'Open Projector Screen'}
           </button>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT PANEL: CUE LIST */}
        <div className={`w-1/3 flex flex-col border-r border-gray-800 min-w-[350px] relative transition-colors ${isDraggingFile ? 'bg-blue-900/20' : 'bg-gray-900'}`}
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
                  loop: false, triggerBehavior: 'stop-others', endBehavior: type === 'image' ? 'none' : 'auto-follow',
                  fadeTime: 1.0, volume: 1, autoAdvance: false, advanceTime: 0, targetCueNumber: '', notes: '', cameraLive: true, maskEnabled: false, maskDataUrl: null, counterLimit: 1, counterCurrent: 0, gotoMode: 'specific', targetCueRangeMin: '', targetCueRangeMax: ''
                };
              });
              setCues(prev => {
                const updated = [...prev, ...newCues];
                return updated.map((c, i) => ({ ...c, number: (i + 1).toString() }));
              });
            }
          }}
        >
          {isDraggingFile && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none border-2 border-blue-500">
              <div className="flex flex-col items-center gap-2 text-blue-400">
                <Plus className="w-10 h-10 animate-bounce" />
                <span className="font-bold tracking-widest">DROP MEDIA TO ADD CUES</span>
              </div>
            </div>
          )}
          <div className="flex flex-col shrink-0 bg-gray-800/50 border-b border-gray-800">
             <div className="flex justify-between items-center px-2 py-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cue List</div>
                <div className="flex gap-1">
                  <button onClick={() => folderInputRef.current?.click()} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="Add Folder"><FolderPlus className="w-4 h-4" /></button>
                  <button onClick={() => { const newId = Date.now().toString(); setCues([...cues, { id: newId, number: (cues.length + 1).toString(), type: 'video', name: 'New Cue', url: MEDIA.video1, state: 'stopped', loop: false, triggerBehavior: 'overlap', endBehavior: 'none', fadeTime: 0, volume: 1, targetCueNumber: '', notes: '', cameraLive: true, maskEnabled: false, maskDataUrl: null, counterLimit: 1, counterCurrent: 0, gotoMode: 'specific', targetCueRangeMin: '', targetCueRangeMax: '' }]); setSelectedCueIds([newId]); setLastSelectedId(newId); }} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"><Plus className="w-4 h-4" /></button>
                  <button onClick={() => { const remaining = cues.filter(c => !selectedCueIds.includes(c.id)); setCues(remaining); setSelectedCueIds(remaining.length > 0 ? [remaining[0].id] : []); setLastSelectedId(remaining.length > 0 ? remaining[0].id : null); }} className="p-1 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
             </div>
             <div className="px-2 pb-2">
                <div className="relative group">
                   <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-blue-500 transition-colors"><Hash className="w-3.5 h-3.5" /></div>
                   <input 
                     type="text" value={jumpToValue} onChange={(e) => setJumpToValue(e.target.value)} onKeyDown={handleJumpToCue}
                     placeholder="Type cue number to jump..."
                     className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded pl-8 pr-3 py-1.5 text-xs text-gray-200 outline-none transition-all"
                   />
                </div>
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {cues.map((cue) => {
              const isSelected = selectedCueIds.includes(cue.id);
              const isPlaying = cue.state === 'playing';
              const isStopping = cue.state === 'stopping';
              const times = mediaTimes[cue.id];

              return (
                <div key={cue.id} data-cue-id={cue.id} onClick={(e) => handleCueClick(e, cue.id)} draggable="true"
                  onDragStart={(e) => handleDragStart(e, cue.id)} onDragOver={(e) => handleDragOver(e, cue.id)} onDragLeave={(e) => handleDragLeave(e, cue.id)} onDrop={(e) => handleDrop(e, cue.id)} onDragEnd={handleDragEnd}
                  className={`flex items-center px-2 py-3 text-sm border-b cursor-pointer select-none transition-colors ${dragOverCueId === cue.id ? 'border-t-2 border-t-blue-500 bg-gray-800/80' : 'border-b-gray-800/50'} ${isSelected ? 'bg-blue-900/40 border-blue-800/50' : 'hover:bg-gray-800/50'} ${isPlaying ? 'text-green-400' : isStopping ? 'text-yellow-500' : 'text-gray-300'}`}
                >
                  <div className="w-6 flex justify-center text-gray-600 cursor-grab active:cursor-grabbing hover:text-gray-400"><GripVertical className="w-4 h-4" /></div>
                  <div className="w-6 flex justify-center">{isSelected && <ChevronRight className="w-4 h-4 text-blue-400" />}</div>
                  <div className="w-8 font-mono opacity-50">{cue.number}</div>
                  <div className="w-10 flex items-center justify-center gap-1">
                    {cue.type === 'video' ? <Video className="w-4 h-4" /> : cue.type === 'image' ? <ImageIcon className="w-4 h-4" /> : cue.type === 'audio' ? <Music className="w-4 h-4" /> : cue.type === 'camera' ? <Camera className="w-4 h-4" /> : cue.type === 'blackout' ? <Moon className="w-4 h-4" /> : cue.type === 'pause' ? <PauseCircle className="w-4 h-4" /> : cue.type === 'counter' ? <Repeat className="w-4 h-4" /> : <CornerDownRight className="w-4 h-4 text-blue-400" />}
                    {cue.type !== 'goto' && cue.type !== 'pause' && cue.type !== 'counter' && (cue.triggerBehavior === 'stop-others' ? <span title="Stops active cues" className="cursor-help"><StopCircle className="w-3 h-3 text-red-500 opacity-60" /></span> : <span title="Overlaps" className="cursor-help"><Layers className="w-3 h-3 text-blue-500 opacity-60" /></span>)}
                  </div>
                  
                  <div className="flex-1 flex items-center font-medium truncate pr-2">
                    {cue.name}
                    {cue.type === 'counter' && <span className="ml-2 text-xs text-purple-400 font-mono tracking-widest bg-purple-900/40 px-1.5 py-0.5 rounded border border-purple-800/50">({cue.counterCurrent || 0}/{cue.counterLimit || 1}) ➔ CUE {cue.targetCueNumber || '?'}</span>}
                    {cue.maskEnabled && <span title="Transparency Mask Active" className="ml-2 flex-shrink-0 cursor-help"><Crop className="w-3 h-3 text-blue-500" /></span>}
                    {cue.type === 'camera' && (<button onClick={(e) => { e.stopPropagation(); setCues(prev => prev.map(c => c.id === cue.id ? {...c, cameraLive: !c.cameraLive} : c)); }} className={`ml-3 px-2 py-0.5 rounded shadow flex items-center gap-1 text-[9px] font-bold tracking-wider border transition-colors ${cue.cameraLive ? 'bg-green-900/40 border-green-500 text-green-400 hover:bg-green-800/60' : 'bg-red-900/40 border-red-500 text-red-400 hover:bg-red-800/60'}`}><div className={`w-1.5 h-1.5 rounded-full ${cue.cameraLive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />{cue.cameraLive ? 'LIVE' : 'CUT'}</button>)}
                    {cue.type === 'goto' && (
                      <span className="ml-2 text-xs text-blue-400 font-mono tracking-widest bg-blue-900/40 px-1.5 py-0.5 rounded border border-blue-800/50">
                        ➔ {cue.gotoMode === 'random' ? `RND [${cue.targetCueRangeMin || '?'} - ${cue.targetCueRangeMax || '?'}]` : `CUE ${cue.targetCueNumber || '?'}`}
                      </span>
                    )}
                    {cue.notes && <span title={`Note: ${cue.notes}`} className="ml-2 flex-shrink-0 cursor-help"><FileText className="w-3 h-3 text-gray-500" /></span>}
                    {cue.endBehavior === 'auto-follow' && cue.type !== 'goto' && <span title="Auto-follows" className="ml-2 flex-shrink-0 cursor-help"><ArrowRight className="w-3 h-3 text-green-500" /></span>}
                    {cue.autoAdvance && cue.type !== 'goto' && <span title="Auto-advance" className="ml-2 flex-shrink-0 cursor-help"><Clock className="w-3 h-3 text-yellow-500" /></span>}
                    <AudioVisualizer isPlaying={isPlaying || isStopping} isPaused={isPaused} type={cue.type} />
                  </div>

                  {(isPlaying || isStopping) && times && cue.type !== 'image' && cue.type !== 'goto' && cue.type !== 'camera' && cue.type !== 'blackout' && cue.type !== 'pause' && cue.type !== 'counter' && (
                    <div className="flex items-center text-[11px] font-mono px-3 whitespace-nowrap text-gray-400">
                      <span className="text-blue-400">{formatTime(times.current)}</span><span className="mx-1.5 opacity-50">/</span><span>{formatTime(times.duration)}</span>
                      <span className="ml-1.5 text-gray-500">(-{formatTime(times.duration - times.current)})</span>
                    </div>
                  )}

                  <div className="w-12 flex justify-end">{isPlaying ? <button onClick={(e) => { e.stopPropagation(); stopCue(cue.id); }} className="hover:scale-110" title="Soft Stop"><Play className="w-4 h-4 text-green-500 fill-green-500" /></button> : isStopping ? <button onClick={(e) => { e.stopPropagation(); setCues(prev => prev.map(c => c.id === cue.id ? {...c, state: 'stopped'} : c)); }} className="hover:scale-110" title="Hard Stop"><Square className="w-4 h-4 text-yellow-500 fill-yellow-500 animate-pulse" /></button> : <Square className="w-4 h-4 opacity-30" />}</div>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-gray-950 border-t border-gray-800 flex gap-2 shrink-0">
            <button onClick={handleGo} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded shadow-lg shadow-green-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2 text-xl tracking-widest"><Play className="w-6 h-6 fill-current" /> GO</button>
            <button onClick={() => setIsPaused(!isPaused)} className={`px-5 font-bold rounded active:scale-95 transition-colors flex items-center justify-center gap-1 ${isPaused ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-gray-800 text-yellow-500'}`}><Pause className={`w-6 h-6 ${isPaused ? 'fill-current' : ''}`} /></button>
            <button onClick={handleStopAll} className="px-5 bg-red-900 hover:bg-red-800 text-red-200 font-bold rounded active:scale-95 transition-transform flex flex-col items-center justify-center gap-1"><AlertCircle className="w-6 h-6" /></button>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="w-2/3 flex flex-col bg-black overflow-hidden">
          <div className="h-2/3 relative bg-gray-950 flex items-center justify-center border-b border-gray-800 p-8 overflow-hidden">
            <div className="relative bg-black shadow-2xl w-full max-w-4xl aspect-video overflow-hidden">
              <div ref={stageRef} className="absolute inset-0 bg-gray-900/20" />
              {showStats && activeMediaCues.filter(c => c.type === 'video' || c.type === 'camera').length > 0 && (
                <div className="absolute bottom-4 left-4 z-[60] flex flex-col gap-2 pointer-events-none">
                  {activeMediaCues.filter(c => c.type === 'video' || c.type === 'camera').map(cue => (
                     <VideoStats key={`stats-${cue.id}`} videoId={`master-vid-${cue.id}`} name={cue.name} />
                  ))}
                </div>
              )}
              {activeMediaCues.filter(c => c.type !== 'goto' && c.type !== 'pause' && c.type !== 'counter').length === 0 && <div className="absolute inset-0 flex items-center justify-center text-gray-800 font-mono tracking-widest pointer-events-none uppercase text-xs">Stage Preview</div>}
              {quads.map((quad, qIdx) => {
                const pt_tl = { x: pins[quad.indices[0]].x * stageSize.w, y: pins[quad.indices[0]].y * stageSize.h };
                const pt_tr = { x: pins[quad.indices[1]].x * stageSize.w, y: pins[quad.indices[1]].y * stageSize.h };
                const pt_br = { x: pins[quad.indices[2]].x * stageSize.w, y: pins[quad.indices[2]].y * stageSize.h };
                const pt_bl = { x: pins[quad.indices[3]].x * stageSize.w, y: pins[quad.indices[3]].y * stageSize.h };
                const matrix1 = getAffineTransform(quadW, quadH, pt_tl, pt_tr, pt_bl, 1);
                const matrix2 = getAffineTransform(quadW, quadH, pt_tr, pt_br, pt_bl, 2);
                return (
                  <React.Fragment key={`quad-${qIdx}`}>
                    <canvas id={`quad-ctx-local-${qIdx}-1`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: matrix1, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                    <canvas id={`quad-ctx-local-${qIdx}-2`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: matrix2, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
                  </React.Fragment>
                );
              })}
              {isMappingMode && (
                <svg className="absolute inset-0 pointer-events-none z-40" style={{ width: stageSize.w, height: stageSize.h }}>
                  {Array.from({ length: gridSize.y + 1 }).map((_, r) => (
                    <polyline key={`h-${r}`} fill="none" stroke="rgba(59, 130, 246, 0.5)" strokeWidth="1.5" points={Array.from({ length: gridSize.x + 1 }).map((_, c) => `${pins[r * (gridSize.x + 1) + c].x * stageSize.w},${pins[r * (gridSize.x + 1) + c].y * stageSize.h}`).join(' ')} />
                  ))}
                  {Array.from({ length: gridSize.x + 1 }).map((_, c) => (
                    <polyline key={`v-${c}`} fill="none" stroke="rgba(59, 130, 246, 0.5)" strokeWidth="1.5" points={Array.from({ length: gridSize.y + 1 }).map((_, r) => `${pins[r * (gridSize.x + 1) + c].x * stageSize.w},${pins[r * (gridSize.x + 1) + c].y * stageSize.h}`).join(' ')} />
                  ))}
                </svg>
              )}
              {isMappingMode && pins.map((pin, i) => (<div key={i} className="absolute w-6 h-6 -ml-3 -mt-3 bg-white border-2 border-blue-500 rounded-full shadow-lg cursor-move z-50 flex items-center justify-center hover:scale-125 transition-transform" style={{ left: pin.x * stageSize.w, top: pin.y * stageSize.h }} onPointerDown={(e) => { 
                const target = e.target;
                const pointerId = e.pointerId;
                target.setPointerCapture(pointerId); 
                const onMove = (moveEvt) => handlePinDrag(i, moveEvt); 
                const onUp = () => { 
                  target.releasePointerCapture(pointerId); 
                  window.removeEventListener('pointermove', onMove); 
                  window.removeEventListener('pointerup', onUp); 
                }; 
                window.addEventListener('pointermove', onMove); 
                window.addEventListener('pointerup', onUp); 
              }} ><div className="w-2 h-2 bg-blue-500 rounded-full"/></div>))}
            </div>
          </div>

          {/* INSPECTOR */}
          <div className="h-1/3 bg-gray-900 flex flex-col shrink-0 overflow-hidden">
            <div className="bg-gray-800/50 px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase flex items-center gap-2 tracking-widest"><Edit3 className="w-4 h-4" /> Inspector</div>
            {activeCues.length > 0 ? (
              <div className="p-4 grid grid-cols-2 gap-6 overflow-y-auto custom-scrollbar">
                <div className="space-y-3">
                  <div><label className="block text-xs text-gray-500 mb-1">Cue Number & Type</label><div className="flex gap-2"><input type="text" value={isMixed('number') ? '' : getSharedVal('number', '')} placeholder={isMixed('number') ? '<Mixed>' : ''} readOnly className="w-16 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 outline-none" /><select value={isMixed('type') ? 'mixed' : getSharedVal('type', 'video')} onChange={(e) => updateSelectedCues('type', e.target.value)} className="flex-1 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 outline-none">{isMixed('type') && <option value="mixed" disabled>Mixed Types</option>}<option value="video">Video Media</option><option value="audio">Audio Only</option><option value="image">Image Graphic</option><option value="camera">Live Capture</option><option value="blackout">Stage Blackout</option><option value="pause">Pause Show</option><option value="goto">GoTo Pointer</option><option value="counter">Loop Counter</option></select></div></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Cue Name</label><input type="text" value={isMixed('name') ? '' : getSharedVal('name', '')} placeholder={isMixed('name') ? '<Multiple Values>' : ''} onChange={(e) => updateSelectedCues('name', e.target.value)} className="w-full bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-3 py-1.5 text-sm text-gray-100 outline-none" /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">Tech / Operator Notes</label><textarea value={isMixed('notes') ? '' : getSharedVal('notes', '')} placeholder={isMixed('notes') ? '<Multiple Values>' : 'Directions...'} onChange={(e) => updateSelectedCues('notes', e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 outline-none resize-none h-16" /></div>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-4">
                    {hasFileMedia && (<div className="flex-1"><label className="block text-xs text-gray-500 mb-1">Media URL</label><div className="flex gap-2"><input type="text" value={isMixed('url') ? '' : getSharedVal('url', '')} placeholder={isMixed('url') ? '<Multiple>' : ''} onChange={(e) => updateSelectedCues('url', e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-xs font-mono text-gray-400 outline-none" /><button onClick={() => { const input = document.createElement('input'); input.type='file'; input.onchange=(e)=>{const file=e.target.files[0]; if(file){ updateSelectedCues('url', getNativeFilePath(file)); updateSelectedCues('name', file.name); }}; input.click(); }} className="bg-gray-800 hover:bg-gray-700 rounded px-3 text-xs font-semibold text-gray-300 transition-colors">Browse</button></div></div>)}
                    {hasCamera && (<div className="flex-1"><label className="block text-xs text-green-500 mb-1 font-bold tracking-wide">Capture Hardware Input</label><select value={isMixed('url') ? '' : getSharedVal('url', '')} onChange={(e) => updateSelectedCues('url', e.target.value)} className="w-full bg-green-950/20 border border-green-800/40 rounded px-3 py-1.5 text-sm font-mono text-green-100 outline-none"><option value="">Default Camera</option>{videoDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera (${d.deviceId.substring(0,8)}...)`}</option>))}</select></div>)}
                    
                    {hasGoto && (
                      <div className="flex-1 flex gap-2">
                        <div className="w-1/3">
                          <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Mode</label>
                          <select value={isMixed('gotoMode') ? 'mixed' : getSharedVal('gotoMode', 'specific')} onChange={(e) => updateSelectedCues('gotoMode', e.target.value)} className="w-full bg-blue-950/30 border border-blue-800/50 rounded px-2 py-1.5 text-xs font-mono text-blue-100 outline-none">
                            {isMixed('gotoMode') && <option value="mixed" disabled>Mixed</option>}
                            <option value="specific">Exact</option>
                            <option value="random">Random</option>
                          </select>
                        </div>
                        {getSharedVal('gotoMode', 'specific') === 'random' && !isMixed('gotoMode') ? (
                          <>
                            <div className="w-1/3">
                              <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Min Num</label>
                              <input type="text" value={isMixed('targetCueRangeMin') ? '' : getSharedVal('targetCueRangeMin', '')} placeholder="Min" onChange={(e) => updateSelectedCues('targetCueRangeMin', e.target.value)} className="w-full bg-blue-950/30 border border-blue-800/50 rounded px-2 py-1.5 text-xs font-mono text-blue-100 outline-none" />
                            </div>
                            <div className="w-1/3">
                              <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Max Num</label>
                              <input type="text" value={isMixed('targetCueRangeMax') ? '' : getSharedVal('targetCueRangeMax', '')} placeholder="Max" onChange={(e) => updateSelectedCues('targetCueRangeMax', e.target.value)} className="w-full bg-blue-950/30 border border-blue-800/50 rounded px-2 py-1.5 text-xs font-mono text-blue-100 outline-none" />
                            </div>
                          </>
                        ) : (
                          <div className="flex-1">
                            <label className="block text-[10px] text-blue-400 mb-1 font-bold uppercase tracking-wider">Target Cue</label>
                            <input type="text" value={isMixed('targetCueNumber') ? '' : getSharedVal('targetCueNumber', '')} placeholder="e.g. 1" onChange={(e) => updateSelectedCues('targetCueNumber', e.target.value)} className="w-full bg-blue-950/30 border border-blue-800/50 rounded px-3 py-1.5 text-sm font-mono text-blue-100 outline-none" />
                          </div>
                        )}
                      </div>
                    )}
                    
                    {hasCounter && (
                      <>
                        <div className="w-1/3">
                           <label className="block text-[10px] text-purple-400 mb-1 font-bold uppercase tracking-wider">Target Cue</label>
                           <input type="text" value={isMixed('targetCueNumber') ? '' : getSharedVal('targetCueNumber', '')} placeholder="e.g. 1" onChange={(e) => updateSelectedCues('targetCueNumber', e.target.value)} className="w-full bg-purple-950/30 border border-purple-800/50 rounded px-3 py-1.5 text-sm font-mono text-purple-100 outline-none" />
                        </div>
                        <div className="w-24">
                           <label className="block text-[10px] text-purple-400 mb-1 font-bold uppercase tracking-wider">Triggers</label>
                           <input type="number" min="1" value={isMixed('counterLimit') ? '' : getSharedVal('counterLimit', 1)} onChange={(e) => updateSelectedCues('counterLimit', parseInt(e.target.value) || 1)} className="w-full bg-purple-950/30 border border-purple-800/50 rounded px-3 py-1.5 text-sm font-mono text-purple-100 outline-none" />
                        </div>
                      </>
                    )}

                    {!isOnlyControl && (<div className="w-24"><label className="block text-xs text-gray-500 mb-1">Fade (sec)</label><input type="number" step="0.5" min="0" value={isMixed('fadeTime') ? '' : getSharedVal('fadeTime', 0)} onChange={(e) => updateSelectedCues('fadeTime', parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 outline-none" /></div>)}
                  </div>
                  
                  {(!hasImage && !hasCamera && !isOnlyControl && !isOnlyBlackout) && (<div><label className="block text-xs text-gray-500 mb-1">Volume ({isMixed('volume') ? 'Mixed' : Math.round(getSharedVal('volume', 1) * 100)}%)</label><input type="range" min="0" max="1" step="0.01" value={isMixed('volume') ? 0.5 : getSharedVal('volume', 1)} onChange={(e) => updateSelectedCues('volume', parseFloat(e.target.value))} className="w-full mt-1.5 accent-blue-500 cursor-pointer" /></div>)}
                  
                  <div className="flex justify-between items-center pt-2">
                    {(!hasImage && !hasCamera && !isOnlyControl && !isOnlyBlackout) && (<label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" ref={el=>{if(el) el.indeterminate=isMixed('loop')}} checked={getSharedVal('loop', false)} onChange={(e)=>updateSelectedCues('loop', e.target.checked)} className="w-4 h-4 bg-gray-950 border-gray-700 rounded text-blue-600" />Loop continuously</label>)}
                    {hasCounter && (
                      <button onClick={() => updateSelectedCues('counterCurrent', 0)} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs font-semibold text-gray-300 transition-colors">
                        Reset Counter to Zero
                      </button>
                    )}
                    
                    {/* MASKING CONTROLS */}
                    {(hasFileMedia || hasCamera) && (
                      <div className="flex-1 flex justify-end">
                        <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
                          <button onClick={() => updateSelectedCues('maskEnabled', !getSharedVal('maskEnabled', false))} className={`px-2 py-1 rounded text-[10px] font-bold tracking-widest border transition-colors ${getSharedVal('maskEnabled', false) ? 'bg-blue-900/40 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-gray-950 border-gray-700 text-gray-500 hover:text-gray-300'}`}>
                            {getSharedVal('maskEnabled', false) ? 'MASK ON' : 'MASK OFF'}
                          </button>
                          <button 
                            onClick={() => { setIsPaused(true); setEditingMaskCueId(selectedCueIds[0]); }} 
                            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-2.5 py-1 flex items-center gap-1 text-[11px] font-semibold text-gray-300 transition-colors"
                          >
                            <Crop className="w-3.5 h-3.5" /> Edit Mask
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-2 space-y-3 pt-4 border-t border-gray-800">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Playback Behaviors</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className="block text-xs text-gray-500 mb-1">On Trigger</label><select value={isMixed('triggerBehavior') ? 'mixed' : getSharedVal('triggerBehavior', 'overlap')} onChange={(e) => updateSelectedCues('triggerBehavior', e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 outline-none">{isMixed('triggerBehavior') && <option value="mixed" disabled>Mixed Behaviors</option>}<option value="overlap">Overlap (Play on top)</option><option value="stop-others">Hard Stop</option></select></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Media End</label><select disabled={hasImage || hasCamera || hasBlackout || hasPause || hasGoto} value={isMixed('endBehavior') ? 'mixed' : getSharedVal('endBehavior', 'none')} onChange={(e) => updateSelectedCues('endBehavior', e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 outline-none disabled:opacity-30">{isMixed('endBehavior') && <option value="mixed" disabled>Mixed Behaviors</option>}<option value="none">Stop Playback</option><option value="auto-follow">Auto-Follow</option></select></div>
                    <div><label className="flex items-center gap-2 text-xs text-gray-500 mb-1 cursor-pointer"><input type="checkbox" ref={el => { if(el) el.indeterminate = isMixed('autoAdvance') }} checked={getSharedVal('autoAdvance', false)} onChange={(e) => updateSelectedCues('autoAdvance', e.target.checked)} className="w-3 h-3 accent-blue-500" />Auto-Advance</label><div className="flex items-center gap-2"><input type="number" step="0.5" min="0" disabled={isMixed('autoAdvance') ? false : !getSharedVal('autoAdvance', false)} value={isMixed('advanceTime') ? '' : getSharedVal('advanceTime', 0)} onChange={(e) => updateSelectedCues('advanceTime', parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 outline-none disabled:opacity-30" /><span className="text-xs text-gray-500">sec</span></div></div>
                  </div>
                </div>

                <div className="col-span-2 space-y-3 pt-4 border-t border-gray-800">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Media Properties (MediaInfo)</h3>
                  <div className="flex flex-col gap-3 bg-gray-950/50 p-3 rounded border border-gray-800">
                    {activeCues.length > 1 ? (<div className="text-sm text-gray-500 text-center italic py-2">Inspect a single cue to view specific media properties.</div>) : (
                      (() => {
                        const activeCue = activeCues[0];
                        const { fileName, fileType, displayPath } = getFileInfo(activeCue?.url, activeCue?.type);
                        return (
                          <>
                            <div className="grid grid-cols-3 gap-4">
                              <div><div className="text-[10px] text-gray-500 uppercase mb-0.5">Resolution</div><div className="text-sm font-mono text-gray-300">{metadata[activeCue?.id]?.resolution || (activeCue?.type === 'audio' ? 'N/A' : 'Pending...')}</div></div>
                              <div><div className="text-[10px] text-gray-500 uppercase mb-0.5">Duration</div><div className="text-sm font-mono text-gray-300">{metadata[activeCue?.id]?.duration ? formatTime(metadata[activeCue.id].duration) : (activeCue?.type === 'image' || activeCue?.type === 'camera' || isOnlyControl || isOnlyBlackout ? 'Infinite' : 'Pending...')}</div></div>
                              <div><div className="text-[10px] text-gray-500 uppercase mb-0.5">Status</div><div className="flex items-center gap-1.5 text-sm font-mono text-gray-300"><div className={`w-2 h-2 rounded-full ${metadata[activeCue?.id]?.status === 'Loaded' || activeCue?.type === 'camera' || isOnlyControl || isOnlyBlackout ? 'bg-green-500' : metadata[activeCue?.id]?.status === 'Error' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>{activeCue?.type === 'camera' ? 'Active' : isOnlyControl || isOnlyBlackout ? 'Ready' : metadata[activeCue?.id]?.status || 'Probing...'}</div></div>
                            </div>
                            <div className="border-t border-gray-800/80 pt-3 grid grid-cols-3 gap-4">
                              <div className="col-span-2"><div className="text-[10px] text-gray-500 uppercase mb-0.5">File Name</div><div className="text-sm font-mono text-gray-300 truncate" title={fileName}>{fileName}</div></div>
                              <div className="col-span-1"><div className="text-[10px] text-gray-500 uppercase mb-0.5">File Type</div><div className="text-sm font-mono text-gray-300 truncate">{fileType}</div></div>
                              <div className="col-span-3"><div className="text-[10px] text-gray-500 uppercase mb-0.5">File Path</div><div className="text-xs font-mono text-gray-400 break-all">{displayPath}</div></div>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </div>
                </div>

              </div>
            ) : <div className="flex-1 flex items-center justify-center text-sm text-gray-600">Select a cue to inspect.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
