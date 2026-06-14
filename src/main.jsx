import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import '../pluginRegistry.js'

if (!window.coreAppAPI) {
  const initialPlugins = [
    {
      id: "panic-proof-importer",
      name: '"Panic-Proof" Slide Importer',
      version: "1.0.0",
      description: "Utility plugin to instantly parse PDF/PPTX presentation slides and import them as sequential image cues with text content names and descriptions.",
      entryPoints: {
        ui: "ui.js"
      },
      dir: "/plugin-creator/panic-proof-importer",
      status: "disabled",
      permissions: []
    },
    {
      id: "atmospheric-particles",
      name: "Atmospheric Particle Generator",
      version: "1.0.0",
      description: "Procedural, hardware-accelerated WebGL environmental overlays (Rain, Snow, Fog, Ash, Fairy Dust) for visual cues.",
      entryPoints: {
        ui: "ui.js"
      },
      dir: "/plugin-creator/atmospheric-particles",
      status: "disabled",
      permissions: []
    }
  ];

  let currentPlugins = [...initialPlugins];
  const listeners = [];

  window.coreAppAPI = {
    getLoadedPlugins: async () => {
      return currentPlugins;
    },
    onPluginStateChanged: (callback) => {
      listeners.push(callback);
      callback(currentPlugins);
      return () => {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      };
    },
    togglePluginState: async (id, isEnabled) => {
      currentPlugins = currentPlugins.map(p => {
        if (p.id === id) {
          return { ...p, status: isEnabled ? 'running' : 'disabled' };
        }
        return p;
      });
      listeners.forEach(cb => cb([...currentPlugins]));
      return { success: true };
    }
  };
}


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
