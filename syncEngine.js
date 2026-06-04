import dgram from 'dgram';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';

class SyncEngine {
    constructor() {
        this.socket = null;
        this.mode = 'standalone'; // 'standalone', 'master', 'backup'
        this.port = 53001;
        this.broadcastIp = '255.255.255.255';
        this.webContents = null;
        this.httpServer = null;
    }

    init(webContents) {
        this.webContents = webContents;
    }

    setMode(newMode, customPort = 53001) {
        this.port = customPort;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }

        this.mode = newMode;
        console.log(`[SyncEngine] Switching to ${this.mode.toUpperCase()} mode on port ${this.port}`);

        if (this.mode === 'standalone') return;

        this.socket = dgram.createSocket('udp4');
        this.socket.on('error', (err) => {
            console.error(`[SyncEngine] UDP Socket Error:`, err.message);
            this.socket.close();
        });

        if (this.mode === 'master') {
            this.socket.bind(() => {
                this.socket.setBroadcast(true);
            });
        } 
        else if (this.mode === 'backup') {
            this.socket.on('message', (msg, rinfo) => {
                try {
                    const payload = JSON.parse(msg.toString());
                    // Forward the network state to the React frontend
                    if (this.webContents && !this.webContents.isDestroyed()) {
                        this.webContents.send('network-sync-receive', payload);
                    }
                } catch (e) {
                    console.error('[SyncEngine] Bad payload received from Master:', e.message);
                }
            });
            
            // Listen on all network interfaces
            this.socket.bind(this.port, '0.0.0.0', () => {
                console.log(`[SyncEngine] Backup listening on 0.0.0.0:${this.port}`);
            });

            // START TCP FILE RECEIVER TUNNEL
            this.httpServer = http.createServer((req, res) => {
                if (req.method === 'POST' && req.url === '/sync-pack') {
                    console.log('[SyncEngine] Incoming .TSPack stream from Master...');
                    const syncDir = path.join(os.tmpdir(), 'tuxshow-active-sync');
                    
                    try {
                        if (fs.existsSync(syncDir)) fs.rmSync(syncDir, { recursive: true, force: true });
                        fs.mkdirSync(syncDir, { recursive: true });
                    } catch (err) {
                        console.error('[SyncEngine] File System Error preparing sync directory:', err.message);
                        res.writeHead(500); res.end('Internal FS Error');
                        return;
                    }

                    const packPath = path.join(syncDir, 'incoming.TSPack');
                    const writeStream = fs.createWriteStream(packPath);
                    writeStream.on('error', (err) => {
                        console.error('[SyncEngine] Stream write error:', err.message);
                        if (!res.headersSent) { res.writeHead(500); res.end('Stream write error'); }
                    });

                    req.pipe(writeStream);

                    req.on('end', () => {
                        console.log('[SyncEngine] File received. Unpacking via native tar...');
                        exec(`tar -xzf "${packPath}" -C "${syncDir}"`, (error) => {
                            if (!error) {
                                const showJsonPath = path.join(syncDir, 'show.json');
                                if (fs.existsSync(showJsonPath)) {
                                    const showData = JSON.parse(fs.readFileSync(showJsonPath, 'utf8'));
                                    
                                    // Rewrite relative ./media paths to absolute /tmp paths for the local engine
                                    if (showData.cues) {
                                        showData.cues = showData.cues.map(c => {
                                            if (c.url && c.url.startsWith('./media/')) {
                                                const newUrl = path.join(syncDir, 'media', c.url.replace('./media/', ''));
                                                return { ...c, url: 'file://' + newUrl.replace(/\\/g, '/') };
                                            }
                                            return c;
                                        });
                                    }
                                    
                                    if (this.webContents && !this.webContents.isDestroyed()) {
                                        this.webContents.send('network-pack-received', showData);
                                    }
                                    res.writeHead(200);
                                    res.end('Pack applied successfully.');
                                } else {
                                    res.writeHead(500); res.end('show.json not found in pack.');
                                }
                            } else {
                                console.error('[SyncEngine] Tar extraction failed:', error);
                                res.writeHead(500); res.end('Extraction failed');
                            }
                        });
                    });
                } else {
                    res.writeHead(404); res.end();
                }
            });
            this.httpServer.listen(this.port + 1, '0.0.0.0', () => {
                console.log(`[SyncEngine] TCP Pack Receiver listening on 0.0.0.0:${this.port + 1}`);
            });
        }
    }

    // Called by main.js whenever React broadcasts a state update
    broadcastState(statePayload) {
        if (this.mode !== 'master' || !this.socket) return;
        
        try {
            const message = Buffer.from(JSON.stringify(statePayload));
            this.socket.send(message, 0, message.length, this.port, this.broadcastIp);
        } catch (e) {
            console.error('[SyncEngine] Failed to broadcast state:', e);
        }
    }
}

export const syncEngine = new SyncEngine();