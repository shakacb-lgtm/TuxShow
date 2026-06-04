import net from 'net';
import crypto from 'crypto';

class ProjectorEngine {
  constructor() {
    this.activeConnections = 0;
  }

  /**
   * Fire a command payload to a venue projector
   * @param {string} ip - Target IP address
   * @param {number} port - Target TCP Port (e.g., 5224 for Barco, 4352 for PJLink)
   * @param {string} protocol - The protocol type ('tcp', 'pjlink', etc.)
   * @param {string} payload - The raw command string
   * @param {string} password - The projector password (for PJLink)
   */
  fireCommand(ip, port, protocol, payload, password = '') {
    if (!ip || !port || !payload) return;

    const client = new net.Socket();
    client.setTimeout(3000);

    client.on('error', (err) => {
      console.error(`[Projector Engine] Connection error to ${ip}:${port} -`, err.message);
      client.destroy();
    });

    client.on('timeout', () => {
      console.error(`[Projector Engine] Connection to ${ip}:${port} timed out.`);
      client.destroy();
    });

    client.connect(port, ip, () => {
      console.log(`[Projector Engine] Connected to ${ip}:${port} via ${protocol}`);
      
      // If it's NOT PJLink (like Barco TCP), fire immediately and forget
      if (protocol.toLowerCase() !== 'pjlink') {
        client.write(payload, () => client.destroy());
      }
    });

    // If it IS PJLink, wait for the handshake header from the projector
    if (protocol.toLowerCase() === 'pjlink') {
      client.on('data', (data) => {
        const response = data.toString().trim();
        
        // Initial connection header from projector
        if (response.startsWith('PJLINK')) {
          let dataToSend = payload;
          if (!dataToSend.endsWith('\r')) dataToSend += '\r';

          if (response.startsWith('PJLINK 1')) {
            // Password IS required
            const token = response.split(' ')[1];
            if (!password) {
              console.error('[Projector Engine] PJLink requires a password, but none was provided.');
              client.destroy();
              return;
            }
            const hash = crypto.createHash('md5').update(token + password).digest('hex');
            client.write(hash + dataToSend);
          } else if (response.startsWith('PJLINK 0')) {
            // No password required
            client.write(dataToSend);
          }
        } else {
          // Success/Error response after sending the command
          console.log(`[Projector Engine] Response from ${ip}:`, response);
          client.destroy();
        }
      });
    }
  }
}

export const projectorEngine = new ProjectorEngine();