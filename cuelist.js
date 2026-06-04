const cueListEl = document.getElementById('cue-list');

function renderCues(cues) {
  cueListEl.innerHTML = '';
  cues.forEach(cue => {
    const el = document.createElement('div');
    el.className = `cue-item ${cue.state === 'playing' ? 'playing' : (cue.state === 'stopping' ? 'stopping' : '')}`;
    
    el.innerHTML = `
      <div class="cue-number">${cue.number}</div>
      <div class="cue-name">${cue.name}</div>
      <div class="cue-type">${cue.type}</div>
    `;
    
    if (cue.state === 'playing') {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
    
    cueListEl.appendChild(el);
  });
}

const eventSource = new EventSource('/api/deck/stream');
eventSource.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    if (data.type === 'cuelist' && Array.isArray(data.payload)) renderCues(data.payload);
  } catch (err) {
    console.error('Error parsing SSE message:', err);
  }
};