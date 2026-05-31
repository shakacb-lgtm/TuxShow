import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { 
  Play, Square, Video, Music, ChevronRight, ChevronDown, Plus, Trash2, 
  ArrowRight, Layers, StopCircle, GripVertical, Image as ImageIcon, FolderOpen, 
  Folder, Camera, Moon, PauseCircle, Search, Repeat, CalendarClock, Type, 
  Settings2, Wifi, CornerDownRight, FolderPlus, AlertCircle, Pause, Hash, 
  Settings, FilePlus, Save, RotateCcw, Grid3X3, Activity, Crosshair, 
  MonitorDown, MonitorUp, Edit3, Crop, Wand2, XSquare, Bold, Italic, Cast, 
  X, Check, Archive, RefreshCw, Maximize, Move, GitBranch, Hourglass, 
  Palette, SlidersHorizontal, Ear, QrCode, Smartphone, LayoutGrid, MonitorPlay, Gamepad2, Clock,
  Undo, Redo, Key, Lock, Unlock, Ban, Database
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const formatTime = (timeInSeconds) => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";
  const m = Math.floor(timeInSeconds / 60);
  const s = Math.floor(timeInSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

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

function applyCanvasAffine(ctx, w, h, p0, p1, p2, type) {
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
  ctx.transform(a, b, c, d, tx, ty);
}

const getNativeFilePath = (file) => {
  try {
    const { webUtils } = window.require('electron');
    const nativePath = webUtils.getPathForFile(file);
    if (nativePath) return `file://${nativePath.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  } catch (e) {}
  return file.path ? `file://${file.path.replace(/#/g, '%23').replace(/\?/g, '%3F')}` : URL.createObjectURL(file);
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================
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

const VideoStats = React.memo(({ videoId, name }) => {
  const [fps, setFps] = useState(0);
  const [res, setRes] = useState("Loading...");
  
  useEffect(() => {
    const video = document.getElementById(videoId);
    if (!video) return;
    let lastFrames = 0;
    const interval = setInterval(() => {
      if (video.readyState >= 2) {
        if (video.getVideoPlaybackQuality) {
           const quality = video.getVideoPlaybackQuality();
           const frames = quality.totalVideoFrames;
           setFps(frames - lastFrames);
           lastFrames = frames;
           setRes(`${video.videoWidth}x${video.videoHeight}`);
        } else {
           setFps("N/A"); setRes(`${video.videoWidth}x${video.videoHeight}`);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [videoId]);

  return (
    <div className="bg-black/80 border border-gray-700 text-green-400 font-mono text-[10px] px-2.5 py-1.5 rounded shadow-lg flex flex-col backdrop-blur-md">
      <span className="text-gray-400 mb-1 border-b border-gray-700 pb-0.5 truncate max-w-[150px]">{name}</span>
      <span>FPS: {fps}</span><span>RES: {res}</span>
    </div>
  );
});

const WarpEditorOverlay = React.memo(({ cue, onClose, onSave }) => {
  const [pins, setPins] = useState(cue.warpPins || [{x:0,y:0}, {x:1,y:0}, {x:1,y:1}, {x:0,y:1}]);
  const svgRef = useRef(null);

  const handleDrag = (idx, e) => {
     const rect = svgRef.current.getBoundingClientRect();
     const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
     const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
     const np = [...pins]; np[idx] = {x, y}; setPins(np);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col">
      <div className="p-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center shadow-lg z-10">
        <h2 className="font-bold text-gray-200 flex items-center gap-2 text-lg"><Move className="w-5 h-5 text-blue-500" /> Edit Warp Geometry</h2>
        <div className="flex gap-3">
          <button onClick={() => setPins([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}])} className="px-4 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold transition-colors flex items-center gap-2"><RotateCcw className="w-4 h-4"/> Reset</button>
          <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-700 hover:bg-gray-800 text-gray-300 text-sm font-semibold transition-colors flex items-center gap-2"><X className="w-4 h-4"/> Cancel</button>
          <button onClick={() => onSave(pins)} className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg transition-colors flex items-center gap-2"><Check className="w-4 h-4"/> Apply Warp</button>
        </div>
      </div>
      <div className="flex-1 p-8 flex items-center justify-center relative bg-[#111] overflow-hidden" style={{ backgroundImage: 'linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' }}>
        <div className="relative shadow-2xl border border-gray-700 bg-black w-full max-w-4xl aspect-video">
          <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-visible z-10">
            <polygon points={pins.map(p => `${p.x * 100}%,${p.y * 100}%`).join(' ')} fill="rgba(59, 130, 246, 0.2)" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="2" strokeDasharray="4 4" />
            {pins.map((p, i) => (
               <circle key={`pin-${i}`} cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2" className="cursor-move" onPointerDown={(e) => { e.target.setPointerCapture(e.pointerId); const move = ev => handleDrag(i, ev); const up = () => { e.target.releasePointerCapture(e.pointerId); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }} />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
});

const MaskEditorOverlay = React.memo(({ cue, onClose, onSave }) => {
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
        const vid = document.getElementById(`master-${cue.type === 'camera' ? 'cam' : 'vid'}-${cue.id}`);
        const tryCapture = () => {
          if (vid && vid.videoWidth && bgCanvasRef.current) {
            setResolution({ w: vid.videoWidth, h: vid.videoHeight });
            bgCanvasRef.current.width = vid.videoWidth; bgCanvasRef.current.height = vid.videoHeight;
            bgCanvasRef.current.getContext('2d').drawImage(vid, 0, 0, vid.videoWidth, vid.videoHeight);
          } else if (vid && !vid.videoWidth) timeoutId = setTimeout(tryCapture, 100);
        };
        tryCapture();
      } else if (cue.type === 'image') {
        const img = new Image();
        img.onload = () => {
          setResolution({ w: img.naturalWidth, h: img.naturalHeight });
          if (bgCanvasRef.current) { bgCanvasRef.current.width = img.naturalWidth; bgCanvasRef.current.height = img.naturalHeight; bgCanvasRef.current.getContext('2d').drawImage(img, 0, 0); }
        };
        img.src = cue.url;
      }
    } catch (e) {}
    return () => clearTimeout(timeoutId);
  }, [cue]);

  const handleCanvasClick = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    setCurrentPoints([...currentPoints, { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }]);
  };

  const finishCurrentShape = () => { if (currentPoints.length >= 3) { setPolygons([...polygons, currentPoints]); setCurrentPoints([]); } };

  const handleSave = () => {
    const allPolygons = [...polygons];
    if (currentPoints.length >= 3) allPolygons.push(currentPoints);
    if (allPolygons.length === 0) { onSave(''); return; }
    
    const c = document.createElement('canvas'); c.width = resolution.w; c.height = resolution.h;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); ctx.fillStyle = 'black'; 
    allPolygons.forEach(poly => {
      ctx.beginPath(); ctx.moveTo(poly[0].x * c.width, poly[0].y * c.height);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x * c.width, poly[i].y * c.height);
      ctx.closePath(); ctx.fill();
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
        <div className="relative shadow-2xl border border-gray-700 bg-black" style={{ width: '100%', maxWidth: '85vw', maxHeight: '80vh', aspectRatio: `${resolution.w}/${resolution.h}` }}>
          <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full object-contain opacity-50 pointer-events-none" />
          <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full cursor-crosshair z-10" onClick={handleCanvasClick} onMouseMove={(e) => { const rect = svgRef.current.getBoundingClientRect(); setMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }); }} onMouseLeave={() => setMousePos(null)}>
            {polygons.map((poly, idx) => (<polygon key={`poly-${idx}`} points={poly.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} fill="rgba(59, 130, 246, 0.4)" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />))}
            {currentPoints.length > 0 && (<polygon points={currentPoints.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="0.5" strokeDasharray="0.5 0.5" vectorEffect="non-scaling-stroke" />)}
            {currentPoints.map((p, i) => (<circle key={`pt-${i}`} cx={p.x * 100} cy={p.y * 100} r="1" fill="#60a5fa" />))}
            {currentPoints.length > 0 && mousePos && (<line x1={currentPoints[currentPoints.length - 1].x * 100} y1={currentPoints[currentPoints.length - 1].y * 100} x2={mousePos.x * 100} y2={mousePos.y * 100} stroke="rgba(59, 130, 246, 0.5)" strokeWidth="0.5" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />)}
          </svg>
        </div>
      </div>
    </div>
  );
});

const PathEditorOverlay = React.memo(({ cue, onClose, onSave }) => {
  const [points, setPoints] = useState(() => {
    if (!cue.animPathSvg) return [];
    // Basic parse of "M x y L x y" string back into points
    const pts = [];
    const parts = cue.animPathSvg.split(/[MLZ ]+/).filter(Boolean);
    for (let i = 0; i < parts.length; i += 2) {
       pts.push({ x: parseFloat(parts[i]), y: parseFloat(parts[i+1]) });
    }
    return pts;
  });

  const handleCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPoints([...points, { x, y }]);
  };

  const handleSave = () => {
    if (points.length < 2) { onSave(''); return; }
    let svgPath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
        svgPath += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
    }
    onSave(svgPath);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col">
      <div className="p-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center shadow-lg z-10">
        <h2 className="font-bold text-gray-200 flex items-center gap-2 text-lg"><Move className="w-5 h-5 text-indigo-500" /> Draw Motion Path</h2>
        <div className="flex gap-3">
          <button onClick={() => setPoints([])} className="px-4 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold transition-colors flex items-center gap-2"><Trash2 className="w-4 h-4"/> Clear Path</button>
          <button onClick={onClose} className="px-4 py-1.5 rounded border border-gray-700 hover:bg-gray-800 text-gray-300 text-sm font-semibold transition-colors flex items-center gap-2"><X className="w-4 h-4"/> Cancel</button>
          <button onClick={handleSave} className="px-5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg transition-colors flex items-center gap-2"><Check className="w-4 h-4"/> Save Path</button>
        </div>
      </div>
      <div className="flex-1 p-8 flex items-center justify-center relative bg-[#111] overflow-hidden" style={{ backgroundImage: 'linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' }}>
        <div className="relative shadow-2xl border border-gray-700 bg-black w-full max-w-4xl aspect-video">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full cursor-crosshair z-10" onClick={handleCanvasClick}>
            {points.length > 1 && (<path d={`M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')} fill="none" stroke="rgba(99, 102, 241, 0.8)" strokeWidth="0.5" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />)}
            {points.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r="1" fill="#818cf8" />))}
            {points.length > 0 && (
                <text x={points[0].x + 1} y={points[0].y - 1} fontSize="3" fill="#818cf8" className="pointer-events-none">Start</text>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
});

const CameraMasterPlayer = React.memo(({ cue, isPaused }) => {
  const videoRef = useRef(null);
  const rtcConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  
  useEffect(() => {
    let connectMobileCam = null;
    const startCamera = async () => {
      if ((cue.state === 'playing' || cue.state === 'stopping') && cue.cameraLive) {
        try {
          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(t => t.stop());
              localStreamRef.current = null;
          }
          if (cue.url && (cue.url.startsWith('rtsp://') || cue.url.startsWith('http'))) {
            if (videoRef.current) { 
              videoRef.current.srcObject = null; 
              videoRef.current.src = cue.url; 
              if (isPaused) videoRef.current.pause(); else videoRef.current.play().catch(()=>{});
            }
          } else if (cue.url && cue.url.startsWith('webrtc://')) {
            // Network WebRTC Capture
            const pc = new RTCPeerConnection({ iceServers: [] });
            rtcConnectionRef.current = pc;
            pc.addTransceiver('video', { direction: 'recvonly' });
            
            pc.ontrack = (e) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = null; // Force DOM reset
                    videoRef.current.srcObject = e.streams[0];
                    if (!isPaused) videoRef.current.play().catch(()=>{});
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Wait for ICE gathering to complete locally
            await new Promise(resolve => {
                if (pc.iceGatheringState === 'complete') resolve();
                else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
            });

            let res;
            try {
                const fetchUrlHttps = cue.url.replace('webrtc://', 'https://');
                res = await fetch(fetchUrlHttps, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription }) });
            } catch (httpsErr) {
                const fetchUrlHttp = cue.url.replace('webrtc://', 'http://');
                res = await fetch(fetchUrlHttp, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription }) });
            }
            
            if (res && res.ok) {
                const answer = await res.json();
                await pc.setRemoteDescription(answer.sdp);
            }
          } else if (cue.url === 'mobile-camera') {
            connectMobileCam = () => {
                if (window.__mobileCamStream && videoRef.current) {
                    videoRef.current.srcObject = null; // Force DOM reset
                    videoRef.current.srcObject = window.__mobileCamStream;
                    if (!isPaused) videoRef.current.play().catch(()=>{});
                }
            };
            connectMobileCam();
            window.addEventListener('mobile-cam-ready', connectMobileCam);
          } else {
            let stream;
            if (cue.url && cue.url.length > 5 && !cue.url.includes('.mp4')) {
              try { stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cue.url } } }); } 
              catch (fallbackErr) { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
            } else stream = await navigator.mediaDevices.getUserMedia({ video: true });
            
            localStreamRef.current = stream;
            if (videoRef.current && stream) { 
                videoRef.current.src = ""; 
                videoRef.current.srcObject = null; // Force DOM reset
                videoRef.current.srcObject = stream; 
                if (isPaused) videoRef.current.pause(); else videoRef.current.play().catch(()=>{}); 
            }
          }
        } catch (err) { console.error("Camera Setup Error:", err); }
      } else {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = "";
        }
      }
    };
    startCamera();
    return () => { 
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
      if (rtcConnectionRef.current) { rtcConnectionRef.current.close(); rtcConnectionRef.current = null; }
      if (connectMobileCam) window.removeEventListener('mobile-cam-ready', connectMobileCam);
    };
  }, [cue.state, cue.cameraLive, cue.url, isPaused]);

  useEffect(() => {
    if (videoRef.current && (videoRef.current.srcObject || videoRef.current.src)) {
      if (isPaused) videoRef.current.pause(); else videoRef.current.play().catch(()=>{});
    }
  }, [isPaused]);

  return <video id={`master-cam-${cue.id}`} ref={videoRef} autoPlay playsInline muted crossOrigin="anonymous" className="hidden" />;
});

const ChromaKeyFilter = React.memo(({ cue }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
     const canvas = canvasRef.current;
     const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
     if (!gl) return;

     const compileShader = (type, source) => {
       const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); return s;
     };

     const prog = gl.createProgram();
     gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, `attribute vec2 p; varying vec2 v; void main(){ gl_Position=vec4(p,0,1); v=vec2((p.x+1.0)/2.0, 1.0-(p.y+1.0)/2.0); }`));
     gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 v; uniform sampler2D t; uniform vec3 k; uniform float s; uniform float sm; void main(){ vec4 c = texture2D(t,v); float d = distance(c.rgb, k); float a = smoothstep(s, s+sm+0.0001, d); gl_FragColor = vec4(c.rgb, c.a*a); }`));
     gl.linkProgram(prog); gl.useProgram(prog);

     const pts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
     const buf = gl.createBuffer();
     gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW);
     const pLoc = gl.getAttribLocation(prog, "p");
     gl.enableVertexAttribArray(pLoc); gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

     const tex = gl.createTexture();
     gl.bindTexture(gl.TEXTURE_2D, tex);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

     const hexToRgb = (h) => { let c = h.substring(1).split(''); if(c.length===3) c=[c[0],c[0],c[1],c[1],c[2],c[2]]; c= '0x'+c.join(''); return [(c>>16&255)/255, (c>>8&255)/255, (c&255)/255]; };
     const rgb = hexToRgb(cue.chromaKeyColor || '#00ff00');
     gl.uniform3f(gl.getUniformLocation(prog, "k"), rgb[0], rgb[1], rgb[2]);
     gl.uniform1f(gl.getUniformLocation(prog, "s"), cue.chromaKeySimilarity !== undefined ? cue.chromaKeySimilarity : 0.4);
     gl.uniform1f(gl.getUniformLocation(prog, "sm"), cue.chromaKeySmoothness !== undefined ? cue.chromaKeySmoothness : 0.1);

     let animId;
     const render = () => {
        const src = document.getElementById(`master-${cue.type === 'image' ? 'img' : (cue.type === 'camera' ? 'cam' : 'vid')}-${cue.id}`);
        if (src && ((src.videoWidth && src.readyState >= 2) || src.complete)) {
           const w = src.videoWidth || src.naturalWidth || 1920; const h = src.videoHeight || src.naturalHeight || 1080;
           if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
           gl.viewport(0, 0, canvas.width, canvas.height); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        animId = requestAnimationFrame(render);
     };
     render();
     return () => {
        cancelAnimationFrame(animId);
        if (gl) {
           gl.deleteTexture(tex);
           gl.deleteBuffer(buf);
           gl.deleteProgram(prog);
        }
     };
  }, [cue.id, cue.type, cue.chromaKeyColor, cue.chromaKeySimilarity, cue.chromaKeySmoothness]);
  return <canvas id={`master-chroma-${cue.id}`} ref={canvasRef} className="hidden" />;
});

const TextMasterPlayer = React.memo(({ cue }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = 1920; const h = 1080; canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);
    if (cue.textContent) {
      ctx.imageSmoothingEnabled = cue.textSmoothing !== false; 
      if (cue.textShadowEnabled) {
        ctx.shadowColor = cue.textShadowColor || '#000000';
        ctx.shadowBlur = cue.textShadowBlur !== undefined ? cue.textShadowBlur : 10;
        ctx.shadowOffsetX = cue.textShadowOffsetX !== undefined ? cue.textShadowOffsetX : 5;
        ctx.shadowOffsetY = cue.textShadowOffsetY !== undefined ? cue.textShadowOffsetY : 5;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      ctx.fillStyle = cue.textColor || '#ffffff';
      const align = cue.textAlign || 'center'; ctx.textAlign = align; ctx.textBaseline = 'middle';
      const fontSize = (cue.textScale || 100); 
      const weight = cue.fontWeight || 'bold'; 
      const style = cue.fontStyle || 'normal'; 
      const family = cue.fontFamily || 'sans-serif';
      ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
      
      const lines = cue.textContent.split('\n'); 
      const lineHeight = fontSize * 1.2; 
      const totalHeight = lineHeight * lines.length;
      
      let startY = (h * (cue.textY !== undefined ? cue.textY : 50) / 100) - (totalHeight / 2) + (lineHeight / 2); 
      let startX = (w * (cue.textX !== undefined ? cue.textX : 50) / 100);
      if (align === 'left') startX = (w * (cue.textX !== undefined ? cue.textX : 5) / 100); 
      if (align === 'right') startX = (w * (cue.textX !== undefined ? cue.textX : 95) / 100); 
      
      lines.forEach(line => { ctx.fillText(line, startX, startY); startY += lineHeight; });
    }
  }, [
    cue.textContent, cue.textColor, cue.textScale, cue.fontFamily, cue.fontWeight, 
    cue.fontStyle, cue.textAlign, cue.textX, cue.textY, cue.textShadowEnabled, 
    cue.textShadowColor, cue.textShadowBlur, cue.textShadowOffsetX, 
    cue.textShadowOffsetY, cue.textSmoothing
  ]);
  return <canvas id={`master-text-${cue.id}`} ref={canvasRef} className="hidden" />;
});

const TimerMasterPlayer = React.memo(({ cue, fadeStateTrackers }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = 1920; const h = 1080; 
    let animId;

    const render = () => {
      canvas.width = w; canvas.height = h; ctx.clearRect(0, 0, w, h);
      const tracker = fadeStateTrackers.current[cue.id];
      if (tracker && (tracker.state === 'playing' || tracker.state === 'stopping')) {
          let elapsed = (performance.now() - tracker.start) / 1000;
          let timeVal = 0;
          const duration = cue.timerDuration || 60;
          
          if (cue.timerStyle === 'countdown') {
              timeVal = Math.max(0, duration - elapsed);
          } else {
              timeVal = Math.min(duration, elapsed);
          }

          let m = Math.floor(timeVal / 60);
          let s = Math.floor(timeVal % 60);
          let ms = Math.floor((timeVal % 1) * 10);
          
          let text = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
          if (cue.timerFormat === 'MM:SS.ms') text = `${text}.${ms}`;
          else if (cue.timerFormat === 'HH:MM:SS') {
              let hUnit = Math.floor(m / 60); m = m % 60;
              text = `${hUnit.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
          } else if (cue.timerFormat === 'SS.ms') {
              text = `${Math.floor(timeVal)}.${ms}`;
          }

          ctx.imageSmoothingEnabled = cue.textSmoothing !== false; 
          if (cue.textShadowEnabled) {
            ctx.shadowColor = cue.textShadowColor || '#000000';
            ctx.shadowBlur = cue.textShadowBlur !== undefined ? cue.textShadowBlur : 10;
            ctx.shadowOffsetX = cue.textShadowOffsetX !== undefined ? cue.textShadowOffsetX : 5;
            ctx.shadowOffsetY = cue.textShadowOffsetY !== undefined ? cue.textShadowOffsetY : 5;
          } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          }

          ctx.fillStyle = cue.textColor || '#ffffff';
          const align = cue.textAlign || 'center'; ctx.textAlign = align; ctx.textBaseline = 'middle';
          const fontSize = (cue.textScale || 100); 
          const weight = cue.fontWeight || 'bold'; 
          const style = cue.fontStyle || 'normal'; 
          const family = cue.fontFamily || 'sans-serif';
          ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
          
          let startY = (h * (cue.textY !== undefined ? cue.textY : 50) / 100); 
          let startX = (w * (cue.textX !== undefined ? cue.textX : 50) / 100);
          if (align === 'left') startX = (w * (cue.textX !== undefined ? cue.textX : 5) / 100); 
          if (align === 'right') startX = (w * (cue.textX !== undefined ? cue.textX : 95) / 100); 
          
          if (cue.timerVisible !== false) {
              ctx.fillText(text, startX, startY);
          }
      }
      animId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animId);
  }, [cue, fadeStateTrackers]);
  return <canvas id={`master-timer-${cue.id}`} ref={canvasRef} className="hidden" />;
});

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
                 <img src={cue.url} className="w-full h-full object-contain opacity-80 hover:opacity-100 transition-opacity" alt="Thumb" crossOrigin="anonymous" />
              ) : (
                 <video src={`${cue.url}#t=0.5`} className="w-full h-full object-contain opacity-80 hover:opacity-100 transition-opacity" preload="metadata" crossOrigin="anonymous" />
              )}
           </div>
         )}
      </div>
  );
});

const Header = React.memo(function Header({
  setShowSettingsModal, gpuStatus, setShowNewModal, fileInputRef, folderInputRef, 
  handleSaveShow, handleLoadShow, handleAddFolder, selectedCueIds, cues, 
  isMappingMode, setIsMappingMode, handleResetPins, gridSize, setGridSize, setPins, 
  showStats, setShowStats, projectorActive, toggleProjectorWindow, setShowPackModal,
  handleUndo, handleRedo, showInspector, setShowInspector
}) {
  const activeHeadCues = cues.filter(c => c.state === 'playing' || c.state === 'stopping');
  const activeHeadStr = activeHeadCues.length > 3 
    ? `${activeHeadCues.slice(0,3).map(c=>c.number).join(', ')} (+${activeHeadCues.length - 3})` 
    : (activeHeadCues.map(c=>c.number).join(', ') || 'Idle');

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-2">
        <button onClick={() => setShowSettingsModal(true)} className="hover:rotate-90 transition-transform duration-300 outline-none cursor-pointer p-1 -ml-1 rounded hover:bg-gray-800/50" title="System & I/O Settings">
          <Settings className="w-5 h-5 text-blue-500" />
        </button>
        <div className="flex flex-col">
          <h1 className="font-bold tracking-widest text-gray-200 leading-tight uppercase">
            TuxShow <span className="text-gray-500 font-normal tracking-normal text-sm ml-2 normal-case">Show Control <span className="text-[10px] font-mono text-blue-500 ml-1">v1.3.0</span></span>
          </h1>
          <span className="text-[9px] text-blue-400/80 font-mono tracking-widest uppercase mt-0.5">{String(gpuStatus)}</span>
        </div>

        <div className="flex items-center gap-1 border-l border-gray-800 pl-4 ml-2">
          <button onClick={() => setShowNewModal(true)} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><FilePlus className="w-3.5 h-3.5" /> New</button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><FolderOpen className="w-3.5 h-3.5" /> Load</button>
          <button onClick={handleSaveShow} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><Save className="w-3.5 h-3.5" /> Save</button>
          <button onClick={() => setShowPackModal(true)} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-blue-400 transition-colors"><Archive className="w-3.5 h-3.5" /> Pack</button>
          <div className="h-4 w-px bg-gray-800 mx-1"></div>
          <button onClick={handleUndo} title="Undo (Ctrl+Z)" className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"><Undo className="w-3.5 h-3.5" /></button>
          <button onClick={handleRedo} title="Redo (Ctrl+Shift+Z)" className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"><Redo className="w-3.5 h-3.5" /></button>
          <input type="file" accept=".TSW" ref={fileInputRef} className="hidden" onChange={handleLoadShow} />
          <input type="file" webkitdirectory="true" directory="true" multiple ref={folderInputRef} className="hidden" onChange={handleAddFolder} />
        </div>
        
        <div className="flex items-center gap-5 ml-6 border-l border-gray-800 pl-6 h-8">
          <div className="flex flex-col max-w-[150px]">
            <span className="text-[8px] text-gray-500 uppercase font-bold tracking-tighter">Selected Cue</span>
            <span 
              className="text-sm font-mono text-blue-400 leading-none truncate" 
              title={selectedCueIds.map(id => cues.find(c=>c.id===id)?.number).join(', ') || 'None'}
            >
              {selectedCueIds.map(id => cues.find(c=>c.id===id)?.number).join(', ') || 'None'}
            </span>
          </div>
          <div className="flex flex-col max-w-[200px]">
            <span className="text-[8px] text-gray-500 uppercase font-bold tracking-tighter">Active Playhead</span>
            <span 
              className="text-sm font-mono text-green-400 leading-none truncate" 
              title={activeHeadCues.map(c=>c.number).join(', ') || 'Idle'}
            >
              {activeHeadStr}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
         {isMappingMode && (
           <div className="flex items-center gap-3 mr-2 border-r border-gray-800 pr-5">
             <button onClick={handleResetPins} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors" title="Reset Grid Pins">
               <RotateCcw className="w-3.5 h-3.5" /> Reset
             </button>
             <div className="flex items-center gap-1 bg-gray-900 rounded border border-gray-800 px-2 py-1">
                <Grid3X3 className="w-4 h-4 text-blue-500" />
                <select value={`${gridSize.x}x${gridSize.y}`} onChange={(e) => { const [x, y] = e.target.value.split('x').map(Number); setGridSize({x,y}); const np=[]; for(let iy=0;iy<=y;iy++){for(let ix=0;ix<=x;ix++){np.push({x:ix/x,y:iy/y})}} setPins(np); }} className="bg-transparent text-gray-300 text-xs font-semibold outline-none cursor-pointer">
                  <option value="1x1">1x1 Mesh</option><option value="2x2">2x2 Mesh</option><option value="3x3">3x3 Mesh</option><option value="4x4">4x4 Mesh</option>
                </select>
             </div>
           </div>
         )}
         <button onClick={() => setShowStats(!showStats)} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors ${showStats ? 'bg-gray-700 text-green-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} title="Performance Stats"><Activity className="w-4 h-4" /></button>
         <button onClick={() => setShowInspector(!showInspector)} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors ${showInspector ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} title="Toggle Inspector"><Edit3 className="w-4 h-4" /> Inspector</button>
         <button onClick={() => setIsMappingMode(!isMappingMode)} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors ${isMappingMode ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}><Crosshair className="w-4 h-4" /> {isMappingMode ? 'Exit Mapping' : 'Map Surface'}</button>
         <button onClick={toggleProjectorWindow} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-semibold transition-colors ${projectorActive ? 'bg-red-900 hover:bg-red-800 text-red-100' : 'bg-green-900 hover:bg-green-800 text-green-100'}`}>{projectorActive ? <MonitorDown className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />} {projectorActive ? 'Close Projector Screens' : 'Open Projector Screens'}</button>
      </div>
    </header>
  );
});

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

  const activeMediaCues = cues.filter(c => c.state === 'playing' || c.state === 'stopping');

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
                     // Snap to current selection when re-engaged
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

          return (
            <div 
              key={cue.id} data-cue-id={cue.id} onClick={(e) => handleCueClick(e, cue.id)} 
              onContextMenu={(e) => handleContextMenu(e, cue.id)}
              draggable onDragStart={(e) => handleDragStart(e, cue.id)} onDragOver={(e) => handleDragOverCue(e, cue.id)}
              onDrop={(e) => handleDropCue(e, cue.id)} onDragEnd={handleDragEnd}
              className={`flex items-center px-2 py-3 text-sm border-b cursor-pointer select-none transition-colors ${isSelected ? 'bg-blue-900/40 border-blue-800/50' : 'hover:bg-gray-800/50'} ${isPlaying ? 'text-green-400' : isStopping ? 'text-yellow-500' : 'text-gray-300'} ${cue.groupId ? 'border-l-2 border-l-gray-700 rounded-l-none bg-gray-950/30' : ''} ${draggedCueId === cue.id ? 'opacity-40 border-dashed' : ''} ${dragOverCueId === cue.id + '-inside' ? 'bg-blue-900/60 shadow-[inset_0_0_0_2px_#3b82f6]' : ''} ${dragOverCueId === cue.id + '-before' ? 'shadow-[inset_0_3px_0_#3b82f6]' : ''} ${dragOverCueId === cue.id + '-after' ? 'shadow-[inset_0_-3px_0_#3b82f6]' : ''}`} 
              style={{ marginLeft: `${indentLevel * 24}px` }}
            >
              <div className="w-6 flex justify-center text-gray-600 cursor-grab"><GripVertical className="w-4 h-4" /></div>
              <div className="w-6 flex justify-center">{cue.type === 'group' ? (<button onClick={(e) => { e.stopPropagation(); setCues(prev => prev.map(c => c.id === cue.id ? {...c, isExpanded: !c.isExpanded} : c)); }} className="hover:text-white">{cue.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>) : (isSelected && <ChevronRight className="w-4 h-4 text-blue-400" />)}</div>
              <div className="w-10 font-mono opacity-50 truncate">{cue.number}</div>
              <div className="w-10 flex items-center justify-center gap-1">
                {cue.type === 'video' ? <Video className="w-4 h-4" /> : cue.type === 'image' ? <ImageIcon className="w-4 h-4" /> : cue.type === 'audio' ? <Music className="w-4 h-4" /> : cue.type === 'camera' ? <Camera className="w-4 h-4" /> : cue.type === 'blackout' ? <Moon className="w-4 h-4" /> : cue.type === 'pause' ? <PauseCircle className="w-4 h-4" /> : cue.type === 'counter' ? <Repeat className="w-4 h-4" /> : cue.type === 'transition' ? <Wand2 className="w-4 h-4 text-pink-500" /> : cue.type === 'group' ? (cue.isExpanded ? <FolderOpen className="w-4 h-4 text-blue-400" /> : <Folder className="w-4 h-4 text-blue-400" />) : cue.type === 'time' ? <CalendarClock className="w-4 h-4 text-orange-400" /> : cue.type === 'text' ? <Type className="w-4 h-4 text-yellow-200" /> : cue.type === 'msc' ? <Settings2 className="w-4 h-4 text-purple-400" /> : cue.type === 'osc' ? <Wifi className="w-4 h-4 text-cyan-400" /> : cue.type === 'stop' ? <XSquare className="w-4 h-4 text-red-500" /> : cue.type === 'state-changer' ? <Key className="w-4 h-4 text-teal-500" /> : cue.type === 'conditional' ? <GitBranch className="w-4 h-4 text-emerald-400" /> : cue.type === 'timer' ? <Hourglass className="w-4 h-4 text-teal-400" /> : cue.type === 'select' ? <Crosshair className="w-4 h-4 text-blue-300" /> : <CornerDownRight className="w-4 h-4 text-blue-400" />}
                {cue.type !== 'goto' && cue.type !== 'pause' && cue.type !== 'counter' && cue.type !== 'transition' && cue.type !== 'group' && cue.type !== 'time' && cue.type !== 'msc' && cue.type !== 'osc' && cue.type !== 'stop' && cue.type !== 'state-changer' && cue.type !== 'conditional' && (cue.triggerBehavior === 'stop-others' ? <StopCircle className="w-3 h-3 text-red-500 opacity-60" /> : <Layers className="w-3 h-3 text-blue-500 opacity-60" />)}
              </div>
              
              <div className={`flex-1 flex items-center font-medium truncate pr-2 ${cue.disabled ? 'opacity-50' : ''}`}>
                <span className={`${cue.type === 'group' ? 'font-bold text-blue-100' : ''} ${cue.disabled ? 'line-through' : ''}`}>{cue.name}</span>
                
                {/* FEEDBACK TAGS */}
                {(cue.type === 'video' || cue.type === 'audio') && (isPlaying || isStopping) && mediaTimes[cue.id] && mediaTimes[cue.id].duration > 0 && (
                  <span className="ml-2 text-[9px] font-mono text-cyan-400 border border-cyan-800/50 bg-cyan-900/30 px-1.5 py-0.5 rounded whitespace-nowrap" title="Media Time Remaining">
                    -{formatTime(mediaTimes[cue.id].duration - mediaTimes[cue.id].current)}
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
          <button className="w-full text-left px-4 py-2 hover:bg-red-600 text-red-400 hover:text-white transition-colors" onClick={handleDelete}>Delete</button>
        </div>
      )}
    </div>
  );
});

const Inspector = React.memo(function Inspector({ 
  cues, setCues, selectedCueIds, activeCues, isMixed, getSharedVal, updateSelectedCues, 
  getNativeFilePath, videoDevices, hardwareDisplays, setEditingMaskCueId, setEditingWarpCueId,
  handleUrlBlur, setEditingPathCueId, mediaTimes, setShowInspector
}) {
  return (
    <div className="w-[400px] border-l border-gray-800 bg-gray-900 flex flex-col shrink-0 overflow-hidden h-full">
      <div className="bg-gray-800/50 px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase flex items-center justify-between tracking-widest">
        <div className="flex items-center gap-2"><Edit3 className="w-4 h-4" /> Inspector</div>
        <button onClick={() => setShowInspector(false)} className="hover:text-white p-1 -mr-1 rounded hover:bg-gray-700"><X className="w-4 h-4"/></button>
      </div>
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
                          else if (newType === 'select') extraProps = { targetCueNumber: c.targetCueNumber || '' };
                          
                          if (['video','image','camera','text','timer'].includes(newType)) {
                              extraProps = { ...extraProps, scaleX: c.scaleX ?? 100, scaleY: c.scaleY ?? 100, keepAspect: c.keepAspect ?? true, posX: c.posX ?? 50, posY: c.posY ?? 50, cropTop: c.cropTop ?? 0, cropBottom: c.cropBottom ?? 0, cropLeft: c.cropLeft ?? 0, cropRight: c.cropRight ?? 0, outlineEnabled: c.outlineEnabled ?? false, outlineColor: c.outlineColor ?? '#ffffff', outlineWidth: c.outlineWidth ?? 2, warpEnabled: c.warpEnabled ?? false, warpPins: c.warpPins || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] };
                          }
                          return { ...c, type: newType, url: newUrl, ...extraProps };
                       }
                       return c;
                    }));
                }} className="flex-1 bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-2 py-1.5 text-sm text-gray-200 outline-none transition-colors">
                  {isMixed('type') && <option value="mixed" disabled hidden>-- Mixed Types --</option>}
                  <option value="video">Video Media</option><option value="audio">Audio Only</option><option value="image">Image Graphic</option><option value="camera">Live Capture</option><option value="text">Text / Title</option><option value="timer">Canvas Timer</option><option value="blackout">Stage Blackout</option><option value="pause">Pause Show</option><option value="goto">GoTo Pointer</option><option value="counter">Loop Counter</option><option value="transition">Scene Transition</option><option value="time">Time / Scheduled</option><option value="conditional">Conditional (If/Then)</option><option value="stop">Targeted Stop</option><option value="state-changer">State Changer (Lock)</option><option value="msc">MSC (MIDI Show Control)</option><option value="osc">OSC (Open Sound Control)</option><option value="group">Group / Folder</option><option value="animate">Animate / Tween</option><option value="select">Select / Load Cue</option>
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
          
            {(!['group', 'goto', 'pause', 'counter', 'transition', 'time', 'msc', 'osc', 'stop', 'state-changer', 'conditional', 'select'].includes(getSharedVal('type'))) && (
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

            {(getSharedVal('type') === 'text' || getSharedVal('type') === 'timer') && (
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

            {(!['group', 'time', 'osc', 'msc', 'goto', 'counter', 'pause', 'conditional', 'stop', 'state-changer', 'select'].includes(getSharedVal('type'))) && (
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
          
          </div>

      ) : <div className="flex-1 flex items-center justify-center text-sm text-gray-600">Select a cue to inspect.</div>}
    </div>
  );
});

const StagePreview = React.memo(function StagePreview({
  stageRef, activeMediaCues, pins, gridSize, stageSize, quadW, quadH,
  isMappingMode, handlePinDrag, showStats, isRecording
}) {
  const quads = [];
  for (let y = 0; y < gridSize.y; y++) {
    for (let x = 0; x < gridSize.x; x++) {
      quads.push({ col: x, row: y, indices: [y * (gridSize.x + 1) + x, y * (gridSize.x + 1) + x + 1, (y + 1) * (gridSize.x + 1) + x + 1, (y + 1) * (gridSize.x + 1) + x] });
    }
  }

  return (
    <div 
      className="flex-1 relative bg-gray-950 flex items-center justify-center p-8 overflow-hidden"
      style={{ 
        backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)', 
        backgroundSize: '30px 30px', 
        backgroundPosition: 'center center' 
      }}
    >
      <div className="relative bg-black shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-gray-700 w-full max-w-4xl aspect-video overflow-hidden ring-1 ring-black">
        <div className="absolute inset-0 bg-gray-900/20 z-0" />
        {activeMediaCues.filter(c => !['goto','pause','counter','group','time','msc','osc','stop','conditional'].includes(c.type) && !c.disabled).length === 0 && <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-mono tracking-widest pointer-events-none uppercase text-xs z-0">Stage Preview</div>}
        
        <div ref={stageRef} className="absolute inset-0 pointer-events-none z-10">
          {pins.length === (gridSize.x + 1) * (gridSize.y + 1) && quads.map((quad, qIdx) => {
            const pt_tl = { x: pins[quad.indices[0]].x * stageSize.w, y: pins[quad.indices[0]].y * stageSize.h };
            const pt_tr = { x: pins[quad.indices[1]].x * stageSize.w, y: pins[quad.indices[1]].y * stageSize.h };
            const pt_br = { x: pins[quad.indices[2]].x * stageSize.w, y: pins[quad.indices[2]].y * stageSize.h };
            const pt_bl = { x: pins[quad.indices[3]].x * stageSize.w, y: pins[quad.indices[3]].y * stageSize.h };
            return (
              <Fragment key={`quad-${qIdx}`}>
                <canvas id={`quad-ctx-local-${qIdx}-1`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: getAffineTransform(quadW, quadH, pt_tl, pt_tr, pt_bl, 1), clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                <canvas id={`quad-ctx-local-${qIdx}-2`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: getAffineTransform(quadW, quadH, pt_tr, pt_br, pt_bl, 2), clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
              </Fragment>
            );
          })}
        </div>
        
        {isMappingMode && pins.map((pin, i) => (<div key={i} className="absolute w-6 h-6 -ml-3 -mt-3 bg-white border-2 border-blue-500 rounded-full shadow-lg cursor-move z-50 flex items-center justify-center hover:scale-125 transition-transform" style={{ left: pin.x * stageSize.w, top: pin.y * stageSize.h }} onPointerDown={(e) => { e.target.setPointerCapture(e.pointerId); const onMove = (moveEvt) => handlePinDrag(i, moveEvt); const onUp = () => { e.target.releasePointerCapture(e.pointerId); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }} ><div className="w-2 h-2 bg-blue-500 rounded-full"/></div>))}
        
        {showStats && (
          <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {activeMediaCues.filter(c => c.type === 'video' || c.type === 'camera').map(cue => (
              <VideoStats key={`stats-${cue.id}`} videoId={`master-vid-${cue.id}`} name={cue.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const StatusBar = React.memo(function StatusBar({ localIp, virtualDisplayConfig, ioConfig, setShowQrModal, masterVolumeUI, handleMasterVolumeSlider }) {
  return (
    <div className="bg-gray-950 border-t border-gray-800 px-4 py-1.5 flex justify-between items-center text-[10px] font-mono tracking-widest text-gray-500 shrink-0 z-50">
      <div className="flex items-center gap-4">
        {/* NEW: Master Volume Slider */}
        <div className="flex items-center gap-2 border-r border-gray-800 pr-4 mr-1">
          <SlidersHorizontal className="w-3 h-3 text-gray-400" />
          <input type="range" min="0" max="1" step="0.01" value={masterVolumeUI} onChange={(e) => handleMasterVolumeSlider(parseFloat(e.target.value))} className="w-16 accent-gray-400" title="Master Global Volume" />
        </div>

        <span className="flex items-center gap-1.5 text-blue-400/80">
          <Wifi className="w-3 h-3" /> HOST IP: {localIp}
          <button onClick={() => setShowQrModal(true)} className="ml-2 bg-blue-900/50 hover:bg-blue-800 text-blue-300 p-1 rounded transition-colors cursor-pointer" title="Show QR Codes">
            <QrCode className="w-3 h-3" />
          </button>
        </span>
        <span className={`flex items-center gap-1.5 ${virtualDisplayConfig.enabled ? 'text-pink-400/80' : 'text-gray-600'} truncate`} title={`Receiver: webrtc://${localIp}:${virtualDisplayConfig.port}${virtualDisplayConfig.path}\nBrowser: https://${localIp}:${virtualDisplayConfig.port}${virtualDisplayConfig.path}\nCamera: https://${localIp}:${virtualDisplayConfig.port}/camera`}>
          <Cast className="w-3 h-3" /> STREAM: {virtualDisplayConfig.enabled ? `RECV: webrtc://${localIp}:${virtualDisplayConfig.port}${virtualDisplayConfig.path} | WEB: https://${localIp}:${virtualDisplayConfig.port}${virtualDisplayConfig.path}` : 'OFF'}
        </span>
      </div>
      <div className="flex items-center gap-6">
        <span className={`flex items-center gap-1.5 ${ioConfig.oscInput ? 'text-cyan-400' : 'text-gray-600'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${ioConfig.oscInput ? 'bg-cyan-500 animate-pulse shadow-[0_0_5px_rgba(6,182,212,0.8)]' : 'bg-gray-700'}`}></div>
          OSC RX: {ioConfig.oscInput ? `PORT ${ioConfig.oscPort}` : 'OFFLINE'}
        </span>
        <span className={`flex items-center gap-1.5 ${ioConfig.mscInput ? 'text-purple-400' : 'text-gray-600'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${ioConfig.mscInput ? 'bg-purple-500 animate-pulse shadow-[0_0_5px_rgba(168,85,247,0.8)]' : 'bg-gray-700'}`}></div>
          MSC RX: {ioConfig.mscInput ? `DEV [${ioConfig.mscDevice}]` : 'OFFLINE'}
        </span>
      </div>
    </div>
  );
});

// ============================================================================
// DEDICATED RECEIVER MODE
// ============================================================================
const DedicatedReceiver = React.memo(({ url }) => {
  const videoRef = useRef(null);
  const rtcConnectionRef = useRef(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let reconnectTimeout = null;
    let isActive = true;

    const connectWebRTC = async () => {
      if (!isActive) return;
      try {
        setErrorMsg('');
        const pc = new RTCPeerConnection({ iceServers: [] });
        rtcConnectionRef.current = pc;
        pc.addTransceiver('video', { direction: 'recvonly' });
        
        pc.ontrack = (e) => {
            if (videoRef.current) {
                videoRef.current.srcObject = e.streams[0];
                videoRef.current.play().catch(()=>{});
            }
        };
        
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'connected') setIsConnected(true);
            else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
                setIsConnected(false);
                if (isActive) reconnectTimeout = setTimeout(connectWebRTC, 2000);
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise(resolve => {
            if (pc.iceGatheringState === 'complete') resolve();
            else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
        });

        let res;
        try {
            const fetchUrlHttps = url.replace('webrtc://', 'https://');
            res = await fetch(fetchUrlHttps, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription.toJSON() }) });
        } catch (httpsErr) {
            const fetchUrlHttp = url.replace('webrtc://', 'http://');
            res = await fetch(fetchUrlHttp, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription.toJSON() }) });
        }
        
        if (res && res.ok) {
            const answer = await res.json();
            await pc.setRemoteDescription(answer.sdp);
        } else {
            throw new Error(`Server responded with ${res ? res.status : 'Network Error'}`);
        }
      } catch (err) {
        console.error("Receiver WebRTC Error:", err);
        setErrorMsg(err.message);
        if (isActive) reconnectTimeout = setTimeout(connectWebRTC, 3000);
      }
    };
    
    if (url && url.startsWith('webrtc://')) {
        connectWebRTC();
    } else if (url && (url.startsWith('http') || url.startsWith('rtsp'))) {
        if (videoRef.current) {
            videoRef.current.src = url;
            videoRef.current.play().catch(()=>{});
        }
    }

    return () => { 
      isActive = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (rtcConnectionRef.current) { rtcConnectionRef.current.close(); rtcConnectionRef.current = null; }
    };
  }, [url]);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative cursor-none flex items-center justify-center">
      <video ref={videoRef} autoPlay playsInline muted crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-contain" />
      
      {!isConnected && url.startsWith('webrtc://') && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 text-gray-400">
           <Wifi className="w-16 h-16 mb-4 animate-pulse opacity-50" />
           <h2 className="text-2xl font-bold tracking-widest uppercase mb-2">Connecting to Stream...</h2>
           <p className="font-mono text-sm">{url}</p>
           {errorMsg && <p className="text-red-500 mt-4 text-xs font-mono">{errorMsg}</p>}
        </div>
      )}

      <div className="absolute top-4 left-4 z-50 bg-black/50 text-white/30 px-2 py-1 rounded text-[10px] font-mono opacity-0 hover:opacity-100 transition-opacity">
        Dedicated Receiver Mode — Press Ctrl+Shift+R to Exit
      </div>
    </div>
  );
});

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const [isProjector, setIsProjector] = useState(window.location.hash.startsWith('#projector'));
  const [displayId, setDisplayId] = useState(window.location.hash.split('-')[1] || 'all');
  const [needsInit, setNeedsInit] = useState(window.location.hash.startsWith('#projector'));
  const [workspaceName, setWorkspaceName] = useState('Untitled Workspace');
  const [isProjectorReady, setIsProjectorReady] = useState(false);
  const [isReceiver, setIsReceiver] = useState(window.location.hash.startsWith('#receiver'));
  const [receiverUrl, setReceiverUrl] = useState(() => {
    if (window.location.hash.startsWith('#receiver-')) {
       return decodeURIComponent(window.location.hash.replace('#receiver-', ''));
    }
    return '';
  });
  
  const advanceTimers = useRef({}); 
  const fadeIntervals = useRef({});
  const syncTimers = useRef({});
  const fadeStateTrackers = useRef({});
  const mediaTimeUpdateThrottles = useRef({});
  const masterVolumeRef = useRef(1);

  const [masterVolumeUI, setMasterVolumeUI] = useState(1);

  const handleMasterVolumeSlider = useCallback((vol) => {
    setMasterVolumeUI(vol);
    masterVolumeRef.current = vol;
    cuesRef.current.filter(c => c.state === 'playing').forEach(cue => { 
      const el = document.getElementById(`master-${cue.type === 'audio' ? 'aud' : (cue.type === 'video' ? 'vid' : '')}-${cue.id}`); 
      if (el && !fadeIntervals.current[el.id]) el.volume = (cue.volume !== undefined ? cue.volume : 1) * vol; 
    });
  }, []);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const packDirInputRef = useRef(null);
  const stageRef = useRef(null);
  const cuesRef = useRef([]);
  const activeCuesRef = useRef([]);
  const masterCanvasRef = useRef(null); 
  const webrtcCanvasRef = useRef(null);
  const oscValuesRef = useRef({}); 
  const hostPeerConnectionsRef = useRef({}); // Tracks active WebRTC instances
  const lastSentStatusRef = useRef(null);
  const isExecutingRef = useRef(false);
  const [viewMode, setViewMode] = useState('list');
  const [showInspector, setShowInspector] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => { try { return parseInt(localStorage.getItem('tuxshow_left_panel_width')) || 400; } catch(e) { return 400; } });

  useEffect(() => { localStorage.setItem('tuxshow_left_panel_width', leftPanelWidth); }, [leftPanelWidth]);

  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);
  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordingStartTimeRef = useRef(0);

  const toggleRecording = async () => {
    const ipc = window.require ? window.require('electron').ipcRenderer : (window.ipcRenderer || (window.electron && window.electron.ipcRenderer) || window.api);
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      const filePath = await ipc.invoke('choose-record-destination');
      if (!filePath) return;
      try {
        const canvasStream = masterCanvasRef.current.captureStream(60);
        const videoTrack = canvasStream.getVideoTracks()[0];
        
        // NOTE TO AI: The app currently uses discrete <audio> and <video> elements rather than a 
        // global AudioContext destination for the WebRTC feed. To capture mixed audio, we would 
        // need to initialize a WebAudio AudioContext and route all media elements to a 
        // MediaStreamAudioDestinationNode. For now, recording video only.
        const streamToRecord = new MediaStream([videoTrack]);
        // Let the browser choose the optimal WebM codec (usually VP8 or VP9) to prevent NotSupportedError
        const options = { mimeType: 'video/webm' };
        const recorder = new MediaRecorder(streamToRecord, options);
        
        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            const arrayBuffer = await e.data.arrayBuffer();
            ipc.send('save-video-chunk', arrayBuffer);
          }
        };
        recorder.onstop = () => {
          const durationMs = Date.now() - recordingStartTimeRef.current;
          ipc.send('stop-recording', durationMs);
        };
        
        recorder.start(1000);
        recordingStartTimeRef.current = Date.now();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        console.log(`[TuxShow] Recording started: ${filePath}`);
      } catch (error) { 
        console.error('Failed to start recording:', error); 
        alert(`Failed to start recording: ${error.message}`);
      }
    }
  };

  const [projectorActive, setProjectorActive] = useState(false);
  const projectorWinRef = useRef(null);

  useEffect(() => {
    const handleHash = () => { 
      setIsProjector(window.location.hash.startsWith('#projector')); 
      setDisplayId(window.location.hash.split('-')[1] || 'all'); 
      setNeedsInit(window.location.hash.startsWith('#projector')); 
      setIsReceiver(window.location.hash.startsWith('#receiver'));
      if (window.location.hash.startsWith('#receiver-')) { setReceiverUrl(decodeURIComponent(window.location.hash.replace('#receiver-', ''))); }
    };
    window.addEventListener('hashchange', handleHash); 
    
    // Prevent browser from navigating away when dropping files outside designated zones
    const preventDefault = (e) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);

    return () => { 
      window.removeEventListener('hashchange', handleHash);
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  const [cues, setCues] = useState([
    { id: '0', number: '1', type: 'group', name: 'Pre-Show Sequence', url: '', state: 'stopped', groupMode: 'fire-all', isExpanded: true, groupId: null, targetDisplay: 'all' },
    { id: '1', number: '2', type: 'video', name: 'Background Loop', url: 'https://www.w3schools.com/html/mov_bbb.mp4', state: 'stopped', loop: true, triggerBehavior: 'stop-others', followAction: 'none', fadeInTime: 2.0, fadeOutTime: 2.0, duration: 0, volume: 1, cameraLive: true, maskEnabled: false, maskDataUrl: null, chromaKeyEnabled: false, chromaKeyColor: '#00ff00', chromaKeySimilarity: 0.4, chromaKeySmoothness: 0.1, groupId: '0', targetDisplay: 'all', scaleX: 100, scaleY: 100, keepAspect: true, posX: 50, posY: 50, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, outlineEnabled: false, outlineColor: '#ffffff', outlineWidth: 2, warpEnabled: false, warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], mediaSyncOffset: 0, mediaIn: 0, mediaOut: 0, holdAtEnd: false, colorFilterEnabled: false, hue: 0, saturation: 100, brightness: 100 },
    { id: '2', number: '3', type: 'audio', name: 'Ambient Music', url: 'https://www.w3schools.com/html/horse.mp3', state: 'stopped', loop: true, triggerBehavior: 'overlap', followAction: 'none', fadeInTime: 5.0, fadeOutTime: 5.0, duration: 0, volume: 0.5, groupId: '0', targetDisplay: 'all', mediaSyncOffset: 0 },
    { id: '3', number: '4', type: 'text', name: 'Welcome Title', url: '', state: 'stopped', loop: false, triggerBehavior: 'overlap', followAction: 'none', fadeInTime: 1.0, fadeOutTime: 1.0, duration: 0, textContent: 'WELCOME TO\nTUXSHOW', textColor: '#3b82f6', textScale: 120, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', textX: 50, textY: 50, textShadowEnabled: true, textShadowColor: '#000000', textShadowBlur: 15, textShadowOffsetX: 5, textShadowOffsetY: 5, textSmoothing: true, groupId: null, targetDisplay: 'all', scaleX: 100, scaleY: 100, keepAspect: true, posX: 50, posY: 50, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, outlineEnabled: false, outlineColor: '#ffffff', outlineWidth: 2, warpEnabled: false, warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] },
  ]);
  useEffect(() => { 
    cuesRef.current = cues; 
    activeCuesRef.current = cues.filter(c => c.state === 'playing' || c.state === 'stopping' || (c.state === 'completed' && c.holdAtEnd));
  }, [cues]);
  
  const undoHistory = useRef([]);
  const historyIndex = useRef(-1);
  const isUndoing = useRef(false);

  useEffect(() => {
     if (isUndoing.current) {
         isUndoing.current = false;
         return;
     }
     // Wait 800ms after the last cue change to commit to undo history
     // This prevents a single typed word from creating 10 undo states
     const timerId = setTimeout(() => {
         const currentStripped = JSON.stringify(cues.map(c => { const { state, triggerTime, counterCurrent, ...rest } = c; return rest; }));
         const lastHistory = undoHistory.current[historyIndex.current];
         
         if (!lastHistory || currentStripped !== lastHistory.stripped) {
             const newHistory = undoHistory.current.slice(0, historyIndex.current + 1);
             newHistory.push({ stripped: currentStripped, full: cues });
             if (newHistory.length > 50) newHistory.shift(); // Keep last 50 edits
             undoHistory.current = newHistory;
             historyIndex.current = newHistory.length - 1;
         }
     }, 800);
     
     return () => clearTimeout(timerId);
  }, [cues]);

  const handleUndo = useCallback(() => {
      if (historyIndex.current > 0) {
          isUndoing.current = true;
          historyIndex.current -= 1;
          const restoredCues = undoHistory.current[historyIndex.current].full;
          const merged = restoredCues.map(rc => { const currentCue = cuesRef.current.find(c => c.id === rc.id); if (currentCue) { return { ...rc, state: currentCue.state, triggerTime: currentCue.triggerTime, counterCurrent: currentCue.counterCurrent }; } return rc; });
          setCues(merged);
      }
  }, []);

  const handleRedo = useCallback(() => {
      if (historyIndex.current < undoHistory.current.length - 1) {
          isUndoing.current = true;
          historyIndex.current += 1;
          const restoredCues = undoHistory.current[historyIndex.current].full;
          const merged = restoredCues.map(rc => { const currentCue = cuesRef.current.find(c => c.id === rc.id); if (currentCue) { return { ...rc, state: currentCue.state, triggerTime: currentCue.triggerTime, counterCurrent: currentCue.counterCurrent }; } return rc; });
          setCues(merged);
      }
  }, []);

  // NEW: Garbage collection for orphaned tracking refs
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const activeIds = new Set(cuesRef.current.map(c => c.id));
      
      const cleanDict = (refDict) => {
        Object.keys(refDict.current).forEach(key => {
          // Handle stop-timer keys (e.g., 'stop-123') and direct ID keys
          const baseKey = key.startsWith('stop-') ? key.replace('stop-', '') : key;
          if (!activeIds.has(baseKey)) {
            if (refDict === fadeIntervals || refDict === syncTimers || refDict === advanceTimers) {
              clearTimeout(refDict.current[key]);
              clearInterval(refDict.current[key]);
            }
            delete refDict.current[key];
          }
        });
      };

      cleanDict(fadeStateTrackers);
      cleanDict(fadeIntervals);
      cleanDict(syncTimers);
      cleanDict(advanceTimers);
      cleanDict(mediaTimeUpdateThrottles);
    }, 10000);

    return () => clearInterval(cleanupInterval);
  }, []);

  const [selectedCueIds, setSelectedCueIds] = useState(['0']);
  const [lastSelectedId, setLastSelectedId] = useState('0'); 
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [editingMaskCueId, setEditingMaskCueId] = useState(null); 
  const [editingWarpCueId, setEditingWarpCueId] = useState(null); 
  const [editingPathCueId, setEditingPathCueId] = useState(null);
  const [mediaTimes, setMediaTimes] = useState({}); 
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [packPath, setPackPath] = useState('');
  const [isPacking, setIsPacking] = useState(false);
  const [packProgress, setPackProgress] = useState('');
  const [pendingLoadState, setPendingLoadState] = useState(null); 
  const [isPaused, setIsPaused] = useState(false); 
  const [globalPause, setGlobalPause] = useState(false);
  const pauseStartTimeRef = useRef(0);

  // NEW: Shift internal engine trackers to compensate for paused time
  useEffect(() => {
      if (isPaused) {
          pauseStartTimeRef.current = performance.now();
      } else if (pauseStartTimeRef.current > 0) {
          const pauseDuration = performance.now() - pauseStartTimeRef.current;
          Object.values(fadeStateTrackers.current).forEach(tracker => {
              if (tracker.start) tracker.start += pauseDuration;
              if (tracker.animStart) tracker.animStart += pauseDuration;
          });
          pauseStartTimeRef.current = 0;
      }
  }, [isPaused]);

  const [showStats, setShowStats] = useState(false);
  const [clipboardCues, setClipboardCues] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]); 
  const [audioDevices, setAudioDevices] = useState([]); 
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [gpuStatus, setGpuStatus] = useState("Probing Hardware..."); 
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState(() => { try { return localStorage.getItem('tuxshow_audio_out') || 'default'; } catch(e) { return 'default'; } });
  const [enableLocalAudio, setEnableLocalAudio] = useState(() => { try { return localStorage.getItem('tuxshow_local_audio') === 'true'; } catch(e) { return false; } });
  
  const [hardwareDisplays, setHardwareDisplays] = useState([]);
  const [selectedDisplays, setSelectedDisplays] = useState(() => { try { const saved = localStorage.getItem('tuxshow_displays'); return saved ? JSON.parse(saved) : []; } catch(e) { return []; } });
  const [ioConfig, setIoConfig] = useState(() => { try { const saved = localStorage.getItem('tuxshow_io_config'); return saved ? JSON.parse(saved) : { oscInput: false, oscPort: 53000, mscInput: false, mscDevice: '0' }; } catch(e) { return { oscInput: false, oscPort: 53000, mscInput: false, mscDevice: '0' }; } });
  const [virtualDisplayConfig, setVirtualDisplayConfig] = useState(() => { try { const saved = localStorage.getItem('tuxshow_virtual_display'); return saved ? JSON.parse(saved) : { enabled: false, port: 8554, path: '/display1' }; } catch(e) { return { enabled: false, port: 8554, path: '/display1' }; } });
  const [receiverConfig, setReceiverConfig] = useState(() => { try { const saved = localStorage.getItem('tuxshow_receiver_config'); return saved ? JSON.parse(saved) : { enabled: false, url: '', displayId: 'primary' }; } catch(e) { return { enabled: false, url: '', displayId: 'primary' }; } });

  const [deckConfig, setDeckConfig] = useState(() => { 
    try { 
      const saved = localStorage.getItem('tuxshow_deck_config'); 
      return saved ? JSON.parse(saved) : { buttons: [
        { label: 'GO', oscPath: '/tuxshow/go', color: '#16a34a', icon: 'play' },
        { label: 'STOP ALL', oscPath: '/tuxshow/stop', color: '#dc2626', icon: 'square' },
        { label: 'PAUSE', oscPath: '/tuxshow/pause', color: '#d97706', icon: 'pause' },
        { label: 'RESUME', oscPath: '/tuxshow/resume', color: '#2563eb', icon: 'play-circle' },
        { label: 'PREV', oscPath: '/tuxshow/select/prev', icon: 'skip-back' },
        { label: 'NEXT', oscPath: '/tuxshow/select/next', icon: 'skip-forward' },
        { label: 'Theme', oscPath: '/tuxshow/select/cue', oscArgs: '1', icon: 'image' },
        { label: 'Timer', oscPath: '/tuxshow/select/cue', oscArgs: '2', icon: 'clock' },
      ] };
    } catch(e) { return { buttons: [] }; } 
  });

  const [urlHistory, setUrlHistory] = useState(() => {
    try { const saved = localStorage.getItem('tuxshow_url_history'); return saved ? JSON.parse(saved) : []; } catch(e) { return []; }
  });

  const handleUrlBlur = useCallback((val) => {
    if (val && (val.startsWith('webrtc://') || val.startsWith('http') || val.startsWith('rtsp://'))) {
      if (!urlHistory.includes(val)) {
        const newHistory = [val, ...urlHistory].slice(0, 10);
        setUrlHistory(newHistory);
        localStorage.setItem('tuxshow_url_history', JSON.stringify(newHistory));
      }
    }
  }, [urlHistory]);

  useEffect(() => { localStorage.setItem('tuxshow_receiver_config', JSON.stringify(receiverConfig)); }, [receiverConfig]);

  useEffect(() => { 
    localStorage.setItem('tuxshow_deck_config', JSON.stringify(deckConfig)); 
    try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('update-deck-config', deckConfig); } catch(e) {} 
  }, [deckConfig]);

  useEffect(() => { localStorage.setItem('tuxshow_audio_out', audioOutputDeviceId); }, [audioOutputDeviceId]);
  useEffect(() => { localStorage.setItem('tuxshow_local_audio', enableLocalAudio.toString()); }, [enableLocalAudio]);

  const [gridSize, setGridSize] = useState({ x: 1, y: 1 });
  const [pins, setPins] = useState([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
  const [stageSize, setStageSize] = useState({ w: 800, h: 450 });

  const handleRenumberCues = useCallback(() => {
    setCues(prev => {
      let rootCounter = 1;
      const groupCounters = {};
      const idToNewNumberMap = {};
      const oldNumberToNewNumberMap = {};

      const updatedCues = prev.map((c) => {
        let assignedNumber;
        
        // If the cue is at the root level (no parent group)
        if (!c.groupId) {
          assignedNumber = rootCounter.toString();
          rootCounter++;
        } else {
          // If the cue is inside a group, construct a point cue based on the parent
          const parentNum = idToNewNumberMap[c.groupId] || '0';
          if (!groupCounters[c.groupId]) groupCounters[c.groupId] = 1;
          
          assignedNumber = `${parentNum}.${groupCounters[c.groupId]}`;
          groupCounters[c.groupId]++;
        }
        
        // Save the assigned number in case this cue is itself a group with children
        idToNewNumberMap[c.id] = assignedNumber;
        if (c.number) {
          oldNumberToNewNumberMap[String(c.number)] = assignedNumber;
        }
        
        return { ...c, number: assignedNumber };
      });

      return updatedCues.map(c => {
        let targetUpdates = {};
        
        if (c.targetCueNumber && oldNumberToNewNumberMap[String(c.targetCueNumber)]) {
            targetUpdates.targetCueNumber = oldNumberToNewNumberMap[String(c.targetCueNumber)];
        }
        if (c.targetCueRangeMin && oldNumberToNewNumberMap[String(c.targetCueRangeMin)]) {
            targetUpdates.targetCueRangeMin = oldNumberToNewNumberMap[String(c.targetCueRangeMin)];
        }
        if (c.targetCueRangeMax && oldNumberToNewNumberMap[String(c.targetCueRangeMax)]) {
            targetUpdates.targetCueRangeMax = oldNumberToNewNumberMap[String(c.targetCueRangeMax)];
        }
        if (c.conditionTargetCue && oldNumberToNewNumberMap[String(c.conditionTargetCue)]) {
            targetUpdates.conditionTargetCue = oldNumberToNewNumberMap[String(c.conditionTargetCue)];
        }
        if (c.trueTargetCue && oldNumberToNewNumberMap[String(c.trueTargetCue)]) {
            targetUpdates.trueTargetCue = oldNumberToNewNumberMap[String(c.trueTargetCue)];
        }
        if (c.falseTargetCue && oldNumberToNewNumberMap[String(c.falseTargetCue)]) {
            targetUpdates.falseTargetCue = oldNumberToNewNumberMap[String(c.falseTargetCue)];
        }
        if (c.animTargetCue && oldNumberToNewNumberMap[String(c.animTargetCue)]) {
            targetUpdates.animTargetCue = oldNumberToNewNumberMap[String(c.animTargetCue)];
        }
        if (c.fadeTargetCue && oldNumberToNewNumberMap[String(c.fadeTargetCue)]) {
            targetUpdates.fadeTargetCue = oldNumberToNewNumberMap[String(c.fadeTargetCue)];
        }

        return Object.keys(targetUpdates).length > 0 ? { ...c, ...targetUpdates } : c;
      });
    });
  }, []);

  const scrollCueIntoView = useCallback((cueId) => { 
    if (!autoScrollRef.current) return;
    const el = document.querySelector(`[data-cue-id="${cueId}"]`); 
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
  }, []);

  const evaluateCue = useCallback((cueId, currentCues, depth = 0) => {
    if (depth > 10) return []; const cue = currentCues.find(c => c.id === cueId); if (!cue) return [];
    if (cue.disabled) return [];

    if ((cue.type === 'audio' || cue.type === 'image') && cue.groupId && cue.state === 'playing') {
        const siblings = currentCues.filter(c => c.groupId === cue.groupId);
        const myIndex = siblings.findIndex(c => c.id === cue.id);
        const nextNonPlaying = siblings.slice(myIndex + 1).find(c => c.state !== 'playing');
        if (nextNonPlaying) return evaluateCue(nextNonPlaying.id, currentCues, depth + 1);
        return [];
    }

    if (cue.type === 'goto') {
        if (cue.gotoMode === 'random') {
             const val1 = parseFloat(cue.targetCueRangeMin); const val2 = parseFloat(cue.targetCueRangeMax);
             if (!isNaN(val1) && !isNaN(val2)) { const validCues = currentCues.filter(c => { const num = parseFloat(c.number); return !isNaN(num) && num >= Math.min(val1, val2) && num <= Math.max(val1, val2); }); if (validCues.length > 0) return evaluateCue(validCues[Math.floor(Math.random() * validCues.length)].id, currentCues, depth + 1); } return [];
        } else { const target = currentCues.find(c => String(c.number) === String(cue.targetCueNumber)); return target ? evaluateCue(target.id, currentCues, depth + 1) : []; }
    }
    if (cue.type === 'counter') return [cue]; 
    if (cue.type === 'conditional') {
        if (cue.conditionRunMode === 'continuous') return [cue];
        let conditionMet = false;
        if (cue.conditionType === 'osc-value') {
            const val = oscValuesRef.current[cue.conditionOscPath];
            if (String(val) === String(cue.conditionOscValue)) conditionMet = true;
        } else {
            const target = currentCues.find(c => String(c.number) === String(cue.conditionTargetCue));
            if (target && target.state === (cue.conditionState || 'playing')) conditionMet = true;
        }
        const nextNum = conditionMet ? cue.trueTargetCue : cue.falseTargetCue;
        const nextCue = currentCues.find(c => String(c.number) === String(nextNum));
        return nextCue ? evaluateCue(nextCue.id, currentCues, depth + 1) : [];
    }
    if (cue.type === 'group') {
        const children = currentCues.filter(c => c.groupId === cue.id); if (children.length === 0) return [cue];
        if (cue.groupMode === 'fire-first') return [cue, ...evaluateCue(children[0].id, currentCues, depth + 1)];
        else return [cue, ...children.flatMap(child => evaluateCue(child.id, currentCues, depth + 1))];
    }
    return [cue];
  }, []);

  const handleGo = useCallback(() => {
    if (isExecutingRef.current) return;
    if (selectedCueIds.length === 0) return; setIsPaused(false); setGlobalPause(false);
    isExecutingRef.current = true; setTimeout(() => { isExecutingRef.current = false; }, 500);
    setCues(prev => {
      let nextState = [...prev]; const resolvedCues = []; const mutations = {};
      selectedCueIds.forEach(id => {
         const cue = prev.find(c => c.id === id);
         if (cue && cue.type === 'counter') {
            const current = (mutations[cue.id]?.counterCurrent ?? cue.counterCurrent) || 0;
            if (current + 1 >= (cue.counterLimit || 1)) { mutations[cue.id] = { counterCurrent: 0 }; const target = prev.find(c => String(c.number) === String(cue.targetCueNumber)); if (target) resolvedCues.push(...evaluateCue(target.id, prev)); } 
            else { mutations[cue.id] = { counterCurrent: current + 1 }; resolvedCues.push(cue); }
         } else { resolvedCues.push(...evaluateCue(id, prev)); }
      });
      const resolvedIds = resolvedCues.map(c => c.id); if (resolvedIds.length === 0 && Object.keys(mutations).length === 0) return prev; 
      const hasHardStop = resolvedCues.some(c => c.triggerBehavior === 'stop-others');
      
      let fadeOutIds = [];
      resolvedCues.forEach(rc => {
          if (rc.triggerBehavior === 'fade-target') {
              if (rc.fadeTargetCue) {
                  const target = prev.find(c => String(c.number) === String(rc.fadeTargetCue));
                  if (target) fadeOutIds.push(target.id);
              } else {
                  const playingCues = prev.filter(c => c.state === 'playing' && !resolvedIds.includes(c.id));
                  if (playingCues.length > 0) {
                      const prevCue = playingCues.reduce((latest, current) => (current.triggerTime || 0) > (latest.triggerTime || 0) ? current : latest);
                      if (prevCue) fadeOutIds.push(prevCue.id);
                  }
              }
          }
      });

      nextState = nextState.map(cue => {
        let updatedCue = { ...cue, ...(mutations[cue.id] || {}) };
        if (resolvedIds.includes(cue.id)) return { ...updatedCue, state: 'playing', triggerTime: Date.now() };
        if (hasHardStop && !resolvedIds.includes(cue.id) && (cue.state === 'playing' || (cue.state === 'completed' && cue.holdAtEnd)) && !cue.lockedBy) return cue.fadeOutTime > 0 ? { ...updatedCue, state: 'stopping' } : { ...updatedCue, state: 'stopped' };
        if (fadeOutIds.includes(cue.id) && (cue.state === 'playing' || (cue.state === 'completed' && cue.holdAtEnd)) && !cue.lockedBy) return cue.fadeOutTime > 0 ? { ...updatedCue, state: 'stopping' } : { ...updatedCue, state: 'stopped' };
        return updatedCue;
      });
      const baseIds = resolvedIds.length > 0 ? resolvedIds : selectedCueIds; const lastTargetIndex = Math.max(...baseIds.map(id => prev.findIndex(c => c.id === id)));
      if (lastTargetIndex >= 0 && lastTargetIndex < prev.length - 1) { const nextSelectionId = prev[lastTargetIndex + 1].id; setTimeout(() => { setSelectedCueIds([nextSelectionId]); setLastSelectedId(nextSelectionId); scrollCueIntoView(nextSelectionId); }, 0); } 
      else if (lastTargetIndex === prev.length - 1) { const currentSelectionId = prev[lastTargetIndex].id; setTimeout(() => { setSelectedCueIds([currentSelectionId]); setLastSelectedId(currentSelectionId); scrollCueIntoView(currentSelectionId); }, 0); }
      return nextState;
    });
  }, [selectedCueIds, scrollCueIntoView, evaluateCue]);

  const handleStopAll = useCallback(() => { setCues(prev => prev.map(cue => ({ ...cue, state: 'stopped' }))); setIsPaused(false); setGlobalPause(false); }, []);
  const stopCue = useCallback((id) => { 
    setCues(prev => {
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
        const targetCue = prev.find(c => c.id === id);
        let idsToStop = [id];
        if (targetCue && targetCue.type === 'group') {
            idsToStop.push(...getDescendantIds(id));
        }
        return prev.map(cue => (idsToStop.includes(cue.id) && !cue.lockedBy) ? { ...cue, state: (cue.state === 'playing' || cue.state === 'completed') && cue.fadeOutTime > 0 ? 'stopping' : 'stopped' } : cue);
    }); 
  }, []);

  useEffect(() => {
    if (isProjector) {
      try {
        const { ipcRenderer } = window.require('electron');
        const handleStateSync = (event, state) => { if (state.cues) setCues(state.cues); if (state.pins) setPins(state.pins); if (state.gridSize) setGridSize(state.gridSize); if (state.isPaused !== undefined) setIsPaused(state.isPaused); if (state.globalPause !== undefined) setGlobalPause(state.globalPause); if (state.audioOutputDeviceId !== undefined) setAudioOutputDeviceId(state.audioOutputDeviceId); if (state.enableLocalAudio !== undefined) setEnableLocalAudio(state.enableLocalAudio); };
        ipcRenderer.on('sync-state', handleStateSync); ipcRenderer.send('request-state'); return () => ipcRenderer.removeListener('sync-state', handleStateSync);
      } catch (e) {
        const bc = new BroadcastChannel('tuxshow_sync_channel'); bc.onmessage = (event) => { if (event.data && event.data.type === 'SYNC_STATE') { const state = event.data.payload; if (state.cues) setCues(state.cues); if (state.pins) setPins(state.pins); if (state.gridSize) setGridSize(state.gridSize); if (state.isPaused !== undefined) setIsPaused(state.isPaused); if (state.globalPause !== undefined) setGlobalPause(state.globalPause); if (state.audioOutputDeviceId !== undefined) setAudioOutputDeviceId(state.audioOutputDeviceId); if (state.enableLocalAudio !== undefined) setEnableLocalAudio(state.enableLocalAudio); } }; return () => bc.close();
      }
    }
  }, [isProjector]);

  const lastPlaybackStateRef = useRef(null);

  useEffect(() => {
    if (!isProjector) {
      // Extract just the playback and pause states to see if a show-control action occurred
      const currentPlaybackState = JSON.stringify({
        cues: cues.map(c => ({ id: c.id, state: c.state, triggerTime: c.triggerTime })),
        isPaused,
        globalPause
      });
      const isPlaybackChange = lastPlaybackStateRef.current !== currentPlaybackState;
      lastPlaybackStateRef.current = currentPlaybackState;

      const syncData = () => {
        localStorage.setItem('tuxshow_state', JSON.stringify({ cues, pins, gridSize, isPaused, globalPause }));
        const statePayload = { cues, pins, gridSize, isPaused, globalPause, audioOutputDeviceId, enableLocalAudio };
        try { 
            const { ipcRenderer } = window.require('electron'); 
            ipcRenderer.send('broadcast-state', statePayload); 
        } catch(e) { 
            const bc = new BroadcastChannel('tuxshow_sync_channel'); 
            bc.postMessage({ type: 'SYNC_STATE', payload: statePayload }); 
            bc.close(); 
        }
      };

      if (isPlaybackChange) {
        // A cue was fired/stopped or show paused. Broadcast instantly so fast cues (<500ms) aren't swallowed!
        syncData();
      } else {
        // User is just typing in the Inspector. Debounce to prevent UI lag.
        const timerId = setTimeout(syncData, 500);
        return () => clearTimeout(timerId);
      }
    }
  }, [cues, pins, gridSize, isPaused, globalPause, audioOutputDeviceId, enableLocalAudio, isProjector]);

  useEffect(() => {
    if (!isProjector) {
      try { 
        const { ipcRenderer } = window.require('electron'); 
        ipcRenderer.invoke('get-gpu-status').then(status => setGpuStatus(typeof status === 'string' ? status : (status ? "Hardware Enabled" : "Probing..."))).catch(() => setGpuStatus("Hardware Unknown")); 
        ipcRenderer.on('projector-closed', () => setProjectorActive(false)); 
        ipcRenderer.on('update-projector-count', (event, count) => setProjectorActive(count > 0));
      } catch (e) { setGpuStatus("Browser Mode"); }
      try { const os = window.require('os'); const nets = os.networkInterfaces(); for (const name of Object.keys(nets)) { for (const net of nets[name]) { if (net.family === 'IPv4' && !net.internal) { setLocalIp(net.address); return; } } } } catch (e) {}
        if (navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(s => {
            s.getTracks().forEach(t => t.stop());
            navigator.mediaDevices.enumerateDevices().then(devices => {
                setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
                setAudioDevices(devices.filter(d => d.kind === 'audiooutput'));
            }).catch(()=>{});
          }).catch(() => {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
                setAudioDevices(devices.filter(d => d.kind === 'audiooutput'));
            }).catch(()=>{});
          });
        }
    }
  }, [isProjector]);

  useEffect(() => {
    if (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype.setSinkId) {
      cues.forEach(cue => {
        if (['audio', 'video'].includes(cue.type)) {
          const typeStr = cue.type === 'video' ? 'vid' : 'aud';
          const el = document.getElementById(`master-${typeStr}-${cue.id}`);
          if (el) {
            const targetSinkId = audioOutputDeviceId === 'default' ? '' : audioOutputDeviceId;
            if (el.sinkId !== targetSinkId) {
              el.setSinkId(targetSinkId).catch(console.warn);
            }
          }
        }
      });
    }
  }, [cues, audioOutputDeviceId]);

  useEffect(() => {
    cuesRef.current.forEach(cue => {
      if (['video', 'audio'].includes(cue.type)) {
        const typeStr = cue.type === 'video' ? 'vid' : 'aud';
        const el = document.getElementById(`master-${typeStr}-${cue.id}`);
        if (el) {
          if (isProjector) {
            el.muted = true;
          } else {
            el.muted = !(projectorActive || enableLocalAudio);
          }
        }
      }
    });
  }, [projectorActive, enableLocalAudio, isProjector]);

  useEffect(() => { if (showSettingsModal && !isProjector) { try { const { ipcRenderer } = window.require('electron'); ipcRenderer.invoke('get-displays').then(displays => { setHardwareDisplays(displays); if (selectedDisplays.length === 0 && displays.length > 1) { const secondary = displays.find(d => !d.isPrimary); if (secondary) setSelectedDisplays([secondary.id]); } }); } catch (e) {} } }, [showSettingsModal]);
  useEffect(() => { try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('update-io-config', ioConfig); } catch(e) {} localStorage.setItem('tuxshow_io_config', JSON.stringify(ioConfig)); }, [ioConfig]);
  useEffect(() => { localStorage.setItem('tuxshow_displays', JSON.stringify(selectedDisplays)); }, [selectedDisplays]);
  useEffect(() => { localStorage.setItem('tuxshow_virtual_display', JSON.stringify(virtualDisplayConfig)); }, [virtualDisplayConfig]);

  useEffect(() => {
    if (isProjector || !virtualDisplayConfig.enabled) return;

    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('start-virtual-display', { port: virtualDisplayConfig.port, path: virtualDisplayConfig.path });
    } catch (e) {}

    return () => { 
      try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('stop-virtual-display'); } catch(e) {} 
    };
  }, [virtualDisplayConfig.enabled, virtualDisplayConfig.port, virtualDisplayConfig.path, isProjector]);

  useEffect(() => {
    const handleWebRTCOffer = async (event, { offerId, sdp }) => {
      if (!webrtcCanvasRef.current) webrtcCanvasRef.current = document.createElement('canvas');
      const canvas = webrtcCanvasRef.current;
      if (!canvas) return;
      const pc = new RTCPeerConnection({ iceServers: [] });
      hostPeerConnectionsRef.current[offerId] = pc;

      const stream = canvas.captureStream(30);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
              delete hostPeerConnectionsRef.current[offerId]; pc.close();
          }
      };

      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await new Promise(resolve => {
          if (pc.iceGatheringState === 'complete') resolve();
          else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
      });

      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('webrtc-answer', { offerId, sdp: pc.localDescription.toJSON() });
    };

    const handleMobileCamOffer = async (event, { offerId, sdp }) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      hostPeerConnectionsRef.current[offerId] = pc;

      pc.ontrack = (e) => {
          window.__mobileCamStream = e.streams[0];
          window.dispatchEvent(new Event('mobile-cam-ready'));
      };

      pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
              delete hostPeerConnectionsRef.current[offerId]; pc.close();
              window.__mobileCamStream = null;
          }
      };

      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await new Promise(resolve => {
          if (pc.iceGatheringState === 'complete') resolve();
          else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
      });

      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('webrtc-answer', { offerId, sdp: pc.localDescription.toJSON() });
    };

    try { 
      const { ipcRenderer } = window.require('electron'); 
      ipcRenderer.on('webrtc-offer', handleWebRTCOffer); 
      ipcRenderer.on('mobile-cam-offer', handleMobileCamOffer); 
      return () => { 
        ipcRenderer.removeListener('webrtc-offer', handleWebRTCOffer); 
        ipcRenderer.removeListener('mobile-cam-offer', handleMobileCamOffer); 
        Object.values(hostPeerConnectionsRef.current).forEach(pc => pc.close()); 
      }; 
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (isProjector) { const handleResize = () => setStageSize({ w: window.innerWidth, h: window.innerHeight }); handleResize(); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); } 
    else { const observer = new ResizeObserver(entries => { if (entries[0] && entries[0].contentRect.width > 0 && entries[0].contentRect.height > 0) setStageSize({ w: entries[0].contentRect.width, h: entries[0].contentRect.height }); }); if (stageRef.current) observer.observe(stageRef.current); return () => observer.disconnect(); }
  }, [isProjector]);

  useEffect(() => {
    try {
      const { ipcRenderer } = window.require('electron');
      const handleOscMessage = (event, { path, args }) => {
        oscValuesRef.current[path] = args.length > 0 ? args[0] : null;
        const currentCues = cuesRef.current;
        if (path === '/tuxshow/go') handleGo(); else if (path === '/tuxshow/stop') handleStopAll(); else if (path === '/tuxshow/pause') { setIsPaused(true); setGlobalPause(true); } else if (path === '/tuxshow/resume') { setIsPaused(false); setGlobalPause(false); } else if (path === '/tuxshow/panic') setCues(prev => prev.map(c => c.state === 'playing' ? { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'stopped' } : c));
        else if (path === '/tuxshow/select/next') { setSelectedCueIds(prev => { if (prev.length === 0) return [currentCues[0]?.id].filter(Boolean); const lastIdx = Math.max(...prev.map(id => currentCues.findIndex(c => c.id === id))); if (lastIdx >= 0 && lastIdx < currentCues.length - 1) { const nextId = currentCues[lastIdx + 1].id; setLastSelectedId(nextId); scrollCueIntoView(nextId); return [nextId]; } return prev; }); }
        else if (path === '/tuxshow/select/prev') { setSelectedCueIds(prev => { if (prev.length === 0) return [currentCues[0]?.id].filter(Boolean); const firstIdx = Math.min(...prev.map(id => currentCues.findIndex(c => c.id === id))); if (firstIdx > 0) { const prevId = currentCues[firstIdx - 1].id; setLastSelectedId(prevId); scrollCueIntoView(prevId); return [prevId]; } return prev; }); }
        else if (path === '/tuxshow/select/cue' && args.length > 0) { const targetNum = String(args[0]); const found = currentCues.find(c => String(c.number) === targetNum); if (found) { setSelectedCueIds([found.id]); setLastSelectedId(found.id); scrollCueIntoView(found.id); } }
        else if (path === '/tuxshow/master/volume' && args.length > 0) { const vol = Math.max(0, Math.min(1, parseFloat(args[0]) || 0)); masterVolumeRef.current = vol; currentCues.filter(c => c.state === 'playing').forEach(cue => { const el = document.getElementById(`master-${cue.type === 'audio' ? 'aud' : (cue.type === 'video' ? 'vid' : '')}-${cue.id}`); if (el && !fadeIntervals.current[el.id]) el.volume = (cue.volume !== undefined ? cue.volume : 1) * vol; }); }
        else {
           const cueMatch = path.match(/^\/tuxshow\/cue\/([\w.]+)\/(start|stop|pause|resume|volume|opacity)$/);
           if (cueMatch) {
              const targetCueNum = cueMatch[1]; const action = cueMatch[2]; const targetCue = currentCues.find(c => String(c.number) === targetCueNum);
              if (targetCue) {
                 if (action === 'start') { const resolved = evaluateCue(targetCue.id, currentCues); if (resolved.length > 0) { setCues(prev => { const hasHardStop = resolved.some(r => r.triggerBehavior === 'stop-others'); const resolvedIds = resolved.map(r => r.id); return prev.map(c => { if (resolvedIds.includes(c.id)) return { ...c, state: 'playing', triggerTime: Date.now() }; if (hasHardStop && !resolvedIds.includes(c.id) && c.state === 'playing' && !c.lockedBy) return { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'completed' }; return c; }); }); } } 
                 else if (action === 'stop') stopCue(targetCue.id);
                 else if (action === 'pause') { const el = document.getElementById(`master-${targetCue.type === 'audio' ? 'aud' : (targetCue.type === 'video' ? 'vid' : '')}-${targetCue.id}`); if (el) el.pause(); } 
                 else if (action === 'resume') { const el = document.getElementById(`master-${targetCue.type === 'audio' ? 'aud' : (targetCue.type === 'video' ? 'vid' : '')}-${targetCue.id}`); if (el && targetCue.state === 'playing') el.play().catch(()=>{}); } 
                 else if (action === 'volume' && args.length > 0) { const vol = Math.max(0, Math.min(1, parseFloat(args[0]) || 0)); setCues(prev => prev.map(c => c.id === targetCue.id ? { ...c, volume: vol } : c)); } 
                 else if (action === 'opacity' && args.length > 0) { const op = Math.max(0, Math.min(1, parseFloat(args[0]) || 0)); setCues(prev => prev.map(c => c.id === targetCue.id ? { ...c, customOpacity: op } : c)); }
              }
           }
        }
      };
      ipcRenderer.on('osc-message', handleOscMessage); return () => ipcRenderer.removeListener('osc-message', handleOscMessage);
    } catch (e) {}
  }, [handleGo, handleStopAll, evaluateCue, scrollCueIntoView]);

  const triggerNextCueAfter = useCallback((currentCueId) => {
    setCues(prev => {
       const currentIndex = prev.findIndex(c => c.id === currentCueId);
       if (currentIndex >= 0 && currentIndex < prev.length - 1) {
        // NEW: Find the next ENABLED cue
        let nextCueRaw = null;
        for (let i = currentIndex + 1; i < prev.length; i++) {
            if (!prev[i].disabled) {
                nextCueRaw = prev[i];
                break;
            }
        }
        if (!nextCueRaw) return prev; // No valid next cue found

        const mutations = {}; let nextCues = [];
          if (nextCueRaw.type === 'counter') { const current = (mutations[nextCueRaw.id]?.counterCurrent ?? nextCueRaw.counterCurrent) || 0; if (current + 1 >= (nextCueRaw.counterLimit || 1)) { mutations[nextCueRaw.id] = { counterCurrent: 0 }; const target = prev.find(c => String(c.number) === String(nextCueRaw.targetCueNumber)); if (target) nextCues.push(...evaluateCue(target.id, prev)); } else { mutations[nextCueRaw.id] = { counterCurrent: current + 1 }; nextCues.push(nextCueRaw); } } else nextCues = evaluateCue(nextCueRaw.id, prev);
          if (nextCues.length === 0 && Object.keys(mutations).length === 0) return prev; 
          let nextState = prev.map(cue => mutations[cue.id] ? { ...cue, ...mutations[cue.id] } : cue);
          if (nextCues.length > 0) {
            const hasHardStop = nextCues.some(c => c.triggerBehavior === 'stop-others');

            let fadeOutIds = [];
            nextCues.forEach(rc => {
                if (rc.triggerBehavior === 'fade-target') {
                    if (rc.fadeTargetCue) {
                        const target = prev.find(c => String(c.number) === String(rc.fadeTargetCue));
                        if (target) fadeOutIds.push(target.id);
                    } else {
                        const playingCues = prev.filter(c => c.state === 'playing' && !nextCues.find(n => n.id === c.id));
                        if (playingCues.length > 0) {
                            const prevCue = playingCues.reduce((latest, current) => (current.triggerTime || 0) > (latest.triggerTime || 0) ? current : latest);
                            if (prevCue) fadeOutIds.push(prevCue.id);
                        }
                    }
                }
            });

            if (hasHardStop) nextState = nextState.map(c => !nextCues.find(n => n.id === c.id) && c.state === 'playing' && !c.lockedBy ? { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'completed' } : c);
            if (fadeOutIds.length > 0) nextState = nextState.map(c => fadeOutIds.includes(c.id) && c.state === 'playing' && !c.lockedBy ? { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'completed' } : c);
            nextState = nextState.map(c => nextCues.find(n => n.id === c.id) ? { ...c, state: 'playing', triggerTime: Date.now() } : c);
            setTimeout(() => { setSelectedCueIds(prevSelected => { if (prevSelected.length === 1 && prevSelected[0] === nextCueRaw.id) { const baseIds = nextCues.map(c => c.id); const lastTargetIndex = Math.max(...baseIds.map(id => prev.findIndex(c => c.id === id))); if (lastTargetIndex >= 0 && lastTargetIndex < prev.length - 1) { const pushedId = prev[lastTargetIndex + 1].id; setLastSelectedId(pushedId); scrollCueIntoView(pushedId); return [pushedId]; } } return prevSelected; }); }, 0);
          } return nextState;
       } return prev;
    });
  }, [scrollCueIntoView, evaluateCue]);

  useEffect(() => {
    const actionCues = cues.filter(c => ((c.type === 'pause' && (!c.duration || c.duration <= 0)) || c.type === 'counter' || c.type === 'msc' || c.type === 'osc' || c.type === 'stop' || c.type === 'state-changer' || c.type === 'select' || (c.type === 'conditional' && c.conditionRunMode !== 'continuous')) && c.state === 'playing');
    if (actionCues.length > 0) {
      if (actionCues.some(c => c.type === 'pause')) setIsPaused(true);
      
      setCues(prev => {
        let nextState = [...prev];
        nextState = nextState.map(c => (((c.type === 'pause' && (!c.duration || c.duration <= 0)) || c.type === 'counter' || c.type === 'msc' || c.type === 'osc' || c.type === 'stop' || c.type === 'state-changer' || c.type === 'select' || (c.type === 'conditional' && c.conditionRunMode !== 'continuous')) && c.state === 'playing') ? { ...c, state: 'completed' } : c);
        
        actionCues.filter(ac => ac.type === 'stop').forEach(sc => {
          const target = nextState.find(c => String(c.number) === String(sc.targetCueNumber).trim());
          if (target && (target.state === 'playing' || target.state === 'stopping')) {
            const getDescendantIds = (parentId, list) => {
                let ids = [];
                for (const c of list) {
                    if (c.groupId === parentId) {
                        ids.push(c.id);
                        ids.push(...getDescendantIds(c.id, list));
                    }
                }
                return ids;
            };
            let idsToStop = [target.id];
            if (target.type === 'group') {
                idsToStop.push(...getDescendantIds(target.id, nextState));
            }
            nextState = nextState.map(c => idsToStop.includes(c.id) && (c.state === 'playing' || c.state === 'stopping') && !c.lockedBy ? { ...c, state: (c.fadeOutTime > 0 && c.state === 'playing') ? 'stopping' : 'completed' } : c);
          }
        });
        
        actionCues.filter(ac => ac.type === 'state-changer').forEach(sc => {
          if (sc.stateChangeMode === 'default-all') {
            nextState = nextState.map(c => ({ ...c, lockedBy: null, disabled: false }));
          } else {
            const target = nextState.find(c => String(c.number) === String(sc.targetCueNumber).trim());
            if (target) {
              const getDescendantIds = (parentId, list) => {
                  let ids = [];
                  for (const c of list) {
                      if (c.groupId === parentId) { ids.push(c.id); ids.push(...getDescendantIds(c.id, list)); }
                  }
                  return ids;
              };
              let idsToModify = [target.id];
              if (target.type === 'group') { idsToModify.push(...getDescendantIds(target.id, nextState)); }
              
              if (sc.stateChangeMode === 'lock') {
                  nextState = nextState.map(c => idsToModify.includes(c.id) ? { ...c, lockedBy: sc.number } : c);
              } else if (sc.stateChangeMode === 'unlock') {
                  nextState = nextState.map(c => idsToModify.includes(c.id) ? { ...c, lockedBy: null } : c);
              } else if (sc.stateChangeMode === 'disable') {
                  nextState = nextState.map(c => idsToModify.includes(c.id) ? { ...c, disabled: true, state: (c.state === 'playing' || c.state === 'stopping') && !c.lockedBy ? ((c.fadeOutTime > 0 && c.state === 'playing') ? 'stopping' : 'completed') : c.state } : c);
              } else if (sc.stateChangeMode === 'enable') {
                  nextState = nextState.map(c => idsToModify.includes(c.id) ? { ...c, disabled: false } : c);
              }
            }
          }
        });

        actionCues.filter(ac => ac.type === 'select').forEach(sc => {
          const target = nextState.find(c => String(c.number) === String(sc.targetCueNumber).trim());
          if (target) {
            setTimeout(() => {
              setSelectedCueIds([target.id]);
              setLastSelectedId(target.id);
              scrollCueIntoView(target.id);
            }, 10);
          }
        });

        return nextState;
      });

      actionCues.forEach(ac => {
        if (ac.type === 'msc' || ac.type === 'osc') { try { const { ipcRenderer } = window.require('electron'); if (ac.type === 'msc') ipcRenderer.send('send-msc', { device: ac.mscDevice, command: ac.mscCommand, cueNumber: ac.mscCue }); if (ac.type === 'osc') ipcRenderer.send('send-osc', { ip: ac.oscIp, port: ac.oscPort, address: ac.oscAddress, args: ac.oscArgs }); } catch (e) {} }
        if (ac.followAction === 'auto-follow' && (!ac.duration || ac.duration <= 0)) setTimeout(() => triggerNextCueAfter(ac.id), 0); 
      });
    }
  }, [cues, triggerNextCueAfter, evaluateCue]); 

  const handleCueEnded = useCallback((endedCueId) => { 
    setCues(prev => { 
      const endedCue = prev.find(c => c.id === endedCueId); 
      if (!endedCue || endedCue.state === 'completed' || endedCue.state === 'stopped') return prev;
      
      let nextState = prev.map(cue => cue.id === endedCueId ? { ...cue, state: 'completed' } : cue); 
      if (endedCue.followAction === 'auto-follow' && (!endedCue.duration || endedCue.duration <= 0 || endedCue.type === 'pause' || endedCue.type === 'timer')) {
         setTimeout(() => triggerNextCueAfter(endedCueId), 0); 
      }
      return nextState; 
    }); 
  }, [triggerNextCueAfter]);

  const handleMediaTimeUpdate = useCallback((id, el) => {
    const now = performance.now();
    const currentCues = cuesRef.current;
    const cue = currentCues.find(c => c.id === id);

    if (cue && cue.state === 'playing' && cue.mediaOut > 0 && el.currentTime >= cue.mediaOut) {
        handleCueEnded(id);
    }

    if (!mediaTimeUpdateThrottles.current[id] || now - mediaTimeUpdateThrottles.current[id] > 500) {
      mediaTimeUpdateThrottles.current[id] = now;
      setMediaTimes(prev => ({...prev, [id]: { current: el.currentTime, duration: el.duration }}));
    }
  }, [handleCueEnded]);

  useEffect(() => {
    const timeCues = cues.filter(c => c.type === 'time' && c.state === 'playing');
    if (timeCues.length === 0) return;
    const interval = setInterval(() => { const now = new Date(); timeCues.forEach(cue => { if (!cue.scheduleTime) return; const target = new Date(); const [hours, minutes] = cue.scheduleTime.split(':'); target.setHours(parseInt(hours, 10) || 0, parseInt(minutes, 10) || 0, 0, 0); if (cue.scheduleDate) { const [year, month, day] = cue.scheduleDate.split('-'); target.setFullYear(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)); } if (now >= target) handleCueEnded(cue.id); }); }, 500); return () => clearInterval(interval);
  }, [cues, handleCueEnded]);

  // Automatically end Timer cues when they reach their duration
  useEffect(() => {
    const interval = setInterval(() => {
      const currentCues = activeCuesRef.current.filter(c => c.state === 'playing');
      if (currentCues.length === 0) return;
      const now = performance.now();
      let cuesToStop = [];
      currentCues.forEach(cue => {
        const tracker = fadeStateTrackers.current[cue.id];
        if (tracker && tracker.state === 'playing') {
          const elapsed = (now - tracker.start) / 1000;
          if (cue.type === 'timer' || (cue.type === 'pause' && cue.duration > 0)) {
            const duration = cue.type === 'timer' ? (cue.timerDuration !== undefined ? Number(cue.timerDuration) : 60) : Number(cue.duration);
            if (elapsed >= duration) {
              handleCueEnded(cue.id);
              if (cue.type === 'pause') { setIsPaused(false); setGlobalPause(false); }
            }
          } else {
            if (!cue.duration || cue.duration <= 0 || ['video', 'audio', 'camera', 'animate'].includes(cue.type)) return;
            if (elapsed >= cue.duration) {
              console.log(`[TuxShow] Auto-Timeout: ${cue.number} exceeded duration.`);
              if (cue.holdAtEnd) {
                 handleCueEnded(cue.id);
              } else {
                 cuesToStop.push(cue.id);
              }
            }
          }
        }
      });
      if (cuesToStop.length > 0) {
        setCues(prev => prev.map(c => cuesToStop.includes(c.id) ? { ...c, state: 'stopping' } : c));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [handleCueEnded]);

  // Continuous Evaluation Loop for Active Listener Cues
  useEffect(() => {
    const interval = setInterval(() => {
      const currentCues = cuesRef.current;
      const conditionalCues = activeCuesRef.current.filter(c => c.type === 'conditional' && c.conditionRunMode === 'continuous' && c.state === 'playing');
      if (conditionalCues.length === 0) return;

      let firedSomething = false;
      let resolvedCues = [];
      let mutations = {};

      conditionalCues.forEach(cue => {
        let conditionMet = false;
        if (cue.conditionType === 'osc-value') {
          const val = oscValuesRef.current[cue.conditionOscPath];
          if (val !== undefined && val !== null && String(val) === String(cue.conditionOscValue)) {
            conditionMet = true;
          }
        } else {
          const target = currentCues.find(c => String(c.number) === String(cue.conditionTargetCue));
          if (target && target.state === (cue.conditionState || 'playing')) {
            conditionMet = true;
          }
        }

        if (conditionMet) {
          firedSomething = true;
          if (cue.conditionType === 'osc-value') oscValuesRef.current[cue.conditionOscPath] = null; // Consume the OSC response
          mutations[cue.id] = { state: 'stopped' };
          
          if (cue.trueTargetCue) {
            const targetCue = currentCues.find(c => String(c.number) === String(cue.trueTargetCue));
            if (targetCue) resolvedCues.push(...evaluateCue(targetCue.id, currentCues));
          }
        }
      });

      if (firedSomething) {
        setCues(prev => {
          let nextState = prev.map(c => mutations[c.id] ? { ...c, ...mutations[c.id] } : c);
          if (resolvedCues.length > 0) {
            const hasHardStop = resolvedCues.some(c => c.triggerBehavior === 'stop-others');
            const resolvedIds = resolvedCues.map(c => c.id);

            let fadeOutIds = [];
            resolvedCues.forEach(rc => {
                if (rc.triggerBehavior === 'fade-target') {
                    if (rc.fadeTargetCue) {
                        const target = prev.find(c => String(c.number) === String(rc.fadeTargetCue));
                        if (target) fadeOutIds.push(target.id);
                    } else {
                        const playingCues = prev.filter(c => c.state === 'playing' && !resolvedIds.includes(c.id));
                        if (playingCues.length > 0) {
                            const prevCue = playingCues.reduce((latest, current) => (current.triggerTime || 0) > (latest.triggerTime || 0) ? current : latest);
                            if (prevCue) fadeOutIds.push(prevCue.id);
                        }
                    }
                }
            });

            nextState = nextState.map(c => {
              if (resolvedIds.includes(c.id)) return { ...c, state: 'playing', triggerTime: Date.now() };
              if (hasHardStop && !resolvedIds.includes(c.id) && (c.state === 'playing' || (c.state === 'completed' && c.holdAtEnd)) && !c.lockedBy) return { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'stopped' };
              if (fadeOutIds.includes(c.id) && (c.state === 'playing' || (c.state === 'completed' && c.holdAtEnd)) && !c.lockedBy) return { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'stopped' };
              return c;
            });
            setTimeout(() => { setSelectedCueIds([resolvedIds[0]]); setLastSelectedId(resolvedIds[0]); scrollCueIntoView(resolvedIds[0]); }, 0);
          }
          return nextState;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [evaluateCue, scrollCueIntoView]);

  useEffect(() => {
    if (!isProjector) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('set-window-title', workspaceName);
      } catch (e) {
        document.title = `TuxShow - ${workspaceName}`;
      }
    }
  }, [workspaceName, isProjector]);

  const doVolumeFade = useCallback((el, startVol, endVol, durationSec) => {
    if (fadeIntervals.current[el.id]) clearInterval(fadeIntervals.current[el.id]);
    if (durationSec <= 0) { el.volume = Math.max(0, Math.min(1, endVol * masterVolumeRef.current)); return; }
    const steps = 20; const interval = 1000 / steps; const totalSteps = Math.max(1, durationSec * steps); let step = 0; el.volume = Math.max(0, Math.min(1, startVol * masterVolumeRef.current));
    fadeIntervals.current[el.id] = setInterval(() => { step++; el.volume = Math.max(0, Math.min(1, (startVol + (endVol - startVol) * (step / totalSteps)) * masterVolumeRef.current)); if (step >= totalSteps) { clearInterval(fadeIntervals.current[el.id]); el.volume = Math.max(0, Math.min(1, endVol * masterVolumeRef.current)); } }, interval);
  }, []);

  useEffect(() => {
    cues.forEach(cue => {
      const trackKey = cue.id; const lastState = fadeStateTrackers.current[trackKey]?.state;
      const lastTriggerTime = fadeStateTrackers.current[trackKey]?.triggerTime;
      const el = document.getElementById(`master-${cue.type === 'audio' ? 'aud' : (cue.type === 'image' ? 'img' : (cue.type === 'text' ? 'text' : (cue.type === 'timer' ? 'timer' : (cue.type === 'camera' ? 'cam' : 'vid'))))}-${cue.id}`);

      const isNewTrigger = cue.state === 'playing' && (lastState !== 'playing' || (cue.triggerTime && lastTriggerTime !== cue.triggerTime));

      if (isNewTrigger) {
          if (cue.type === 'pause') setIsPaused(true);
          if (syncTimers.current[cue.id]) clearTimeout(syncTimers.current[cue.id]);
          if (el && fadeIntervals.current[el.id]) clearInterval(fadeIntervals.current[el.id]);

          fadeStateTrackers.current[trackKey] = { state: 'playing', start: performance.now(), animStart: performance.now(), duration: cue.type === 'transition' ? (cue.duration || 0) : (cue.fadeInTime || 0), triggerTime: cue.triggerTime, mediaElement: el };
          if (cue.type === 'transition') {
              const mCanvas = masterCanvasRef.current;
              const wCanvas = webrtcCanvasRef.current;
              if (mCanvas) { const snapCanvas = document.createElement('canvas'); snapCanvas.width = mCanvas.width || 1920; snapCanvas.height = mCanvas.height || 1080; snapCanvas.getContext('2d', { alpha: false }).drawImage(mCanvas, 0, 0); fadeStateTrackers.current[trackKey].snapshot = snapCanvas; }
              if (wCanvas) { const snapCanvasW = document.createElement('canvas'); snapCanvasW.width = wCanvas.width || 1920; snapCanvasW.height = wCanvas.height || 1080; snapCanvasW.getContext('2d', { alpha: false }).drawImage(wCanvas, 0, 0); fadeStateTrackers.current[trackKey].snapshotWebRTC = snapCanvasW; }
              setTimeout(() => {
                  setCues(prev => {
                  let nextState = prev.map(c => { if (c.id !== cue.id && ['video', 'audio', 'image', 'text', 'camera', 'timer'].includes(c.type) && (c.state === 'playing' || c.state === 'stopping') && !c.lockedBy) { return { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'completed' }; } return c; });
                      let targetCues = []; if (cue.targetCueNumber) { const target = nextState.find(c => String(c.number) === String(cue.targetCueNumber)); if (target) targetCues = evaluateCue(target.id, nextState); } else { const currentIndex = nextState.findIndex(c => c.id === cue.id); if (currentIndex >= 0 && currentIndex < nextState.length - 1) { targetCues = evaluateCue(nextState[currentIndex + 1].id, nextState); } }
                      if (targetCues.length > 0) { const resolvedIds = targetCues.map(tc => tc.id); nextState = nextState.map(c => resolvedIds.includes(c.id) ? { ...c, state: 'playing' } : c); setSelectedCueIds([resolvedIds[0]]); setLastSelectedId(resolvedIds[0]); scrollCueIntoView(resolvedIds[0]); } return nextState;
                  });
              }, 0);
          } else if (el && !['image','goto','blackout','pause','counter','transition','group','time','text','msc','osc','stop','conditional','timer'].includes(cue.type)) {
              if (isProjector) {
                  el.muted = true;
              } else {
                  el.muted = !(projectorActive || enableLocalAudio);
              }
              
              const startPlayback = () => {
                  if (cue.mediaIn > 0) el.currentTime = cue.mediaIn;
                  else if (cue.mediaSyncOffset > 0) el.currentTime = cue.mediaSyncOffset / 1000;
                  else el.currentTime = 0;
                  
                  if (cue.fadeInTime > 0) doVolumeFade(el, 0, cue.volume !== undefined ? cue.volume : 1, cue.fadeInTime); 
                  else el.volume = (cue.volume !== undefined ? cue.volume : 1) * masterVolumeRef.current;
                  
                  const p = el.play();
                  if (p !== undefined) p.catch(()=>{});
              };

              if (cue.mediaSyncOffset < 0) {
                  syncTimers.current[cue.id] = setTimeout(() => {
                      if (fadeStateTrackers.current[trackKey]?.state === 'playing') startPlayback();
                  }, Math.abs(cue.mediaSyncOffset));
              } else {
                  startPlayback();
              }
          }
      } else if (cue.state === 'stopping' && lastState !== 'stopping') {
      fadeStateTrackers.current[trackKey] = { state: 'stopping', start: performance.now(), animStart: fadeStateTrackers.current[trackKey]?.animStart || performance.now(), duration: cue.fadeOutTime || 0 };
          if (el && !['image','goto','blackout','pause','counter','transition','group','time','text','msc','osc','stop','conditional','timer'].includes(cue.type)) { if (cue.fadeOutTime > 0) { const currentBaseVol = masterVolumeRef.current > 0 ? el.volume / masterVolumeRef.current : (cue.volume !== undefined ? cue.volume : 1); doVolumeFade(el, currentBaseVol, 0, cue.fadeOutTime); } }
          if (advanceTimers.current[`stop-${cue.id}`]) clearTimeout(advanceTimers.current[`stop-${cue.id}`]); advanceTimers.current[`stop-${cue.id}`] = setTimeout(() => { setCues(prev => prev.map(c => c.id === cue.id ? { ...c, state: 'stopped' } : c)); }, (cue.fadeOutTime || 0) * 1000);
      } else if ((cue.state === 'stopped' || cue.state === 'completed') && lastState !== 'stopped' && lastState !== 'completed') {
          fadeStateTrackers.current[trackKey] = { state: cue.state, start: 0, duration: 0, fromStopping: lastState === 'stopping' }; if (fadeStateTrackers.current[trackKey].snapshot) delete fadeStateTrackers.current[trackKey].snapshot; if (fadeStateTrackers.current[trackKey].snapshotWebRTC) delete fadeStateTrackers.current[trackKey].snapshotWebRTC; if (advanceTimers.current[`stop-${cue.id}`]) { clearTimeout(advanceTimers.current[`stop-${cue.id}`]); delete advanceTimers.current[`stop-${cue.id}`]; } if (el && fadeIntervals.current[el.id]) clearInterval(fadeIntervals.current[el.id]);
          if (syncTimers.current[cue.id]) { clearTimeout(syncTimers.current[cue.id]); delete syncTimers.current[cue.id]; }
          if (el && ['video', 'audio'].includes(cue.type)) { 
              if (cue.holdAtEnd && cue.state === 'completed' && lastState !== 'stopping') {
                  el.pause(); 
              } else {
                  el.pause(); el.currentTime = cue.mediaIn > 0 ? cue.mediaIn : 0; 
              }
          }
      }
      if (cue.state === 'playing' && lastState === 'playing' && el && !fadeIntervals.current[el.id] && !['image','goto','blackout','pause','counter','transition','group','time','text','msc','osc','stop','conditional','timer'].includes(cue.type)) { el.volume = (cue.volume !== undefined ? cue.volume : 1) * masterVolumeRef.current; }
    });
  }, [cues, doVolumeFade, scrollCueIntoView, evaluateCue]);

  useEffect(() => {
    if (!isProjector && !isReceiver && receiverConfig.enabled) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('spawn-receiver', { displayId: receiverConfig.displayId, url: receiverConfig.url });
      } catch(e) {}
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        try {
          const { ipcRenderer } = window.require('electron');
          ipcRenderer.send('exit-receiver');
        } catch(err){}
        
        if (isReceiver) {
           window.location.hash = '';
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
         if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
         e.preventDefault();
         if (e.shiftKey) handleRedo(); else handleUndo();
      }
      
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'y') {
         if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
         e.preventDefault();
         handleRedo();
      }
      
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      
      if ((e.key === ' ' || e.code === 'Space') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
         e.preventDefault();
         setIsPaused(prev => !prev);
         setGlobalPause(prev => !prev);
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
         e.preventDefault();
         handleGo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReceiver, handleUndo, handleRedo, handleGo]);

  useEffect(() => {
    if (!isProjector && !isReceiver) {
      try {
        const { ipcRenderer } = window.require('electron');
        const onReceiverExited = () => {
           setReceiverConfig(prev => ({...prev, enabled: false}));
        };
        ipcRenderer.on('receiver-mode-exited', onReceiverExited);
        return () => ipcRenderer.removeListener('receiver-mode-exited', onReceiverExited);
      } catch(e) {}
    }
  }, [isProjector, isReceiver]);

  useEffect(() => {
    if (!masterCanvasRef.current) masterCanvasRef.current = document.createElement('canvas');
    if (!webrtcCanvasRef.current) webrtcCanvasRef.current = document.createElement('canvas');
    const masterCanvas = masterCanvasRef.current; 
    const webrtcCanvas = webrtcCanvasRef.current;
    const layerCanvas = document.createElement('canvas'); 
    const maskCanvas = document.createElement('canvas'); // Cached offscreen canvas for Masking
    
    const masterCtx = masterCanvas.getContext('2d', { alpha: false, desynchronized: true }); 
    const layerCtx = layerCanvas.getContext('2d', { alpha: true });
    const webrtcCtx = webrtcCanvas.getContext('2d', { alpha: false, desynchronized: true });
    const maskCtx = maskCanvas.getContext('2d', { alpha: true });
    
    const quadCtxCache = {}; // Cache to prevent 60fps DOM querying
    let animId;
    
    const renderLoop = () => {
      if (stageSize.w === 0 || stageSize.h === 0) { animId = requestAnimationFrame(renderLoop); return; }
      if (masterCanvas.width !== stageSize.w) masterCanvas.width = Math.max(1, stageSize.w); if (masterCanvas.height !== stageSize.h) masterCanvas.height = Math.max(1, stageSize.h);
      if (webrtcCanvas.width !== stageSize.w) webrtcCanvas.width = Math.max(1, stageSize.w); if (webrtcCanvas.height !== stageSize.h) webrtcCanvas.height = Math.max(1, stageSize.h);
      if (layerCanvas.width !== stageSize.w) layerCanvas.width = Math.max(1, stageSize.w); if (layerCanvas.height !== stageSize.h) layerCanvas.height = Math.max(1, stageSize.h);

      masterCtx.fillStyle = '#000000'; masterCtx.fillRect(0, 0, stageSize.w, stageSize.h);
      
      if (!isProjector) { webrtcCtx.fillStyle = '#000000'; webrtcCtx.fillRect(0, 0, stageSize.w, stageSize.h); }

      const currentCues = activeCuesRef.current;
      
      // --- OPTIMIZED ANIMATE MODIFIER CALCULATION ---
      const animModifiers = {};
      // Since currentCues is ALREADY filtered to only playing/stopping cues, 
      // we just need a fast standard loop to find the 'animate' types, bypassing array reallocation.
      for (let i = 0; i < currentCues.length; i++) {
          const anim = currentCues[i];
          if (anim.type === 'animate') {
              const tracker = fadeStateTrackers.current[anim.id];
              if (tracker && anim.duration > 0 && anim.animTargetCue) {
                  let p = (performance.now() - (tracker.animStart || tracker.start)) / (anim.duration * 1000);
                  p = Math.min(Math.max(p, 0), 1);
                  
                  if (!animModifiers[anim.animTargetCue]) animModifiers[anim.animTargetCue] = {};
                  
                  if (anim.animPathEnabled && anim.animPathSvg) {
                      if (!window.__animPaths) window.__animPaths = {};
                      if (!window.__animPaths[anim.id] || window.__animPaths[anim.id].raw !== anim.animPathSvg) {
                          const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                          pathEl.setAttribute("d", anim.animPathSvg);
                          window.__animPaths[anim.id] = { raw: anim.animPathSvg, el: pathEl, len: pathEl.getTotalLength() };
                      }
                      const pathData = window.__animPaths[anim.id];
                      if (pathData.len > 0) {
                          const pt = pathData.el.getPointAtLength(p * pathData.len);
                          animModifiers[anim.animTargetCue]['posX'] = pt.x;
                          animModifiers[anim.animTargetCue]['posY'] = pt.y;
                      }
                  } else {
                      const currentVal = anim.animStartValue + (anim.animEndValue - anim.animStartValue) * p;
                      animModifiers[anim.animTargetCue][anim.animProperty] = currentVal;
                  }
              }
          }
      }
      // ----------------------------------------

      currentCues.forEach(cue => {
        if (['audio', 'goto', 'pause', 'counter', 'transition', 'group', 'time', 'msc', 'osc', 'stop', 'conditional', 'animate', 'state-changer', 'select'].includes(cue.type)) return;
        if (cue.disabled) return;
        
        const showOnMaster = !isProjector || (displayId === 'all') || (cue.targetDisplay === 'all' || String(cue.targetDisplay) === String(displayId));
        const showOnWebRTC = !isProjector && (cue.targetDisplay === 'all' || cue.targetDisplay === 'webrtc');
        if (!showOnMaster && !showOnWebRTC) return;

        let opacity = 1; const tracker = fadeStateTrackers.current[cue.id];
        if (tracker) { const elapsed = (performance.now() - tracker.start) / 1000; if (tracker.state === 'playing') opacity = tracker.duration > 0 ? Math.min(1, elapsed / tracker.duration) : 1; else if (tracker.state === 'stopping') opacity = tracker.duration > 0 ? Math.max(0, 1 - (elapsed / tracker.duration)) : 0; }
        if (cue.type === 'blackout') { 
            if (showOnMaster) { masterCtx.globalAlpha = opacity; masterCtx.fillStyle = 'black'; masterCtx.fillRect(0, 0, stageSize.w, stageSize.h); masterCtx.globalAlpha = 1; }
            if (showOnWebRTC) { webrtcCtx.globalAlpha = opacity; webrtcCtx.fillStyle = 'black'; webrtcCtx.fillRect(0, 0, stageSize.w, stageSize.h); webrtcCtx.globalAlpha = 1; }
            return; 
        }

        let mediaEl = tracker?.mediaElement || document.getElementById(`master-${cue.type === 'image' ? 'img' : (cue.type === 'text' ? 'text' : (cue.type === 'timer' ? 'timer' : (cue.type === 'camera' ? 'cam' : 'vid')))}-${cue.id}`);
        if (cue.chromaKeyEnabled) { const chromaEl = document.getElementById(`master-chroma-${cue.id}`); if (chromaEl) mediaEl = chromaEl; }
        if (!mediaEl) return; if (mediaEl instanceof HTMLVideoElement && mediaEl.readyState < 2) return; if (mediaEl instanceof HTMLImageElement && !mediaEl.complete) return;
        
        const cueOpac = animModifiers[cue.number]?.customOpacity !== undefined ? animModifiers[cue.number].customOpacity : (cue.customOpacity !== undefined ? cue.customOpacity : 1); 
        if (showOnMaster) masterCtx.globalAlpha = opacity * cueOpac;
        if (showOnWebRTC) webrtcCtx.globalAlpha = opacity * cueOpac;

        // Apply HSB Color Correction
        const filterStr = (cue.colorFilterEnabled && ['video', 'image', 'camera'].includes(cue.type)) ? `hue-rotate(${cue.hue || 0}deg) saturate(${cue.saturation ?? 100}%) brightness(${cue.brightness ?? 100}%)` : 'none';
        if (showOnMaster) masterCtx.filter = filterStr;
        if (showOnWebRTC) webrtcCtx.filter = filterStr;

        // GEOMETRY & CROP LOGIC
        const srcW = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.width || stageSize.w;
        const srcH = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.height || stageSize.h;
        const cL = (cue.cropLeft || 0) / 100; const cR = (cue.cropRight || 0) / 100; const cT = (cue.cropTop || 0) / 100; const cB = (cue.cropBottom || 0) / 100;
        const sx = cL * srcW; const sy = cT * srcH; 
        const sw = Math.max(1, srcW - sx - (cR * srcW)); const sh = Math.max(1, srcH - sy - (cB * srcH));

        const scX = (animModifiers[cue.number]?.scaleX !== undefined ? animModifiers[cue.number].scaleX : (cue.scaleX ?? 100)) / 100; 
        const scY = (animModifiers[cue.number]?.scaleY !== undefined ? animModifiers[cue.number].scaleY : (cue.scaleY ?? 100)) / 100;
        const pX = (animModifiers[cue.number]?.posX !== undefined ? animModifiers[cue.number].posX : (cue.posX ?? 50)) / 100; 
        const pY = (animModifiers[cue.number]?.posY !== undefined ? animModifiers[cue.number].posY : (cue.posY ?? 50)) / 100;
        
        let baseDw = stageSize.w;
        let baseDh = stageSize.h;
        if (cue.keepAspect ?? true) {
            const stageRatio = stageSize.w / stageSize.h;
            const srcRatio = srcW / srcH;
            if (srcRatio > stageRatio) {
                baseDh = stageSize.w / srcRatio;
            } else {
                baseDw = stageSize.h * srcRatio;
            }
        }
        
        const fullDw = baseDw * scX; 
        const fullDh = baseDh * scY;
        const dw = fullDw * (sw / srcW); 
        const dh = fullDh * (sh / srcH);
        const dx = (stageSize.w * pX) - (dw / 2); 
        const dy = (stageSize.h * pY) - (dh / 2);

        const drawToCtx = (ctx, imageToDraw) => {
            if (cue.warpEnabled && cue.warpPins) {
                const pts = cue.warpPins.map(p => ({ x: dx + p.x * dw, y: dy + p.y * dh }));
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(pts[3].x, pts[3].y);
                ctx.closePath(); ctx.clip();
                applyCanvasAffine(ctx, dw, dh, pts[0], pts[1], pts[3], 1);
                ctx.drawImage(imageToDraw, sx, sy, sw, sh, 0, 0, dw, dh);
                ctx.restore();

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y);
                ctx.closePath(); ctx.clip();
                applyCanvasAffine(ctx, dw, dh, pts[1], pts[2], pts[3], 2);
                ctx.drawImage(imageToDraw, sx, sy, sw, sh, 0, 0, dw, dh);
                ctx.restore();
            } else {
                ctx.drawImage(imageToDraw, sx, sy, sw, sh, dx, dy, dw, dh);
            }
            
            ctx.filter = 'none'; // Ensure outline isn't color filtered

            if (cue.outlineEnabled) {
                ctx.save();
                if (cue.warpEnabled && cue.warpPins) {
                     const pts = cue.warpPins.map(p => ({ x: dx + p.x * dw, y: dy + p.y * dh }));
                     ctx.beginPath();
                     ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); ctx.closePath();
                } else {
                     ctx.beginPath();
                     ctx.rect(dx, dy, dw, dh);
                }
                ctx.strokeStyle = cue.outlineColor || '#ffffff';
                ctx.lineWidth = cue.outlineWidth || 2;
                ctx.stroke();
                ctx.restore();
            }
        };

        const drawWrapper = (imageToDraw) => {
             if (showOnMaster) drawToCtx(masterCtx, imageToDraw);
             if (showOnWebRTC) drawToCtx(webrtcCtx, imageToDraw);
        };

        try {
            if (cue.maskEnabled && cue.maskDataUrl) {
               const maskEl = document.getElementById(`master-mask-${cue.id}`);
               if (maskEl && maskEl.complete) { 
                   if (maskCanvas.width !== sw) maskCanvas.width = Math.max(1, sw);
                   if (maskCanvas.height !== sh) maskCanvas.height = Math.max(1, sh);
                   maskCtx.globalCompositeOperation = 'source-over';
                   maskCtx.clearRect(0, 0, sw, sh);
                   maskCtx.drawImage(maskEl, sx, sy, sw, sh, 0, 0, sw, sh); 
                   maskCtx.globalCompositeOperation = 'source-in'; 
                   maskCtx.drawImage(mediaEl, sx, sy, sw, sh, 0, 0, sw, sh);
                   drawWrapper(maskCanvas);
               } else drawWrapper(mediaEl);
            } else drawWrapper(mediaEl);
        } catch(err) { }
        if (showOnMaster) { masterCtx.globalAlpha = 1; masterCtx.filter = 'none'; }
        if (showOnWebRTC) { webrtcCtx.globalAlpha = 1; webrtcCtx.filter = 'none'; }
      });

      const drawTransitionShapes = (ctx, W, H, p, maxR, tType) => {
          switch(tType) {
              case 'wipe-up': ctx.fillRect(0, H - H*p, W, H*p); break;
              case 'wipe-down': ctx.fillRect(0, 0, W, H*p); break;
              case 'iris-in': ctx.arc(W/2, H/2, maxR*p, 0, Math.PI*2); ctx.fill(); break;
              case 'iris-out': ctx.globalCompositeOperation = 'destination-in'; ctx.arc(W/2, H/2, maxR*(1-p), 0, Math.PI*2); ctx.fill(); break;
              case 'star-in': case 'star-out': const spikes = 5; const drawS = (outer, inner) => { let rot = Math.PI / 2 * 3; let cx = W/2, cy = H/2; let step = Math.PI / spikes; ctx.moveTo(cx, cy - outer); for(let i=0;i<spikes;i++){ ctx.lineTo(cx + Math.cos(rot)*outer, cy + Math.sin(rot)*outer); rot+=step; ctx.lineTo(cx + Math.cos(rot)*inner, cy + Math.sin(rot)*inner); rot+=step; } ctx.lineTo(cx, cy - outer); ctx.closePath(); }; if(tType==='star-in') { drawS(maxR*p, maxR*p*0.4); ctx.fill(); } else { ctx.globalCompositeOperation = 'destination-in'; drawS(maxR*(1-p), maxR*(1-p)*0.4); ctx.fill(); } break;
              case 'curtain-in': ctx.fillRect(0, H/2 - (H/2)*p, W, H*p); break;
              case 'curtain-out': ctx.globalCompositeOperation = 'destination-in'; ctx.fillRect(0, H/2 - (H/2)*(1-p), W, H*(1-p)); break;
              case 'ripple-in': ctx.lineWidth = maxR/8; for(let i=0;i<8;i++) { let r = (maxR*p*1.5) - (i*maxR/4); if(r>0){ ctx.moveTo(W/2+r, H/2); ctx.arc(W/2,H/2,r,0,Math.PI*2); } } ctx.stroke(); break;
              case 'ripple-out': ctx.lineWidth = maxR/8; for(let i=0;i<8;i++) { let r = (maxR*(1-p)*1.5) + (i*maxR/4); if(r<maxR*1.5){ ctx.moveTo(W/2+r, H/2); ctx.arc(W/2,H/2,r,0,Math.PI*2); } } ctx.stroke(); break;
              case 'wind-left': for(let y=0; y<H; y+= H/40) { let delay = (Math.sin(y * 123.45) + 1)/2; let lp = Math.max(0, Math.min(1, (p - delay*0.3)*1.5)); ctx.fillRect(W - W*lp, y, W*lp, H/40 + 1); } break;
              case 'wind-right': for(let y=0; y<H; y+= H/40) { let delay = (Math.sin(y * 123.45) + 1)/2; let lp = Math.max(0, Math.min(1, (p - delay*0.3)*1.5)); ctx.fillRect(0, y, W*lp, H/40 + 1); } break;
          }
      };

      currentCues.forEach(cue => {
        if (cue.disabled) return;
        if (cue.type === 'transition' && (fadeStateTrackers.current[cue.id]?.snapshot || fadeStateTrackers.current[cue.id]?.snapshotWebRTC)) {
            const tracker = fadeStateTrackers.current[cue.id]; let p = 0; if (tracker.duration > 0) { p = Math.min(1, Math.max(0, (performance.now() - tracker.start) / (tracker.duration * 1000))); } else p = 1;
            if (p < 1) {
                const W = stageSize.w; const H = stageSize.h;
                const maxR = Math.hypot(W, H) / 2; const tType = cue.transitionType || 'wipe-up';

                if (tracker.snapshot) {
                    layerCtx.clearRect(0,0,W,H); layerCtx.globalCompositeOperation = 'source-over'; layerCtx.drawImage(tracker.snapshot, 0, 0, W, H); layerCtx.globalCompositeOperation = 'destination-out'; layerCtx.fillStyle = 'white'; layerCtx.beginPath();
                    drawTransitionShapes(layerCtx, W, H, p, maxR, tType);
                    masterCtx.globalAlpha = 1; masterCtx.globalCompositeOperation = 'source-over'; masterCtx.drawImage(layerCanvas, 0, 0);
                }
                
                if (tracker.snapshotWebRTC && !isProjector) {
                    layerCtx.clearRect(0,0,W,H); layerCtx.globalCompositeOperation = 'source-over'; layerCtx.drawImage(tracker.snapshotWebRTC, 0, 0, W, H); layerCtx.globalCompositeOperation = 'destination-out'; layerCtx.fillStyle = 'white'; layerCtx.beginPath();
                    drawTransitionShapes(layerCtx, W, H, p, maxR, tType);
                    webrtcCtx.globalAlpha = 1; webrtcCtx.globalCompositeOperation = 'source-over'; webrtcCtx.drawImage(layerCanvas, 0, 0);
                }
            }
        }
      });

      const viewPrefix = isProjector ? 'proj' : 'local'; const safeQuadW = Math.max(1, stageSize.w / gridSize.x); const safeQuadH = Math.max(1, stageSize.h / gridSize.y);
      for (let y = 0; y < gridSize.y; y++) { for (let x = 0; x < gridSize.x; x++) { const qIdx = y * gridSize.x + x; [1, 2].forEach(tri => { 
          const cacheKey = `${qIdx}-${tri}`;
          let ctx = quadCtxCache[cacheKey];
          if (!ctx || !ctx.canvas.isConnected) { 
             const canvas = document.getElementById(`quad-ctx-${viewPrefix}-${qIdx}-${tri}`); 
             if (canvas) { ctx = canvas.getContext('2d', { alpha: false }); quadCtxCache[cacheKey] = ctx; } else { quadCtxCache[cacheKey] = null; }
          }
          if (ctx) { 
             if (ctx.canvas.width !== safeQuadW) ctx.canvas.width = safeQuadW; 
             if (ctx.canvas.height !== safeQuadH) ctx.canvas.height = safeQuadH; 
             try { ctx.drawImage(masterCanvas, x * safeQuadW, y * safeQuadH, safeQuadW, safeQuadH, 0, 0, safeQuadW, safeQuadH); } catch(e) {} 
          } 
      }); } }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [stageSize, gridSize, isProjector, displayId]);

  useEffect(() => { cues.filter(c => c.state === 'playing' || c.state === 'stopping').forEach(cue => { if (['image', 'goto', 'camera', 'blackout', 'pause', 'counter', 'stop', 'group', 'time', 'text', 'msc', 'osc', 'conditional', 'timer', 'animate', 'select'].includes(cue.type)) return; const el = document.getElementById(`master-${cue.type === 'video' ? 'vid' : 'aud'}-${cue.id}`); if (el) { if (isPaused && (!cue.lockedBy || globalPause)) el.pause(); else { const p = el.play(); if (p !== undefined) p.catch(()=>{}); } } }); }, [isPaused, globalPause, cues]);
  
  useEffect(() => { 
    if (isProjector) return; 
    cues.forEach(cue => { 
      if (cue.state === 'playing' && cue.followAction === 'auto-follow' && cue.duration > 0 && cue.type !== 'pause' && cue.type !== 'timer' && (!isPaused || (cue.lockedBy && !globalPause))) { 
        if (!advanceTimers.current[cue.id]) {
            // NEW: Calculate accurate remaining time
            const tracker = fadeStateTrackers.current[cue.id];
            const elapsed = tracker ? (performance.now() - tracker.start) / 1000 : 0;
            const remainingMs = Math.max(0, cue.duration - elapsed) * 1000;
            advanceTimers.current[cue.id] = setTimeout(() => { triggerNextCueAfter(cue.id); }, remainingMs); 
        }
      } else if (advanceTimers.current[cue.id]) { 
        clearTimeout(advanceTimers.current[cue.id]); delete advanceTimers.current[cue.id]; 
      } 
    }); 
  }, [cues, isProjector, triggerNextCueAfter, isPaused, globalPause]);

  // =========================================================================
  // FILE SAVE, LOAD & PACK WORKSPACE
  // =========================================================================
  const handleSaveShow = useCallback(() => { const stateToSave = { cues: cuesRef.current.map(c => ({ ...c, state: 'stopped' })), pins, gridSize, isPaused: false, globalPause: false }; const blob = new Blob([JSON.stringify(stateToSave, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const outName = workspaceName === 'Untitled Workspace' ? 'show_workspace.TSW' : workspaceName; a.download = outName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); if (workspaceName === 'Untitled Workspace') setWorkspaceName(outName); }, [pins, gridSize, workspaceName]);
  
  const applyLoadedState = useCallback((loadedState) => {
    let hydratedCues = loadedState.cues.map(c => {
      let migrated = { ...c };
      if (c.fadeTime !== undefined || c.autoAdvance !== undefined || c.endBehavior !== undefined) {
          migrated.fadeInTime = c.fadeTime || 0;
          migrated.fadeOutTime = c.fadeTime || 0;
          migrated.duration = c.type === 'transition' ? (c.fadeTime || 1) : (c.autoAdvance ? (c.advanceTime || 0) : 0);
          migrated.followAction = (c.endBehavior === 'auto-follow' || c.autoAdvance) ? 'auto-follow' : 'none';
          delete migrated.fadeTime; delete migrated.autoAdvance; delete migrated.advanceTime; delete migrated.endBehavior;
      }
      return {
        ...migrated, description: migrated.description || '', groupId: migrated.groupId ?? null, groupMode: migrated.groupMode || 'fire-all', isExpanded: migrated.isExpanded ?? true, cameraLive: migrated.cameraLive ?? true, maskEnabled: migrated.maskEnabled ?? false, maskDataUrl: migrated.maskDataUrl ?? null, chromaKeyEnabled: migrated.chromaKeyEnabled ?? false, chromaKeyColor: migrated.chromaKeyColor || '#00ff00', chromaKeySimilarity: migrated.chromaKeySimilarity ?? 0.4, chromaKeySmoothness: migrated.chromaKeySmoothness ?? 0.1, counterLimit: migrated.counterLimit ?? 1, counterCurrent: migrated.counterCurrent ?? 0, gotoMode: migrated.gotoMode || 'specific', targetCueRangeMin: migrated.targetCueRangeMin || '', targetCueRangeMax: migrated.targetCueRangeMax || '', scheduleDate: migrated.scheduleDate || '', scheduleTime: migrated.scheduleTime || '', textContent: migrated.textContent || '', textColor: migrated.textColor || '#ffffff', textScale: migrated.textScale || 100, fontFamily: migrated.fontFamily || 'sans-serif', fontWeight: migrated.fontWeight || 'bold', fontStyle: migrated.fontStyle || 'normal', textAlign: migrated.textAlign || 'center', textX: migrated.textX ?? 50, textY: migrated.textY ?? 50, textShadowEnabled: migrated.textShadowEnabled ?? false, textShadowColor: migrated.textShadowColor || '#000000', textShadowBlur: migrated.textShadowBlur ?? 10, textShadowOffsetX: migrated.textShadowOffsetX ?? 5, textShadowOffsetY: migrated.textShadowOffsetY ?? 5, textSmoothing: migrated.textSmoothing ?? true, mscDevice: migrated.mscDevice ?? 0, mscCommand: migrated.mscCommand || 'GO', mscCue: migrated.mscCue || '1', oscIp: migrated.oscIp || '127.0.0.1', oscPort: migrated.oscPort ?? 8000, oscAddress: migrated.oscAddress || '/tuxshow/go', oscArgs: migrated.oscArgs || '', targetDisplay: migrated.targetDisplay || 'all', targetCueNumber: migrated.targetCueNumber || '',
        scaleX: migrated.scaleX ?? 100, scaleY: migrated.scaleY ?? 100, keepAspect: migrated.keepAspect ?? true, posX: migrated.posX ?? 50, posY: migrated.posY ?? 50, cropTop: migrated.cropTop ?? 0, cropBottom: migrated.cropBottom ?? 0, cropLeft: migrated.cropLeft ?? 0, cropRight: migrated.cropRight ?? 0, outlineEnabled: migrated.outlineEnabled ?? false, outlineColor: migrated.outlineColor || '#ffffff', outlineWidth: migrated.outlineWidth ?? 2, warpEnabled: migrated.warpEnabled ?? false, warpPins: migrated.warpPins || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
        mediaSyncOffset: migrated.mediaSyncOffset || 0, mediaIn: migrated.mediaIn || 0, mediaOut: migrated.mediaOut || 0, holdAtEnd: migrated.holdAtEnd || false, fadeTargetCue: migrated.fadeTargetCue || '', colorFilterEnabled: migrated.colorFilterEnabled ?? false, hue: migrated.hue || 0, saturation: migrated.saturation ?? 100, brightness: migrated.brightness ?? 100,
        timerDuration: migrated.timerDuration || 60, timerStyle: migrated.timerStyle || 'countdown', timerFormat: migrated.timerFormat || 'MM:SS', timerVisible: migrated.timerVisible ?? true, customOpacity: migrated.customOpacity,
        conditionRunMode: migrated.conditionRunMode || 'immediate', conditionType: migrated.conditionType || 'cue-state', conditionTargetCue: migrated.conditionTargetCue || '', conditionState: migrated.conditionState || 'playing', conditionOscPath: migrated.conditionOscPath || '/tuxshow/sensor', conditionOscValue: migrated.conditionOscValue || '1', trueTargetCue: migrated.trueTargetCue || '', falseTargetCue: migrated.falseTargetCue || ''
      };
    });
    setCues(hydratedCues);
    if (hydratedCues.length > 0) { setSelectedCueIds([hydratedCues[0].id]); setLastSelectedId(hydratedCues[0].id); }
    if (loadedState.pins) setPins(loadedState.pins); 
    if (loadedState.gridSize) setGridSize(loadedState.gridSize); 
    setIsPaused(false);
    setGlobalPause(false);
  }, []);

  const handleLoadShow = useCallback((e) => { 
    const file = e.target.files[0]; if (!file) return; 
    setWorkspaceName(file.name);
    
    let baseDir = '';
    try {
      let filePath = file.path;
      try {
        const { webUtils } = window.require('electron');
        const webPath = webUtils.getPathForFile(file);
        if (webPath) filePath = webPath;
      } catch(err) {}
      
      if (filePath) {
          const path = window.require('path');
          baseDir = path.dirname(filePath);
      }
    } catch(err) { console.error("Base directory resolution failed:", err); }

    const reader = new FileReader(); 
    reader.onload = (event) => { 
      try { 
        const loadedState = JSON.parse(event.target.result); 
        if (loadedState.cues) {
          if (baseDir) {
              try {
                  const path = window.require('path');
                  loadedState.cues = loadedState.cues.map(c => {
                      if (c.url && c.url.startsWith('./')) {
                          let absolutePath = path.join(baseDir, c.url.slice(2));
                          absolutePath = absolutePath.replace(/\\/g, '/');
                          const prefix = absolutePath.startsWith('/') ? 'file://' : 'file:///';
                          return { ...c, url: `${prefix}${absolutePath.replace(/#/g, '%23').replace(/\?/g, '%3F')}` };
                      }
                      return c;
                  });
              } catch(e) { console.error("URL remapping failed:", e); }
          }
          const isOldFormat = loadedState.cues.some(c => c.fadeTime !== undefined || c.autoAdvance !== undefined);
          if (isOldFormat) setPendingLoadState(loadedState); else applyLoadedState(loadedState);
        }
      } catch (err) { alert("Invalid .TSW file."); } 
    }; 
    reader.readAsText(file); e.target.value = ''; 
  }, [applyLoadedState]);
  
  const handlePackWorkspace = useCallback(async () => {
    if (!packPath) return;
    setIsPacking(true);
    setPackProgress('Initializing...');
    try {
        const fs = window.require('fs');
        const path = window.require('path');
        
        if (!fs.existsSync(packPath)) {
            await fs.promises.mkdir(packPath, { recursive: true });
        }
        
        const mediaDir = path.join(packPath, 'media');
        if (!fs.existsSync(mediaDir)) {
            await fs.promises.mkdir(mediaDir, { recursive: true });
        }

        let packedCues = JSON.parse(JSON.stringify(cues));
        const copiedFilesMap = new Map();
        const copyPromises = [];

        for (let i = 0; i < packedCues.length; i++) {
            let cue = packedCues[i];
            if (cue.url && cue.url.startsWith('file://')) {
                let originalPath = decodeURIComponent(cue.url.replace('file://', ''));
                if (process.platform === 'win32' && originalPath.startsWith('/')) {
                    originalPath = originalPath.slice(1);
                }

                if (copiedFilesMap.has(originalPath)) {
                    cue.url = copiedFilesMap.get(originalPath);
                    continue;
                }

                if (fs.existsSync(originalPath)) {
                    const fileName = path.basename(originalPath);
                    let safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
                    let newPath = path.join(mediaDir, safeFileName);
                    
                    if (fs.existsSync(newPath)) {
                        safeFileName = `${Date.now()}_${safeFileName}`;
                        newPath = path.join(mediaDir, safeFileName);
                    }
                    
                    const relativeUrl = `./media/${safeFileName}`;
                    cue.url = relativeUrl;
                    copiedFilesMap.set(originalPath, relativeUrl);
                    
                    copyPromises.push(fs.promises.copyFile(originalPath, newPath));
                } else {
                    console.warn("File not found to pack:", originalPath);
                }
            }
        }

        if (copyPromises.length > 0) {
            setPackProgress(`Copying ${copyPromises.length} files...`);
            await Promise.all(copyPromises);
        }

        setPackProgress('Saving workspace file...');
        const stateToSave = { cues: packedCues.map(c => ({ ...c, state: 'stopped' })), pins, gridSize, isPaused: false, globalPause: false };
        const tswPath = path.join(packPath, 'packed_show.TSW');
        await fs.promises.writeFile(tswPath, JSON.stringify(stateToSave, null, 2));

        setPackProgress('Packing complete! Portable workspace created.');
        setWorkspaceName('packed_show.TSW');
        setTimeout(() => {
            setShowPackModal(false);
            setPackProgress('');
            setIsPacking(false);
        }, 2500);

    } catch (err) {
        setPackProgress(`Error: ${err.message}`);
        setIsPacking(false);
    }
  }, [packPath, cues, pins, gridSize]);

  const handleAddFolder = useCallback((e) => { if (!e.target.files) return; const files = Array.from(e.target.files); const validFiles = files.filter(file => { const name = file.name.toLowerCase(); return file.type.startsWith('audio/') || file.type.startsWith('video/') || file.type.startsWith('image/') || name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.ogg') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg'); }); validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); const newCues = validFiles.map((file, idx) => { let type = 'video'; const name = file.name.toLowerCase(); if (file.type.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg')) type = 'audio'; else if (file.type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) type = 'image'; return { id: Date.now().toString() + '-' + idx, number: '', type, name: file.name, description: '', url: getNativeFilePath(file), state: 'stopped', loop: false, triggerBehavior: 'stop-others', fadeTargetCue: '', followAction: 'none', fadeInTime: 1.0, fadeOutTime: 1.0, duration: 0, volume: 1, targetDisplay: 'all', groupId: null, cameraLive: true, scaleX: 100, scaleY: 100, keepAspect: true, posX: 50, posY: 50, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, outlineEnabled: false, outlineColor: '#ffffff', outlineWidth: 2, warpEnabled: false, warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], mediaSyncOffset: 0, colorFilterEnabled: false, hue: 0, saturation: 100, brightness: 100 }; }); if (newCues.length > 0) { setCues(prev => { const startingNum = prev.length; let insertIdx = prev.length; let groupId = null; if (lastSelectedId) { const targetCue = prev.find(c => c.id === lastSelectedId); if (targetCue) { insertIdx = prev.findIndex(c => c.id === lastSelectedId) + 1; groupId = targetCue.type === 'group' ? targetCue.id : targetCue.groupId; } } const updatedNewCues = newCues.map((c, i) => ({ ...c, number: (startingNum + i + 1).toString(), groupId })); const nextCues = [...prev]; nextCues.splice(insertIdx, 0, ...updatedNewCues); return nextCues; }); } e.target.value = ''; }, [lastSelectedId]);
  const toggleProjectorWindow = useCallback(() => { try { const { ipcRenderer } = window.require('electron'); if (projectorActive) { ipcRenderer.send('close-projector'); setProjectorActive(false); } else { ipcRenderer.send('spawn-projector', selectedDisplays); setProjectorActive(true); } } catch (e) { if (window.location.protocol === 'blob:' || window.location.hostname.includes('googleusercontent')) { window.location.hash = 'projector-all'; setIsProjector(true); setDisplayId('all'); setNeedsInit(true); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{}); } else { if (projectorWinRef.current && !projectorWinRef.current.closed) { projectorWinRef.current.close(); projectorWinRef.current = null; setProjectorActive(false); } else { projectorWinRef.current = window.open(window.location.origin + window.location.pathname + '#projector-all', 'ProjectorOutput', 'width=1280,height=720'); setProjectorActive(true); const checkClose = setInterval(() => { if (projectorWinRef.current && projectorWinRef.current.closed) { setProjectorActive(false); clearInterval(checkClose); } }, 500); } } } }, [projectorActive, selectedDisplays]);

  // =========================================================================
  // FILE MIGRATOR UI CLOSE & CONFIRM BUTTONS
  // =========================================================================
  const confirmMigration = () => {
    if (pendingLoadState) {
      applyLoadedState(pendingLoadState);
      setPendingLoadState(null);
    }
  };

  const cancelMigration = () => {
    setPendingLoadState(null);
  };

  // =========================================================================
  // CORE TIMELINE AND RUNTIME STATE UPDATES
  // =========================================================================
  const handleCueClick = useCallback((e, id) => {
    if (e.shiftKey && lastSelectedId) {
      const startIdx = cues.findIndex(c => c.id === lastSelectedId);
      const endIdx = cues.findIndex(c => c.id === id);
      const rangeIds = cues.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1).map(c => c.id);
      if (e.metaKey || e.ctrlKey) setSelectedCueIds(Array.from(new Set([...selectedCueIds, ...rangeIds])));
      else setSelectedCueIds(rangeIds);
    } else if (e.metaKey || e.ctrlKey) {
      if (selectedCueIds.includes(id)) setSelectedCueIds(selectedCueIds.filter(i => i !== id));
      else setSelectedCueIds([...selectedCueIds, id]);
      setLastSelectedId(id);
    } else {
      setSelectedCueIds([id]);
      setLastSelectedId(id);
    }
  }, [cues, lastSelectedId, selectedCueIds]);

  const isVisible = useCallback((cueId) => {
    const cue = cues.find(c => c.id === cueId);
    if (!cue || !cue.groupId) return true;
    const parent = cues.find(c => c.id === cue.groupId);
    if (parent && !parent.isExpanded) return false;
    return isVisible(parent.id);
  }, [cues]);

  const getIndent = useCallback((cueId, depth = 0) => {
    const cue = cues.find(c => c.id === cueId);
    if (!cue || !cue.groupId) return depth;
    return getIndent(cue.groupId, depth + 1);
  }, [cues]);

  const activeMediaCues = useMemo(() => cues.filter(c => c.state === 'playing' || c.state === 'stopping'), [cues]);
  const activeCues = useMemo(() => cues.filter(c => selectedCueIds.includes(c.id)), [cues, selectedCueIds]);
  const getSharedVal = useCallback((field, fallback = '') => { if (activeCues.length === 0) return fallback; const val = activeCues[0][field]; return val === undefined || val === null ? fallback : (activeCues.every(c => c[field] === val) ? val : fallback); }, [activeCues]);
  const isMixed = useCallback((field) => { if (activeCues.length === 0) return false; const val = activeCues[0][field]; return !activeCues.every(c => c[field] === val); }, [activeCues]);
  const updateSelectedCues = useCallback((field, value) => { setCues(prev => prev.map(c => { if (!selectedCueIds.includes(c.id)) return c; return { ...c, [field]: value }; })); }, [selectedCueIds]);

  const activePlayheadCues = useMemo(() => cues.filter(c => c.state === 'playing'), [cues]);

  useEffect(() => {
    if (isProjector || isReceiver) return;

    let statusPayload;
    if (activePlayheadCues.length > 0) {
      const latestCue = activePlayheadCues.reduce((latest, current) => (current.triggerTime || 0) > (latest.triggerTime || 0) ? current : latest);
      statusPayload = { cueNumber: latestCue.number, cueName: latestCue.name };
    } else {
      statusPayload = { cueNumber: null, cueName: 'Idle' };
    }

    const statusString = JSON.stringify(statusPayload);
    if (lastSentStatusRef.current !== statusString) {
      try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('broadcast-status', statusPayload); lastSentStatusRef.current = statusString; } catch (e) {}
    }
  }, [activePlayheadCues, isProjector, isReceiver]);

  // NEW: Diet CueList Broadcaster for Stage Manager PWA
  const previousDietCuesRef = useRef('[]');
  useEffect(() => {
    const dietCues = cues.map(c => ({
      id: c.id,
      number: c.number,
      name: c.name,
      type: c.type,
      state: c.state
    }));

    const dietString = JSON.stringify(dietCues);
    if (dietString !== previousDietCuesRef.current) {
      previousDietCuesRef.current = dietString;
      try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('broadcast-cuelist', dietCues); } catch(e) { if (window.electron) window.electron.ipcRenderer.send('broadcast-cuelist', dietCues); }
    }
  }, [cues]);

  const handlePinDrag = useCallback((index, e) => { if (!stageRef.current) return; const rect = stageRef.current.getBoundingClientRect(); const newPins = [...pins]; newPins[index] = { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) }; setPins(newPins); }, [pins]);
  const handleResetPins = useCallback(() => { const np = []; for (let iy = 0; iy <= gridSize.y; iy++) { for (let ix = 0; ix <= gridSize.x; ix++) { np.push({ x: ix / gridSize.x, y: iy / gridSize.y }); } } setPins(np); }, [gridSize]);

  const quadW = Math.max(1, stageSize.w / gridSize.x); const quadH = Math.max(1, stageSize.h / gridSize.y);

  const quads = [];
  for (let y = 0; y < gridSize.y; y++) {
    for (let x = 0; x < gridSize.x; x++) {
      quads.push({ col: x, row: y, indices: [y * (gridSize.x + 1) + x, y * (gridSize.x + 1) + x + 1, (y + 1) * (gridSize.x + 1) + x + 1, (y + 1) * (gridSize.x + 1) + x] });
    }
  }

  // =========================================================================
  // RENDER: PROJECTOR WINDOWS
  // =========================================================================
  if (isProjector) {
    return (
      <div className={`w-screen h-screen bg-black overflow-hidden relative ${isProjectorReady ? 'cursor-none' : ''}`}>
        <style>{` body { margin: 0; overflow: hidden; background: black; } `}</style>

        {!isProjectorReady && (
          <div 
            className="absolute inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-gray-500 cursor-pointer hover:text-white transition-colors"
            onClick={() => setIsProjectorReady(true)}
          >
            <MonitorUp className="w-16 h-16 mb-4 opacity-50 animate-pulse" />
            <h2 className="text-2xl font-bold tracking-widest uppercase">Projector Output Standby</h2>
            <p className="mt-2 text-sm">Click anywhere on this screen to initialize media engine</p>
          </div>
        )}

        <div className="hidden">
          {cues.map(cue => (
            <Fragment key={`media-group-proj-${cue.id}`}>
              {cue.type === 'camera' && <CameraMasterPlayer cue={cue} isPaused={isPaused && (!cue.lockedBy || globalPause)} />}
              {cue.type === 'text' && <TextMasterPlayer cue={cue} />}
              {cue.type === 'timer' && <TimerMasterPlayer cue={cue} fadeStateTrackers={fadeStateTrackers} />}
              {cue.type === 'video' && <video id={`master-vid-${cue.id}`} src={cue.url} loop={cue.loop} muted crossOrigin="anonymous" onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" playsInline />}
              {cue.type === 'audio' && <audio id={`master-aud-${cue.id}`} src={cue.url} loop={cue.loop} muted onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" />}
              {cue.type === 'image' && <img id={`master-img-${cue.id}`} src={cue.url} crossOrigin="anonymous" alt="" className="hidden" />}
              {cue.chromaKeyEnabled && <ChromaKeyFilter cue={cue} />}
              {cue.maskEnabled && cue.maskDataUrl && <img id={`master-mask-${cue.id}`} src={cue.maskDataUrl} alt="mask" className="hidden" crossOrigin="anonymous" />}
            </Fragment>
          ))}
        </div>
        
        {pins.length === (gridSize.x + 1) * (gridSize.y + 1) && quads.map((quad, qIdx) => {
          const pt_tl = { x: pins[quad.indices[0]].x * stageSize.w, y: pins[quad.indices[0]].y * stageSize.h };
          const pt_tr = { x: pins[quad.indices[1]].x * stageSize.w, y: pins[quad.indices[1]].y * stageSize.h };
          const pt_br = { x: pins[quad.indices[2]].x * stageSize.w, y: pins[quad.indices[2]].y * stageSize.h };
          const pt_bl = { x: pins[quad.indices[3]].x * stageSize.w, y: pins[quad.indices[3]].y * stageSize.h };
          return (
            <Fragment key={`quad-proj-${qIdx}`}>
              <canvas id={`quad-ctx-proj-${qIdx}-1`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: getAffineTransform(quadW, quadH, pt_tl, pt_tr, pt_bl, 1), clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
              <canvas id={`quad-ctx-proj-${qIdx}-2`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: getAffineTransform(quadW, quadH, pt_tr, pt_br, pt_bl, 2), clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
            </Fragment>
          );
        })}
      </div>
    );
  }

  // =========================================================================
  // RENDER: MAIN CONTROL INTERFACE
  // =========================================================================
  if (isReceiver) {
    return <DedicatedReceiver url={receiverUrl} />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-600 relative">
      <style>{` @keyframes meter { 0% { transform: scaleY(0.2); } 100% { transform: scaleY(1); } } `}</style>

      <datalist id="url-history">
        {urlHistory.map((h, i) => <option key={i} value={h} />)}
      </datalist>
      <div className="hidden">
        {cues.map(cue => (
          <Fragment key={`media-group-${cue.id}`}>
            {cue.type === 'camera' && <CameraMasterPlayer cue={cue} isPaused={isPaused && !cue.lockedBy} />}
            {cue.type === 'text' && <TextMasterPlayer cue={cue} />}
            {cue.type === 'timer' && <TimerMasterPlayer cue={cue} fadeStateTrackers={fadeStateTrackers} />}
            {cue.type === 'video' && <video id={`master-vid-${cue.id}`} src={cue.url} loop={cue.loop} muted crossOrigin="anonymous" onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" playsInline />}
            {cue.type === 'audio' && <audio id={`master-aud-${cue.id}`} src={cue.url} loop={cue.loop} muted onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" />}
            {cue.type === 'image' && <img id={`master-img-${cue.id}`} src={cue.url} crossOrigin="anonymous" alt="" className="hidden" />}
            {cue.chromaKeyEnabled && <ChromaKeyFilter cue={cue} />}
            {cue.maskEnabled && cue.maskDataUrl && <img id={`master-mask-${cue.id}`} src={cue.maskDataUrl} alt="mask" className="hidden" crossOrigin="anonymous" />}
          </Fragment>
        ))}
      </div>

      {editingMaskCueId && ( <MaskEditorOverlay cue={cues.find(c => c.id === editingMaskCueId)} onClose={() => setEditingMaskCueId(null)} onSave={(dataUrl) => { setCues(prev => prev.map(c => c.id === editingMaskCueId ? { ...c, maskDataUrl: dataUrl, maskEnabled: dataUrl !== '' } : c)); setEditingMaskCueId(null); }} /> )}
      {editingWarpCueId && ( <WarpEditorOverlay cue={cues.find(c => c.id === editingWarpCueId)} onClose={() => setEditingWarpCueId(null)} onSave={(pins) => { setCues(prev => prev.map(c => c.id === editingWarpCueId ? { ...c, warpPins: pins, warpEnabled: true } : c)); setEditingWarpCueId(null); }} /> )}
      {editingPathCueId && ( <PathEditorOverlay cue={cues.find(c => c.id === editingPathCueId)} onClose={() => setEditingPathCueId(null)} onSave={(svgPath) => { setCues(prev => prev.map(c => c.id === editingPathCueId ? { ...c, animPathSvg: svgPath } : c)); setEditingPathCueId(null); }} /> )}

      {/* BACKBUILD COMPATIBILITY LAYER / MIGRATOR DIALOGUE BOX */}
      {pendingLoadState && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-gray-900 border-2 border-yellow-600 p-6 rounded-lg shadow-2xl max-w-md w-full">
            <div className="flex items-center gap-3 text-yellow-500 mb-3">
              <AlertCircle className="w-6 h-6 shrink-0 animate-pulse" />
              <h3 className="text-lg font-bold text-white">Legacy Show File Detected</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">
              This <span className="font-mono text-yellow-400">.TSW</span> workspace was built on an older engine structure. 
            </p>
            <p className="text-xs text-gray-400 leading-relaxed bg-black/40 p-2.5 rounded border border-gray-800 mb-6">
              TuxShow will automatically convert your old <span className="text-gray-300 font-semibold">Fades & Advancements</span> into the new independent <span className="text-blue-400 font-semibold">Fade In / Out</span> properties and universal timing parameters in memory.
            </p>
            <div className="flex justify-end gap-3 border-t border-gray-800 pt-4">
              <button onClick={cancelMigration} className="px-4 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white text-xs font-semibold transition-colors">Abort Load</button>
              <button onClick={confirmMigration} className="px-4 py-2 rounded bg-yellow-600 text-white hover:bg-yellow-500 text-xs font-bold shadow-lg shadow-yellow-900/20 transition-colors">Migrate & Open Workspace</button>
            </div>
          </div>
        </div>
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
                  setWorkspaceName('Untitled Workspace');
                  setShowNewModal(false);
              }} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500 text-sm font-semibold transition-colors">Clear Workspace</button>
            </div>
          </div>
        </div>
      )}

  {showAboutModal && (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 p-8 rounded shadow-2xl max-w-sm w-full text-center">
        <div className="w-20 h-20 bg-gray-800 rounded-xl mx-auto mb-4 flex items-center justify-center border border-gray-700">
           <span className="text-3xl font-black text-blue-500">T</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">TuxShow</h2>
        <p className="text-xs text-gray-500 font-mono mb-6">Version 1.3.0</p>
        <p className="text-sm text-gray-300 mb-6 italic">"Designed by Christopher Baker with AI assistance"</p>
        
        <div className="text-[10px] text-gray-500 border-t border-gray-800 pt-4 text-left">
          <h4 className="font-bold text-gray-400 uppercase tracking-wider mb-2">Acknowledgments</h4>
          <p className="mb-2">With deepest gratitude for years of support, knowledge, and friendship:</p>
          <p className="text-gray-300 font-semibold mb-2">Shawna, Madysun, JD, and little Charley (welcome to the world!)</p>
          <p className="mb-1">And to my mentors for their guidance:</p>
          <p className="text-gray-300 mb-4">Tony, Jeff, Mark, Leon, and Squeek!</p>
          
          <h4 className="font-bold text-gray-400 uppercase tracking-wider mb-1">Licensing (MIT)</h4>
          <div className="bg-black/40 p-2 rounded border border-gray-800 h-24 overflow-y-auto text-[9px] font-mono text-gray-400 mb-4">
            Copyright (c) 2026 Christopher Earl Baker<br/><br/>
            Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:<br/><br/>
            The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
          </div>
        </div>
        <button onClick={() => setShowAboutModal(false)} className="mt-2 px-6 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm font-bold transition-colors w-full">Close</button>
      </div>
    </div>
  )}

      {/* PACK WORKSPACE MODAL */}
      {showPackModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 p-6 rounded shadow-2xl max-w-lg w-full">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Archive className="w-5 h-5 text-blue-500" /> Pack Workspace</h3>
            <p className="text-sm text-gray-400 mb-4">Bundle all media files and the show file into a single portable folder.</p>
            
            <label className="block text-xs text-gray-500 mb-1">Destination Folder (Absolute Path)</label>
            <div className="flex gap-2 mb-1">
                <input 
                  type="text" 
                  value={packPath} 
                  onChange={(e) => setPackPath(e.target.value)} 
                  className="flex-1 bg-gray-950 border border-gray-700 focus:border-blue-500 rounded px-3 py-2 text-sm text-gray-200 outline-none font-mono" 
                  placeholder="/home/user/Desktop/MyPackedShow" 
                />
                <button onClick={() => packDirInputRef.current?.click()} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-4 py-2 text-sm font-semibold text-gray-300 transition-colors">Browse</button>
                <input type="file" webkitdirectory="true" directory="true" ref={packDirInputRef} className="hidden" onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        try {
                            const path = window.require('path');
                            setPackPath(path.dirname(e.target.files[0].path));
                        } catch(err) {
                            setPackPath(e.target.files[0].path);
                        }
                    }
                }} />
            </div>
            <p className="text-[10px] text-gray-600 mb-4 italic">* If using Browse, select a folder that contains at least 1 file to bypass Chromium restrictions.</p>
            
            {packProgress && <div className="text-xs text-blue-400 font-mono mb-4 bg-gray-950 p-2 rounded border border-blue-900/30 truncate">{packProgress}</div>}

            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowPackModal(false); setPackProgress(''); }} disabled={isPacking} className="px-4 py-2 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm font-semibold disabled:opacity-50">Cancel</button>
              <button onClick={handlePackWorkspace} disabled={isPacking || !packPath} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm font-bold shadow-lg disabled:opacity-50 flex items-center gap-2">
                 {isPacking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} {isPacking ? 'Packing...' : 'Pack Show'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR CODE MODAL */}
      {showQrModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 p-6 rounded shadow-2xl max-w-4xl w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><QrCode className="w-5 h-5 text-blue-500" /> Network PWA Links</h3>
              <button onClick={() => setShowQrModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {virtualDisplayConfig.enabled ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {/* Live Script Block */}
                 <div className="flex flex-col items-center bg-gray-950 p-4 rounded border border-gray-800">
                   <Type className="w-8 h-8 text-blue-500 mb-3" />
                   <h4 className="font-bold text-gray-200 mb-4 text-sm text-center">Live Script</h4>
                   <div className="bg-white p-2 rounded mb-4">
                     <QRCodeSVG value={`https://${localIp}:${virtualDisplayConfig.port}/cuelist`} size={140} />
                   </div>
                   <span className="text-[10px] text-gray-500 font-mono text-center break-all">https://{localIp}:{virtualDisplayConfig.port}/cuelist</span>
                 </div>
                 <div className="flex flex-col items-center bg-gray-950 p-4 rounded border border-gray-800">
                   <LayoutGrid className="w-8 h-8 text-emerald-500 mb-3" />
                   <h4 className="font-bold text-gray-200 mb-4 text-sm text-center">Stage Manager Deck</h4>
                   <div className="bg-white p-2 rounded mb-4">
                     <QRCodeSVG value={`https://${localIp}:${virtualDisplayConfig.port}/deck`} size={140} />
                   </div>
                   <span className="text-[10px] text-gray-500 font-mono text-center break-all">https://{localIp}:{virtualDisplayConfig.port}/deck</span>
                 </div>
                 <div className="flex flex-col items-center bg-gray-950 p-4 rounded border border-gray-800">
                   <Gamepad2 className="w-8 h-8 text-yellow-500 mb-3" />
                   <h4 className="font-bold text-gray-200 mb-4 text-sm text-center">Game Show Buzzer</h4>
                   <div className="bg-white p-2 rounded mb-4">
                     <QRCodeSVG value={`https://${localIp}:${virtualDisplayConfig.port}/buzzer`} size={140} />
                   </div>
                   <span className="text-[10px] text-gray-500 font-mono text-center break-all">https://{localIp}:{virtualDisplayConfig.port}/buzzer</span>
                 </div>
                 <div className="flex flex-col items-center bg-gray-950 p-4 rounded border border-gray-800">
                   <Smartphone className="w-8 h-8 text-pink-500 mb-3" />
                   <h4 className="font-bold text-gray-200 mb-4 text-sm text-center">Mobile Camera</h4>
                   <div className="bg-white p-2 rounded mb-4">
                     <QRCodeSVG value={`https://${localIp}:${virtualDisplayConfig.port}/camera`} size={140} />
                   </div>
                   <span className="text-[10px] text-gray-500 font-mono text-center break-all">https://{localIp}:{virtualDisplayConfig.port}/camera</span>
                 </div>
                 <div className="flex flex-col items-center bg-gray-950 p-4 rounded border border-gray-800">
                   <MonitorPlay className="w-8 h-8 text-blue-500 mb-3" />
                   <h4 className="font-bold text-gray-200 mb-4 text-sm text-center">WebRTC Viewer</h4>
                   <div className="bg-white p-2 rounded mb-4">
                     <QRCodeSVG value={`https://${localIp}:${virtualDisplayConfig.port}${virtualDisplayConfig.path}`} size={140} />
                   </div>
                   <span className="text-[10px] text-gray-500 font-mono text-center break-all">https://{localIp}:{virtualDisplayConfig.port}{virtualDisplayConfig.path}</span>
                 </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                 <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                 <p>Virtual HTTP Display is currently disabled.</p>
                 <p className="text-sm mt-2">Enable it in System Settings to access the network PWAs.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 p-6 rounded shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Settings className="w-5 h-5 text-blue-500" /> System Settings</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1">
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 pb-1">Video Output Routing</h4>
                <div className="bg-gray-950 p-3 rounded border border-gray-800 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {hardwareDisplays.length === 0 ? ( <div className="text-xs text-gray-500 italic">No hardware API found.</div> ) : (
                    hardwareDisplays.map(display => (
                      <label key={display.id} className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer hover:bg-gray-900 p-1.5 rounded transition-colors">
                        <input type="checkbox" checked={selectedDisplays.includes(display.id)} onChange={(e) => { if (e.target.checked) setSelectedDisplays(prev => [...prev, display.id]); else setSelectedDisplays(prev => prev.filter(id => id !== display.id)); }} className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-blue-500 accent-blue-500 cursor-pointer" />
                        <span className="flex-1 truncate">{display.label} {display.isPrimary && <span className="text-[10px] text-gray-500 ml-1">(Primary)</span>}</span>
                      </label>
                    ))
                  )}
                </div>

              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 pb-1 mt-4">Audio Output Routing</h4>
              <div className="bg-gray-950 p-3 rounded border border-gray-800 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Master Audio Device:</label>
                  <select value={audioOutputDeviceId} onChange={(e) => setAudioOutputDeviceId(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 outline-none">
                    <option value="default">Default System Audio</option>
                    {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0,5)}...)`}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
                  <input type="checkbox" checked={enableLocalAudio} onChange={(e) => setEnableLocalAudio(e.target.checked)} className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-blue-500 accent-blue-500 cursor-pointer" />
                  <span>Enable Local Audio Playback <span className="text-[10px] text-gray-500 ml-1">(Build Mode)</span></span>
                </label>
              </div>

                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 pb-1 mt-4">Virtual WebRTC Output Stream</h4>
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <label className="flex items-center gap-3 text-sm font-bold text-pink-400 mb-2 cursor-pointer">
                    <input type="checkbox" checked={virtualDisplayConfig.enabled} onChange={(e) => setVirtualDisplayConfig(prev => ({...prev, enabled: e.target.checked}))} className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-pink-500 accent-pink-500 cursor-pointer" /> Enable WebRTC Output Stream
                  </label>
                  <div className="flex items-center gap-4 pl-7 mb-2">
                    <label className="text-xs text-gray-400">Port:</label>
                    <input 
                      type="number" 
                      value={virtualDisplayConfig.port} 
                      disabled={!virtualDisplayConfig.enabled} 
                      onChange={(e) => setVirtualDisplayConfig(prev => ({...prev, port: parseInt(e.target.value) || 8554}))} 
                      className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 disabled:opacity-50 outline-none focus:border-pink-500" 
                    />
                  </div>
                  <div className="flex items-center gap-4 pl-7">
                    <label className="text-xs text-gray-400">Path:</label>
                    <input 
                      type="text" 
                      value={virtualDisplayConfig.path} 
                      disabled={!virtualDisplayConfig.enabled} 
                      onChange={(e) => setVirtualDisplayConfig(prev => ({...prev, path: e.target.value}))} 
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 disabled:opacity-50 outline-none focus:border-pink-500" 
                      placeholder="/display1" 
                    />
                  </div>
                </div>

                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 pb-1 mt-4">Dedicated Receiver Mode</h4>
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <label className="flex items-center gap-3 text-sm font-bold text-indigo-400 mb-2 cursor-pointer">
                    <input type="checkbox" checked={receiverConfig.enabled} onChange={(e) => {
                       const enabled = e.target.checked;
                       setReceiverConfig(prev => ({...prev, enabled}));
                       if (enabled) {
                           try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('spawn-receiver', { displayId: receiverConfig.displayId, url: receiverConfig.url }); } catch(err) {}
                       }
                    }} className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-indigo-500 accent-indigo-500 cursor-pointer" /> Enable Dedicated Receiver Mode
                  </label>
                  <div className="flex items-center gap-4 pl-7 mb-2">
                    <label className="text-xs text-gray-400">Stream URL:</label>
                    <input list="url-history" type="text" value={receiverConfig.url} onChange={(e) => setReceiverConfig(prev => ({...prev, url: e.target.value}))} onBlur={(e) => handleUrlBlur(e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-indigo-500" placeholder="webrtc://192.168.0.191:8554/display1" />
                  </div>
                  <div className="flex items-center gap-4 pl-7">
                    <label className="text-xs text-gray-400">Display:</label>
                    <select value={receiverConfig.displayId} onChange={(e) => setReceiverConfig(prev => ({...prev, displayId: e.target.value}))} className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-indigo-500">
                      <option value="primary">Primary Display</option>
                      {hardwareDisplays.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 pb-1">Hardware & Network I/O</h4>
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <label className="flex items-center gap-3 text-sm font-bold text-cyan-400 mb-2 cursor-pointer">
                    <input type="checkbox" checked={ioConfig.oscInput} onChange={(e) => setIoConfig(prev => ({...prev, oscInput: e.target.checked}))} className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-cyan-500 accent-cyan-500 cursor-pointer" /> Enable OSC Listener
                  </label>
                  <div className="flex items-center gap-4 pl-7">
                    <label className="text-xs text-gray-400">Incoming Port:</label>
                    <input type="number" value={ioConfig.oscPort} disabled={!ioConfig.oscInput} onChange={(e) => setIoConfig(prev => ({...prev, oscPort: parseInt(e.target.value) || 53000}))} className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 disabled:opacity-50 outline-none focus:border-cyan-500" />
                  </div>
                </div>
                <div className="bg-gray-950 p-3 rounded border border-gray-800">
                  <label className="flex items-center gap-3 text-sm font-bold text-purple-400 mb-2 cursor-pointer">
                    <input type="checkbox" checked={ioConfig.mscInput} onChange={(e) => setIoConfig(prev => ({...prev, mscInput: e.target.checked}))} className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-purple-500 accent-purple-500 cursor-pointer" /> Enable MSC (MIDI)
                  </label>
                  <div className="flex items-center gap-4 pl-7">
                    <label className="text-xs text-gray-400">Device Name/ID:</label>
                    <input type="text" value={ioConfig.mscDevice} disabled={!ioConfig.mscInput} onChange={(e) => setIoConfig(prev => ({...prev, mscDevice: e.target.value}))} className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 disabled:opacity-50 outline-none focus:border-purple-500" placeholder="e.g. 0 or 'Launchpad'" />
                  </div>
                </div>

                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 pb-1 mt-4">Stream Deck Config</h4>
                <div className="bg-gray-950 p-3 rounded border border-gray-800 space-y-3">
                  <div className="max-h-60 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {deckConfig.buttons.map((btn, idx) => (
                      <div key={idx} className="bg-gray-900 border border-gray-700 p-2 rounded relative group">
                         <button onClick={() => setDeckConfig(prev => ({ buttons: prev.buttons.filter((_, i) => i !== idx) }))} className="absolute top-2 right-2 text-gray-500 hover:text-red-500 hidden group-hover:block"><X className="w-3 h-3" /></button>
                         <div className="grid grid-cols-2 gap-2 mb-2">
                            <div>
                              <label className="block text-[9px] text-gray-500 uppercase">Label</label>
                              <input type="text" value={btn.label} onChange={(e) => setDeckConfig(prev => { const n = [...prev.buttons]; n[idx].label = e.target.value; return {buttons:n}; })} className="w-full bg-black border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 outline-none focus:border-blue-500" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-gray-500 uppercase">OSC Path</label>
                              <input type="text" value={btn.oscPath} onChange={(e) => setDeckConfig(prev => { const n = [...prev.buttons]; n[idx].oscPath = e.target.value; return {buttons:n}; })} className="w-full bg-black border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 outline-none focus:border-blue-500 font-mono" />
                            </div>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[9px] text-gray-500 uppercase">OSC Args</label>
                              <input type="text" value={btn.oscArgs || ''} onChange={(e) => setDeckConfig(prev => { const n = [...prev.buttons]; n[idx].oscArgs = e.target.value; return {buttons:n}; })} className="w-full bg-black border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 outline-none focus:border-blue-500 font-mono" />
                            </div>
                            <div>
                              <label className="block text-[9px] text-gray-500 uppercase">Color</label>
                              <div className="flex mt-0.5">
                                 <input type="color" value={btn.color || '#1f2937'} onChange={(e) => setDeckConfig(prev => { const n = [...prev.buttons]; n[idx].color = e.target.value; return {buttons:n}; })} className="w-6 h-6 p-0 border-none bg-transparent cursor-pointer" />
                                 <button onClick={() => setDeckConfig(prev => { const n = [...prev.buttons]; delete n[idx].color; return {buttons:n}; })} className="text-[9px] text-gray-500 ml-2 hover:text-gray-300">Clear</button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-[9px] text-gray-500 uppercase">Icon</label>
                              <select value={btn.icon || ''} onChange={(e) => setDeckConfig(prev => { const n = [...prev.buttons]; n[idx].icon = e.target.value; return {buttons:n}; })} className="w-full bg-black border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 outline-none focus:border-blue-500">
                                 <option value="">None</option>
                                 <option value="play">Play</option><option value="square">Square</option><option value="pause">Pause</option><option value="play-circle">Play Circle</option><option value="skip-back">Skip Back</option><option value="skip-forward">Skip Forward</option><option value="image">Image</option><option value="clock">Clock</option>
                              </select>
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setDeckConfig(prev => ({ buttons: [...prev.buttons, { label: 'NEW', oscPath: '/tuxshow/go', oscArgs: '', color: '', icon: '' }] }))} className="w-full py-1.5 rounded border border-gray-700 hover:bg-gray-800 text-xs font-semibold text-gray-400 transition-colors flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add Button</button>
                </div>
              </div>
            </div>

      <div className="flex justify-between items-center w-full mt-6 pt-4 border-t border-gray-800 shrink-0">
        <button onClick={() => { setShowSettingsModal(false); setShowAboutModal(true); }} className="px-4 py-2 rounded bg-gray-800 text-gray-400 hover:text-white text-sm font-semibold transition-colors">About</button>
        <button onClick={() => setShowSettingsModal(false)} className="px-5 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm font-bold shadow-lg transition-colors">Done</button>
      </div>
          </div>
        </div>
      )}

      <Header 
        setShowSettingsModal={setShowSettingsModal} gpuStatus={gpuStatus} setShowNewModal={setShowNewModal} 
        fileInputRef={fileInputRef} folderInputRef={folderInputRef} handleSaveShow={handleSaveShow} 
        handleLoadShow={handleLoadShow} handleAddFolder={handleAddFolder} selectedCueIds={selectedCueIds} 
        cues={cues} isMappingMode={isMappingMode} setIsMappingMode={setIsMappingMode} 
        handleResetPins={handleResetPins} gridSize={gridSize} setGridSize={setGridSize} 
        setPins={setPins} showStats={showStats} setShowStats={setShowStats} 
        projectorActive={projectorActive} toggleProjectorWindow={toggleProjectorWindow}
        setShowPackModal={setShowPackModal}
        handleUndo={handleUndo} handleRedo={handleRedo}
        showInspector={showInspector} setShowInspector={setShowInspector}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <div className="absolute top-2 left-3 z-[60] flex bg-gray-950 border border-gray-700 rounded overflow-hidden shadow-lg">
           <button onClick={() => setViewMode('list')} className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>List View</button>
           <button onClick={() => setViewMode('timeline')} className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors flex items-center gap-1 ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}><Clock className="w-3 h-3"/> Timeline</button>
        </div>

        <div style={{ width: leftPanelWidth }} className="flex flex-col shrink-0 min-w-[350px] z-50">
          {viewMode === 'list' ? (
            <CueList 
              autoScroll={autoScroll} setAutoScroll={setAutoScroll}
              cues={cues} setCues={setCues} selectedCueIds={selectedCueIds} setSelectedCueIds={setSelectedCueIds} 
              lastSelectedId={lastSelectedId} setLastSelectedId={setLastSelectedId} getNativeFilePath={getNativeFilePath} folderInputRef={folderInputRef} 
              isVisible={isVisible} getIndent={getIndent} handleCueClick={handleCueClick} 
              mediaTimes={mediaTimes} isPaused={isPaused} setIsPaused={setIsPaused} globalPause={globalPause} setGlobalPause={setGlobalPause} stopCue={stopCue} 
              handleGo={handleGo} handleStopAll={handleStopAll} handleRenumberCues={handleRenumberCues}
              clipboardCues={clipboardCues} setClipboardCues={setClipboardCues}
              isRecording={isRecording} toggleRecording={toggleRecording}
            />
          ) : (
            <div className="h-full w-full flex flex-col border-r border-gray-800 bg-gray-950">
               <TimelineView 
                 cues={cues} 
                 selectedCueIds={selectedCueIds} 
                 setSelectedCueIds={setSelectedCueIds}
                 setLastSelectedId={setLastSelectedId}
                 scrollCueIntoView={scrollCueIntoView}
               />
               <div className="p-4 bg-gray-950 border-t border-gray-800 flex gap-2 shrink-0">
                 <button onClick={handleGo} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded shadow-lg shadow-green-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2 text-xl tracking-widest"><Play className="w-6 h-6 fill-current" /> GO</button>
                 <button onClick={() => { setIsPaused(!isPaused); setGlobalPause(!isPaused); }} className={`px-5 font-bold rounded active:scale-95 transition-colors flex items-center justify-center gap-1 ${isPaused ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-gray-800 text-yellow-500'}`}><Pause className={`w-6 h-6 ${isPaused ? 'fill-current' : ''}`} /></button>
                 <button onClick={handleStopAll} className="px-5 bg-red-900 hover:bg-red-800 text-red-200 font-bold rounded active:scale-95 transition-transform flex flex-col items-center justify-center gap-1"><AlertCircle className="w-6 h-6" /></button>
                 <button onClick={toggleRecording} className={`px-4 font-bold rounded flex items-center justify-center gap-2 transition-colors ${isRecording ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                   <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`} />
                   {isRecording ? 'REC' : 'Record'}
                 </button>
               </div>
            </div>
          )}
        </div>

        {/* Drag Handle */}
        <div 
           className="w-1 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 shrink-0 z-[70] transition-colors relative -ml-1"
           onPointerDown={(e) => {
              e.target.setPointerCapture(e.pointerId);
              const startX = e.clientX;
              const startWidth = leftPanelWidth;
              const onMove = (moveEvt) => {
                 setLeftPanelWidth(Math.max(350, Math.min(window.innerWidth * 0.7, startWidth + (moveEvt.clientX - startX))));
              };
              const onUp = () => {
                 e.target.releasePointerCapture(e.pointerId);
                 window.removeEventListener('pointermove', onMove);
                 window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
           }}
        >
           <div className="absolute inset-y-0 -inset-x-2" />
        </div>

        <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
          <StagePreview 
            stageRef={stageRef} activeMediaCues={activeMediaCues} pins={pins} gridSize={gridSize} 
            stageSize={stageSize} quadW={quadW} quadH={quadH} isMappingMode={isMappingMode} 
            handlePinDrag={handlePinDrag} showStats={showStats} isRecording={isRecording}
          />
        </div>
        
        {showInspector && (
          <Inspector 
            cues={cues} setCues={setCues} selectedCueIds={selectedCueIds} activeCues={activeCues} 
            isMixed={isMixed} getSharedVal={getSharedVal} updateSelectedCues={updateSelectedCues} 
            getNativeFilePath={getNativeFilePath} videoDevices={videoDevices} hardwareDisplays={hardwareDisplays} urlHistory={urlHistory}
            setEditingMaskCueId={setEditingMaskCueId} setEditingWarpCueId={setEditingWarpCueId} handleUrlBlur={handleUrlBlur} setEditingPathCueId={setEditingPathCueId}
            mediaTimes={mediaTimes} setShowInspector={setShowInspector}
          />
        )}
      </div>

      <StatusBar localIp={localIp} virtualDisplayConfig={virtualDisplayConfig} ioConfig={ioConfig} setShowQrModal={setShowQrModal} masterVolumeUI={masterVolumeUI} handleMasterVolumeSlider={handleMasterVolumeSlider} />
    </div>
  );
}
