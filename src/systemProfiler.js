export class SystemProfiler {
    static async runDiagnostics() {
        console.log("[Profiler] Initiating System Diagnostics...");
        const results = {
            os: null,
            gpu: { maxTextureSize: 0, webglSupported: false },
            benchmark: { averageFps: 0, droppedFrames: 0, score: 0 },
            recommendedTier: 'balanced' // 'high', 'balanced', or 'basic'
        };

        // 1. Gather OS/Hardware Specs via IPC
        try {
            const { ipcRenderer } = window.require('electron');
            results.os = await ipcRenderer.invoke('get-system-profile');
        } catch (e) {
            console.warn("[Profiler] Could not fetch OS metrics.");
        }

        // 2. Check GPU / WebGL Limits
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            results.gpu.webglSupported = true;
            results.gpu.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        }

        // 3. Run Real-Time Frame Benchmark (Measure 60 frames)
        await new Promise((resolve) => {
            let frameCount = 0;
            let droppedFrames = 0;
            let lastTime = performance.now();
            const startTest = performance.now();

            const testLoop = (now) => {
                const delta = now - lastTime;
                lastTime = now;
                
                // If delta is significantly higher than 16.6ms (60Hz), we dropped a frame
                if (frameCount > 0 && delta > 20) {
                    droppedFrames++;
                }

                frameCount++;
                if (frameCount < 60) {
                    requestAnimationFrame(testLoop);
                } else {
                    const elapsed = performance.now() - startTest;
                    results.benchmark.averageFps = Math.round((frameCount / elapsed) * 1000);
                    results.benchmark.droppedFrames = droppedFrames;
                    resolve();
                }
            };
            requestAnimationFrame(testLoop);
        });

        // 4. Calculate Recommended Scaling Tier
        let score = 100;
        score -= (results.benchmark.droppedFrames * 5); // Penalize heavily for stutter
        if (results.os && results.os.totalRamGB < 8) score -= 20; // Penalize for low RAM
        if (results.gpu.maxTextureSize <= 4096) score -= 10; // Penalize for older GPUs

        results.benchmark.score = Math.max(0, score);

        if (score >= 90) results.recommendedTier = 'high';
        else if (score >= 60) results.recommendedTier = 'balanced';
        else results.recommendedTier = 'basic';

        console.log(`[Profiler] Diagnostics Complete. Score: ${results.benchmark.score} | Tier: ${results.recommendedTier}`);
        return results;
    }
}