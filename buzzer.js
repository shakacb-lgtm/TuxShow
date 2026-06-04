document.addEventListener('DOMContentLoaded', () => {
    const playerSetup = document.getElementById('player-setup');
    const buzzerScreen = document.getElementById('buzzer-screen');
    const statusBar = document.getElementById('status-bar');
    const buzzerBtn = document.getElementById('buzzer-btn');
    
    let playerId = null;
  
    const colors = {
        '1': '#ef4444', // Red
        '2': '#3b82f6', // Blue
        '3': '#10b981', // Green
        '4': '#f59e0b'  // Yellow
    };
  
    // 1. Check URL for existing player param (e.g. ?player=1)
    const urlParams = new URLSearchParams(window.location.search);
    const urlPlayer = urlParams.get('player');
    if (urlPlayer && colors[urlPlayer]) {
        setPlayer(urlPlayer, colors[urlPlayer]);
    }
  
    // 2. Player selection handler
    document.querySelectorAll('.player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pid = e.target.getAttribute('data-player');
            setPlayer(pid, colors[pid]);
            
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('player', pid);
            window.history.pushState({}, '', newUrl);
        });
    });
  
    function setPlayer(id, color) {
        playerId = id;
        document.documentElement.style.setProperty('--player-color', color);
        statusBar.textContent = `PLAYER ${id}`;
        playerSetup.classList.add('hidden');
        buzzerScreen.classList.remove('hidden');
    }
  
    // 3. Buzzer Action
    const fireBuzzer = () => {
        if (!playerId) return;
        
        // We leverage the exact same endpoint as the Stream Deck!
        fetch('/api/deck/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/tuxshow/buzzer', args: [playerId] })
        }).catch(err => console.error('Failed to send buzzer:', err));
        
        if (navigator.vibrate) navigator.vibrate(50);
    };
  
    // Touch events for instantly responsive mobile firing
    buzzerBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        fireBuzzer();
        buzzerBtn.style.transform = 'scale(0.95) translateY(5px)';
        buzzerBtn.style.filter = 'brightness(0.8)';
    }, {passive: false});
  
    buzzerBtn.addEventListener('touchend', () => { buzzerBtn.style.transform = ''; buzzerBtn.style.filter = ''; });
    buzzerBtn.addEventListener('mousedown', fireBuzzer);
});