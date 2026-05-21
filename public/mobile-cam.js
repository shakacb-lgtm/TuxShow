const videoPreview = document.getElementById('preview');
const connectBtn = document.getElementById('connectBtn');
const statusIndicator = document.getElementById('statusIndicator');
const errorLog = document.getElementById('errorLog');

let localStream = null;
let peerConnection = null;

function logError(msg) {
    console.error(msg);
    errorLog.textContent = msg;
    errorLog.classList.remove('hidden');
}

async function initCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false // Prevents feedback loops in the theater
        });
        videoPreview.srcObject = localStream;
    } catch (err) {
        logError(`Camera Error: ${err.message}. Please check permissions.`);
        connectBtn.disabled = true;
        connectBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

connectBtn.addEventListener('click', async () => {
    if (!localStream) return;
    
    connectBtn.textContent = 'Connecting...';
    connectBtn.classList.replace('bg-blue-600', 'bg-yellow-600');
    errorLog.classList.add('hidden');

    try {
        peerConnection = new RTCPeerConnection({ iceServers: [] });
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'connected') {
                statusIndicator.textContent = '● LIVE';
                statusIndicator.className = 'px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-red-900/50 text-red-400 border border-red-800 animate-pulse';
                connectBtn.textContent = 'Transmitting to Stage';
                connectBtn.classList.replace('bg-yellow-600', 'bg-green-600');
            } else if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
                statusIndicator.textContent = 'Offline';
                statusIndicator.className = 'px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-gray-800 text-gray-400 border border-gray-700';
                connectBtn.textContent = 'Go Live';
                connectBtn.classList.replace('bg-green-600', 'bg-blue-600');
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await new Promise(resolve => { if (peerConnection.iceGatheringState === 'complete') resolve(); else peerConnection.onicegatheringstatechange = () => { if (peerConnection.iceGatheringState === 'complete') resolve(); }; });

        const response = await fetch('/mobile-cam-offer', { method: 'POST', body: JSON.stringify({ sdp: peerConnection.localDescription }) });
        if (!response.ok) throw new Error('Signaling server rejected connection.');
        
        const answer = await response.json();
        await peerConnection.setRemoteDescription(answer.sdp);
    } catch (err) { logError(`Connection failed: ${err.message}`); connectBtn.textContent = 'Retry Connection'; connectBtn.classList.replace('bg-yellow-600', 'bg-blue-600'); }
});
initCamera();