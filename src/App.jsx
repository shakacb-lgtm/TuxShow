import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { 
  Play, Square, Video, Music, ChevronRight, ChevronDown, Plus, Trash2, 
  ArrowRight, Layers, StopCircle, GripVertical, Image as ImageIcon, FolderOpen, 
  Folder, Camera, Moon, PauseCircle, Search, Repeat, CalendarClock, Type, 
  Settings2, Wifi, CornerDownRight, FolderPlus, AlertCircle, AlertTriangle, Pause, Hash, 
  Settings, FilePlus, Save, RotateCcw, Grid3X3, Activity, Crosshair, 
  MonitorDown, MonitorUp, Edit3, Crop, Wand2, XSquare, Bold, Italic, Cast, 
  X, Check, Archive, RefreshCw, Maximize, Move, GitBranch, Hourglass, 
  Palette, SlidersHorizontal, Ear, QrCode, Smartphone, LayoutGrid, MonitorPlay, Gamepad2, Clock,
  Undo, Redo, Key, Lock, Unlock, Ban, Database, Cpu
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import PluginManagerModal from './PluginManagerModal';
import { ErrorBoundary } from '../ErrorBoundary.jsx';
import '../pluginRegistry.js';
import TimelineView from './TimelineView.jsx';
import Inspector from './InspectorPanel.jsx';
import StagePreview, { getAffineTransform, applyCanvasAffine } from './StagePreview.jsx';
import CueList from './CueList.jsx';
import { glslEngine } from './glslFilterEngine.js';
import { SystemProfiler } from './systemProfiler.js';

window.React = React;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const formatTime = (timeInSeconds) => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return "00:00";
  const m = Math.floor(timeInSeconds / 60);
  const s = Math.floor(timeInSeconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const getNativeFilePath = (file) => {
  try {
    const { webUtils } = window.require('electron');
    const nativePath = webUtils.getPathForFile(file);
    if (nativePath) return `file://${nativePath.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  } catch (e) {}
  return file.path ? `file://${file.path.replace(/#/g, '%23').replace(/\?/g, '%3F')}` : URL.createObjectURL(file);
};

// ============================================================================
// MASTER CANVAS GRAPHICS DRAW HELPER (OPTIMIZED)
// ============================================================================
const drawCueToCtx = (ctx, imageToDraw, cue, sx, sy, sw, sh, dx, dy, dw, dh) => {
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

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

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

  return <video id={`master-cam-${cue.id}`} ref={videoRef} autoPlay playsInline muted className="hidden" onError={(e) => console.error(`[CameraLoader] Failed to load camera feed for cue ${cue.id}`, e)} />;
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

const CustomShaderFilter = React.memo(({ cue }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
     if (!gl) return;

     const compileShader = (type, source) => {
       const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); 
       if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
       return s;
     };

     const vs = `attribute vec2 p; varying vec2 v; void main(){ gl_Position=vec4(p,0,1); v=vec2((p.x+1.0)/2.0, 1.0-(p.y+1.0)/2.0); }`;
     let fs = '';

     if (cue.shaderId === 'blur') {
         fs = `precision mediump float; varying vec2 v; uniform sampler2D t; uniform vec2 res; uniform float r;
         void main() {
             vec4 c = vec4(0.0); vec2 off = r / res;
             c += texture2D(t, v + vec2(-off.x, -off.y)) * 0.0625; c += texture2D(t, v + vec2(0.0, -off.y)) * 0.125; c += texture2D(t, v + vec2(off.x, -off.y)) * 0.0625;
             c += texture2D(t, v + vec2(-off.x, 0.0)) * 0.125;    c += texture2D(t, v) * 0.25;                      c += texture2D(t, v + vec2(off.x, 0.0)) * 0.125;
             c += texture2D(t, v + vec2(-off.x, off.y)) * 0.0625;  c += texture2D(t, v + vec2(0.0, off.y)) * 0.125;  c += texture2D(t, v + vec2(off.x, off.y)) * 0.0625;
             gl_FragColor = c;
         }`;
     } else if (cue.shaderId === 'noise') {
         fs = `precision mediump float; varying vec2 v; uniform sampler2D t; uniform float time; uniform float intensity;
         float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
         void main() {
             vec4 c = texture2D(t, v); float noise = (rand(v * time) - 0.5) * intensity; gl_FragColor = vec4(c.rgb + noise, c.a);
         }`;
     } else if (cue.shaderId === 'edge') {
         fs = `precision mediump float; varying vec2 v; uniform sampler2D t; uniform vec2 res;
         void main() {
             vec2 texel = 1.0 / res; float x = 0.0; float y = 0.0;
             x += texture2D(t, v + vec2(-texel.x, -texel.y)).r * -1.0; x += texture2D(t, v + vec2(-texel.x,  0.0)).r * -2.0; x += texture2D(t, v + vec2(-texel.x,  texel.y)).r * -1.0;
             x += texture2D(t, v + vec2( texel.x, -texel.y)).r * 1.0;  x += texture2D(t, v + vec2( texel.x,  0.0)).r * 2.0;  x += texture2D(t, v + vec2( texel.x,  texel.y)).r * 1.0;
             y += texture2D(t, v + vec2(-texel.x, -texel.y)).r * -1.0; y += texture2D(t, v + vec2( 0.0,    -texel.y)).r * -2.0; y += texture2D(t, v + vec2( texel.x, -texel.y)).r * -1.0;
             y += texture2D(t, v + vec2(-texel.x,  texel.y)).r * 1.0;  y += texture2D(t, v + vec2( 0.0,     texel.y)).r * 2.0;  y += texture2D(t, v + vec2( texel.x,  texel.y)).r * 1.0;
             float edge = sqrt(x*x + y*y); gl_FragColor = vec4(vec3(edge), texture2D(t, v).a);
         }`;
     } else return;

     const prog = gl.createProgram();
     gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vs));
     gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fs));
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

     let animId;
     const render = () => {
        const src = document.getElementById(`master-${cue.type === 'image' ? 'img' : (cue.type === 'camera' ? 'cam' : 'vid')}-${cue.id}`);
        if (src && ((src.videoWidth && src.readyState >= 2) || src.complete)) {
           const w = src.videoWidth || src.naturalWidth || 1920; const h = src.videoHeight || src.naturalHeight || 1080;
           if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
           gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(prog);
           
           if (cue.shaderId === 'blur') { gl.uniform2f(gl.getUniformLocation(prog, "res"), w, h); gl.uniform1f(gl.getUniformLocation(prog, "r"), cue.shaderBlurRadius !== undefined ? cue.shaderBlurRadius : 5.0); } 
           else if (cue.shaderId === 'noise') { const speed = cue.shaderNoiseSpeed !== undefined ? cue.shaderNoiseSpeed : 1.0; const t = (performance.now() % 100000) / 1000.0 * speed; gl.uniform1f(gl.getUniformLocation(prog, "time"), t); gl.uniform1f(gl.getUniformLocation(prog, "intensity"), cue.shaderNoiseIntensity !== undefined ? cue.shaderNoiseIntensity : 0.5); } 
           else if (cue.shaderId === 'edge') { gl.uniform2f(gl.getUniformLocation(prog, "res"), w, h); }

           gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        animId = requestAnimationFrame(render);
     };
     render();
     return () => { cancelAnimationFrame(animId); if (gl) { gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog); } };
  }, [cue.id, cue.type, cue.shaderId, cue.shaderBlurRadius, cue.shaderNoiseIntensity, cue.shaderNoiseSpeed]);
  return <canvas id={`master-customshader-${cue.id}`} ref={canvasRef} className="hidden" />;
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

