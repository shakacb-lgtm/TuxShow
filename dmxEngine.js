import dgram from 'dgram';

class DMXEngine {
  constructor() {
    this.socket = null;
    this.universeData = Buffer.alloc(512, 0); // 512 channels, defaults to 0
    this.fades = {}; // Tracks active running fades
    this.broadcastIp = '255.255.255.255';
    this.port = 6454; // Standard Art-Net UDP Port
    this.interval = null;
    this.isRunning = false;
    
    // Static Art-Net Header (18 bytes)
    this.header = Buffer.from([
      0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00, 
      0x00, 0x50, 0x00, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00  
    ]);
  }

  start(ip = '255.255.255.255') {
    if (this.isRunning) return;
    this.broadcastIp = ip;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    this.socket.bind(() => {
      this.socket.setBroadcast(true);
      this.isRunning = true;
      console.log(`[DMX Engine] Art-Net Emitter started at 44Hz.`);
      this.interval = setInterval(() => this.transmit(), 22); // ~44Hz loop
    });
  }

  fadeChannel(channel, endValue, durationMs) {
    if (!this.isRunning) this.start();
    const ch = parseInt(channel);
    const target = Math.max(0, Math.min(255, Math.floor(endValue)));
    
    // Instant snap
    if (durationMs <= 0) {
        this.universeData[ch - 1] = target;
        delete this.fades[ch];
        return;
    }

    // Setup smooth mathematical fade
    this.fades[ch] = {
        startValue: this.universeData[ch - 1],
        endValue: target,
        startTime: Date.now(),
        durationMs
    };
  }

  transmit() {
    if (!this.socket) return;
    const now = Date.now();
    
    // Calculate all active fades for this 22ms tick
    for (const [chStr, fade] of Object.entries(this.fades)) {
        const ch = parseInt(chStr);
        const elapsed = now - fade.startTime;
        if (elapsed >= fade.durationMs) {
            this.universeData[ch - 1] = fade.endValue;
            delete this.fades[ch];
        } else {
            const progress = elapsed / fade.durationMs;
            this.universeData[ch - 1] = Math.floor(fade.startValue + (fade.endValue - fade.startValue) * progress);
        }
    }

    const packet = Buffer.concat([this.header, this.universeData]);
    this.socket.send(packet, 0, packet.length, this.port, this.broadcastIp);
  }
}

export const dmxEngine = new DMXEngine();