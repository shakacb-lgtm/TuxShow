/**
 * TUXSHOW PLUGIN REGISTRY
 * Global interface for third-party frontend tab injection.
 */

window.tuxShowRegistry = {
  plugins: [],
  listeners: [],
  
  subscribe: function(callback) {
    this.listeners.push(callback);
    callback(this.plugins); // Hydrate immediately upon subscription
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  },

  registerInspectorTab: function(pluginConfig) {
    if (!pluginConfig || !pluginConfig.id || !pluginConfig.renderTab) {
      console.error('[TuxShow Registry] Invalid plugin configuration. Missing required fields.');
      return;
    }
    if (this.plugins.find(p => p.id === pluginConfig.id)) {
      console.warn(`[TuxShow Registry] Plugin ID '${pluginConfig.id}' is already registered.`);
      return;
    }
    this.plugins.push(pluginConfig);
    this.listeners.forEach(cb => cb([...this.plugins])); // Broadcast updated registry
  }
};

/**
 * Registers a new custom configuration panel in the Inspector tab-bar.
 */
export const registerInspectorTab = window.tuxShowRegistry.registerInspectorTab.bind(window.tuxShowRegistry);