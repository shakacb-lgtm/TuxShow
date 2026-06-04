import React, { useState, useEffect, useRef, Fragment } from 'react';

export function getAffineTransform(w, h, p0, p1, p2, type) {
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

export function applyCanvasAffine(ctx, w, h, p0, p1, p2, type) {
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

const compileShader = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[WebGL] Shader Compile Error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null; // Return null so the pipeline can fall back to the default shader
    }
    return shader;
};

const buildShaderProgram = (gl, vsSource, fsSource) => {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[WebGL] Program Link Error:', gl.getProgramInfoLog(program));
        return null;
    }
    return program;
};

// Default Passthrough Vertex Shader (Handles basic 2D geometry)
const DEFAULT_VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

// Default Passthrough Fragment Shader (Just draws the texture pixels)
const DEFAULT_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    void main() {
        gl_FragColor = texture2D(u_image, v_texCoord);
    }
`;

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

  const [customShaders, setCustomShaders] = useState({});
  const programCache = useRef({});

  const getShaderProgram = (gl, shaderId) => {
      // 1. If no custom shader is requested, use/compile the default program
      if (!shaderId || !customShaders[shaderId]) {
          if (!programCache.current['default']) {
              programCache.current['default'] = buildShaderProgram(gl, DEFAULT_VERTEX_SHADER, DEFAULT_FRAGMENT_SHADER);
          }
          return programCache.current['default'];
      }

      // 2. If a custom shader is requested but hasn't been compiled yet, compile and cache it
      if (!programCache.current[shaderId]) {
          const fsSource = customShaders[shaderId];
          const program = buildShaderProgram(gl, DEFAULT_VERTEX_SHADER, fsSource);
          
          if (program) {
              programCache.current[shaderId] = program;
          } else {
              console.warn(`[WebGL] Custom shader '${shaderId}' failed to compile. Falling back to default.`);
              // If it fails, fall back to default to prevent crashing the renderer
              return programCache.current['default']; 
          }
      }

      // 3. Return the cached custom program
      return programCache.current[shaderId];
  };

  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    
    const handleShaderRegistration = (event, { pluginId, shaderConfig }) => {
        console.log(`[StagePreview] Compiling new shader from ${pluginId}`);
        // shaderConfig should contain { id: string, fragmentSource: string }
        setCustomShaders(prev => {
            // Delete the old cached program so the engine is forced to recompile the new GLSL
            if (programCache.current[shaderConfig.id]) {
                delete programCache.current[shaderConfig.id];
            }
            return {
                ...prev,
                [shaderConfig.id]: shaderConfig.fragmentSource
            };
        });
    };

    ipcRenderer.on('tuxshow:shader-registered', handleShaderRegistration);

    return () => {
        ipcRenderer.removeListener('tuxshow:shader-registered', handleShaderRegistration);
    };
  }, []);

  return (
    <div className="flex-1 relative bg-gray-950 flex items-center justify-center p-8 overflow-hidden" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)', backgroundSize: '30px 30px', backgroundPosition: 'center center' }}>
      <div className="relative bg-black shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-gray-700 w-full max-w-4xl aspect-video overflow-hidden ring-1 ring-black">
        <div className="absolute inset-0 bg-gray-900/20 z-0" />
        {activeMediaCues.filter(c => !['goto','pause','counter','group','time','msc','osc','stop','conditional'].includes(c.type) && !c.disabled).length === 0 && <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-mono tracking-widest pointer-events-none uppercase text-xs z-0">Stage Preview</div>}
        
        <div ref={stageRef} className="absolute inset-0 pointer-events-none z-10">
          {pins.length === (gridSize.x + 1) * (gridSize.y + 1) && quads.map((quad, qIdx) => {
            const pt_tl = { x: pins[quad.indices[0]].x * stageSize.w, y: pins[quad.indices[0]].y * stageSize.h }; const pt_tr = { x: pins[quad.indices[1]].x * stageSize.w, y: pins[quad.indices[1]].y * stageSize.h }; const pt_br = { x: pins[quad.indices[2]].x * stageSize.w, y: pins[quad.indices[2]].y * stageSize.h }; const pt_bl = { x: pins[quad.indices[3]].x * stageSize.w, y: pins[quad.indices[3]].y * stageSize.h };
            return (
              <Fragment key={`quad-${qIdx}`}><canvas id={`quad-ctx-local-${qIdx}-1`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: getAffineTransform(quadW, quadH, pt_tl, pt_tr, pt_bl, 1), clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} /><canvas id={`quad-ctx-local-${qIdx}-2`} className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: quadW, height: quadH, transform: getAffineTransform(quadW, quadH, pt_tr, pt_br, pt_bl, 2), clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} /></Fragment>
            );
          })}
        </div>
        {isMappingMode && pins.map((pin, i) => (<div key={i} className="absolute w-6 h-6 -ml-3 -mt-3 bg-white border-2 border-blue-500 rounded-full shadow-lg cursor-move z-50 flex items-center justify-center hover:scale-125 transition-transform" style={{ left: pin.x * stageSize.w, top: pin.y * stageSize.h }} onPointerDown={(e) => { e.target.setPointerCapture(e.pointerId); const onMove = (moveEvt) => handlePinDrag(i, moveEvt); const onUp = () => { e.target.releasePointerCapture(e.pointerId); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }} ><div className="w-2 h-2 bg-blue-500 rounded-full"/></div>))}
        {showStats && (<div className="absolute top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">{activeMediaCues.filter(c => c.type === 'video' || c.type === 'camera').map(cue => (<VideoStats key={`stats-${cue.id}`} videoId={`master-vid-${cue.id}`} name={cue.name} />))}</div>)}
      </div>
    </div>
  );
});

export default StagePreview;