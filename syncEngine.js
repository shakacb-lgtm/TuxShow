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
        this.backupIp = '';
        this.webContents = null;
        this.httpServer = null;
        this.heartbeatInterval = null;

        // Diagnostic state variables
        this.lastReceivedStateSize = 0;
        this.lastSentStateSize = 0;
        this.totalPacketsReceived = 0;
        this.totalPacketsSent = 0;
        this.lastSyncError = null;
        this.socketError = null;
        this.httpServerError = null;
    }

    init(webContents) {
        this.webContents = webContents;
    }

    setMode(newMode, customPort = 53001) {
        this.port = customPort;
        this.socketError = null;
        this.httpServerError = null;
        this.lastSyncError = null;

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        this.mode = newMode;
        console.log(`[SyncEngine] Switching to ${this.mode.toUpperCase()} mode on port ${this.port}`);

        if (this.mode === 'standalone') return;

        this.socket = dgram.createSocket('udp4');
        this.socket.on('error', (err) => {
            console.error(`[SyncEngine] UDP Socket Error:`, err.message);
            this.socketError = err.message;
            this.socket.close();
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
        });

        if (this.mode === 'master') {
            this.socket.bind(() => {
                this.socket.setBroadcast(true);
            });
            this.heartbeatInterval = setInterval(() => {
                this.broadcastHeartbeat();
            }, 1000);
        } 
        else if (this.mode === 'backup') {
            this.socket.on('message', (msg, rinfo) => {
                try {
                    this.totalPacketsReceived++;
                    this.lastReceivedStateSize = msg.length;
                    const payload = JSON.parse(msg.toString());
                    if (payload.type === 'heartbeat') {
                        if (this.webContents && !this.webContents.isDestroyed()) {
                            this.webContents.send('network-sync-heartbeat', payload);
                        }
                        return;
                    }
                    // Forward the network state to the React frontend
                    if (this.webContents && !this.webContents.isDestroyed()) {
                        this.webContents.send('network-sync-receive', payload);
                    }
                } catch (e) {
                    console.error('[SyncEngine] Bad payload received from Master:', e.message);
                    this.lastSyncError = `Receive parse error: ${e.message}`;
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
                                // Delete the temporary archive file after successful extraction
                                try {
                                    fs.unlinkSync(packPath);
                                } catch (err) {
                                    console.warn('[SyncEngine] Failed to delete incoming TSPack temp file:', err.message);
                                }

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
            this.httpServer.on('error', (err) => {
                console.error(`[SyncEngine] TCP Server Error:`, err.message);
                this.httpServerError = err.message;
            });
            this.httpServer.listen(this.port + 1, '0.0.0.0', () => {
                console.log(`[SyncEngine] TCP Pack Receiver listening on 0.0.0.0:${this.port + 1}`);
            });
        }
    }

    setBackupIp(ip) {
        this.backupIp = ip;
        console.log(`[SyncEngine] Backup IP target set to: ${this.backupIp}`);
    }

    broadcastHeartbeat() {
        if (this.mode !== 'master' || !this.socket) return;
        try {
            const payload = { type: 'heartbeat', timestamp: Date.now() };
            const message = Buffer.from(JSON.stringify(payload));
            this.socket.send(message, 0, message.length, this.port, this.broadcastIp);
            if (this.backupIp && this.backupIp.trim() !== '') {
                this.socket.send(message, 0, message.length, this.port, this.backupIp.trim());
            }
            this.totalPacketsSent++;
            this.lastSentStateSize = message.length;
        } catch (e) {
            this.lastSyncError = `Heartbeat send error: ${e.message}`;
        }
    }

    // Called by main.js whenever React broadcasts a state update
    broadcastState(statePayload) {
        if (this.mode !== 'master' || !this.socket) return;
        
        try {
            // Create a slim copy of the state payload to stay within UDP size limits
            const slimPayload = JSON.parse(JSON.stringify(statePayload));
            if (slimPayload.cues) {
                slimPayload.cues = slimPayload.cues.map(c => {
                    // Strip heavy base64 assets since the backup machine already loads/holds them locally
                    const { maskDataUrl, ...rest } = c;
                    return rest;
                });
            }

            const message = Buffer.from(JSON.stringify(slimPayload));
            this.lastSentStateSize = message.length;
            this.totalPacketsSent++;
            this.socket.send(message, 0, message.length, this.port, this.broadcastIp);
            if (this.backupIp && this.backupIp.trim() !== '') {
                this.socket.send(message, 0, message.length, this.port, this.backupIp.trim());
            }
        } catch (e) {
            console.error('[SyncEngine] Failed to broadcast state:', e);
            this.lastSyncError = `State broadcast error: ${e.message}`;
        }
    }

    getDiagnostics() {
        const syncDir = path.join(os.tmpdir(), 'tuxshow-active-sync');
        
        let stagingExists = false;
        let stagingFiles = [];
        let stagingSize = 0;
        
        if (fs.existsSync(syncDir)) {
            stagingExists = true;
            try {
                const getFiles = (dir) => {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);
                        if (stat.isDirectory()) {
                            getFiles(filePath);
                        } else {
                            stagingFiles.push({
                                name: path.relative(syncDir, filePath),
                                size: stat.size
                            });
                            stagingSize += stat.size;
                        }
                    }
                };
                getFiles(syncDir);
            } catch (err) {
                // Ignore
            }
        }
        
        return {
            mode: this.mode,
            port: this.port,
            broadcastIp: this.broadcastIp,
            backupIp: this.backupIp,
            socketBound: !!this.socket,
            httpServerRunning: !!this.httpServer,
            lastReceivedStateSize: this.lastReceivedStateSize || 0,
            lastSentStateSize: this.lastSentStateSize || 0,
            totalPacketsReceived: this.totalPacketsReceived || 0,
            totalPacketsSent: this.totalPacketsSent || 0,
            lastSyncError: this.lastSyncError || null,
            socketError: this.socketError || null,
            httpServerError: this.httpServerError || null,
            stagingExists,
            stagingFileCount: stagingFiles.length,
            stagingFiles,
            stagingSize
        };
    }
}

export const syncEngine = new SyncEngine();