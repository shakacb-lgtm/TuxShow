// ui.js
(function() {
  // Ensure the registry exists before attempting to attach
  if (!window.tuxShowRegistry) {
    console.error("TuxShow Plugin Registry not found.");
    return;
  }

  // Define the React Component for the Inspector Tab
  const DummyTab = ({ activeCue }) => {
    // A simple handler to test the 'logTechEvent' IPC bridge
    const handleTestLog = () => {
      if (window.tuxShowAPI && window.tuxShowAPI.logTechEvent) {
        window.tuxShowAPI.logTechEvent(
          'dev.tuxshow.dummy-diagnostics', 
          'INFO', 
          `Test ping fired while editing cue: ${activeCue ? activeCue.cue_id : 'None'}`
        );
      }
    };

    // Return the UI utilizing standard inline styles or inherited CSS classes
    return React.createElement(
      'div',
      { style: { padding: '20px', color: '#fff' } },
      React.createElement('h3', null, 'Diagnostics Test Active'),
      React.createElement('p', null, `Currently active cue: ${activeCue ? activeCue.label : 'No Cue Selected'}`),
      React.createElement('button', 
        { 
          onClick: handleTestLog,
          style: { padding: '10px', marginTop: '10px', cursor: 'pointer' }
        }, 
        'Fire Tech-Log Ping'
      )
    );
  };

  // Register the plugin with the core application
  window.tuxShowRegistry.registerInspectorTab({
    id: 'dev.tuxshow.dummy-diagnostics',
    name: 'Test Plugin',
    icon: '🛠️', 
    renderTab: DummyTab
  });
})();
