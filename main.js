import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

// --- OPTIONAL PLUGIN IMPORTS (OSC/MSC) ---
let OSCServer, OSCClient, easymidi;
try {
  const nodeOsc = await import('node-osc');
  OSCServer = nodeOsc.Server;
  OSCClient = nodeOsc.Client;
  easymidi = (await import('easymidi')).default;
} catch (err) {
  console.warn("TuxShow: Hardware I/O plugins (node-osc or easymidi) not installed. Network features will be disabled.");
}

function applyHardwareTuning() {
  let currentGpuStatus = "Standard GPU Accelerated";
  let isIntel = false;
  let isLegacyIntel = false;
  let isAMD = false;
  let isNvidia = false;

  if (os.platform() === 'linux') {
    try {
      const lspciOutput = execSync('lspci -nn | grep -i vga', { encoding: 'utf-8' }).toLowerCase();
      if (lspciOutput.includes('intel')) isIntel = true;
      if (lspciOutput.includes('haswell') || lspciOutput.includes('ivy bridge') || lspciOutput.includes('sandy bridge') || lspciOutput.includes('hd graphics 4')) {
         isLegacyIntel = true;
      }
      if (lspciOutput.includes('amd') || lspciOutput.includes('radeon')) isAMD = true;
      if (lspciOutput.includes('nvidia')) isNvidia = true;
    } catch (e) {
      console.warn("TuxShow: Could not execute lspci to detect GPU. Defaulting to safe mode.");
    }
  }

  if (isLegacyIntel) {
    console.log("TuxShow: Legacy Intel GPU detected (Haswell/Older). Enabling Safe Fallback Mode.");
    app.commandLine.appendSwitch('disable-accelerated-video-decode'); 
    app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
    currentGpuStatus = "Legacy Fallback Mode (Haswell)";
  } else {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization');
    app.commandLine.appendSwitch('use-gl', 'desktop');

    if ((isIntel || isAMD) && !isNvidia) {
      console.log("TuxShow: Modern Intel/AMD iGPU detected. Enabling Zero-Copy Unified Memory optimizations.");
      app.commandLine.appendSwitch('enable-zero-copy');
      app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
      currentGpuStatus = "Zero-Copy Unified Memory Accelerated";
    } else {
      console.log("TuxShow: Dedicated GPU (or Nvidia) detected. Bypassing Zero-Copy for maximum stability.");
      currentGpuStatus = "Standard GPU Accelerated";
    }
  }
  
  ipcMain.handle('get-gpu-status', () => currentGpuStatus);
}

applyHardwareTuning();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow; 
let projectorWindow;
let splashWindow; 

// --- HARDWARE I/O STATE ---
let oscServerInstance = null;
let mscInputInstance = null;

function createWindow() {
  const iconPath = app.isPackaged 
    ? path.join(__dirname, 'dist', 'icon.png') 
    : path.join(__dirname, 'public', 'icon.png');

  splashWindow = new BrowserWindow({
    width: 1024, height: 559, frame: false, alwaysOnTop: true,
    backgroundColor: '#0f172a', show: true, icon: iconPath
  });

  if (app.isPackaged) splashWindow.loadFile(path.join(__dirname, 'dist', 'splash.html'));
  else splashWindow.loadFile(path.join(__dirname, 'public', 'splash.html'));

  mainWindow = new BrowserWindow({
    width: 1280, height: 720, title: "TuxShow", show: false, icon: iconPath,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
  });

  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  else mainWindow.loadURL('http://localhost:5173');

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      mainWindow.show();
    }, 2500); 
  });

  // --- HARDWARE I/O ROUTES ---
  
  ipcMain.on('update-io-config', (event, config) => {
    // 1. Manage OSC Listener
    if (OSCServer) {
      if (config.oscInput) {
        if (!oscServerInstance) {
          try {
            oscServerInstance = new OSCServer(config.oscPort, '0.0.0.0');
            oscServerInstance.on('message', (msg) => {
              if (mainWindow) mainWindow.webContents.send('osc-message', { path: msg[0], args: msg.slice(1) });
            });
            console.log(`TuxShow: OSC Listener Active on Port ${config.oscPort}`);
          } catch(e) { console.error('OSC Server Failed:', e); }
        }
      } else {
        if (oscServerInstance) { oscServerInstance.close(); oscServerInstance = null; console.log('TuxShow: OSC Listener Closed.'); }
      }
    }

    // 2. Manage MSC (MIDI) Listener
    if (easymidi) {
      if (config.mscInput && config.mscDevice) {
         if (!mscInputInstance) {
            try {
               mscInputInstance = new easymidi.Input(config.mscDevice);
               mscInputInstance.on('sysex', (msg) => {
                  // Forward raw Hex SysEx payload to React to parse Show Control Commands
                  if (mainWindow) mainWindow.webContents.send('msc-message', { raw: msg.bytes });
               });
               console.log(`TuxShow: MSC Listener Active on ${config.mscDevice}`);
            } catch(e) { console.error('MSC MIDI Connection Failed:', e); }
         }
      } else {
         if (mscInputInstance) { mscInputInstance.close(); mscInputInstance = null; console.log('TuxShow: MSC Listener Closed.'); }
      }
    }
  });

  ipcMain.on('send-osc', (event, { ip, port, address, args }) => {
    if (!OSCClient) return;
    try {
      const client = new OSCClient(ip, port);
      const argArray = args ? String(args).split(',').map(a => { const num = parseFloat(a); return isNaN(num) ? a.trim() : num; }) : [];
      client.send(address, ...argArray, () => client.close());
    } catch(e) { console.error('OSC Send Error:', e); }
  });

  ipcMain.on('send-msc', (event, { deviceId, format, command, cueNumber }) => {
    if (!easymidi) return;
    try {
       const cueBytes = cueNumber.split('').map(c => c.charCodeAt(0));
       // Standard Universal MIDI SysEx Header: F0 7F <deviceId> 02 <format> <command> <cueNumberString> F7
       const sysex = [0xF0, 0x7F, parseInt(deviceId), 0x02, parseInt(format), parseInt(command), ...cueBytes, 0xF7];
       
       const outputs = easymidi.getOutputs();
       if (outputs.length > 0) {
           const out = new easymidi.Output(outputs[0]);
           out.send('sysex', sysex);
           out.close();
       }
    } catch(e) { console.error('MSC Send Error:', e); }
  });


  // --- PROJECTOR IPC COMMANDS ---
  ipcMain.on('spawn-projector', () => {
    if (projectorWindow) return;
    const displays = screen.getAllDisplays();
    const externalDisplay = displays.find((display) => display.bounds.x !== 0 || display.bounds.y !== 0);

    projectorWindow = new BrowserWindow({
      x: externalDisplay ? externalDisplay.bounds.x : 0,
      y: externalDisplay ? externalDisplay.bounds.y : 0,
      width: 1280, height: 720, frame: false, fullscreen: !!externalDisplay,
      backgroundColor: '#000000', icon: iconPath,
      webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
    });

    if (app.isPackaged) projectorWindow.loadFile(path.join(__dirname, 'dist', 'index.html'), { hash: 'projector' });
    else projectorWindow.loadURL('http://localhost:5173/#projector');

    projectorWindow.on('closed', () => {
      projectorWindow = null;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('projector-closed');
    });
  });

  ipcMain.on('close-projector', () => { if (projectorWindow) projectorWindow.close(); });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