const SurtitleMasterPlayer = React.memo(({ cue }) => {
  const canvasRef = useRef(null);
  const lastIndexRef = useRef(-2);
  const transitionStartRef = useRef(0);
  const prevTextRef = useRef('');
  const currentTextRef = useRef('');

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = 1920; const h = 1080; 
    let animId;

    const render = () => {
      canvas.width = w; canvas.height = h; 
      ctx.clearRect(0, 0, w, h);

      const lines = cue.surtitleLines || [];
      const currentIndex = cue.currentLineIndex ?? -1;

      if (lastIndexRef.current !== currentIndex) {
        const oldText = lastIndexRef.current >= 0 && lastIndexRef.current < lines.length ? lines[lastIndexRef.current] : '';
        const newText = currentIndex >= 0 && currentIndex < lines.length ? lines[currentIndex] : '';
        prevTextRef.current = oldText;
        currentTextRef.current = newText;
        transitionStartRef.current = performance.now();
        lastIndexRef.current = currentIndex;
      }

      const durationMs = (cue.duration || 0.5) * 1000;
      const elapsed = performance.now() - transitionStartRef.current;
      const progress = durationMs > 0 ? Math.min(1, elapsed / durationMs) : 1;

      ctx.imageSmoothingEnabled = cue.textSmoothing !== false; 
      ctx.fillStyle = cue.textColor || '#ffffff';
      const align = cue.textAlign || 'center'; 
      ctx.textAlign = align; 
      ctx.textBaseline = 'middle';
      const fontSize = (cue.textScale || 100); 
      const weight = cue.fontWeight || 'bold'; 
      const style = cue.fontStyle || 'normal'; 
      const family = cue.fontFamily || 'sans-serif';
      ctx.font = `${style} ${weight} ${fontSize}px ${family}`;

      const drawTextBlock = (text, alpha) => {
        if (!text) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        if (cue.textShadowEnabled) {
          ctx.shadowColor = cue.textShadowColor || '#000000';
          ctx.shadowBlur = cue.textShadowBlur !== undefined ? cue.textShadowBlur : 15;
          ctx.shadowOffsetX = cue.textShadowOffsetX !== undefined ? cue.textShadowOffsetX : 5;
          ctx.shadowOffsetY = cue.textShadowOffsetY !== undefined ? cue.textShadowOffsetY : 5;
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        const splitLines = text.split('\n');
        const lineHeight = fontSize * 1.2;
        const totalHeight = lineHeight * splitLines.length;

        let startY = (h * (cue.textY !== undefined ? cue.textY : 85) / 100) - (totalHeight / 2) + (lineHeight / 2);
        let startX = (w * (cue.textX !== undefined ? cue.textX : 50) / 100);
        if (align === 'left') startX = (w * (cue.textX !== undefined ? cue.textX : 5) / 100);
        if (align === 'right') startX = (w * (cue.textX !== undefined ? cue.textX : 95) / 100);

        splitLines.forEach(lineStr => {
          ctx.fillText(lineStr, startX, startY);
          startY += lineHeight;
        });
        ctx.restore();
      };

      if (progress < 1 && prevTextRef.current) {
        drawTextBlock(prevTextRef.current, 1 - progress);
      }
      if (currentTextRef.current) {
        drawTextBlock(currentTextRef.current, progress);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [cue]);

  return <canvas id={`master-surtitle-${cue.id}`} ref={canvasRef} className="hidden" />;
});

const Header = React.memo(function Header({
  setShowSettingsModal, gpuStatus, setShowNewModal, fileInputRef, folderInputRef, 
  handleSaveShow, handleLoadShow, handleAddFolder, selectedCueIds, cues, 
  isMappingMode, setIsMappingMode, handleResetPins, gridSize, setGridSize, setPins, 
  showStats, setShowStats, projectorActive, toggleProjectorWindow, setShowPackModal,
  handleUndo, handleRedo, showInspector, setShowInspector,
  setIsPluginManagerOpen
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
        <button onClick={() => setIsPluginManagerOpen(true)} className="hover:scale-110 transition-transform duration-300 outline-none cursor-pointer p-1 rounded hover:bg-gray-800/50" title="Plugin Manager">
          <Cpu className="w-5 h-5 text-purple-500" />
        </button>
        <div className="flex flex-col">
          <h1 className="font-bold tracking-widest text-gray-200 leading-tight uppercase">
            TuxShow <span className="text-gray-500 font-normal tracking-normal text-sm ml-2 normal-case">Show Control <span className="text-[10px] font-mono text-blue-500 ml-1">v1.5.1</span></span>
          </h1>
          <span className="text-[9px] text-blue-400/80 font-mono tracking-widest uppercase mt-0.5">{String(gpuStatus)}</span>
        </div>

        <div className="flex items-center gap-1 border-l border-gray-800 pl-4 ml-2">
          <button onClick={() => setShowNewModal(true)} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><FilePlus className="w-3.5 h-3.5" /> New</button>
          <button onClick={handleLoadShow} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><FolderOpen className="w-3.5 h-3.5" /> Load</button>
          <button onClick={handleSaveShow} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"><Save className="w-3.5 h-3.5" /> Save</button>
          <button onClick={() => setShowPackModal(true)} className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-gray-800 rounded text-xs font-semibold text-gray-400 hover:text-blue-400 transition-colors"><Archive className="w-3.5 h-3.5" /> Pack</button>
          <div className="h-4 w-px bg-gray-800 mx-1"></div>
          <button onClick={handleUndo} title="Undo (Ctrl+Z)" className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"><Undo className="w-3.5 h-3.5" /></button>
          <button onClick={handleRedo} title="Redo (Ctrl+Shift+Z)" className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors"><Redo className="w-3.5 h-3.5" /></button>
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

const StatusBar = React.memo(function StatusBar({ localIp, virtualDisplayConfig, ioConfig, setShowQrModal, masterVolumeUI, handleMasterVolumeSlider, performanceTier, syncMode, syncActive }) {
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
        {performanceTier && (
            <div 
                title={
                    performanceTier === 'high' ? "High Performance: All features enabled (60fps UI, WebGL Shaders, Animations, Visualizers)" :
                    performanceTier === 'balanced' ? "Balanced Performance: Visualizers disabled, 30fps UI to conserve resources." :
                    "Basic Performance: Shaders, Animations, and Visualizers disabled. UI limited to 15fps to protect show output."
                }
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border cursor-help ${
                performanceTier === 'high' ? 'bg-green-900/30 text-green-400 border-green-800' :
                performanceTier === 'balanced' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800' :
                'bg-red-900/30 text-red-400 border-red-800'
            }`}>
                <Cpu className="w-3 h-3" />
                <span>{performanceTier} TIER</span>
            </div>
        )}

        {syncMode && syncMode !== 'standalone' && (
            <div 
                title={
                    syncMode === 'master' ? "Broadcasting state to backups" : 
                    syncActive ? "Successfully synchronized with Master" : "Disconnected: No heartbeat from Master"
                } 
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border cursor-help transition-colors duration-300 ${
                    syncMode === 'master' ? 'bg-blue-900/30 text-blue-400 border-blue-800' :
                    syncActive ? 'bg-green-900/30 text-green-400 border-green-800' :
                    'bg-red-900/30 text-red-400 border-red-800'
                }`}
            >
                {syncMode === 'master' ? (
                    <>
                        <Database className="w-3 h-3" />
                        <span>{syncMode}</span>
                    </>
                ) : syncActive ? (
                    <>
                        <Check className="w-3 h-3" />
                        <span>{syncMode}: Synced</span>
                    </>
                ) : (
                    <>
                        <X className="w-3 h-3 text-red-500" />
                        <span>{syncMode}: Offline</span>
                    </>
                )}
            </div>
        )}

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
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" onError={(e) => console.error(`[WebRTCLoader] Failed to load stream from ${url}`, e)} />
      
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

  const [performanceTier, setPerformanceTier] = useState('high');
  const [perfFlags, setPerfFlags] = useState({
      disableVisualizers: false,
      previewFps: 60,
      disableCssAnimations: false,
      disableShaders: false
  });
  const [customShaders, setCustomShaders] = useState({});
  const lastRenderTime = useRef(0);

  useEffect(() => {
      if (isProjector) {
          setPerformanceTier('high');
          setPerfFlags({ disableVisualizers: false, previewFps: 60, disableCssAnimations: false, disableShaders: false });
          return;
      }
      SystemProfiler.runDiagnostics().then(results => {
          setPerformanceTier(results.recommendedTier);
          if (results.recommendedTier === 'basic') {
              setPerfFlags({ disableVisualizers: true, previewFps: 15, disableCssAnimations: true, disableShaders: true });
          } else if (results.recommendedTier === 'balanced') {
              setPerfFlags({ disableVisualizers: true, previewFps: 30, disableCssAnimations: false, disableShaders: false });
          } else {
              setPerfFlags({ disableVisualizers: false, previewFps: 60, disableCssAnimations: false, disableShaders: false });
          }
      });
  }, [isProjector]);
  
  const [cues, setCues] = useState([
    { id: '0', number: '1', type: 'group', name: 'Pre-Show Sequence', url: '', state: 'stopped', groupMode: 'fire-all', isExpanded: true, groupId: null, targetDisplay: 'all' },
    { id: '1', number: '2', type: 'video', name: 'Background Loop', url: 'https://www.w3schools.com/html/mov_bbb.mp4', state: 'stopped', loop: true, triggerBehavior: 'stop-others', followAction: 'none', fadeInTime: 2.0, fadeOutTime: 2.0, duration: 0, volume: 1, cameraLive: true, maskEnabled: false, maskDataUrl: null, chromaKeyEnabled: false, chromaKeyColor: '#00ff00', chromaKeySimilarity: 0.4, chromaKeySmoothness: 0.1, groupId: '0', targetDisplay: 'all', scaleX: 100, scaleY: 100, keepAspect: true, posX: 50, posY: 50, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, outlineEnabled: false, outlineColor: '#ffffff', outlineWidth: 2, warpEnabled: false, warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}], mediaSyncOffset: 0, mediaIn: 0, mediaOut: 0, holdAtEnd: false, colorFilterEnabled: false, hue: 0, saturation: 100, brightness: 100 },
    { id: '2', number: '3', type: 'audio', name: 'Ambient Music', url: 'https://www.w3schools.com/html/horse.mp3', state: 'stopped', loop: true, triggerBehavior: 'overlap', followAction: 'none', fadeInTime: 5.0, fadeOutTime: 5.0, duration: 0, volume: 0.5, groupId: '0', targetDisplay: 'all', mediaSyncOffset: 0 },
    { id: '3', number: '4', type: 'text', name: 'Welcome Title', url: '', state: 'stopped', loop: false, triggerBehavior: 'overlap', followAction: 'none', fadeInTime: 1.0, fadeOutTime: 1.0, duration: 0, textContent: 'WELCOME TO\nTUXSHOW', textColor: '#3b82f6', textScale: 120, fontFamily: 'sans-serif', fontWeight: 'bold', fontStyle: 'normal', textAlign: 'center', textX: 50, textY: 50, textShadowEnabled: true, textShadowColor: '#000000', textShadowBlur: 15, textShadowOffsetX: 5, textShadowOffsetY: 5, textSmoothing: true, groupId: null, targetDisplay: 'all', scaleX: 100, scaleY: 100, keepAspect: true, posX: 50, posY: 50, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, outlineEnabled: false, outlineColor: '#ffffff', outlineWidth: 2, warpEnabled: false, warpPins: [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}] },
  ]);
  const cuesRef = useRef([]);
  const activeCuesRef = useRef([]);
  useEffect(() => { 
    cuesRef.current = cues; 
    activeCuesRef.current = cues.filter(c => c.state === 'playing' || c.state === 'stopping' || (c.state === 'completed' && c.holdAtEnd));
  }, [cues]);

  const [previewDisplayFilter, setPreviewDisplayFilter] = useState('all');
  const previewDisplayFilterRef = useRef('all');
  useEffect(() => {
    previewDisplayFilterRef.current = previewDisplayFilter;
  }, [previewDisplayFilter]);

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
  const masterCanvasRef = useRef(null); 
  const webrtcCanvasRef = useRef(null);
  const oscValuesRef = useRef({}); 
  const hostPeerConnectionsRef = useRef({}); // Tracks active WebRTC instances
  const lastSentStatusRef = useRef(null);
  const isExecutingRef = useRef(false);
  const [viewMode, setViewMode] = useState('list');
  const [showInspector, setShowInspector] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => { try { return parseInt(localStorage.getItem('tuxshow_left_panel_width')) || 400; } catch(e) { return 400; } });
  const [isPluginManagerOpen, setIsPluginManagerOpen] = useState(false);
  
  const scrollCueIntoView = useCallback((cueId) => {
    const el = document.querySelector(`[data-cue-id="${cueId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  // =========================================================================
  // TIMELINE WORKER ("BRAIN") INITIALIZATION
  // =========================================================================
  const workerRef = useRef(null);
  const animModifiersRef = useRef({});

  useEffect(() => {
    if (isProjector || isReceiver) return;
    
    // Initialize the background timeline worker and bind message handlers
    workerRef.current = new Worker(new URL('./timelineWorker.js', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'ANIMATION_TICK') {
            animModifiersRef.current = payload;
        } else if (type === 'SEQUENCE_TICK') {
            const { resolvedChildren, mutations } = payload;
            
            // 1. Apply local worker mutations and inject synthetic media cues into the global state
            setCues(prev => {
                let nextCues = [...prev];
                
                if (Object.keys(mutations).length > 0) {
                    nextCues = nextCues.map(c => {
                        if (mutations[c.id]) {
                            const updated = { ...c, ...mutations[c.id] };
                            if (updated.type === 'surtitle' && mutations[c.id].state === 'playing') {
                                if (updated.currentLineIndex === undefined || updated.currentLineIndex < 0) {
                                    updated.currentLineIndex = 0;
                                }
                            }
                            return updated;
                        }
                        return c;
                    });
                }

                if (resolvedChildren && resolvedChildren.length > 0) {
                    const newMediaCues = resolvedChildren
                        .filter(childCue => ['video', 'audio', 'image', 'text', 'camera'].includes(childCue.type))
                        .map(childCue => ({ ...childCue, state: 'playing', isSynthetic: true })); // Tag as synthetic so UI ignores it, but stage plays it
                    
                    newMediaCues.forEach(newCue => {
                        if (!nextCues.find(c => c.id === newCue.id)) {
                            nextCues.push(newCue);
                        }
                    });
                }
                return nextCues;
            });

            // 2. Fire the hardware action cues instantly on the UI thread over IPC
            if (resolvedChildren && resolvedChildren.length > 0) {
                resolvedChildren.forEach(childCue => {
                    if (['osc', 'projector', 'dmx', 'webhook'].includes(childCue.type)) {
                        console.log(`[Hybrid Timeline] Firing synthetic hardware child:`, childCue.id);
                        try {
                            const { ipcRenderer } = window.require('electron');
                            if (childCue.type === 'osc') {
                                ipcRenderer.send('send-osc', { ip: childCue.oscIp, port: childCue.oscPort, address: childCue.oscPath, args: childCue.oscArgs });
                            } else if (childCue.type === 'projector') {
                                ipcRenderer.send('fire-projector-cue', { ip: childCue.projectorIp, port: childCue.projectorPort, protocol: childCue.projectorProtocol, payload: childCue.projectorPayload, password: childCue.projectorPassword });
                            } else if (childCue.type === 'dmx') {
                                ipcRenderer.send('fire-dmx-cue', { channel: childCue.dmxChannel, endValue: childCue.dmxEndValue, duration: childCue.duration });
                            } else if (childCue.type === 'webhook') {
                                ipcRenderer.send('fire-webhook-cue', { url: childCue.webhookUrl, method: childCue.webhookMethod, headers: childCue.webhookHeaders, body: childCue.webhookBody });
                            }
                        } catch(e) {
                            console.error("[Hybrid Timeline] IPC Error:", e);
                            if (childCue.type === 'webhook') {
                                // Direct browser fetch fallback
                                const parsedHeaders = {};
                                if (childCue.webhookHeaders) {
                                    try { Object.assign(parsedHeaders, typeof childCue.webhookHeaders === 'string' ? JSON.parse(childCue.webhookHeaders) : childCue.webhookHeaders); } catch(err) {}
                                }
                                if (childCue.webhookBody && !parsedHeaders['Content-Type'] && !parsedHeaders['content-type']) {
                                    try { JSON.parse(childCue.webhookBody); parsedHeaders['Content-Type'] = 'application/json'; } catch(err) {}
                                }
                                fetch(childCue.webhookUrl, {
                                    method: childCue.webhookMethod || 'GET',
                                    headers: parsedHeaders,
                                    body: ['POST', 'PUT', 'PATCH'].includes(childCue.webhookMethod) ? childCue.webhookBody : undefined
                                }).catch(err => console.error("Web fallback fetch error:", err));
                            }
                        }
                    }
                });
            }
        } else if (type === 'CUES_RESOLVED' || type === 'CONDITION_MET') {
            const { resolvedCues, mutations, source, consumedOscPaths, targetIds } = payload;
            
            if (consumedOscPaths) {
                consumedOscPaths.forEach(p => oscValuesRef.current[p] = null);
            }

            setCues(prevCues => {
                let nextCues = [...prevCues];
                
                // Apply state mutations (like counters or condition stops)
                if (mutations && Object.keys(mutations).length > 0) {
                    nextCues = nextCues.map(c => mutations[c.id] ? { ...c, ...mutations[c.id] } : c);
                }

                if (resolvedCues && resolvedCues.length > 0) {
                    const hasHardStop = resolvedCues.some(c => c.triggerBehavior === 'stop-others');
                    const resolvedIds = resolvedCues.map(c => c.id);
                    
                    // NEW: Pre-load animation start values synchronously to prevent 1-frame visual pops
                    resolvedCues.forEach(rc => {
                        if (rc.type === 'animate' && rc.animTargetCue) {
                            if (!animModifiersRef.current[rc.animTargetCue]) animModifiersRef.current[rc.animTargetCue] = {};
                            animModifiersRef.current[rc.animTargetCue][rc.animProperty] = rc.animStartValue;
                        }
                    });

                    let fadeOutIds = [];
                    resolvedCues.forEach(rc => {
                        if (rc.triggerBehavior === 'fade-target') {
                            const targetNum = String(rc.fadeTargetCue || '').trim();
                            if (targetNum) {
                                const target = prevCues.find(c => String(c.number) === targetNum);
                                if (target) fadeOutIds.push(target.id);
                            } else {
                                const playingCues = prevCues.filter(c => c.state === 'playing' && !resolvedIds.includes(c.id));
                                if (playingCues.length > 0) {
                                    const prevCue = playingCues.reduce((latest, current) => (current.triggerTime || 0) > (latest.triggerTime || 0) ? current : latest);
                                    if (prevCue) fadeOutIds.push(prevCue.id);
                                }
                            }
                        }
                    });

                    nextCues = nextCues.map(c => {
                        if (resolvedIds.includes(c.id)) {
                            const updated = { ...c, state: 'playing', triggerTime: Date.now() };
                            if (c.type === 'surtitle') {
                                if (updated.currentLineIndex === undefined || updated.currentLineIndex < 0) {
                                    updated.currentLineIndex = 0;
                                }
                            }
                            return updated;
                        }
                        if (hasHardStop && !resolvedIds.includes(c.id) && (c.state === 'playing' || (c.state === 'completed' && c.holdAtEnd)) && !c.lockedBy) return { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'stopped' };
                        if (fadeOutIds.includes(c.id) && (c.state === 'playing' || (c.state === 'completed' && c.holdAtEnd)) && !c.lockedBy) return { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'stopped' };
                        return c;
                    });

                    if (source === 'handleGo' || source === 'transition') {
                        const baseIds = resolvedIds.length > 0 ? resolvedIds : targetIds; 
                        const lastTargetIndex = Math.max(...baseIds.map(id => prevCues.findIndex(c => c.id === id)));
                        if (lastTargetIndex >= 0 && lastTargetIndex < prevCues.length - 1) { 
                            const nextSelectionId = prevCues[lastTargetIndex + 1].id; 
                            setTimeout(() => { setSelectedCueIds([nextSelectionId]); setLastSelectedId(nextSelectionId); scrollCueIntoView(nextSelectionId); }, 0); 
                        } else if (lastTargetIndex === prevCues.length - 1) { 
                            const currentSelectionId = prevCues[lastTargetIndex].id; 
                            setTimeout(() => { setSelectedCueIds([currentSelectionId]); setLastSelectedId(currentSelectionId); scrollCueIntoView(currentSelectionId); }, 0); 
                        }
                    } else if (source === 'auto-follow') {
                        setTimeout(() => { setSelectedCueIds(prevSelected => { if (prevSelected.length === 1 && prevSelected[0] === targetIds[0]) { const baseIds = resolvedIds; const lastTargetIndex = Math.max(...baseIds.map(id => prevCues.findIndex(c => c.id === id))); if (lastTargetIndex >= 0 && lastTargetIndex < prevCues.length - 1) { const pushedId = prevCues[lastTargetIndex + 1].id; setLastSelectedId(pushedId); scrollCueIntoView(pushedId); return [pushedId]; } } return prevSelected; }); }, 0);
                    } else if (type === 'CONDITION_MET') {
                        setTimeout(() => { setSelectedCueIds([resolvedIds[0]]); setLastSelectedId(resolvedIds[0]); scrollCueIntoView(resolvedIds[0]); }, 0);
                    }
                }
                return nextCues;
            });
        }
    };

    return () => workerRef.current?.terminate();
  }, [isProjector, isReceiver, scrollCueIntoView]);

   useEffect(() => { localStorage.setItem('tuxshow_left_panel_width', leftPanelWidth); }, [leftPanelWidth]);

  // =========================================================================
  // PLUGIN SCRIPT INJECTION & REACTIVITY
  // =========================================================================
  useEffect(() => {
    const handlePluginInjection = (plugins) => {
      plugins.forEach(plugin => {
        if ((plugin.status === 'running' || plugin.status === 'waiting') && plugin.entryPoints && plugin.entryPoints.ui) {
          const scriptId = `plugin-script-${plugin.id}`;
          if (!document.getElementById(scriptId)) {
            try {
              const script = document.createElement('script');
              script.id = scriptId;
              script.type = 'module';
              const isBrowser = !window.require;
              const scriptPath = isBrowser
                ? `${plugin.dir}/${plugin.entryPoints.ui}`
                : `file://${plugin.dir}/${plugin.entryPoints.ui}`.replace(/\\/g, '/');
              script.src = scriptPath;
              script.onload = () => console.log(`[Plugin System] Successfully injected UI script for ${plugin.id}`);
              script.onerror = (e) => console.error(`[Plugin System] Failed to load UI script for ${plugin.id} at ${scriptPath}`, e);
              document.head.appendChild(script);
            } catch (e) {
              console.error(`[Plugin System] Error injecting script for ${plugin.id}:`, e);
            }
          }
        }
      });
    };

    if (window.coreAppAPI) {
      window.coreAppAPI.getLoadedPlugins().then(handlePluginInjection);
      return window.coreAppAPI.onPluginStateChanged(handlePluginInjection);
    }
  }, []);

  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);
  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'danger') => {
    setToast({ message, type });
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const lastSurtitleTimerFireRef = useRef(0);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordingStartTimeRef = useRef(0);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      try {
        const filePath = await window.coreAppAPI.chooseRecordDestination();
        if (!filePath) return;
        
        // Ensure AudioContext is initialized/resumed on user action
        initAudioContext();
        
        const canvasStream = masterCanvasRef.current.captureStream(60);
        const videoTrack = canvasStream.getVideoTracks()[0];
        
        const tracks = [videoTrack];
        if (recAudioDestRef.current) {
          const audioTracks = recAudioDestRef.current.stream.getAudioTracks();
          if (audioTracks && audioTracks.length > 0) {
            tracks.push(audioTracks[0]);
            console.log('[TuxShow] Recording audio track added:', audioTracks[0]);
          }
        }
        
        const streamToRecord = new MediaStream(tracks);
        // Let the browser choose the optimal WebM codec (usually VP8/VP9 with Opus)
        const options = { mimeType: 'video/webm' };
        const recorder = new MediaRecorder(streamToRecord, options);
        
        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            const arrayBuffer = await e.data.arrayBuffer();
            window.coreAppAPI.saveVideoChunk(arrayBuffer);
          }
        };
        recorder.onstop = () => {
          const durationMs = Date.now() - recordingStartTimeRef.current;
          window.coreAppAPI.stopRecording(durationMs);
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
  
  // Web Audio API components for mixed audio recording and local speaker playback
  const audioContextRef = useRef(null);
  const localGainNodeRef = useRef(null);
  const recAudioDestRef = useRef(null);
  const projectorActiveRef = useRef(false);
  const enableLocalAudioRef = useRef(false);

  useEffect(() => {
    projectorActiveRef.current = projectorActive;
    if (localGainNodeRef.current) {
      localGainNodeRef.current.gain.value = (projectorActive || enableLocalAudioRef.current) ? 1.0 : 0.0;
    }
  }, [projectorActive]);

  useEffect(() => {
    enableLocalAudioRef.current = enableLocalAudio;
    if (localGainNodeRef.current) {
      localGainNodeRef.current.gain.value = (projectorActiveRef.current || enableLocalAudio) ? 1.0 : 0.0;
    }
  }, [enableLocalAudio]);

  const initAudioContext = useCallback(() => {
    if (isProjector) return;
    if (!audioContextRef.current) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        
        // Create local gain node for speakers
        const localGain = ctx.createGain();
        localGain.gain.value = (projectorActiveRef.current || enableLocalAudioRef.current) ? 1.0 : 0.0;
        localGain.connect(ctx.destination);
        localGainNodeRef.current = localGain;
        
        // Create destination for WebM recorder
        const recDest = ctx.createMediaStreamDestination();
        recAudioDestRef.current = recDest;
        
        if (typeof ctx.setSinkId === 'function') {
          const targetSinkId = audioOutputDeviceId === 'default' ? '' : audioOutputDeviceId;
          ctx.setSinkId(targetSinkId).catch(console.warn);
        }
        console.log('[TuxShow] AudioContext successfully initialized.');
      } catch (err) {
        console.error('[TuxShow] Failed to initialize AudioContext:', err);
      }
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(err => console.error('[TuxShow] Failed to resume AudioContext:', err));
    }
  }, [audioOutputDeviceId, isProjector]);

  useEffect(() => {
    if (audioContextRef.current && typeof audioContextRef.current.setSinkId === 'function') {
      const targetSinkId = audioOutputDeviceId === 'default' ? '' : audioOutputDeviceId;
      audioContextRef.current.setSinkId(targetSinkId).catch(console.warn);
    }
  }, [audioOutputDeviceId]);

  const routeElementAudio = useCallback((el) => {
    if (!el || isProjector) return;
    initAudioContext();
    if (audioContextRef.current && !el.__audioRouted) {
      try {
        const source = audioContextRef.current.createMediaElementSource(el);
        if (localGainNodeRef.current) {
          source.connect(localGainNodeRef.current);
        } else {
          source.connect(audioContextRef.current.destination);
        }
        if (recAudioDestRef.current) {
          source.connect(recAudioDestRef.current);
        }
        el.__audioRouted = true;
        console.log('[TuxShow] Routed audio element:', el.id);
      } catch (e) {
        console.warn('[TuxShow] Failed to route audio for element:', el.id, e);
      }
    }
  }, [initAudioContext, isProjector]);
  
  const [hardwareDisplays, setHardwareDisplays] = useState([]);
  const [selectedDisplays, setSelectedDisplays] = useState(() => { try { const saved = localStorage.getItem('tuxshow_displays'); return saved ? JSON.parse(saved) : []; } catch(e) { return []; } });
  const [ioConfig, setIoConfig] = useState(() => { try { const saved = localStorage.getItem('tuxshow_io_config'); return saved ? JSON.parse(saved) : { oscInput: false, oscPort: 53000, mscInput: false, mscDevice: '0' }; } catch(e) { return { oscInput: false, oscPort: 53000, mscInput: false, mscDevice: '0' }; } });
  const [virtualDisplayConfig, setVirtualDisplayConfig] = useState(() => { try { const saved = localStorage.getItem('tuxshow_virtual_display'); return saved ? JSON.parse(saved) : { enabled: false, port: 8554, path: '/display1' }; } catch(e) { return { enabled: false, port: 8554, path: '/display1' }; } });
  const [receiverConfig, setReceiverConfig] = useState(() => { try { const saved = localStorage.getItem('tuxshow_receiver_config'); return saved ? JSON.parse(saved) : { enabled: false, url: '', displayId: 'primary' }; } catch(e) { return { enabled: false, url: '', displayId: 'primary' }; } });
  const [settingsTab, setSettingsTab] = useState('routing');
  const [debugMode, setDebugMode] = useState(() => {
      try { return localStorage.getItem('tuxshow_debug_mode') === 'true'; }
      catch (e) { return false; }
  });
  const [diagnostics, setDiagnostics] = useState(null);

  useEffect(() => {
      localStorage.setItem('tuxshow_debug_mode', debugMode.toString());
  }, [debugMode]);

  useEffect(() => {
      if (!showSettingsModal || settingsTab !== 'diagnostics') return;
      
      const fetchDiagnostics = async () => {
          if (window.coreAppAPI && window.coreAppAPI.getDebugDiagnostics) {
              const res = await window.coreAppAPI.getDebugDiagnostics();
              if (res && res.success) {
                  setDiagnostics(res);
              }
          }
      };
      
      fetchDiagnostics();
      const intervalId = setInterval(fetchDiagnostics, 1000);
      return () => clearInterval(intervalId);
  }, [showSettingsModal, settingsTab]);

  const [syncMode, setSyncMode] = useState(() => { 
      try { return localStorage.getItem('tuxshow_sync_mode') || 'standalone'; } 
      catch(e) { return 'standalone'; } 
  });
  const [backupIp, setBackupIp] = useState(() => {
      try { return localStorage.getItem('tuxshow_backup_ip') || ''; }
      catch(e) { return ''; }
  });
  const [syncActive, setSyncActive] = useState(false);
  const lastHeartbeatTimeRef = useRef(0);

  useEffect(() => {
      localStorage.setItem('tuxshow_sync_mode', syncMode);
      try {
          const { ipcRenderer } = window.require('electron');
          ipcRenderer.invoke('set-sync-mode', { mode: syncMode, port: 53001 });
      } catch (e) {}
  }, [syncMode]);

  useEffect(() => {
      localStorage.setItem('tuxshow_backup_ip', backupIp);
      try {
          const { ipcRenderer } = window.require('electron');
          ipcRenderer.invoke('set-backup-ip', backupIp);
      } catch (e) {}
  }, [backupIp]);

  // HOT-STANDBY BACKUP LISTENER
  useEffect(() => {
      if (syncMode !== 'backup') {
          setSyncActive(false);
          return;
      }
      
      try {
          const { ipcRenderer } = window.require('electron');
          const handleNetworkSync = (event, payload) => {
              // Lock out local execution while slaved
              isExecutingRef.current = true; 
              
              if (payload.cues) {
                  setCues(prev => {
                      return payload.cues.map((masterCue, index) => {
                          let existingBackupCue = prev.find(c => String(c.id) === String(masterCue.id));
                          if (!existingBackupCue && prev.length === payload.cues.length) {
                              // Fallback to array index matching for legacy show files that lacked IDs
                              existingBackupCue = prev[index];
                          }
                          if (existingBackupCue) {
                              // Preserve local media path URLs and heavy static assets on the backup
                              return { ...existingBackupCue, ...masterCue, url: existingBackupCue.url };
                          }
                          return masterCue;
                      });
                  });
              }
              if (payload.pins) setPins(payload.pins);
              if (payload.gridSize) setGridSize(payload.gridSize);
              if (payload.isPaused !== undefined) setIsPaused(payload.isPaused);
              if (payload.globalPause !== undefined) setGlobalPause(payload.globalPause);
              
              // Unlock local execution after a tiny delay
              setTimeout(() => { isExecutingRef.current = false; }, 50);
          };
          
          const handleHeartbeat = (event, payload) => {
              lastHeartbeatTimeRef.current = performance.now();
              setSyncActive(true);
          };

          ipcRenderer.on('network-sync-receive', handleNetworkSync);
          ipcRenderer.on('network-sync-heartbeat', handleHeartbeat);
          
          const intervalId = setInterval(() => {
              if (performance.now() - lastHeartbeatTimeRef.current > 3000) {
                  setSyncActive(false);
              }
          }, 1000);

          return () => {
              ipcRenderer.removeListener('network-sync-receive', handleNetworkSync);
              ipcRenderer.removeListener('network-sync-heartbeat', handleHeartbeat);
              clearInterval(intervalId);
          };
      } catch (e) {}
  }, [syncMode]);

  // HOT-STANDBY PACK RECEIVER
  useEffect(() => {
      if (syncMode !== 'backup') return;
      try {
          const { ipcRenderer } = window.require('electron');
          const handlePackReceived = (event, showData) => {
              isExecutingRef.current = true;
              if (showData.cues) setCues(showData.cues);
              if (showData.pins) setPins(showData.pins);
              if (showData.gridSize) setGridSize(showData.gridSize);
              showToast("New .TSPack received and loaded from Master!", "success");
              setTimeout(() => { isExecutingRef.current = false; }, 50);
          };
          ipcRenderer.on('network-pack-received', handlePackReceived);
          return () => ipcRenderer.removeListener('network-pack-received', handlePackReceived);
      } catch (e) {}
  }, [syncMode, showToast]);

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

  const triggerNextCueAfter = useCallback((currentCueId) => {
    const currentCue = cuesRef.current.find(c => c.id === currentCueId);
    if (currentCue && currentCue.type === 'surtitle') {
      lastSurtitleTimerFireRef.current = performance.now();
    }
    const currentIndex = cuesRef.current.findIndex(c => c.id === currentCueId);
    if (currentIndex >= 0 && currentIndex < cuesRef.current.length - 1) {
        let nextCueRaw = null;
        for (let i = currentIndex + 1; i < cuesRef.current.length; i++) {
            if (!cuesRef.current[i].disabled) {
                nextCueRaw = cuesRef.current[i];
                break;
            }
        }
        if (nextCueRaw && nextCueRaw.state !== 'playing') {
             workerRef.current?.postMessage({ action: 'EVALUATE_GO', payload: { targetIds: [nextCueRaw.id], source: 'auto-follow' } });
        }
    }
  }, []);

  const handleGo = useCallback(() => {
    if (isExecutingRef.current) return;
    if (selectedCueIds.length === 0) return; setIsPaused(false); setGlobalPause(false);
    isExecutingRef.current = true; setTimeout(() => { isExecutingRef.current = false; }, 500);
    
    const activeSurtitle = cues.find(c => c.type === 'surtitle' && c.state === 'playing');
    if (activeSurtitle) {
      if (performance.now() - lastSurtitleTimerFireRef.current < 150) {
        console.warn("[TuxShow Surtitles] Manual line advance in handleGo blocked by 150ms auto-advance lock.");
        return;
      }
      const lines = activeSurtitle.surtitleLines || [];
      const currLine = activeSurtitle.currentLineIndex ?? -1;
      if (currLine < lines.length - 1) {
        setCues(prev => prev.map(c => c.id === activeSurtitle.id ? { ...c, currentLineIndex: currLine + 1 } : c));
        return;
      } else {
        setCues(prev => prev.map(c => c.id === activeSurtitle.id ? { ...c, state: 'completed', currentLineIndex: c.holdAtEnd ? c.currentLineIndex : -1 } : c));
        if (activeSurtitle.followAction === 'auto-follow') {
          setTimeout(() => triggerNextCueAfter(activeSurtitle.id), 0);
        }
      }
    }
    
    workerRef.current?.postMessage({ action: 'EVALUATE_GO', payload: { targetIds: selectedCueIds, source: 'handleGo' } });
  }, [selectedCueIds, cues, triggerNextCueAfter]);

  const handleStopAll = useCallback(() => { setCues(prev => prev.map(cue => ({ ...cue, state: 'stopped', currentLineIndex: cue.type === 'surtitle' ? -1 : cue.currentLineIndex }))); setIsPaused(false); setGlobalPause(false); }, []);
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
        return prev.map(cue => (idsToStop.includes(cue.id) && !cue.lockedBy) ? { ...cue, state: (cue.state === 'playing' || cue.state === 'completed') && cue.fadeOutTime > 0 ? 'stopping' : 'stopped', currentLineIndex: (cue.type === 'surtitle' && !((cue.state === 'playing' || cue.state === 'completed') && cue.fadeOutTime > 0)) ? -1 : cue.currentLineIndex } : cue);
    }); 
  }, []);

  useEffect(() => {
    if (isProjector) {
      try {
        const { ipcRenderer } = window.require('electron');
        const handleStateSync = (event, state) => { 
            if (state.cues) {
                setCues(prev => {
                    return state.cues.map((masterCue, index) => {
                        const existingCue = prev.find(c => String(c.id) === String(masterCue.id)) || prev[index];
                        if (existingCue) return { ...existingCue, ...masterCue };
                        return masterCue;
                    });
                });
            }
            if (state.pins) setPins(state.pins); 
            if (state.gridSize) setGridSize(state.gridSize); 
            if (state.isPaused !== undefined) setIsPaused(state.isPaused); 
            if (state.globalPause !== undefined) setGlobalPause(state.globalPause); 
            if (state.audioOutputDeviceId !== undefined) setAudioOutputDeviceId(state.audioOutputDeviceId); 
            if (state.enableLocalAudio !== undefined) setEnableLocalAudio(state.enableLocalAudio); 
        };
        ipcRenderer.on('sync-state', handleStateSync); ipcRenderer.send('request-state'); return () => ipcRenderer.removeListener('sync-state', handleStateSync);
      } catch (e) {
        const bc = new BroadcastChannel('tuxshow_sync_channel'); 
        bc.onmessage = (event) => { 
            if (event.data && event.data.type === 'SYNC_STATE') { 
                const state = event.data.payload; 
                if (state.cues) {
                    setCues(prev => {
                        return state.cues.map((masterCue, index) => {
                            const existingCue = prev.find(c => String(c.id) === String(masterCue.id)) || prev[index];
                            if (existingCue) return { ...existingCue, ...masterCue };
                            return masterCue;
                        });
                    });
                }
                if (state.pins) setPins(state.pins); 
                if (state.gridSize) setGridSize(state.gridSize); 
                if (state.isPaused !== undefined) setIsPaused(state.isPaused); 
                if (state.globalPause !== undefined) setGlobalPause(state.globalPause); 
                if (state.audioOutputDeviceId !== undefined) setAudioOutputDeviceId(state.audioOutputDeviceId); 
                if (state.enableLocalAudio !== undefined) setEnableLocalAudio(state.enableLocalAudio); 
            } 
        }; 
        return () => bc.close();
      }
    }
  }, [isProjector]);

  const lastPlaybackStateRef = useRef(null);

  const lastStructuralStateRef = useRef('');
  useEffect(() => {
    if (isProjector || isReceiver) return;
    const structuralPayload = JSON.stringify({
      cues: cues.map(c => {
        const { state, currentLineIndex, counterCurrent, triggerTime, ...rest } = c;
        return rest;
      }),
      pins,
      gridSize
    });
    if (structuralPayload !== lastStructuralStateRef.current) {
      lastStructuralStateRef.current = structuralPayload;
      const timeoutId = setTimeout(() => {
        localStorage.setItem('tuxshow_state', JSON.stringify({ cues, pins, gridSize, isPaused: false, globalPause: false }));
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [cues, pins, gridSize, isProjector, isReceiver]);

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
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('get-local-ip')
          .then(ip => setLocalIp(ip))
          .catch(() => setLocalIp('127.0.0.1'));
      } catch (e) {
        setLocalIp('127.0.0.1');
      }
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
            el.muted = false;
            routeElementAudio(el);
          }
        }
      }
    });
  }, [projectorActive, enableLocalAudio, isProjector, cues, routeElementAudio]);

  useEffect(() => {
    if (!isProjector) {
      const fetchDisplays = () => {
        try {
          const { ipcRenderer } = window.require('electron');
          ipcRenderer.invoke('get-displays').then(displays => {
            setHardwareDisplays(displays);
            if (selectedDisplays.length === 0 && displays.length > 1) {
              const secondary = displays.find(d => !d.isPrimary);
              if (secondary) setSelectedDisplays([secondary.id]);
            }
          });
        } catch (e) {
          setHardwareDisplays([
            { id: 'primary', label: 'Primary Screen (Mock)', isPrimary: true },
            { id: 'projector-1', label: 'HDMI-1 Projector (Mock)', isPrimary: false }
          ]);
        }
      };
      fetchDisplays();
    }
  }, [isProjector, showSettingsModal]);
  useEffect(() => { try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('update-io-config', ioConfig); } catch(e) {} localStorage.setItem('tuxshow_io_config', JSON.stringify(ioConfig)); }, [ioConfig]);
  useEffect(() => { localStorage.setItem('tuxshow_displays', JSON.stringify(selectedDisplays)); }, [selectedDisplays]);
  useEffect(() => { localStorage.setItem('tuxshow_virtual_display', JSON.stringify(virtualDisplayConfig)); }, [virtualDisplayConfig]);

  useEffect(() => {
    if (isProjector || !virtualDisplayConfig.enabled) return;

    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('start-virtual-display', { port: virtualDisplayConfig.port, path: virtualDisplayConfig.path, pin: virtualDisplayConfig.pin });
    } catch (e) {}

    return () => { 
      try { const { ipcRenderer } = window.require('electron'); ipcRenderer.send('stop-virtual-display'); } catch(e) {} 
    };
  }, [virtualDisplayConfig.enabled, virtualDisplayConfig.port, virtualDisplayConfig.path, virtualDisplayConfig.pin, isProjector]);

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
    if (isProjector) { 
        let resizeFrame;
        const handleResize = () => {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => setStageSize({ w: window.innerWidth, h: window.innerHeight }));
        };
        handleResize(); 
        window.addEventListener('resize', handleResize); 
        return () => { window.removeEventListener('resize', handleResize); if (resizeFrame) cancelAnimationFrame(resizeFrame); }; 
    } else { 
        const observer = new ResizeObserver(entries => { if (entries[0] && entries[0].contentRect.width > 0 && entries[0].contentRect.height > 0) setStageSize({ w: entries[0].contentRect.width, h: entries[0].contentRect.height }); }); if (stageRef.current) observer.observe(stageRef.current); return () => observer.disconnect(); 
    }
  }, [isProjector]);

  useEffect(() => {
    try {
      const { ipcRenderer } = window.require('electron');
      const handleOscMessage = (event, { path, args }) => {
        oscValuesRef.current[path] = args.length > 0 ? args[0] : null;
        workerRef.current?.postMessage({ action: 'SYNC_STATE', payload: { oscValues: oscValuesRef.current } });
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
                 if (action === 'start') { workerRef.current?.postMessage({ action: 'EVALUATE_GO', payload: { targetIds: [targetCue.id], source: 'osc' } }); } 
                 else if (action === 'stop') stopCue(targetCue.id);
                 else if (action === 'pause') { const el = document.getElementById(`master-${targetCue.type === 'audio' ? 'aud' : (targetCue.type === 'video' ? 'vid' : '')}-${targetCue.id}`); if (el) el.pause(); } 
                 else if (action === 'resume') { const el = document.getElementById(`master-${targetCue.type === 'audio' ? 'aud' : (targetCue.type === 'video' ? 'vid' : '')}-${targetCue.id}`); if (el && targetCue.state === 'playing') el.play().catch(()=>{}); } 
                 else if (action === 'volume' && args.length > 0) { const vol = Math.max(0, Math.min(1, parseFloat(args[0]) || 0)); setCues(prev => prev.map(c => c.id === targetCue.id ? { ...c, volume: vol } : c)); } 
                 else if (action === 'opacity' && args.length > 0) { const op = Math.max(0, Math.min(1, parseFloat(args[0]) || 0)); setCues(prev => prev.map(c => c.id === targetCue.id ? { ...c, customOpacity: op } : c)); }
              }
           }
        }
      };
      ipcRenderer.on('osc-message', handleOscMessage);
      
      const handleShaderRegistration = (event, { pluginId, shaderConfig }) => {
          console.log(`[App] Received shader: ${shaderConfig.id} from ${pluginId}`);
          glslEngine.updateShader(shaderConfig.id, shaderConfig.fragmentSource);
          setCustomShaders(prev => ({
              ...prev,
              [shaderConfig.id]: shaderConfig.fragmentSource
          }));
      };
      ipcRenderer.on('tuxshow:shader-registered', handleShaderRegistration);

      ipcRenderer.send('request-shaders');

      const handleWebhookError = (event, { error, url }) => {
          console.error(`[Webhook Error] ${error} for ${url}`);
          showToast(`${error} (${url})`, 'danger');
      };
      ipcRenderer.on('webhook-error', handleWebhookError);

      return () => {
          ipcRenderer.removeListener('osc-message', handleOscMessage);
          ipcRenderer.removeListener('tuxshow:shader-registered', handleShaderRegistration);
          ipcRenderer.removeListener('webhook-error', handleWebhookError);
      };
    } catch (e) {}
  }, [handleGo, handleStopAll, scrollCueIntoView, stopCue]);



  useEffect(() => {
    const actionCues = cues.filter(c => (
      c.type === 'memo' ||
      c.type === 'webhook' ||
      (c.type === 'pause' && (!c.duration || c.duration <= 0)) ||
      c.type === 'counter' ||
      c.type === 'msc' ||
      c.type === 'osc' ||
      c.type === 'projector' ||
      c.type === 'stop' ||
      c.type === 'state-changer' ||
      c.type === 'select' ||
      (c.type === 'conditional' && c.conditionRunMode !== 'continuous') ||
      (c.type === 'dmx' && (!c.duration || c.duration <= 0))
    ) && c.state === 'playing');
    if (actionCues.length > 0) {
      if (actionCues.some(c => c.type === 'pause')) setIsPaused(true);
      
      setCues(prev => {
        let nextState = [...prev];
        nextState = nextState.map(c => (
          (
            c.type === 'memo' ||
            c.type === 'webhook' ||
            (c.type === 'pause' && (!c.duration || c.duration <= 0)) ||
            c.type === 'counter' ||
            c.type === 'msc' ||
            c.type === 'osc' ||
            c.type === 'projector' ||
            c.type === 'stop' ||
            c.type === 'state-changer' ||
            c.type === 'select' ||
            (c.type === 'conditional' && c.conditionRunMode !== 'continuous') ||
            (c.type === 'dmx' && (!c.duration || c.duration <= 0))
          ) && c.state === 'playing'
        ) ? { ...c, state: 'completed' } : c);
        
        actionCues.filter(ac => ac.type === 'stop').forEach(sc => {
          const targetNum = String(sc.targetCueNumber || '').trim();
          if (!targetNum) return;
          const target = nextState.find(c => String(c.number) === targetNum);
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
            const targetNum = String(sc.targetCueNumber || '').trim();
            if (!targetNum) return;
            const target = nextState.find(c => String(c.number) === targetNum);
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
          const targetNum = String(sc.targetCueNumber || '').trim();
          if (!targetNum) return;
          const target = nextState.find(c => String(c.number) === targetNum);
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
        if (ac.type === 'projector') { 
            try { 
                const { ipcRenderer } = window.require('electron'); 
                ipcRenderer.send('fire-projector-cue', { ip: ac.projectorIp, port: ac.projectorPort, protocol: ac.projectorProtocol, payload: ac.projectorPayload }); 
            } catch (e) {} 
        }
        if (ac.type === 'webhook') {
            try {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('fire-webhook-cue', { url: ac.webhookUrl, method: ac.webhookMethod, headers: ac.webhookHeaders, body: ac.webhookBody });
            } catch (e) {
                // Direct browser fetch fallback
                const parsedHeaders = {};
                if (ac.webhookHeaders) {
                    try { Object.assign(parsedHeaders, typeof ac.webhookHeaders === 'string' ? JSON.parse(ac.webhookHeaders) : ac.webhookHeaders); } catch(err) {}
                }
                if (ac.webhookBody && !parsedHeaders['Content-Type'] && !parsedHeaders['content-type']) {
                    try { JSON.parse(ac.webhookBody); parsedHeaders['Content-Type'] = 'application/json'; } catch(err) {}
                }
                fetch(ac.webhookUrl, {
                    method: ac.webhookMethod || 'GET',
                    headers: parsedHeaders,
                    body: ['POST', 'PUT', 'PATCH'].includes(ac.webhookMethod) ? ac.webhookBody : undefined
                }).catch(err => console.error("Web fallback fetch error:", err));
            }
        }
        if (ac.followAction === 'auto-follow' && (!ac.duration || ac.duration <= 0)) setTimeout(() => triggerNextCueAfter(ac.id), 0); 
      });
    }
  }, [cues, triggerNextCueAfter]); 

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
            if (!cue.duration || cue.duration <= 0 || ['video', 'audio', 'camera', 'animate', 'surtitle'].includes(cue.type)) return;
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
      const el = document.getElementById(`master-${cue.type === 'audio' ? 'aud' : (cue.type === 'image' ? 'img' : (cue.type === 'text' ? 'text' : (cue.type === 'timer' ? 'timer' : (cue.type === 'surtitle' ? 'surtitle' : (cue.type === 'camera' ? 'cam' : 'vid')))))}-${cue.id}`);

      const isNewTrigger = cue.state === 'playing' && (lastState !== 'playing' || (cue.triggerTime && lastTriggerTime !== cue.triggerTime));

      if (isNewTrigger) {
          if (cue.type === 'pause') setIsPaused(true);
          if (cue.type === 'dmx') {
              try {
                  const { ipcRenderer } = window.require('electron');
                  ipcRenderer.send('fire-dmx-cue', { channel: cue.dmxChannel, endValue: cue.dmxEndValue, duration: cue.duration });
              } catch (e) {}
          }
          if (syncTimers.current[cue.id]) clearTimeout(syncTimers.current[cue.id]);
          if (el && fadeIntervals.current[el.id]) clearInterval(fadeIntervals.current[el.id]);

          fadeStateTrackers.current[trackKey] = { state: 'playing', start: performance.now(), animStart: performance.now(), duration: cue.type === 'transition' ? (cue.duration || 0) : (cue.fadeInTime || 0), triggerTime: cue.triggerTime, mediaElement: el };
          if (cue.type === 'transition') {
              const mCanvas = masterCanvasRef.current;
              const wCanvas = webrtcCanvasRef.current;
              if (mCanvas) { const snapCanvas = document.createElement('canvas'); snapCanvas.width = mCanvas.width || 1920; snapCanvas.height = mCanvas.height || 1080; snapCanvas.getContext('2d', { alpha: false }).drawImage(mCanvas, 0, 0); fadeStateTrackers.current[trackKey].snapshot = snapCanvas; }
              if (wCanvas) { const snapCanvasW = document.createElement('canvas'); snapCanvasW.width = wCanvas.width || 1920; snapCanvasW.height = wCanvas.height || 1080; snapCanvasW.getContext('2d', { alpha: false }).drawImage(wCanvas, 0, 0); fadeStateTrackers.current[trackKey].snapshotWebRTC = snapCanvasW; }
              setTimeout(() => {
                  setCues(prev => prev.map(c => { if (c.id !== cue.id && ['video', 'audio', 'image', 'text', 'camera', 'timer'].includes(c.type) && (c.state === 'playing' || c.state === 'stopping') && !c.lockedBy) { return { ...c, state: c.fadeOutTime > 0 ? 'stopping' : 'completed' }; } return c; }));
                  let targetId = null; 
                  if (cue.targetCueNumber) { 
                      const target = cuesRef.current.find(c => String(c.number) === String(cue.targetCueNumber)); 
                      if (target) targetId = target.id; 
                  } else { 
                      const currentIndex = cuesRef.current.findIndex(c => c.id === cue.id); 
                      if (currentIndex >= 0 && currentIndex < cuesRef.current.length - 1) { 
                          targetId = cuesRef.current[currentIndex + 1].id; 
                      } 
                  }
                  if (targetId) workerRef.current?.postMessage({ action: 'EVALUATE_GO', payload: { targetIds: [targetId], source: 'transition' } });
              }, 0);
          } else if (el && !['image','goto','blackout','pause','counter','transition','group','time','text','msc','osc','projector','stop','conditional','timer','dmx','memo','surtitle','animate','select','state-changer','sequence','webhook'].includes(cue.type)) {
              if (isProjector) {
                  el.muted = true;
              } else {
                  el.muted = false;
                  routeElementAudio(el);
              }
              
              const startPlayback = () => {
                  if (cue.mediaIn > 0) el.currentTime = cue.mediaIn;
                  else if (cue.mediaSyncOffset > 0) el.currentTime = cue.mediaSyncOffset / 1000;
                  else el.currentTime = 0;
                  
                  if (cue.fadeInTime > 0) doVolumeFade(el, 0, cue.volume !== undefined ? cue.volume : 1, cue.fadeInTime); 
                  else el.volume = (cue.volume !== undefined ? cue.volume : 1) * masterVolumeRef.current;
                  
                  if (!isProjector) {
                      el.muted = false;
                      routeElementAudio(el);
                  }

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
          if (el && !['image','goto','blackout','pause','counter','transition','group','time','text','msc','osc','projector','stop','conditional','timer','dmx','memo','surtitle','animate','select','state-changer','sequence','webhook'].includes(cue.type)) { if (cue.fadeOutTime > 0) { const currentBaseVol = masterVolumeRef.current > 0 ? el.volume / masterVolumeRef.current : (cue.volume !== undefined ? cue.volume : 1); doVolumeFade(el, currentBaseVol, 0, cue.fadeOutTime); } }
          if (advanceTimers.current[`stop-${cue.id}`]) clearTimeout(advanceTimers.current[`stop-${cue.id}`]); advanceTimers.current[`stop-${cue.id}`] = setTimeout(() => { setCues(prev => prev.map(c => c.id === cue.id ? { ...c, state: 'stopped', currentLineIndex: c.type === 'surtitle' ? -1 : c.currentLineIndex } : c)); }, (cue.fadeOutTime || 0) * 1000);
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
      if (cue.state === 'playing' && lastState === 'playing' && el && !fadeIntervals.current[el.id] && !['image','goto','blackout','pause','counter','transition','group','time','text','msc','osc','projector','stop','conditional','timer','dmx','memo','surtitle','animate','select','state-changer','sequence','webhook'].includes(cue.type)) { el.volume = (cue.volume !== undefined ? cue.volume : 1) * masterVolumeRef.current; }
    });
  }, [cues, doVolumeFade, scrollCueIntoView]);

  const lastSyncHashRef = useRef('');
  const lastSyncedWorkerRef = useRef(null);
  useEffect(() => {
    if (workerRef.current && !isProjector && !isReceiver) {
        const strippedCues = cues.map(c => ({ id: c.id, type: c.type, state: c.state, groupId: c.groupId, disabled: c.disabled, gotoMode: c.gotoMode, targetCueRangeMin: c.targetCueRangeMin, targetCueRangeMax: c.targetCueRangeMax, targetCueNumber: c.targetCueNumber, number: c.number, groupMode: c.groupMode, counterCurrent: c.counterCurrent, counterLimit: c.counterLimit, conditionRunMode: c.conditionRunMode, conditionType: c.conditionType, conditionOscPath: c.conditionOscPath, conditionOscValue: c.conditionOscValue, conditionTargetCue: c.conditionTargetCue, conditionState: c.conditionState, trueTargetCue: c.trueTargetCue, falseTargetCue: c.falseTargetCue, duration: c.duration, animTargetCue: c.animTargetCue, animProperty: c.animProperty, animStartValue: c.animStartValue, animEndValue: c.animEndValue, animPathEnabled: c.animPathEnabled, triggerBehavior: c.triggerBehavior, fadeTargetCue: c.fadeTargetCue }));
        
        // Strip non-serializable DOM elements (media, canvases) from the payload
        const strippedTrackers = {};
        for (const [key, value] of Object.entries(fadeStateTrackers.current)) {
            strippedTrackers[key] = { start: value.start, animStart: value.animStart };
        }

        const syncHash = JSON.stringify(strippedCues) + JSON.stringify(strippedTrackers);
        if (syncHash !== lastSyncHashRef.current || workerRef.current !== lastSyncedWorkerRef.current) {
            lastSyncHashRef.current = syncHash;
            lastSyncedWorkerRef.current = workerRef.current;
            workerRef.current.postMessage({ 
                action: 'SYNC_STATE', 
                payload: { cues: strippedCues, oscValues: oscValuesRef.current, trackers: strippedTrackers, mainTime: performance.now() } 
            });
        }
    }
  }, [cues, isProjector, isReceiver]);

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
      const now = performance.now();
      // Projector output runs at 60fps. Preview runs at 15fps when projector is active, otherwise standard previewFps.
      const fpsLimit = isProjector ? 60 : (projectorActive ? 15 : perfFlags.previewFps);
      if (now - lastRenderTime.current < (1000 / fpsLimit)) {
          animId = requestAnimationFrame(renderLoop);
          return;
      }
      lastRenderTime.current = now;

      if (stageSize.w === 0 || stageSize.h === 0) { animId = requestAnimationFrame(renderLoop); return; }
      if (masterCanvas.width !== stageSize.w) masterCanvas.width = Math.max(1, stageSize.w); if (masterCanvas.height !== stageSize.h) masterCanvas.height = Math.max(1, stageSize.h);
      if (webrtcCanvas.width !== stageSize.w) webrtcCanvas.width = Math.max(1, stageSize.w); if (webrtcCanvas.height !== stageSize.h) webrtcCanvas.height = Math.max(1, stageSize.h);
      if (layerCanvas.width !== stageSize.w) layerCanvas.width = Math.max(1, stageSize.w); if (layerCanvas.height !== stageSize.h) layerCanvas.height = Math.max(1, stageSize.h);

      masterCtx.fillStyle = '#000000'; masterCtx.fillRect(0, 0, stageSize.w, stageSize.h);
      
      if (!isProjector) { webrtcCtx.fillStyle = '#000000'; webrtcCtx.fillRect(0, 0, stageSize.w, stageSize.h); }

      const currentCues = activeCuesRef.current;
      
      const animModifiers = {};
      const refModifiers = animModifiersRef.current || {};
      for (const [cueNum, props] of Object.entries(refModifiers)) {
          animModifiers[cueNum] = { ...props };
      }
      
      const allCues = cuesRef.current;
      for (let i = 0; i < allCues.length; i++) {
          const anim = allCues[i];
          if (anim.type === 'animate' && (anim.state === 'playing' || anim.state === 'completed') && anim.animTargetCue) {
              const tracker = fadeStateTrackers.current[anim.id];
              if (tracker && anim.duration > 0) {
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
                      const startVal = anim.animStartValue !== undefined ? anim.animStartValue : 0;
                      const endVal = anim.animEndValue !== undefined ? anim.animEndValue : 100;
                      const currentVal = startVal + (endVal - startVal) * p;
                      animModifiers[anim.animTargetCue][anim.animProperty || 'posX'] = currentVal;
                  }
              }
          }
      }
      // ----------------------------------------

      currentCues.forEach(cue => {
        if (['audio', 'goto', 'pause', 'counter', 'transition', 'group', 'time', 'msc', 'osc', 'projector', 'stop', 'conditional', 'animate', 'state-changer', 'select', 'dmx', 'memo', 'webhook'].includes(cue.type)) return;
        if (cue.disabled) return;
        
        const showOnMaster = isProjector
          ? (displayId === 'all' || cue.targetDisplay === 'all' || String(cue.targetDisplay) === String(displayId))
          : (previewDisplayFilterRef.current === 'all' || 
             (previewDisplayFilterRef.current === 'webrtc' && (cue.targetDisplay === 'all' || cue.targetDisplay === 'webrtc')) ||
             cue.targetDisplay === 'all' || 
             String(cue.targetDisplay) === String(previewDisplayFilterRef.current));
        const showOnWebRTC = !isProjector && (cue.targetDisplay === 'all' || cue.targetDisplay === 'webrtc');
        if (!showOnMaster && !showOnWebRTC) return;

        let opacity = 1; const tracker = fadeStateTrackers.current[cue.id];
        if (tracker) { const elapsed = (performance.now() - tracker.start) / 1000; if (tracker.state === 'playing') opacity = tracker.duration > 0 ? Math.min(1, elapsed / tracker.duration) : 1; else if (tracker.state === 'stopping') opacity = tracker.duration > 0 ? Math.max(0, 1 - (elapsed / tracker.duration)) : 0; }
        if (cue.type === 'blackout') { 
            if (showOnMaster) { masterCtx.globalAlpha = opacity; masterCtx.fillStyle = 'black'; masterCtx.fillRect(0, 0, stageSize.w, stageSize.h); masterCtx.globalAlpha = 1; }
            if (showOnWebRTC) { webrtcCtx.globalAlpha = opacity; webrtcCtx.fillStyle = 'black'; webrtcCtx.fillRect(0, 0, stageSize.w, stageSize.h); webrtcCtx.globalAlpha = 1; }
            return; 
        }

        let mediaEl = tracker?.mediaElement || document.getElementById(`master-${cue.type === 'image' ? 'img' : (cue.type === 'text' ? 'text' : (cue.type === 'timer' ? 'timer' : (cue.type === 'surtitle' ? 'surtitle' : (cue.type === 'camera' ? 'cam' : 'vid'))))}-${cue.id}`);
        if (cue.chromaKeyEnabled) { const chromaEl = document.getElementById(`master-chroma-${cue.id}`); if (chromaEl) mediaEl = chromaEl; }
        if (!mediaEl) return; if (mediaEl instanceof HTMLVideoElement && mediaEl.readyState < 2) return; if (mediaEl instanceof HTMLImageElement && !mediaEl.complete) return;
        
        // If the cue has a custom shader assigned AND we aren't in Basic survival mode
        let renderSource = mediaEl;
        if (cue.shaderId && !perfFlags.disableShaders) {
            if (['blur', 'noise', 'edge'].includes(cue.shaderId)) {
                const customEl = document.getElementById(`master-customshader-${cue.id}`);
                if (customEl) renderSource = customEl;
            } else {
                const width = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.width || 1920;
                const height = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.height || 1080;
                renderSource = glslEngine.processFrame(mediaEl, cue.shaderId, width, height);
            }
        }

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
                   maskCtx.drawImage(renderSource, sx, sy, sw, sh, 0, 0, sw, sh);
                   if (showOnMaster) drawCueToCtx(masterCtx, maskCanvas, cue, sx, sy, sw, sh, dx, dy, dw, dh);
                   if (showOnWebRTC) drawCueToCtx(webrtcCtx, maskCanvas, cue, sx, sy, sw, sh, dx, dy, dw, dh);
               } else {
                   if (showOnMaster) drawCueToCtx(masterCtx, renderSource, cue, sx, sy, sw, sh, dx, dy, dw, dh);
                   if (showOnWebRTC) drawCueToCtx(webrtcCtx, renderSource, cue, sx, sy, sw, sh, dx, dy, dw, dh);
               }
            } else {
               if (showOnMaster) drawCueToCtx(masterCtx, renderSource, cue, sx, sy, sw, sh, dx, dy, dw, dh);
               if (showOnWebRTC) drawCueToCtx(webrtcCtx, renderSource, cue, sx, sy, sw, sh, dx, dy, dw, dh);
            }
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
      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
          const qIdx = y * gridSize.x + x;
          for (let tri = 1; tri <= 2; tri++) {
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
          }
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };
    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [stageSize, gridSize, isProjector, displayId, perfFlags, projectorActive]);

  useEffect(() => { cues.filter(c => c.state === 'playing' || c.state === 'stopping').forEach(cue => { if (['image', 'goto', 'camera', 'blackout', 'pause', 'counter', 'stop', 'group', 'time', 'text', 'msc', 'osc', 'projector', 'conditional', 'timer', 'animate', 'select', 'dmx', 'memo', 'surtitle', 'webhook'].includes(cue.type)) return; const el = document.getElementById(`master-${cue.type === 'video' ? 'vid' : 'aud'}-${cue.id}`); if (el) { if (isPaused && (!cue.lockedBy || globalPause)) el.pause(); else { if (!isProjector) { el.muted = false; routeElementAudio(el); } const p = el.play(); if (p !== undefined) p.catch(()=>{}); } } }); }, [isPaused, globalPause, cues, isProjector, routeElementAudio]);
  
  useEffect(() => { 
    if (isProjector) return; 
    cues.forEach(cue => { 
      if (cue.state === 'playing' && cue.followAction === 'auto-follow' && cue.duration > 0 && cue.type !== 'pause' && cue.type !== 'timer' && cue.type !== 'surtitle' && (!isPaused || (cue.lockedBy && !globalPause))) { 
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
        timerDuration: migrated.timerDuration || 60, timerStyle: migrated.timerStyle || 'countdown', timerFormat: migrated.timerFormat || 'MM:SS', timerVisible: migrated.timerVisible ?? true, customOpacity: migrated.customOpacity, shaderId: migrated.shaderId || '', shaderBlurRadius: migrated.shaderBlurRadius ?? 5.0, shaderNoiseIntensity: migrated.shaderNoiseIntensity ?? 0.5, shaderNoiseSpeed: migrated.shaderNoiseSpeed ?? 1.0,
        conditionRunMode: migrated.conditionRunMode || 'immediate', conditionType: migrated.conditionType || 'cue-state', conditionTargetCue: migrated.conditionTargetCue || '', conditionState: migrated.conditionState || 'playing', conditionOscPath: migrated.conditionOscPath || '/tuxshow/sensor', conditionOscValue: migrated.conditionOscValue || '1', trueTargetCue: migrated.trueTargetCue || '', falseTargetCue: migrated.falseTargetCue || '',
        memoColor: migrated.memoColor || 'yellow',
        surtitleLines: migrated.surtitleLines || [],
        currentLineIndex: migrated.currentLineIndex ?? -1,
        surtitleFilePath: migrated.surtitleFilePath || '',
        webhookUrl: migrated.webhookUrl || '',
        webhookMethod: migrated.webhookMethod || 'GET',
        webhookHeaders: migrated.webhookHeaders || '',
        webhookBody: migrated.webhookBody || ''
      };
    });
    setCues(hydratedCues);
    if (hydratedCues.length > 0) { setSelectedCueIds([hydratedCues[0].id]); setLastSelectedId(hydratedCues[0].id); }
    if (loadedState.pins) setPins(loadedState.pins); 
    if (loadedState.gridSize) setGridSize(loadedState.gridSize); 
    setIsPaused(false);
    setGlobalPause(false);
  }, []);

  const handleLoadShow = useCallback(async () => {
    try {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('open-workspace');

        if (result.success && result.data) {
            const filePath = result.filePath;
            setWorkspaceName(filePath.split(/[/\\]/).pop());

            let loadedState;
            try {
                loadedState = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
            } catch (err) {
                alert("Invalid Workspace file.");
                return;
            }

            if (loadedState.cues) {
                const path = window.require('path');
                const baseDir = path.dirname(filePath);

                // For regular .TSW files, rewrite relative media paths
                if (!filePath.toLowerCase().endsWith('.tspack')) {
                    loadedState.cues = loadedState.cues.map(c => {
                        if (c.url && c.url.startsWith('./')) {
                            let absolutePath = path.join(baseDir, c.url.slice(2));
                            absolutePath = absolutePath.replace(/\\/g, '/');
                            const prefix = absolutePath.startsWith('/') ? 'file://' : 'file:///';
                            return { ...c, url: `${prefix}${absolutePath.replace(/#/g, '%23').replace(/\?/g, '%3F')}` };
                        }
                        return c;
                    });
                }

                const isOldFormat = loadedState.cues.some(c => c.fadeTime !== undefined || c.autoAdvance !== undefined);
                if (isOldFormat) setPendingLoadState(loadedState); else applyLoadedState(loadedState);

                // Auto-deploy TSPack to backup if in master mode with a target IP
                if (filePath.toLowerCase().endsWith('.tspack') && syncMode === 'master' && backupIp) {
                    showToast('Deploying .TSPack to Backup...', 'success');
                    ipcRenderer.invoke('push-tspack-to-backup', { packPath: filePath, targetIp: backupIp })
                      .then(res => {
                          if (res.success) showToast('Pack successfully deployed to Backup!', 'success');
                          else showToast('Failed to deploy pack to Backup: ' + res.error, 'danger');
                      })
                      .catch(err => {
                          showToast('Error deploying pack to Backup: ' + err.message, 'danger');
                      });
                }
            }
        } else if (result.error) {
            alert("Failed to load showfile: " + result.error);
        }
    } catch (err) {
        console.error("Error invoking open-workspace:", err);
    }
  }, [applyLoadedState, syncMode, backupIp, showToast]);

  const handlePackWorkspace = useCallback(async () => {
    if (!packPath) return;
    setIsPacking(true);
    setPackProgress('Archiving workspace and media securely...');
    
    try {
        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('create-tspack', { packPath, cues, pins, gridSize });
        
        if (result.success) {
            setPackProgress('Packing complete! .TSPack archive created.');
            // Only update the workspace name if it successfully packed
            setWorkspaceName(result.filePath.split(/[/\\]/).pop());
            
            setTimeout(() => {
                setShowPackModal(false);
                setPackProgress('');
                setIsPacking(false);
            }, 2500);
        } else {
            throw new Error(result.error);
        }
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
  const updateSelectedCues = useCallback((field, value) => {
    if (field === 'currentLineIndex') {
      if (performance.now() - lastSurtitleTimerFireRef.current < 150) {
        console.warn("[TuxShow Surtitles] Manual line advance blocked by 150ms auto-advance lock.");
        return;
      }
    }
    setCues(prev => prev.map(c => { if (!selectedCueIds.includes(c.id)) return c; return { ...c, [field]: value }; }));
  }, [selectedCueIds]);

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
              {cue.type === 'surtitle' && <SurtitleMasterPlayer cue={cue} />}
              {cue.type === 'video' && <video id={`master-vid-${cue.id}`} src={cue.url} loop={cue.loop} muted onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" playsInline onError={(e) => console.error(`[VideoLoader] Failed to load video cue ${cue.id} (${cue.name}) from URL: ${cue.url}`, e)} />}
              {cue.type === 'audio' && <audio id={`master-aud-${cue.id}`} src={cue.url} loop={cue.loop} muted onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" onError={(e) => console.error(`[AudioLoader] Failed to load audio cue ${cue.id} (${cue.name}) from URL: ${cue.url}`, e)} />}
              {cue.type === 'image' && <img id={`master-img-${cue.id}`} src={cue.url} alt="" className="hidden" onError={(e) => console.error(`[ImageLoader] Failed to load image cue ${cue.id} (${cue.name}) from URL: ${cue.url}`, e)} />}
              {cue.chromaKeyEnabled && <ChromaKeyFilter cue={cue} />}
              {['blur', 'noise', 'edge'].includes(cue.shaderId) && <CustomShaderFilter cue={cue} />}
              {cue.maskEnabled && cue.maskDataUrl && <img id={`master-mask-${cue.id}`} src={cue.maskDataUrl} alt="mask" className="hidden" onError={(e) => console.error(`[MaskLoader] Failed to load mask for cue ${cue.id} (${cue.name})`, e)} />}
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
    <div className={`flex flex-col h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-600 relative ${perfFlags.disableCssAnimations ? 'disable-animations' : ''}`}>
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
            {cue.type === 'surtitle' && <SurtitleMasterPlayer cue={cue} />}
            {cue.type === 'video' && <video id={`master-vid-${cue.id}`} src={cue.url} loop={cue.loop} muted onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" playsInline onError={(e) => console.error(`[VideoLoader] Failed to load video cue ${cue.id} (${cue.name}) from URL: ${cue.url}`, e)} />}
            {cue.type === 'audio' && <audio id={`master-aud-${cue.id}`} src={cue.url} loop={cue.loop} muted onTimeUpdate={!isProjector ? (e) => handleMediaTimeUpdate(cue.id, e.target) : undefined} onEnded={() => handleCueEnded(cue.id)} className="hidden" onError={(e) => console.error(`[AudioLoader] Failed to load audio cue ${cue.id} (${cue.name}) from URL: ${cue.url}`, e)} />}
            {cue.type === 'image' && <img id={`master-img-${cue.id}`} src={cue.url} alt="" className="hidden" onError={(e) => console.error(`[ImageLoader] Failed to load image cue ${cue.id} (${cue.name}) from URL: ${cue.url}`, e)} />}
            {cue.chromaKeyEnabled && <ChromaKeyFilter cue={cue} />}
            {['blur', 'noise', 'edge'].includes(cue.shaderId) && <CustomShaderFilter cue={cue} />}
            {cue.maskEnabled && cue.maskDataUrl && <img id={`master-mask-${cue.id}`} src={cue.maskDataUrl} alt="mask" className="hidden" onError={(e) => console.error(`[MaskLoader] Failed to load mask for cue ${cue.id} (${cue.name})`, e)} />}
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
        <p className="text-xs text-gray-500 font-mono mb-6">Version 1.5.1</p>
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
                  placeholder="/home/user/Desktop/MyPackedShow.TSPack" 
                />
                <button onClick={async () => {
                    try {
                        const { ipcRenderer } = window.require('electron');
                        const { canceled, filePath } = await ipcRenderer.invoke('choose-pack-destination');
                        if (!canceled && filePath) {
                            setPackPath(filePath);
                        }
                    } catch(e) {
                        console.error("Failed to open save dialog", e);
                    }
                }} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-4 py-2 text-sm font-semibold text-gray-300 transition-colors">
                    Browse
                </button>
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

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-800 mb-6 shrink-0">
              <button 
                onClick={() => setSettingsTab('routing')} 
                className={`px-4 py-2 text-sm font-bold flex items-center gap-2 transition-colors border-b-2 -mb-[2px] ${
                  settingsTab === 'routing' 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4" /> Routing & Sync
              </button>
              <button 
                onClick={() => setSettingsTab('diagnostics')} 
                className={`px-4 py-2 text-sm font-bold flex items-center gap-2 transition-colors border-b-2 -mb-[2px] ${
                  settingsTab === 'diagnostics' 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Activity className="w-4 h-4" /> Diagnostics & Logs
              </button>
            </div>

            {settingsTab === 'diagnostics' ? (
              <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 flex-1 min-h-0">
                {/* Debug Mode Toggle & Sync Status Card */}
                <div className="grid grid-cols-2 gap-4 shrink-0">
                  <div className="bg-gray-950 p-4 rounded border border-gray-800 flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-200 mb-1">Debug Mode</h4>
                      <p className="text-xs text-gray-500 mb-3 font-medium">Enable verbose diagnostics monitoring and console capture.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={debugMode} 
                        onChange={(e) => setDebugMode(e.target.checked)} 
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
                      <span className="ml-3 text-xs font-bold text-gray-300">{debugMode ? 'VERBOSE DEBUG ON' : 'STANDARD MONITORING'}</span>
                    </label>
                  </div>

                  <div className="bg-gray-950 p-4 rounded border border-gray-800 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-200 mb-1">Redundancy Link</h4>
                      <p className="text-xs text-gray-500 font-medium">UDP state heartbeat link status.</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          syncMode === 'master' 
                            ? 'bg-blue-500 animate-pulse' 
                            : (syncActive ? 'bg-green-500 animate-pulse' : 'bg-gray-600')
                        }`}></span>
                        <span className="text-xs font-bold text-gray-300 uppercase font-mono">
                          {syncMode}: {
                            syncMode === 'master' 
                              ? 'BROADCASTING' 
                              : (syncActive ? 'ACTIVE SYNC' : 'DISCONNECTED / IDLE')
                          }
                        </span>
                      </div>
                    </div>
                    <Wifi className={`w-8 h-8 ${
                      syncMode === 'master' 
                        ? 'text-blue-400' 
                        : (syncActive ? 'text-green-500' : 'text-gray-600')
                    }`} />
                  </div>
                </div>

                {/* System & Telemetry Diagnostics */}
                {diagnostics ? (
                  <div className="space-y-4 flex-1 flex flex-col min-h-0">
                    <div className="grid grid-cols-2 gap-4 shrink-0">
                      {/* Telemetry statistics */}
                      <div className="bg-gray-950 p-3 rounded border border-gray-800 space-y-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sync Packet Statistics</h4>
                        <div className="space-y-1.5 text-xs text-gray-300 font-mono">
                          <div className="flex justify-between"><span>UDP Port Status:</span><span className="text-blue-400 font-bold">{diagnostics.sync.socketBound ? 'Bound / Listening' : 'Unbound'}</span></div>
                          <div className="flex justify-between"><span>TCP Tunnel Status:</span><span className="text-blue-400 font-bold">{diagnostics.sync.httpServerRunning ? 'Listening (Port 53002)' : 'Offline'}</span></div>
                          <div className="flex justify-between"><span>Packets Sent:</span><span>{diagnostics.sync.totalPacketsSent}</span></div>
                          <div className="flex justify-between"><span>Packets Received:</span><span>{diagnostics.sync.totalPacketsReceived}</span></div>
                          <div className="flex justify-between">
                            <span>Last Sent Size:</span>
                            <span className={diagnostics.sync.lastSentStateSize > 65000 ? 'text-red-500 font-bold animate-pulse' : diagnostics.sync.lastSentStateSize > 1400 ? 'text-yellow-500 font-semibold' : 'text-green-400'}>
                              {diagnostics.sync.lastSentStateSize} B
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Last Received Size:</span>
                            <span className={diagnostics.sync.lastReceivedStateSize > 65000 ? 'text-red-500 font-bold animate-pulse' : diagnostics.sync.lastReceivedStateSize > 1400 ? 'text-yellow-500 font-semibold' : 'text-green-400'}>
                              {diagnostics.sync.lastReceivedStateSize} B
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Staging directory info */}
                      <div className="bg-gray-950 p-3 rounded border border-gray-800 space-y-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">TSPack Local Extraction</h4>
                        <div className="space-y-1.5 text-xs text-gray-300 font-mono">
                          <div className="flex justify-between"><span>Staging Active:</span><span className="text-blue-400 font-bold">{diagnostics.sync.stagingExists ? 'Active / Mounted' : 'Empty'}</span></div>
                          <div className="flex justify-between"><span>Total Staging Files:</span><span>{diagnostics.sync.stagingFileCount}</span></div>
                          <div className="flex justify-between"><span>Total Staging Size:</span><span>{(diagnostics.sync.stagingSize / (1024 * 1024)).toFixed(2)} MB</span></div>
                          <div className="flex justify-between"><span>Target System IP:</span><span>{localIp}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Network Size Warning Card */}
                    {(diagnostics.sync.lastSentStateSize > 1400 || diagnostics.sync.lastReceivedStateSize > 1400 || diagnostics.sync.lastSyncError) && (
                      <div className="bg-yellow-950/40 border border-yellow-800/60 p-3 rounded flex gap-3 items-start shrink-0">
                        <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-yellow-300">
                          <h5 className="font-bold mb-0.5">High Packet Payload Detected</h5>
                          {diagnostics.sync.lastSyncError ? (
                            <p className="font-mono text-[10px] text-red-400">Error: {diagnostics.sync.lastSyncError}</p>
                          ) : (
                            <p className="leading-relaxed font-medium">
                              Sync payload size ({Math.max(diagnostics.sync.lastSentStateSize, diagnostics.sync.lastReceivedStateSize)} bytes) exceeds the standard Ethernet MTU limit (1400B). Standard UDP packets this large are fragmented and dropped on typical theatrical local networks. When loading a complex TSPack with warp/mask data or high cue counts, syncing the state via UDP will fail.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Log Terminal */}
                    <div className="flex-1 min-h-[200px] flex flex-col bg-black rounded border border-gray-800 font-mono text-[11px] leading-relaxed overflow-hidden">
                      <div className="bg-gray-950 px-3 py-1.5 border-b border-gray-800 flex justify-between items-center shrink-0">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Main Process Console Logs</span>
                        <span className="text-[9px] text-gray-500">Auto-updates in real-time</span>
                      </div>
                      <div className="p-3 overflow-y-auto flex-1 space-y-1 custom-scrollbar">
                        {diagnostics.logs && diagnostics.logs.length > 0 ? (
                          diagnostics.logs.map((log, index) => {
                            let color = 'text-gray-400';
                            if (log.level === 'warn') color = 'text-yellow-400 font-bold';
                            if (log.level === 'error') color = 'text-red-400 font-bold';
                            return (
                              <div key={index} className="flex gap-2 items-start hover:bg-gray-900/50 p-0.5 rounded">
                                <span className="text-gray-600 select-none shrink-0">[{log.timestamp.slice(11, 19)}]</span>
                                <span className={`${color} shrink-0 uppercase font-bold text-[9px] w-10`}>{log.level}</span>
                                <span className="text-gray-200 flex-1 whitespace-pre-wrap">{log.message}</span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-gray-600 italic text-center py-4">No captured main process logs. Try performing sync actions.</div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3 mt-2 shrink-0 pb-1">
                      <button 
                        onClick={async () => {
                          try {
                            const date = new Date().toISOString().replace(/[:.]/g, '-');
                            const filename = `tuxshow_diagnostics_${date}.json`;
                            const dataStr = JSON.stringify(diagnostics, null, 2);
                            const blob = new Blob([dataStr], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = filename;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                            showToast("Diagnostics exported successfully!", "success");
                          } catch (e) {
                            showToast("Failed to export diagnostics: " + e.message, "danger");
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-xs font-bold transition-colors shadow flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" /> Export Diagnostic Package
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 italic text-center py-12 flex-1">Probing system diagnostics...</div>
                )}
              </div>
            ) : (
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
                    <div className="mt-3">
                        <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Security PIN (Optional)</label>
                        <input 
                            type="text" 
                            placeholder="Leave blank for public access" 
                            value={virtualDisplayConfig.pin || ''} 
                            onChange={(e) => setVirtualDisplayConfig({...virtualDisplayConfig, pin: e.target.value})} 
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500 font-mono" 
                        />
                        <p className="text-[9px] text-gray-600 mt-1 italic">
                            * If set, all remote devices (Deck, Buzzer, Viewer) will be blocked by a PIN pad.
                        </p>
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

                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 pb-1 mt-4">Multi-Machine Redundancy</h4>
                  <div className="bg-gray-950 p-3 rounded border border-gray-800">
                    <label className="block text-xs text-gray-400 mb-2">Network Role:</label>
                    <select 
                        value={syncMode} 
                        onChange={(e) => setSyncMode(e.target.value)} 
                        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-blue-500"
                    >
                        <option value="standalone">Standalone (Local Operation Only)</option>
                        <option value="master">Master (Broadcast Timeline State)</option>
                        <option value="backup">Backup (Slave to Master over LAN)</option>
                    </select>
                    <p className="text-[9px] text-gray-500 mt-2 italic leading-relaxed">
                        * Master broadcasts UDP heartbeats. Backup listens and instantly slaves its local timeline to match.
                    </p>
                    {syncMode === 'master' && (
                        <div className="mt-4 pt-3 border-t border-gray-800">
                            <label className="block text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-2">Deploy .TSPack to Backup</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={backupIp} 
                                    onChange={(e) => setBackupIp(e.target.value)} 
                                    placeholder="Backup IP (e.g. 192.168.1.51)" 
                                    className="w-1/2 bg-black border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-blue-500 font-mono" 
                                />
                                <button onClick={async (e) => {
                                    if (!backupIp) return alert('Enter Backup IP Address');
                                    
                                    try {
                                        const { ipcRenderer } = window.require('electron');
                                        const { canceled, filePaths } = await ipcRenderer.invoke('show-open-dialog', { title: 'Select Pack to Push', filters: [{ name: 'TSPack', extensions: ['TSPack'] }] });
                                        if (!canceled && filePaths.length > 0) {
                                            const btn = e.target;
                                            const originalText = btn.innerText;
                                            btn.innerText = 'Pushing...';
                                            btn.disabled = true;
                                            
                                            const res = await ipcRenderer.invoke('push-tspack-to-backup', { packPath: filePaths[0], targetIp: backupIp });
                                            
                                            btn.innerText = originalText;
                                            btn.disabled = false;
                                            
                                            if (res.success) alert('Pack successfully deployed and loaded on Backup!');
                                            else alert('Failed to push pack: ' + res.error);
                                        }
                                    } catch (err) {}
                                }} className="flex-1 bg-blue-900/50 hover:bg-blue-800 border border-blue-700 text-blue-200 rounded px-2 py-1.5 text-xs font-bold transition-colors disabled:opacity-50">
                                    Select Pack & Push
                                </button>
                            </div>
                        </div>
                    )}
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
            )}

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
        setIsPluginManagerOpen={setIsPluginManagerOpen}
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
              disableVisualizers={perfFlags.disableVisualizers}
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
            hardwareDisplays={hardwareDisplays}
            previewDisplayFilter={previewDisplayFilter}
            setPreviewDisplayFilter={setPreviewDisplayFilter}
          />
        </div>
        
        {showInspector && (
          <Inspector 
            cues={cues} setCues={setCues} selectedCueIds={selectedCueIds} activeCues={activeCues} 
            isMixed={isMixed} getSharedVal={getSharedVal} updateSelectedCues={updateSelectedCues} 
            getNativeFilePath={getNativeFilePath} videoDevices={videoDevices} hardwareDisplays={hardwareDisplays} urlHistory={urlHistory}
            setEditingMaskCueId={setEditingMaskCueId} setEditingWarpCueId={setEditingWarpCueId} handleUrlBlur={handleUrlBlur} setEditingPathCueId={setEditingPathCueId}
            mediaTimes={mediaTimes} setShowInspector={setShowInspector} customShaders={customShaders}
          />
        )}
      </div>

      <StatusBar localIp={localIp} virtualDisplayConfig={virtualDisplayConfig} ioConfig={ioConfig} setShowQrModal={setShowQrModal} masterVolumeUI={masterVolumeUI} handleMasterVolumeSlider={handleMasterVolumeSlider} performanceTier={performanceTier} syncMode={syncMode} syncActive={syncActive} />
      
      {isPluginManagerOpen && (
        <PluginManagerModal onClose={() => setIsPluginManagerOpen(false)} />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] max-w-sm flex items-start gap-3 p-4 rounded-lg shadow-2xl border transition-all duration-300 animate-slide-in ${
          toast.type === 'danger' 
            ? 'bg-red-950/90 border-red-800/80 text-red-200' 
            : 'bg-yellow-950/90 border-yellow-800/80 text-yellow-200'
        }`}>
          <div className="flex-shrink-0">
            <AlertTriangle className={`w-5 h-5 ${toast.type === 'danger' ? 'text-red-400' : 'text-yellow-400'}`} />
          </div>
          <div className="flex-1 text-xs">
            <div className="font-bold uppercase tracking-wider mb-0.5">
              {toast.type === 'danger' ? 'Delivery Failure' : 'Operator Note'}
            </div>
            <p className="opacity-90 font-mono">{toast.message}</p>
          </div>
          <button 
            onClick={() => setToast(null)} 
            className="text-gray-400 hover:text-white transition-colors p-0.5 rounded hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
