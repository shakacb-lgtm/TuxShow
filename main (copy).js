import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execSync, spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================================================================
// GPU AUTO-HEAL & COMPATIBILITY LAYER
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (process.platform === 'linux') {
  try {
    const gpuInfo = execSync('lspci | grep VGA', { encoding: 'utf8' }).toLowerCase();
    if (gpuInfo.includes('intel') && (gpuInfo.includes('haswell') || gpuInfo.includes('4400') || gpuInfo.includes('4600'))) {
      console.log("[TuxShow Boot] Legacy Intel GPU detected. Forcing i965 driver fallback.");
      process.env.LIBVA_DRIVER_NAME = 'i965';
    }
    if (gpuInfo.includes('nvidia')) {
      console.log("[TuxShow Boot] Nvidia GPU detected. Forcing hardware acceleration...");
      app.commandLine.appendSwitch('ignore-gpu-blocklist');
      app.commandLine.appendSwitch('enable-gpu-rasterization');
      app.commandLine.appendSwitch('enable-zero-copy');
    }
  } catch (e) {
    console.warn("[TuxShow Boot] GPU Auto-Heal skipped: Could not execute lspci.");
  }
}
// =========================================================================

let mainWindow;
let splashWindow;
let projectorWindows = [];
let lastKnownState = null;

let oscServerInstance = null;
let OSCClient = null;
let OSCServer = null;

let virtualDisplayProcess = null;
let virtualHttpServer = null;
let virtualClients = [];
const http = require('http');

