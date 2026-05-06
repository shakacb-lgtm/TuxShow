import { app, BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

// --- HARDWARE GPU TUNING ---
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
      console.warn("TuxShow: Could not execute lspci to detect GPU. Defaulting to safe mode.", e);
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
      app.commandLine.appendSwitch('enable-zero-copy');
      app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
      currentGpuStatus = "Zero-Copy Unified Memory Accelerated";
    } else {
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

function createWindow() {
  const iconPath = app.isPackaged 
    ? path.join(__dirname, 'dist', 'icon.png') 
    : path.join(__dirname, 'public', 'icon.png');

  // --- SPLASH SCREEN RESTORED ---
  splashWindow = new BrowserWindow({
    width: 1024, height: 559, frame: false, alwaysOnTop: true,
    backgroundColor: '#0f172a', show: true, icon: iconPath
  });

  if (app.isPackaged) splashWindow.loadFile(path.join(__dirname, 'dist', 'splash.html'));
  else splashWindow.loadFile(path.join(__dirname, 'public', 'splash.html'));

  // --- MAIN CONTROL WINDOW ---
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
      if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('projector-closed');
      }
    });
  });

  ipcMain.on('close-projector', () => {
    if (projectorWindow) {
      projectorWindow.close();
    }
  });

  // --- OMT BROADCAST IPC STUBS ---
  ipcMain.on('start-omt-broadcast', () => {
    console.log("Backend received: Start OMT Broadcast");
    // Future OMT Network routing logic will go here
  });

  ipcMain.on('stop-omt-broadcast', () => {
    console.log("Backend received: Stop OMT Broadcast");
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
