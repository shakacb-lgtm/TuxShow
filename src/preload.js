const { contextBridge, ipcRenderer } = require('electron');

/**
 * TUXSHOW PLUG-IN EXTENSIBILITY PRELOAD GATEKEEPER
 * Restricts plugin/renderer access to core engine functionality.
 */
const tuxShowAPI = {
  // =======================================================================
  // 1. READ-ONLY TELEMETRY STREAM
  // =======================================================================
  onCueChanged: (callback) => {
    // Stripping the 'event' object from the callback prevents sandbox escapes
    const handler = (_event, cueData) => callback(cueData);
    ipcRenderer.on('tuxshow:cueChanged', handler);
    return () => ipcRenderer.removeListener('tuxshow:cueChanged', handler);
  },
  
  onTimelineTick: (callback) => {
    const handler = (_event, tickData) => callback(tickData);
    ipcRenderer.on('tuxshow:timelineTick', handler);
    return () => ipcRenderer.removeListener('tuxshow:timelineTick', handler);
  },
  
  onPerformanceUpdate: (callback) => {
    const handler = (_event, metrics) => callback(metrics);
    ipcRenderer.on('tuxshow:performanceMetric', handler);
    return () => ipcRenderer.removeListener('tuxshow:performanceMetric', handler);
  },

  // =======================================================================
  // 2. SAFE DATA-OUT MUTATIONS
  // =======================================================================
  requestCueFire: (cueId) => {
    ipcRenderer.send('tuxshow:requestCueFire', cueId);
  },
  
  registerHardwareStatus: (pluginId, status) => {
    ipcRenderer.send('tuxshow:pluginStatus', { pluginId, status });
  },

  // =======================================================================
  // 3. THE SHADER PIPELINE INTERFACE
  // =======================================================================
  registerShaderEffect: (pluginId, shaderConfig) => {
    ipcRenderer.send('tuxshow:registerShader', { pluginId, shaderConfig });
  },

  // =======================================================================
  // 4. DIAGNOSTIC LOGGER INJECTION
  // =======================================================================
  logTechEvent: (pluginId, level, message) => {
    ipcRenderer.send('tuxshow:writeLog', { pluginId, level, message });
  }
};

/**
 * CORE APPLICATION API
 * Exclusive secure bridge for App.jsx and frontend children, replacing `window.require`.
 */
const coreAppAPI = {
  // =======================================================================
  // OS & HARDWARE METRICS
  // =======================================================================
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getGpuStatus: () => ipcRenderer.invoke('get-gpu-status'),
  getDebugDiagnostics: () => ipcRenderer.invoke('get-debug-diagnostics'),

  // =======================================================================
  // SAFE DIALOGS
  // =======================================================================
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  chooseRecordDestination: () => ipcRenderer.invoke('choose-record-destination'),

  // =======================================================================
  // RESTRICTED FILE SYSTEM ACCESS
  // =======================================================================
  // We do not expose native 'fs' to the window. Operations are strictly gated.
  readShowFile: (filePath) => ipcRenderer.invoke('read-show-file', filePath),
  saveShowFile: (filePath, data) => ipcRenderer.invoke('save-show-file', filePath, data),
  saveVideoChunk: (arrayBuffer) => ipcRenderer.send('save-video-chunk', arrayBuffer),
  stopRecording: (durationMs) => ipcRenderer.send('stop-recording', durationMs),

  // =======================================================================
  // CORE EVENT LISTENERS
  // =======================================================================
  onSyncState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('sync-state', handler);
    return () => ipcRenderer.removeListener('sync-state', handler);
  },
  
  onOscMessage: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('osc-message', handler);
    return () => ipcRenderer.removeListener('osc-message', handler);
  },
  
  // Standard command forwards
  setWindowTitle: (title) => ipcRenderer.send('set-window-title', title),
  requestState: () => ipcRenderer.send('request-state'),

  // =======================================================================
  // PLUGIN MANAGER API
  // =======================================================================
  installPluginArchive: () => ipcRenderer.invoke('plugin-install-archive'),
  togglePluginState: (pluginId, isEnabled) => ipcRenderer.invoke('plugin-toggle-state', pluginId, isEnabled),
  getLoadedPlugins: () => ipcRenderer.invoke('plugin-get-loaded'),
  uninstallPlugin: (pluginId) => ipcRenderer.invoke('plugin-uninstall', pluginId),
  onPluginStateChanged: (callback) => {
    const handler = (_event, plugins) => callback(plugins);
    ipcRenderer.on('plugin-state-changed', handler);
    return () => ipcRenderer.removeListener('plugin-state-changed', handler);
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('tuxShowAPI', tuxShowAPI);
  contextBridge.exposeInMainWorld('coreAppAPI', coreAppAPI);
} else {
  window.tuxShowAPI = tuxShowAPI;
  window.coreAppAPI = coreAppAPI;
}