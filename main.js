import electronPkg from 'electron';
const { app, BrowserWindow, screen, ipcMain, dialog, Menu } = electronPkg;
import path from 'path';
import { pluginManager } from './pluginManager.js';
import { projectorEngine } from './projectorEngine.js';
import { dmxEngine } from './dmxEngine.js';
import { syncEngine } from './syncEngine.js';
import { fileURLToPath } from 'url';
import { exec, execSync, spawn } from 'child_process';
import { createRequire } from 'module';
import fsPromises from 'fs/promises';

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
let deckClients = [];
let deckConfig = { buttons: [] };
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

// Global reference for the recording stream
let recordingStream = null;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width, height } = primaryDisplay.workArea;

  const iconPath = app.isPackaged ? path.join(__dirname, 'dist', 'icon.png') : path.join(__dirname, 'public', 'icon.png');

  splashWindow = new BrowserWindow({
    width: 600, height: 400, transparent: true, frame: false, alwaysOnTop: true, icon: iconPath,
    x: Math.round(x + (width - 600) / 2),
    y: Math.round(y + (height - 400) / 2),
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
  });

  if (app.isPackaged) splashWindow.loadFile(path.join(__dirname, 'dist', 'splash.html'));
  else splashWindow.loadFile(path.join(__dirname, 'public', 'splash.html'));

  mainWindow = new BrowserWindow({
    width: 1280, height: 720, title: "TuxShow", show: false, icon: iconPath,
    x: Math.round(x + (width - 1280) / 2),
    y: Math.round(y + (height - 720) / 2),
    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false, 
      webSecurity: false,
      preload: path.join(__dirname, 'src', 'preload.js')
    }
  });

  // Native Context Menu for Text Fields (Zero React Overhead)
  mainWindow.webContents.on('context-menu', (event, params) => {
    if (params.isEditable) {
      const template = [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'selectAll' }
      ];
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWindow });
    }
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

  mainWindow.webContents.on('did-finish-load', () => {
    syncEngine.init(mainWindow.webContents);
  });

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

  ipcMain.handle('get-local-ip', () => {
    try {
      const os = require('os');
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
          if (net.family === 'IPv4' && !net.internal) {
            return net.address;
          }
        }
      }
    } catch (e) {
      console.error("Error fetching local IP:", e);
    }
    return '127.0.0.1'; // Fallback
  });

  ipcMain.handle('get-system-profile', () => {
    try {
      const os = require('os');
      const cpus = os.cpus();
      return {
          cpuCores: cpus.length,
          cpuModel: cpus[0]?.model || 'Unknown CPU',
          totalRamGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
          freeRamGB: Math.round(os.freemem() / (1024 * 1024 * 1024)),
          platform: process.platform
      };
    } catch (e) {
      console.error("[TuxShow] Error gathering system profile:", e);
      return null;
    }
  });

  // --- CORE APP FILE SYSTEM & DIALOG HANDLERS ---
  ipcMain.handle('show-open-dialog', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, options);
    return result;
  });

  ipcMain.handle('read-show-file', async (event, filePath) => {
    try {
      // Hardened approach: we return parsed text data, never file handles
      const data = await fsPromises.readFile(filePath, 'utf-8');
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-workspace', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Open Workspace',
        properties: ['openFile'],
        filters: [
            { name: 'TuxShow Workspaces', extensions: ['TSW', 'TSShow', 'TSPack', 'json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!canceled && filePaths.length > 0) {
        const fs = require('fs');
        const path = require('path');
        const targetPath = filePaths[0];

        // IF IT IS A PACKED ARCHIVE, EXTRACT IT FIRST
        if (targetPath.toLowerCase().endsWith('.tspack')) {
            const os = require('os');
            const { execSync } = require('child_process');
            
            console.log('[Loader] .TSPack detected. Extracting...');
            const syncDir = path.join(os.tmpdir(), 'tuxshow-active-sync');
            if (fs.existsSync(syncDir)) fs.rmSync(syncDir, { recursive: true, force: true });
            fs.mkdirSync(syncDir, { recursive: true });

            try {
                execSync(`tar -xzf "${targetPath}" -C "${syncDir}"`);
                const showJsonPath = path.join(syncDir, 'show.json');
                
                if (fs.existsSync(showJsonPath)) {
                    let showData = JSON.parse(fs.readFileSync(showJsonPath, 'utf8'));
                    
                    // Rewrite relative media paths to the absolute extraction folder
                    if (showData.cues) {
                        showData.cues = showData.cues.map(c => {
                            if (c.url && c.url.startsWith('./media/')) {
                                const newUrl = path.join(syncDir, 'media', c.url.replace('./media/', ''));
                                return { ...c, url: 'file://' + newUrl.replace(/\\/g, '/') };
                            }
                            return c;
                        });
                    }
                    return { success: true, data: JSON.stringify(showData), filePath: targetPath };
                } else {
                    throw new Error("show.json not found inside the .TSPack archive.");
                }
            } catch (err) {
                return { success: false, error: "Failed to extract .TSPack: " + err.message };
            }
        } 
        
        // IF IT IS A STANDARD .TSW OR .TSSHOW, READ IT DIRECTLY
        else {
            const rawData = fs.readFileSync(targetPath, 'utf-8');
            return { success: true, data: rawData, filePath: targetPath };
        }
    }
    return { success: false, canceled: true };
  });

  ipcMain.handle('save-show-file', async (event, filePath, data) => {
    try {
      await fsPromises.writeFile(filePath, data, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('choose-pack-destination', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save Packed Workspace',
      defaultPath: 'show.TSPack',
      filters: [{ name: 'TuxShow Pack', extensions: ['TSPack'] }]
    });
    return { canceled, filePath };
  });

  // SAVE SEQUENCE SNIPPET
  ipcMain.handle('save-sequence-snippet', async (event, snippetData) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const { filePath } = await dialog.showSaveDialog({
        title: 'Save Sequence Snippet',
        defaultPath: 'sequence.tssnip',
        filters: [{ name: 'TuxShow Snippet', extensions: ['tssnip'] }]
      });
      
      if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify(snippetData, null, 2));
        return { success: true, filePath };
      }
      return { success: false, canceled: true };
    } catch (e) {
      console.error("[TuxShow] Error saving snippet:", e);
      return { success: false, error: e.message };
    }
  });

  // LOAD SEQUENCE SNIPPET
  ipcMain.handle('load-sequence-snippet', async (event) => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Load Sequence Snippet',
        properties: ['openFile'],
        filters: [{ name: 'TuxShow Snippet', extensions: ['tssnip'] }]
      });
      
      if (filePaths && filePaths.length > 0) {
        const rawData = fs.readFileSync(filePaths[0], 'utf-8');
        const parsedData = JSON.parse(rawData);
        return { success: true, data: parsedData };
      }
      return { success: false, canceled: true };
    } catch (e) {
      console.error("[TuxShow] Error loading snippet:", e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('set-sync-mode', (event, { mode, port }) => {
      try {
          syncEngine.setMode(mode, port);
          return { success: true, mode };
      } catch (e) {
          console.error("[TuxShow] Error setting sync mode:", e);
          return { success: false, error: e.message };
      }
  });

  ipcMain.handle('create-tspack', async (event, { packPath, cues, pins, gridSize }) => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    try {
      console.log(`[Packer] Initializing .TSPack creation at: ${packPath}`);
      
      // 1. Create a temporary staging directory
      const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuxshow-pack-'));
      const mediaDir = path.join(stagingDir, 'media');
      fs.mkdirSync(mediaDir);

      // 2. Process cues and copy media natively
      let packedCues = JSON.parse(JSON.stringify(cues));
      const copiedFilesMap = new Map();

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
              
              fs.copyFileSync(originalPath, newPath);
              const relativeUrl = `./media/${safeFileName}`;
              cue.url = relativeUrl;
              copiedFilesMap.set(originalPath, relativeUrl);
          } else {
              console.warn(`[Packer] Warning: Media file not found - ${originalPath}`);
          }
        }
      }

      // 3. Write the workspace JSON
      const stateToSave = { 
          cues: packedCues.map(c => ({ ...c, state: 'stopped' })), 
          pins, 
          gridSize, 
          isPaused: false, 
          globalPause: false 
      };
      const tswPath = path.join(stagingDir, 'show.json');
      fs.writeFileSync(tswPath, JSON.stringify(stateToSave, null, 2));

      // 4. Compress using native OS tar command
      const finalDest = packPath.endsWith('.TSPack') ? packPath : `${packPath}.TSPack`;
      
      // Ensure the destination directory exists before tar tries to write the file
      const destDir = path.dirname(finalDest);
      if (!fs.existsSync(destDir)) {
          console.log(`[Packer] Creating missing destination directory: ${destDir}`);
          fs.mkdirSync(destDir, { recursive: true });
      }

      // tar -c (create), -z (gzip), -f (file). -C changes dir before executing so the archive root is clean
      await execAsync(`tar -czf "${finalDest}" -C "${stagingDir}" .`);

      // 5. Cleanup temporary staging directory
      fs.rmSync(stagingDir, { recursive: true, force: true });

      console.log(`[Packer] Successfully built archive: ${finalDest}`);
      return { success: true, filePath: finalDest };
      
    } catch (err) {
      console.error('[Packer] Failed to create TSPack:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('push-tspack-to-backup', async (event, { packPath, targetIp }) => {
    const fs = require('fs');
    const http = require('http');

    return new Promise((resolve) => {
        try {
            const stat = fs.statSync(packPath);
            const req = http.request({
                hostname: targetIp,
                port: 53002, // UDP runs on 53001, HTTP runs on +1
                path: '/sync-pack',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': stat.size
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) resolve({ success: true });
                    else resolve({ success: false, error: body });
                });
            });

            req.on('error', (e) => resolve({ success: false, error: e.message }));

            const readStream = fs.createReadStream(packPath);
            readStream.on('error', (e) => {
                console.error('[Packer] Read stream error:', e.message);
                resolve({ success: false, error: e.message });
            });
            readStream.pipe(req);
        } catch (e) {
            resolve({ success: false, error: e.message });
        }
    });
  });

  // --- RECORDING IPC HANDLERS ---
  // 1. Handle the request to choose a save destination
  ipcMain.handle('choose-record-destination', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save Show Recording',
      defaultPath: 'TuxShow_Recording.webm',
      filters: [{ name: 'WebM Video', extensions: ['webm'] }]
    });
    
    if (canceled || !filePath) return null;
    
    // Initialize the write stream
    recordingStream = fs.createWriteStream(filePath);
    recordingStream.on('error', (err) => {
        console.error('[TuxShow] Recording stream error:', err.message);
        recordingStream = null;
    });
    return filePath;
  });

  // 2. Handle incoming video chunks from the frontend
  ipcMain.on('save-video-chunk', (event, arrayBuffer) => {
    if (recordingStream) {
      recordingStream.write(Buffer.from(arrayBuffer));
    }
  });

  // 3. Handle stopping the recording and injecting metadata
  ipcMain.on('stop-recording', (event, durationMs) => {
    if (recordingStream) {
      const finalPath = recordingStream.path;

      // Close the stream safely
      recordingStream.end(() => {
        recordingStream = null;
        console.log(`[TuxShow] Recording stream closed. Fixing metadata...`);
        
        const fixedPath = finalPath.replace('.webm', '_fixed.webm');
        
        // Use native ffmpeg to instantly rebuild the WebM container with correct duration metadata
        exec(`ffmpeg -y -i "${finalPath}" -c copy "${fixedPath}"`, async (error) => {
            if (!error) {
                try {
                    await fsPromises.rename(fixedPath, finalPath);
                    console.log('[TuxShow] WebM Metadata successfully injected via FFmpeg!');
                } catch (e) {
                    console.error('[TuxShow] Error replacing original file:', e);
                }
            } else {
                console.warn('[TuxShow] FFmpeg fix failed. Is ffmpeg installed on the system?', error);
            }
        });
      });
    }
  });

  // --- VIRTUAL HTTP DISPLAY ENGINE ---
  ipcMain.on('start-virtual-display', (event, { port, path: streamPath, pin }) => {
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

      // --- AUTHENTICATION GATEWAY ---
      // Check for the tuxshow_auth cookie
      const authCookie = req.headers.cookie?.split('; ').find(row => row.startsWith('tuxshow_auth='))?.split('=')[1];
      
      // Define which routes require protection (UI and APIs)
      const baseRoute = req.url.split('?')[0];
      const isProtected = ['/deck', '/buzzer', '/camera', '/cuelist', streamPath].includes(baseRoute) || 
                          req.url.startsWith('/api/') || 
                          req.url === '/mobile-cam-offer' || 
                          req.url === '/webrtc-offer';

      if (pin && isProtected && authCookie !== pin) {
          // If it's an API request, cleanly reject it
          if (req.method === 'POST' || req.url.startsWith('/api/deck/stream')) {
              res.writeHead(401, { 'Content-Type': 'application/json' }); 
              res.end(JSON.stringify({ error: 'Unauthorized. PIN required.' })); 
              return;
          }
          
          // If it's a browser request for a UI, serve the TuxShow PIN Pad
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
              <!DOCTYPE html>
              <html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0"><title>TuxShow Security</title>
              <style>
              body { background: #030712; color: #f3f4f6; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .box { background: #111827; padding: 30px; border-radius: 12px; border: 1px solid #1f2937; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 80%; max-width: 320px; }
              h2 { margin-top: 0; color: #60a5fa; font-size: 18px; text-transform: uppercase; letter-spacing: 2px; }
              p { color: #9ca3af; font-size: 12px; margin-bottom: 20px; }
              input { background: #000; border: 1px solid #374151; color: #fff; font-size: 24px; padding: 12px; text-align: center; width: 100%; box-sizing: border-box; border-radius: 8px; margin-bottom: 20px; letter-spacing: 12px; outline: none; }
              input:focus { border-color: #3b82f6; }
              button { background: #2563eb; color: #fff; border: none; padding: 14px; font-size: 14px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; text-transform: uppercase; letter-spacing: 1px; }
              button:hover { background: #1d4ed8; }
              </style></head><body>
              <div class="box">
                  <h2>Security Gateway</h2>
                  <p>A PIN is required to access this interface.</p>
                  <input type="password" id="pin" pattern="[0-9]*" inputmode="numeric" autofocus>
                  <button onclick="document.cookie='tuxshow_auth='+document.getElementById('pin').value+';path=/;max-age=31536000';window.location.reload();">Unlock</button>
              </div>
              <script>document.getElementById('pin').addEventListener('keypress', function(e){ if(e.key==='Enter') document.querySelector('button').click(); });</script>
              </body></html>
          `);
          return;
      }
      // --- END AUTHENTICATION GATEWAY ---

      // Handle PWA Manifests & Icon
      if (req.method === 'GET' && req.url === '/manifest-cam.json') {
        const manifest = { name: "TuxShow Cam", short_name: "TuxShow Cam", display: "standalone", background_color: "#000000", theme_color: "#000000", icons: [{ src: "/icon.png", sizes: "192x192 512x512", type: "image/png" }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return;
      }
      if (req.method === 'GET' && req.url === '/manifest-view.json') {
        const manifest = { name: "TuxShow View", short_name: "TuxShow View", display: "standalone", background_color: "#000000", theme_color: "#000000", icons: [{ src: "/icon.png", sizes: "192x192 512x512", type: "image/png" }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return;
      }
      if (req.method === 'GET' && req.url === '/manifest-deck.json') {
        const manifest = { name: "TuxShow Deck", short_name: "TuxShow Deck", start_url: "/deck", display: "standalone", background_color: "#111827", theme_color: "#111827", icons: [{ src: "/icon.png", sizes: "192x192 512x512", type: "image/png" }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return;
      }
      if (req.method === 'GET' && req.url === '/manifest-buzzer.json') {
        const manifest = { name: "TuxShow Buzzer", short_name: "TS Buzzer", start_url: "/buzzer", display: "standalone", background_color: "#111827", theme_color: "#111827", icons: [{ src: "/icon.png", sizes: "192x192 512x512", type: "image/png" }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return;
      }
      if (req.method === 'GET' && req.url === '/manifest-cuelist.json') {
        const manifest = { name: "TuxShow Script", short_name: "Script", display: "standalone", background_color: "#111827", theme_color: "#111827", icons: [{ src: "/icon.png", sizes: "192x192 512x512", type: "image/png" }] };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return;
      }
      if (req.method === 'GET' && req.url === '/cuelist') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'cuelist.html') : path.join(__dirname, 'public', 'cuelist.html');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end('CueList UI not found.'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content); }
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/cuelist.js') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'cuelist.js') : path.join(__dirname, 'public', 'cuelist.js');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(content); }
        });
        return;
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

      // Handle Deck PWA Static Files
      if (req.method === 'GET' && req.url === '/deck') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'deck.html') : path.join(__dirname, 'public', 'deck.html');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end('Deck UI not found.'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content); }
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/deck.js') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'deck.js') : path.join(__dirname, 'public', 'deck.js');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(content); }
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/deck.css') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'deck.css') : path.join(__dirname, 'public', 'deck.css');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(content); }
        });
        return;
      }
      
      // Handle Buzzer PWA Static Files
      if (req.method === 'GET' && req.url.split('?')[0] === '/buzzer') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'buzzer.html') : path.join(__dirname, 'public', 'buzzer.html');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end('Buzzer UI not found.'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content); }
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/buzzer.js') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'buzzer.js') : path.join(__dirname, 'public', 'buzzer.js');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(content); }
        });
        return;
      }
      if (req.method === 'GET' && req.url === '/buzzer.css') {
        const filePath = app.isPackaged ? path.join(__dirname, 'dist', 'buzzer.css') : path.join(__dirname, 'public', 'buzzer.css');
        fs.readFile(filePath, (err, content) => {
          if (err) { res.writeHead(404); res.end(); }
          else { res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(content); }
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

      // Handle Deck API Routes
      if (req.method === 'GET' && req.url === '/api/deck/config') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(deckConfig));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/deck/command') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { path, args } = JSON.parse(body);
            if (mainWindow && !mainWindow.isDestroyed() && path) {
              mainWindow.webContents.send('osc-message', { path, args: args || [] });
              res.writeHead(200);
              res.end();
            } else {
              res.writeHead(500);
              res.end();
            }
          } catch(e) {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/api/deck/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('\n');

        const clientId = Date.now();
        const newClient = { id: clientId, res };
        deckClients.push(newClient);

        req.on('close', () => {
          deckClients = deckClients.filter(client => client.id !== clientId);
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
        fullscreen: true, frame: false, backgroundColor: '#000000', icon: iconPath,
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
      fullscreen: true, frame: false, backgroundColor: '#000000', alwaysOnTop: true, icon: iconPath,
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

  // --- PLUGIN MANAGER IPC HANDLERS ---
  ipcMain.handle('plugin-install-archive', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Install Plugin Archive',
      filters: [{ name: 'Archives', extensions: ['zip', 'tar.gz', 'tgz', 'gz'] }]
    });
    if (canceled || filePaths.length === 0) return { success: false, error: 'User canceled' };
    return await pluginManager.installArchive(filePaths[0]);
  });

  ipcMain.handle('plugin-toggle-state', async (event, id, isEnabled) => {
    try {
      if (isEnabled) await pluginManager.startPlugin(id);
      else await pluginManager.stopPlugin(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('plugin-get-loaded', () => {
    return pluginManager.getLoadedPlugins();
  });

  // =======================================================================
  // TUXSHOW PLUG-IN EXTENSIBILITY IPC HANDLERS
  // =======================================================================
  ipcMain.on('tuxshow:requestCueFire', (event, cueId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Map to the internal OSC listener format that App.jsx already expects
      mainWindow.webContents.send('osc-message', { path: `/tuxshow/cue/${cueId}/start`, args: [] });
    }
  });

  ipcMain.on('tuxshow:pluginStatus', (event, { pluginId, status }) => {
    console.log(`[Plugin System] ${pluginId} reported status:`, status);
  });

  ipcMain.on('tuxshow:registerShader', (event, { pluginId, shaderConfig }) => {
    console.log(`[Plugin System] Registered shader effect from ${pluginId}`);
    // Forward to the renderer to compile into the WebGL pipeline
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tuxshow:shader-registered', { pluginId, shaderConfig });
    }
  });

  ipcMain.on('tuxshow:writeLog', (event, { pluginId, level, message }) => {
    console.log(`[Plugin:${pluginId}] [${level.toUpperCase()}] ${message}`);
  });

  ipcMain.on('broadcast-state', (event, state) => {
    lastKnownState = state;
    syncEngine.broadcastState(state);
    projectorWindows.forEach(win => { if (!win.isDestroyed()) win.webContents.send('sync-state', state); });

    // Broadcast read-only cue telemetry back to the preload bridge
    if (mainWindow && !mainWindow.isDestroyed() && state.cues) {
      mainWindow.webContents.send('tuxshow:cueChanged', state.cues);
    }
  });

  ipcMain.on('request-state', (event) => {
    if (lastKnownState) {
      event.sender.send('sync-state', lastKnownState);
    }
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

  ipcMain.on('fire-projector-cue', (event, { ip, port, protocol, payload, password }) => {
    projectorEngine.fireCommand(ip, port, protocol, payload, password);
  });

  ipcMain.on('fire-dmx-cue', (event, { channel, endValue, duration }) => {
    dmxEngine.fadeChannel(channel, endValue, duration * 1000);
  });

  ipcMain.on('broadcast-status', (event, data) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    deckClients.forEach(client => client.res.write(message));
  });

  ipcMain.on('broadcast-cuelist', (event, dietCues) => {
    const message = `data: ${JSON.stringify({ type: 'cuelist', payload: dietCues })}\n\n`;
    deckClients.forEach(client => client.res.write(message));
  });

  ipcMain.on('update-deck-config', (event, config) => {
    deckConfig = config;
  });
}

app.whenReady().then(async () => {
  await pluginManager.init((plugins) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('plugin-state-changed', plugins);
    }
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (virtualHttpServer) {
    Object.values(virtualClients).forEach(c => { try { c.destroy(); } catch(e){} });
    virtualHttpServer.close();
  }
  deckClients.forEach(client => client.res.end());
  if (process.platform !== 'darwin') app.quit();
});
