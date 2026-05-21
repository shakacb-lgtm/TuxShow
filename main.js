import electronPkg from 'electron';
const { app, BrowserWindow, screen, ipcMain } = electronPkg;
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
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns'); // Expose raw local IPs for fast LAN discovery
app.commandLine.appendSwitch('ignore-certificate-errors'); // Allow self-signed certs for local WebRTC signaling

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

let mainWindow;
let splashWindow;
let projectorWindows = [];
let receiverWindow = null;
let lastKnownState = null;

let oscServerInstance = null;
let OSCClient = null;
let OSCServer = null;

let virtualHttpServer = null;
let virtualClients = {}; // Changed to an object map to track SDP requests
const http = require('http');
const https = require('https');
const fs = require('fs');

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
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    const loadVite = () => {
      mainWindow.loadURL('http://localhost:5173').catch(() => {
        setTimeout(loadVite, 500);
      });
    };
    loadVite();
  }

  mainWindow.once('ready-to-show', () => {
    try { mainWindow.webContents.setWebRTCIPHandlingPolicy('default_public_and_private_interfaces'); } catch (e) {}
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
  ipcMain.on('start-virtual-display', (event, { port, path: streamPath }) => {
    if (virtualHttpServer) { 
      Object.values(virtualClients).forEach(c => { try { c.destroy(); } catch(e){} });
      virtualHttpServer.close(); 
      virtualHttpServer = null; 
    }
    virtualClients = {};
    
    const keyPath = path.join(app.getPath('userData'), 'tuxshow.key');
    const certPath = path.join(app.getPath('userData'), 'tuxshow.cert');
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        try {
            console.log("[TuxShow] Generating self-signed HTTPS certificates for WebRTC...");
            execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=TuxShow Local LAN"`);
        } catch (e) {
            console.warn("[TuxShow] openssl failed, falling back to HTTP. Mobile Camera may be blocked by browsers.");
        }
    }
    let tlsOptions = null;
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        tlsOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    }

    const requestHandler = (req, res) => {
      // Handle CORS Preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        res.end();
        return;
      }

      // Handle PWA Manifests & Icon
      if (req.method === 'GET' && req.url === '/manifest-cam.json') {
        const manifest = { name: "TuxShow Cam", short_name: "TuxShow Cam", display: "standalone", background_color: "#000000", theme_color: "#000000", icons: [{ src: "/icon.png", sizes: "192x192 512x512", type: "image/png" }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return;
      }
      if (req.method === 'GET' && req.url === '/manifest-view.json') {
        const manifest = { name: "TuxShow View", short_name: "TuxShow View", display: "standalone", background_color: "#000000", theme_color: "#000000", icons: [{ src: "/icon.png", sizes: "192x192 512x512", type: "image/png" }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return;
      }
      if (req.method === 'GET' && req.url === '/icon.png') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'icon.png') : path.join(__dirname, 'public', 'icon.png');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }); res.end(content); }
        });
        return;
      }

      // Handle Mobile Camera PWA Static Files
      if (req.method === 'GET' && req.url === '/camera') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'mobile-cam.html') : path.join(__dirname, 'public', 'mobile-cam.html');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end('Mobile Camera UI not found. Ensure public/mobile-cam.html exists.'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content); }
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/mobile-cam.js') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'mobile-cam.js') : path.join(__dirname, 'public', 'mobile-cam.js');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(content); }
        });
        return;
      }

      // Handle Web Browser Viewer
      if (req.method === 'GET' && req.url === streamPath) {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'viewer.html') : path.join(__dirname, 'public', 'viewer.html');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end('Viewer UI not found.'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content); }
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/viewer.js') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'viewer.js') : path.join(__dirname, 'public', 'viewer.js');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(content); }
        });
        return;
      }

      // Handle incoming Mobile Camera WebRTC SDP Offers
      if (req.method === 'POST' && req.url === '/mobile-cam-offer') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const offerId = Date.now().toString() + Math.random().toString();
            virtualClients[offerId] = res;
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('mobile-cam-offer', { offerId, sdp: data.sdp });
            } else {
              res.writeHead(500); res.end();
            }
            
            setTimeout(() => {
              if (virtualClients[offerId]) {
                 virtualClients[offerId].writeHead(504);
                 virtualClients[offerId].end();
                 delete virtualClients[offerId];
              }
            }, 10000);
          } catch(e) {
            res.writeHead(400); res.end();
          }
        });
        return;
      }

      // Handle incoming WebRTC SDP Offers
      if (req.method === 'POST' && req.url === streamPath) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const offerId = Date.now().toString() + Math.random().toString();
            virtualClients[offerId] = res;
            
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('webrtc-offer', { offerId, sdp: data.sdp });
            } else {
              res.writeHead(500); res.end();
            }
            
            // Timeout the request if the renderer doesn't reply fast enough
            setTimeout(() => {
              if (virtualClients[offerId]) {
                 virtualClients[offerId].writeHead(504);
                 virtualClients[offerId].end();
                 delete virtualClients[offerId];
              }
            }, 10000);
          } catch(e) {
            res.writeHead(400); res.end();
          }
        });
      } else {
        res.writeHead(404); res.end();
      }
    };

    virtualHttpServer = tlsOptions ? https.createServer(tlsOptions, requestHandler) : http.createServer(requestHandler);

    virtualHttpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[TuxShow] ERROR: Port ${port} is currently locked by another process. Please wait a moment or try a different port.`);
      } else {
        console.error('[TuxShow] Virtual Display Server Error:', err);
      }
    });
    
    virtualHttpServer.listen(port, '0.0.0.0', () => {
      console.log(`[TuxShow] WebRTC Signaling Server running at ${tlsOptions ? 'https' : 'http'}://0.0.0.0:${port}${streamPath}`);
    });
  });

  // --- VIRTUAL WEBRTC ANSWER ROUTER ---
  ipcMain.on('webrtc-answer', (event, { offerId, sdp }) => {
    if (virtualClients[offerId]) {
      virtualClients[offerId].writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      virtualClients[offerId].end(JSON.stringify({ sdp }));
      delete virtualClients[offerId];
    }
  });

  ipcMain.on('stop-virtual-display', () => {
     if (virtualHttpServer) {
       virtualHttpServer.close(); virtualHttpServer = null;
       Object.values(virtualClients).forEach(c => c.end()); virtualClients = {};
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
      try { projWin.webContents.setWebRTCIPHandlingPolicy('default_public_and_private_interfaces'); } catch (e) {}

      projWin.on('closed', () => {
        projectorWindows = projectorWindows.filter(w => w !== projWin);
        if (projectorWindows.length === 0 && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-projector-count', 0);
      });
      projectorWindows.push(projWin);
    });

    const count = idsToSpawn.length;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-projector-count', count);
    projectorWindows.forEach(w => w.webContents.send('update-projector-count', count));
  });

  ipcMain.on('close-projector', () => {
    projectorWindows.forEach(win => { if (!win.isDestroyed()) win.close(); });
    projectorWindows = [];
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-projector-count', 0);
  });

  ipcMain.on('spawn-receiver', (event, { displayId, url }) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    
    if (receiverWindow && !receiverWindow.isDestroyed()) receiverWindow.close();
    
    const displays = screen.getAllDisplays();
    const display = displays.find(d => d.id === displayId) || displays[0];
    
    receiverWindow = new BrowserWindow({
      x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
      fullscreen: true, frame: false, backgroundColor: '#000000', alwaysOnTop: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false, backgroundThrottling: false }
    });
    
    const encodedUrl = encodeURIComponent(url || '');
    if (app.isPackaged) receiverWindow.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: `receiver-${encodedUrl}` });
    else receiverWindow.loadURL(`http://localhost:5173/#receiver-${encodedUrl}`);
    
    try { receiverWindow.webContents.setWebRTCIPHandlingPolicy('default_public_and_private_interfaces'); } catch (e) {}

    receiverWindow.on('closed', () => {
      receiverWindow = null;
    });
  });

  ipcMain.on('exit-receiver', () => {
    if (receiverWindow && !receiverWindow.isDestroyed()) receiverWindow.close();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.webContents.send('receiver-mode-exited');
    }
  });

  ipcMain.on('set-window-title', (event, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(`TuxShow - ${title}`);
    }
  });

  ipcMain.on('broadcast-state', (event, state) => {
    lastKnownState = state;
    projectorWindows.forEach(win => { if (!win.isDestroyed()) win.webContents.send('sync-state', state); });
  });

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
    } catch(e) { console.error('OSC Send Error:', e); }
  });

  ipcMain.on('send-msc', (event, { device, command, cueNumber }) => { console.log(`[MSC Broadcast Simulation] Device: ${device}, Command: ${command}, Cue: ${cueNumber}`); });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (virtualHttpServer) {
    Object.values(virtualClients).forEach(c => { try { c.destroy(); } catch(e){} });
    virtualHttpServer.close();
  }
  if (process.platform !== 'darwin') app.quit();
});
