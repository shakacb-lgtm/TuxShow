const video = document.getElementById('vid');
const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('overlay');
const statusTxt = document.getElementById('statusTxt');
let pc = null;

startBtn.addEventListener('click', async () => {
    startBtn.classList.add('hidden');
    statusTxt.textContent = 'Negotiating WebRTC Connection...';
    
    try {
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (e) => { 
            video.srcObject = e.streams[0]; 
            video.play().catch(err => console.error("Playback failed:", err));
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'connected') {
                overlay.classList.add('hidden');
            } else if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                overlay.classList.remove('hidden');
                startBtn.classList.remove('hidden');
                statusTxt.textContent = 'Connection lost. Click to reconnect.';
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise(resolve => {
            if (pc.iceGatheringState === 'complete') resolve();
            else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
        });

        // We POST to the exact same URL path that this page was loaded from!
        const res = await fetch(window.location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: pc.localDescription }) });
        if (!res.ok) throw new Error("Server rejected connection");
        
        const answer = await res.json();
        await pc.setRemoteDescription(answer.sdp);
    } catch (err) {
        startBtn.classList.remove('hidden');
        statusTxt.textContent = `Error: ${err.message}`;
    }
});