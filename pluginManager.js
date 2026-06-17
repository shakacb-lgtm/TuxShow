import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

class PluginManager {
  constructor() {
    this.pluginsDir = path.join(os.homedir(), '.tuxshow', 'plugins');
    this.plugins = new Map();
    this.onStateChange = null;
  }

  async init(onStateChangeCb) {
    this.onStateChange = onStateChangeCb;
    await fsPromises.mkdir(this.pluginsDir, { recursive: true });
    await this.scanPlugins();
  }

  async scanPlugins() {
    try {
      const entries = await fsPromises.readdir(this.pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(this.pluginsDir, entry.name, 'manifest.json');
          try {
            const manifestData = await fsPromises.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestData);
            if (!this.plugins.has(manifest.id)) {
              this.plugins.set(manifest.id, {
                ...manifest,
                dir: path.join(this.pluginsDir, entry.name),
                status: 'disabled',
                process: null
              });
            }
          } catch (e) {
            console.warn(`[PluginManager] Skipping ${entry.name}: Missing or invalid manifest.json`);
          }
        }
      }
    } catch (e) {
      console.error('[PluginManager] Failed to scan plugins:', e);
    }
  }

  async installArchive(archivePath) {
    try {
      const ext = path.extname(archivePath).toLowerCase();
      const tempId = `plugin_extract_${Date.now()}`;
      const targetDir = path.join(this.pluginsDir, tempId);
      await fsPromises.mkdir(targetDir, { recursive: true });

      // Using native shell utilities for non-blocking I/O
      if (ext === '.zip') {
        await execAsync(`unzip -o "${archivePath}" -d "${targetDir}"`);
      } else if (ext === '.gz' || ext === '.tgz' || archivePath.endsWith('.tar.gz')) {
        await execAsync(`tar -xzf "${archivePath}" -C "${targetDir}"`);
      } else {
        throw new Error('Unsupported format. Please provide a .zip or .tar.gz file.');
      }

      const manifestPath = path.join(targetDir, 'manifest.json');
      const manifestData = await fsPromises.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestData);

      if (!manifest.id || !manifest.name) {
        throw new Error('manifest.json must contain "id" and "name".');
      }

      const finalDir = path.join(this.pluginsDir, manifest.id);
      if (targetDir !== finalDir) {
          await fsPromises.rm(finalDir, { recursive: true, force: true });
          await fsPromises.rename(targetDir, finalDir);
      }

      const pluginObj = { ...manifest, dir: finalDir, status: 'disabled', process: null };
      this.plugins.set(manifest.id, pluginObj);
      this._notify();
      return { success: true, manifest: pluginObj };
    } catch (error) {
      console.error('[PluginManager] Extraction failed:', error);
      return { success: false, error: error.message };
    }
  }

  async startPlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin ${id} not found.`);
    if (plugin.status === 'running') return;

    try {
      plugin.status = 'waiting';
      this._notify();

      if (plugin.entry) {
         const entryPath = path.join(plugin.dir, plugin.entry);
         const isPython = entryPath.endsWith('.py');
         const cmd = isPython ? 'python3' : 'node';

         const child = spawn(cmd, [entryPath], { cwd: plugin.dir });
         plugin.process = child;

         child.on('error', (err) => {
             console.error(`[Plugin:${id}] Failed to start:`, err);
             plugin.status = 'error';
             plugin.process = null;
             this._notify();
         });

         child.on('exit', (code) => {
             console.log(`[Plugin:${id}] Exited with code ${code}`);
             plugin.status = code === 0 ? 'disabled' : 'error';
             plugin.process = null;
             this._notify();
         });
         
         child.stdout.on('data', (data) => console.log(`[Plugin:${id}] ${data}`));
         child.stderr.on('data', (data) => console.error(`[Plugin:${id}] ERROR: ${data}`));
      }
      
      plugin.status = 'running';
      this._notify();
    } catch (error) {
      plugin.status = 'error';
      this._notify();
      throw error;
    }
  }

  async stopPlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) return;

    if (plugin.process) {
      plugin.process.kill('SIGKILL'); // Aggressive termination
      plugin.process = null;
    }
    plugin.status = 'disabled';
    this._notify();
  }

  async uninstallPlugin(id) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin ${id} not found.`);

    // 1. Stop the plugin if it's running
    await this.stopPlugin(id);

    // 2. Recursively delete the plugin directory
    if (plugin.dir) {
      await fsPromises.rm(plugin.dir, { recursive: true, force: true });
    }

    // 3. Remove it from the Map
    this.plugins.delete(id);

    // 4. Notify listeners
    this._notify();
  }

  getLoadedPlugins() {
    // Strip the raw process object before returning to React
    return Array.from(this.plugins.values()).map(({ process, ...safePlugin }) => safePlugin);
  }

  _notify() {
    if (this.onStateChange) this.onStateChange(this.getLoadedPlugins());
  }
}

export const pluginManager = new PluginManager();