try {
  const nodeOsc = require('node-osc');
  OSCClient = nodeOsc.Client;
  OSCServer = nodeOsc.Server;
} catch (e) { console.warn("node-osc not installed"); }

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  splashWindow = new BrowserWindow({
    width: 600, height: 400, transparent: true, frame: false, alwaysOnTop: true, 
    x: Math.round(x + (width - 600) / 2),
    y: Math.round(y + (height - 400) / 2),
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  if (app.isPackaged) splashWindow.loadFile(path.join(__dirname, 'dist', 'splash.html'));
  else splashWindow.loadFile(path.join(__dirname, 'public', 'splash.html'));

  mainWindow = new BrowserWindow({
    width: 1280, height: 720, title: "TuxShow", show: false, 
    x: Math.round(x + (width - 1280) / 2),
    y: Math.round(y + (height - 720) / 2),
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  // --- VITE RACE CONDITION FIX ---
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    const loadVite = () => {
      mainWindow.loadURL('http://localhost:5173').catch(() => {
        console.log("[TuxShow] Waiting for Vite Dev Server to start...");
        setTimeout(loadVite, 500); // Retry every 500ms until Vite is ready
      });
    };
    loadVite();
  }

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      mainWindow.show(); mainWindow.focus();
    }, 1500); 
  });

  ipcMain.handle('get-displays', () => {
    return screen.getAllDisplays().map((d, index) => ({
      id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor,
      isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
      label: `Display ${index + 1} (${d.bounds.width}x${d.bounds.height})`
    }));
  });

  ipcMain.handle('get-gpu-status', () => {
    return new Promise((resolve) => {
      if (process.platform === 'linux') {
        exec('lspci | grep VGA', (error, stdout) => {
          if (!error && stdout) {
            if (stdout.toLowerCase().includes('nvidia')) resolve('NVIDIA HW-ACCEL');
            else if (stdout.toLowerCase().includes('intel')) resolve('INTEL HW-ACCEL');
            else if (stdout.toLowerCase().includes('amd')) resolve('AMD HW-ACCEL');
            else resolve('LINUX HW-ACCEL');
          } else resolve('GENERIC HW-ACCEL');
        });
      } else resolve('HW-ACCEL ACTIVE');
    });
  });

  // --- VIRTUAL HTTP DISPLAY ENGINE ---
  ipcMain.on('start-virtual-display', (event, { port, path }) => {
    if (virtualDisplayProcess) { virtualDisplayProcess.kill('SIGINT'); virtualDisplayProcess = null; }
    if (virtualHttpServer) { 
      virtualClients.forEach(c => { try { c.destroy(); } catch(e){} });
      virtualHttpServer.close(); 
      virtualHttpServer = null; 
    }
    virtualClients = [];
    
    virtualHttpServer = http.createServer((req, res) => {
      if (req.url === path) {
        res.writeHead(200, {
          'Content-Type': 'video/mp2t',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        });
        virtualClients.push(res);
        req.on('close', () => { virtualClients = virtualClients.filter(c => c !== res); });
      } else {
        res.writeHead(404); res.end();
      }
    });

    virtualHttpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[TuxShow] ERROR: Port ${port} is currently locked by another process. Please wait a moment or try a different port.`);
      } else {
        console.error('[TuxShow] Virtual Display Server Error:', err);
      }
    });
    
    virtualHttpServer.listen(port, '0.0.0.0', () => {
      console.log(`[TuxShow] HTTP Stream Server running at http://0.0.0.0:${port}${path}`);
    });

    virtualDisplayProcess = spawn('ffmpeg', [
      '-f', 'webm', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-g', '30', '-f', 'mpegts', 'pipe:1'
    ]);

    virtualDisplayProcess.stdout.on('data', (data) => {
      virtualClients.forEach(client => {
        try { client.write(data); } catch(e) {}
      });
    });

    // ANTI-CRASH EPIPE CATCHER
    virtualDisplayProcess.stdin.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'EOF') console.warn(`[TuxShow] FFmpeg pipe gracefully closed (${err.code}).`);
      else console.error('[TuxShow] FFmpeg stdin error:', err);
    });

    virtualDisplayProcess.stderr.on('data', (data) => { 
        // Suppress massive ffmpeg log output in console to avoid lagging the terminal 
    });
    
    virtualDisplayProcess.on('close', (code) => { 
      console.log(`[TuxShow] FFmpeg Transcoder Offline (Exit Code: ${code})`); 
    });
  });

  ipcMain.on('virtual-display-frame', (event, buffer) => {
    if (virtualDisplayProcess && virtualDisplayProcess.stdin && !virtualDisplayProcess.stdin.destroyed) {
      try { virtualDisplayProcess.stdin.write(Buffer.from(buffer)); } 
      catch (err) { console.warn('[TuxShow] Frame dropped: FFmpeg is not accepting data.'); }
    }
  });

  ipcMain.on('stop-virtual-display', () => {
     if (virtualDisplayProcess) { 
       try { virtualDisplayProcess.stdin.end(); } catch (e) {}
       virtualDisplayProcess.kill('SIGINT'); virtualDisplayProcess = null; 
     }
     if (virtualHttpServer) {
       virtualHttpServer.close(); virtualHttpServer = null;
       virtualClients.forEach(c => c.end()); virtualClients = [];
     }
  });

  ipcMain.on('spawn-projector', (event, targetDisplayIds) => {
    projectorWindows.forEach(win => { if (!win.isDestroyed()) win.close(); });
    projectorWindows = [];
    const displays = screen.getAllDisplays();
    const idsToSpawn = (targetDisplayIds && targetDisplayIds.length > 0) ? targetDisplayIds : [displays.length > 1 ? displays[1].id : displays[0].id];

    idsToSpawn.forEach(id => {
      const display = displays.find(d => d.id === id);
      if (!display) return;
      const projWin = new BrowserWindow({
        x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
        fullscreen: true, frame: false, backgroundColor: '#000000',
        webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false, backgroundThrottling: false }
      });
      if (app.isPackaged) projWin.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: `projector-${display.id}` });
      else projWin.loadURL(`http://localhost:5173/#projector-${display.id}`);

      projWin.on('closed', () => {
        projectorWindows = projectorWindows.filter(w => w !== projWin);
        if (projectorWindows.length === 0 && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('projector-closed');
      });
      projectorWindows.push(projWin);
    });
  });

  ipcMain.on('close-projector', () => {
    projectorWindows.forEach(win => { if (!win.isDestroyed()) win.close(); });
    projectorWindows = [];
  });

  ipcMain.on('broadcast-state', (event, state) => {
    lastKnownState = state;
    projectorWindows.forEach(win => { if (!win.isDestroyed()) win.webContents.send('sync-state', state); });
  });

  ipcMain.on('request-state', (event) => { if (lastKnownState) event.reply('sync-state', lastKnownState); });

  ipcMain.on('update-io-config', (event, config) => {
    if (OSCServer) {
      if (config.oscInput && config.oscPort) {
        if (!oscServerInstance || oscServerInstance.port !== config.oscPort) {
          if (oscServerInstance) oscServerInstance.close();
          try {
            oscServerInstance = new OSCServer(config.oscPort, '0.0.0.0', () => { console.log(`[TuxShow] OSC Listener Active on Port ${config.oscPort}`); });
            oscServerInstance.on('message', (msg) => { const [path, ...args] = msg; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('osc-message', { path, args }); });
          } catch(e) { console.error('OSC Server Failed:', e); }
        }
      } else {
        if (oscServerInstance) { oscServerInstance.close(); oscServerInstance = null; console.log('[TuxShow] OSC Listener Closed.'); }
      }
    }
  });

  ipcMain.on('send-osc', (event, { ip, port, address, args }) => {
    if (!OSCClient) return;
    try {
      const client = new OSCClient(ip, port);
      const argArray = args ? String(args).split(',').map(a => { const trimmed = a.trim(); const num = parseFloat(trimmed); return (isNaN(num) || trimmed === '') ? trimmed : num; }) : [];
      client.send(address, ...argArray, () => client.close());
      console.log(`OSC Sent -> IP: ${ip} | Port: ${port} | Addr: ${address}`);
    } catch(e) { console.error('OSC Send Error:', e); }
  });
  
  ipcMain.on('send-msc', (event, { device, command, cueNumber }) => { console.log(`[MSC Broadcast Simulation] Device: ${device}, Command: ${command}, Cue: ${cueNumber}`); });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (virtualDisplayProcess) virtualDisplayProcess.kill();
  if (virtualHttpServer) {
    virtualClients.forEach(c => { try { c.destroy(); } catch(e){} });
    virtualHttpServer.close();
  }
  if (process.platform !== 'darwin') app.quit();
});
