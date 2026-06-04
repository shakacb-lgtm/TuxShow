document.addEventListener('DOMContentLoaded', async () => {
  const buttonGrid = document.getElementById('button-grid');
  const statusBar = document.getElementById('status-bar');

  // SVG Icon definitions
  const icons = {
    'play': '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon></svg>',
    'square': '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="currentColor"></rect></svg>',
    'pause': '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" fill="currentColor"></rect><rect x="14" y="4" width="4" height="16" fill="currentColor"></rect></svg>',
    'play-circle': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"></polygon></svg>',
    'skip-back': '<svg viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20" fill="currentColor"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>',
    'skip-forward': '<svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>',
    'image': '<svg viewBox="0 0 24 24" style="fill: none;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    'clock': '<svg viewBox="0 0 24 24" style="fill: none;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
  };

  // --- Configuration ---
  // Fetches the dynamic configuration from TuxShow Backend
  let config = { buttons: [] };
  try {
    const res = await fetch('/api/deck/config');
    if (res.ok) config = await res.json();
  } catch (err) {
    console.error('Failed to load deck configuration:', err);
  }

  // --- Button Generation ---
  config.buttons.forEach(buttonConfig => {
    const button = document.createElement('div');
    button.className = 'deck-button';
    
    let content = '';
    if (buttonConfig.icon && icons[buttonConfig.icon]) {
        content += `<div class="icon">${icons[buttonConfig.icon]}</div>`;
    }
    content += `<span>${buttonConfig.label}</span>`;
    button.innerHTML = content;

    if (buttonConfig.color) {
      button.style.setProperty('--btn-bg', buttonConfig.color);
      button.style.setProperty('--btn-border', buttonConfig.color);
      button.style.setProperty('--btn-filter', 'brightness(0.9)');
    } else {
      button.style.setProperty('--btn-bg', '#1f2937');
      button.style.setProperty('--btn-border', '#1f2937');
      button.style.setProperty('--btn-hover', '#374151');
    }

    // Ensures the :active CSS pseudo-class fires on mobile touch events
    button.addEventListener('touchstart', () => {}, {passive: true});

    button.addEventListener('click', () => {
      fetch('/api/deck/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: buttonConfig.oscPath,
          args: buttonConfig.oscArgs ? [buttonConfig.oscArgs] : []
        })
      }).catch(err => console.error('Failed to send command:', err));
    });

    buttonGrid.appendChild(button);
  });

  // --- Server-Sent Events (SSE) for Live Feedback ---
  function connectEventSource() {
    const eventSource = new EventSource('/api/deck/stream');

    eventSource.onopen = () => {
      console.log('SSE Connection established.');
      statusBar.innerHTML = '<span class="status-label">Active Playhead</span><span class="status-value" style="color: var(--text-muted)">Idle</span>';
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.cueNumber && data.cueName) {
          statusBar.innerHTML = `<span class="status-label">Active Playhead</span><span class="status-value">${data.cueNumber}: ${data.cueName}</span>`;
        } else {
          statusBar.innerHTML = '<span class="status-label">Active Playhead</span><span class="status-value" style="color: var(--text-muted)">Idle</span>';
        }
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
        statusBar.innerHTML = '<span class="status-label">Status</span><span class="status-value" style="color: #dc2626">Error</span>';
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
      statusBar.innerHTML = '<span class="status-label">Status</span><span class="status-value" style="color: #d97706">Disconnected. Retrying...</span>';
      eventSource.close();
    };
  }

  connectEventSource();
});