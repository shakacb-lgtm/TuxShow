import React, { useState, useEffect } from 'react';
import { X, Archive, Power, ShieldAlert, Cpu, AlertCircle } from 'lucide-react';

export default function PluginManagerModal({ onClose }) {
  const [plugins, setPlugins] = useState([]);
  const [installing, setInstalling] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    // Load initial state
    window.coreAppAPI.getLoadedPlugins().then(setPlugins);

    // Subscribe to live backend updates (e.g. process exits, failures)
    const cleanup = window.coreAppAPI.onPluginStateChanged((updatedPlugins) => {
      setPlugins(updatedPlugins);
    });
    return cleanup;
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    setErrorMsg(null);
    try {
      const result = await window.coreAppAPI.installPluginArchive();
      if (!result.success && result.error !== 'User canceled') {
        setErrorMsg(result.error);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setInstalling(false);
    }
  };

  const handleToggle = async (id, currentStatus) => {
    const isEnabled = currentStatus === 'running' || currentStatus === 'waiting';
    await window.coreAppAPI.togglePluginState(id, !isEnabled);
  };

  const getStatusIndicator = (status) => {
    switch (status) {
      case 'running': return <div className="flex items-center gap-1.5 text-green-400 font-bold text-xs"><span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span> ACTIVE</div>;
      case 'waiting': return <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-xs"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.8)]"></span> WAITING</div>;
      case 'error': return <div className="flex items-center gap-1.5 text-red-500 font-bold text-xs"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span> ERROR</div>;
      default: return <div className="flex items-center gap-1.5 text-gray-500 font-bold text-xs"><span className="w-2.5 h-2.5 rounded-full bg-gray-600"></span> DISABLED</div>;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 bg-gray-950/50">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-purple-500" />
            <div>
              <h2 className="text-lg font-bold text-gray-100 uppercase tracking-widest">Plugin Manager</h2>
              <p className="text-xs text-gray-500 font-mono tracking-wider">Hardware & Community Extensions</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="m-4 p-3 bg-red-900/30 border border-red-800 rounded flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-red-200 break-all">{errorMsg}</div>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="flex justify-between items-center p-4 bg-purple-900/10 border border-purple-800/30 rounded-lg">
            <div className="text-sm text-gray-300 max-w-xl">
              <span className="font-bold text-purple-400 block mb-1">Install New Plugin</span>
              Install community plugins safely via .zip or .tar.gz archives. Plugins are restricted by the Canvas Firewall and run in isolated background processes.
            </div>
            <button onClick={handleInstall} disabled={installing} className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white font-bold rounded shadow-lg transition-colors flex items-center gap-2">
              <Archive className={`w-4 h-4 ${installing ? 'animate-spin' : ''}`} />
              {installing ? 'Extracting...' : 'Install from Archive...'}
            </button>
          </div>

          {/* Plugin List */}
          <div className="space-y-3">
            {plugins.length === 0 ? (
              <div className="text-center py-12 text-gray-600 italic">No plugins currently installed.</div>
            ) : (
              plugins.map(plugin => (
                <div key={plugin.id} className="bg-gray-950 border border-gray-800 rounded p-4 flex gap-4 transition-colors hover:border-gray-700">
                  <div className="flex flex-col items-center justify-center gap-3 pr-6 border-r border-gray-800 min-w-[120px]">
                    {getStatusIndicator(plugin.status)}
                    <button onClick={() => handleToggle(plugin.id, plugin.status)} className={`w-full py-2 rounded flex items-center justify-center gap-2 text-xs font-bold uppercase transition-all ${(plugin.status === 'running' || plugin.status === 'waiting') ? 'bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-white border border-red-800' : 'bg-green-900/50 hover:bg-green-800 text-green-400 hover:text-white border border-green-800'}`}>
                      <Power className="w-3 h-3" /> {(plugin.status === 'running' || plugin.status === 'waiting') ? 'Kill Switch' : 'Start'}
                    </button>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-1"><h3 className="text-lg font-bold text-gray-200 leading-tight">{plugin.name}</h3><span className="text-xs font-mono text-gray-500 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">v{plugin.version}</span></div>
                    <div className="text-xs text-gray-500 mb-3 font-mono">By {plugin.author || 'Unknown'} | ID: {plugin.id}</div>
                    {plugin.permissions && plugin.permissions.length > 0 && (<div className="flex flex-wrap gap-2 mt-auto">{plugin.permissions.map(perm => (<span key={perm} className="flex items-center gap-1 text-[10px] text-yellow-500/80 bg-yellow-900/20 px-2 py-0.5 rounded border border-yellow-800/30 uppercase tracking-wider font-semibold"><ShieldAlert className="w-3 h-3" /> {perm}</span>))}</div>)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}