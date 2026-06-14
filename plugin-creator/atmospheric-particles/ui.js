/**
 * Atmospheric Particle Generator (Generative Visuals)
 * Real-time, hardware-accelerated environmental effect overlays.
 */

// Shaders definitions
const shaders = {
    particles_rain: `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform float u_time;
        uniform vec2 u_resolution;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
            vec4 baseColor = texture2D(u_image, v_texCoord);
            vec2 uv = v_texCoord;
            
            // Slanted rain coordinates
            vec2 rainUv = uv;
            rainUv.x += rainUv.y * 0.12; 
            
            float rain = 0.0;
            
            // Layer 1 (Close, fast rain)
            vec2 grid1 = rainUv * vec2(90.0, 9.0) - vec2(0.0, u_time * 16.0);
            vec2 id1 = floor(grid1);
            vec2 f1 = fract(grid1);
            float h1 = hash(id1);
            if (h1 > 0.85) {
                float streak = smoothstep(0.06, 0.0, abs(f1.x - 0.5)) * smoothstep(0.1, 0.9, f1.y);
                rain += streak * (h1 - 0.85) * 4.0;
            }
            
            // Layer 2 (Medium distance)
            vec2 grid2 = rainUv * vec2(160.0, 16.0) - vec2(0.0, u_time * 11.0);
            vec2 id2 = floor(grid2);
            vec2 f2 = fract(grid2);
            float h2 = hash(id2);
            if (h2 > 0.90) {
                float streak = smoothstep(0.04, 0.0, abs(f2.x - 0.5)) * smoothstep(0.1, 0.9, f2.y);
                rain += streak * (h2 - 0.90) * 5.0;
            }
            
            // Layer 3 (Far, small rain)
            vec2 grid3 = rainUv * vec2(260.0, 26.0) - vec2(0.0, u_time * 7.0);
            vec2 id3 = floor(grid3);
            vec2 f3 = fract(grid3);
            float h3 = hash(id3);
            if (h3 > 0.93) {
                float streak = smoothstep(0.03, 0.0, abs(f3.x - 0.5)) * smoothstep(0.1, 0.9, f3.y);
                rain += streak * (h3 - 0.93) * 6.0;
            }
            
            vec3 rainColor = vec3(0.8, 0.88, 0.98) * rain;
            gl_FragColor = vec4(baseColor.rgb + rainColor, baseColor.a);
        }
    `,

    particles_snow: `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform float u_time;
        uniform vec2 u_resolution;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
            vec4 baseColor = texture2D(u_image, v_texCoord);
            vec2 uv = v_texCoord;
            float aspect = u_resolution.x / u_resolution.y;
            
            float snow = 0.0;
            
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float sizeFactor = 1.0 + fi * 0.75;
                float speedFactor = 0.55 + fi * 0.35;
                
                vec2 snowUv = uv * vec2(16.0, 10.0) * sizeFactor;
                
                snowUv.y -= u_time * 0.35 * speedFactor;
                snowUv.x += sin(u_time * 0.7 + fi * 1.6) * 0.18 * speedFactor;
                
                vec2 id = floor(snowUv);
                vec2 f = fract(snowUv);
                
                float h = hash(id);
                if (h > 0.72) {
                    vec2 center = vec2(0.2 + 0.6 * hash(id + vec2(1.1, 2.1)), 
                                       0.2 + 0.6 * hash(id + vec2(3.1, 4.1)));
                    
                    vec2 diff = (f - center) * vec2(1.0, aspect * 1.6);
                    float dist = length(diff);
                    
                    float r = 0.025 + 0.045 * hash(id + vec2(5.1, 6.1));
                    float flake = smoothstep(r, r * 0.3, dist);
                    snow += flake * (h - 0.72) * 2.5;
                }
            }
            
            vec3 snowColor = vec3(0.96, 0.98, 1.0) * snow;
            gl_FragColor = vec4(baseColor.rgb + snowColor, baseColor.a);
        }
    `,

    particles_fog: `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform float u_time;
        uniform vec2 u_resolution;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), f.x),
                       mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), f.x), f.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100.0);
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
            for (int i = 0; i < 4; ++i) {
                v += a * noise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec4 baseColor = texture2D(u_image, v_texCoord);
            vec2 uv = v_texCoord;
            
            vec2 q = uv * 2.8;
            q.x += u_time * 0.04;
            
            vec2 r = uv * 2.8;
            r.y -= u_time * 0.02;
            r.x -= u_time * 0.01;
            
            float f = fbm(q + fbm(r));
            
            float lowFogFactor = smoothstep(1.0, 0.1, uv.y) * 0.55 + 0.25; 
            float fogIntensity = f * lowFogFactor * 0.65;
            
            vec3 fogColor = vec3(0.86, 0.89, 0.93);
            vec3 finalColor = mix(baseColor.rgb, fogColor, fogIntensity);
            gl_FragColor = vec4(finalColor, baseColor.a);
        }
    `,

    particles_ash: `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform float u_time;
        uniform vec2 u_resolution;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
            vec4 baseColor = texture2D(u_image, v_texCoord);
            vec2 uv = v_texCoord;
            float aspect = u_resolution.x / u_resolution.y;
            
            vec3 embers = vec3(0.0);
            
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float sizeFactor = 1.0 + fi * 0.65;
                float speedFactor = 0.45 + fi * 0.25;
                
                vec2 emberUv = uv * vec2(22.0, 13.0) * sizeFactor;
                
                emberUv.y -= u_time * 0.32 * speedFactor;
                emberUv.x += sin(u_time * 0.45 + fi * 1.8 + emberUv.y * 0.4) * 0.16;
                
                vec2 id = floor(emberUv);
                vec2 f = fract(emberUv);
                
                float h = hash(id);
                if (h > 0.81) {
                    vec2 center = vec2(0.2 + 0.6 * hash(id + vec2(1.4, 2.4)), 
                                       0.2 + 0.6 * hash(id + vec2(3.4, 4.4)));
                    
                    vec2 diff = (f - center) * vec2(1.0, aspect * 1.6);
                    float dist = length(diff);
                    
                    float r = 0.02 + 0.035 * hash(id + vec2(5.4, 6.4));
                    float emberIntensity = smoothstep(r, r * 0.1, dist);
                    
                    float flicker = 0.45 + 0.55 * sin(u_time * 7.5 + h * 95.0);
                    
                    vec3 emberColor = mix(vec3(0.92, 0.18, 0.0), vec3(1.0, 0.65, 0.08), hash(id + vec2(6.9, 7.9)));
                    
                    embers += emberColor * emberIntensity * flicker * (h - 0.81) * 4.5;
                }
            }
            
            gl_FragColor = vec4(baseColor.rgb + embers, baseColor.a);
        }
    `,

    particles_dust: `
        precision mediump float;
        varying vec2 v_texCoord;
        uniform sampler2D u_image;
        uniform float u_time;
        uniform vec2 u_resolution;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
            vec4 baseColor = texture2D(u_image, v_texCoord);
            vec2 uv = v_texCoord;
            float aspect = u_resolution.x / u_resolution.y;
            
            vec3 dust = vec3(0.0);
            
            for (int i = 0; i < 3; i++) {
                float fi = float(i);
                float sizeFactor = 1.0 + fi * 0.85;
                float speedFactor = 0.28 + fi * 0.18;
                
                vec2 dustUv = uv * vec2(17.0, 11.0) * sizeFactor;
                
                dustUv.y -= u_time * 0.12 * speedFactor;
                dustUv.x += sin(u_time * 0.28 + fi) * 0.12 - u_time * 0.04 * speedFactor;
                
                vec2 id = floor(dustUv);
                vec2 f = fract(dustUv);
                
                float h = hash(id);
                if (h > 0.77) {
                    vec2 center = vec2(0.2 + 0.6 * hash(id + vec2(1.3, 2.3)), 
                                       0.2 + 0.6 * hash(id + vec2(3.3, 4.3)));
                    
                    float twinkle = 0.35 + 0.65 * sin(u_time * 3.8 + h * 280.0);
                    
                    vec2 diff = (f - center) * vec2(1.0, aspect * 1.6);
                    float dist = length(diff);
                    
                    float d1 = abs(diff.x) + abs(diff.y);
                    float d2 = length(diff);
                    float shape = mix(d2, d1, 0.45);
                    
                    float r = 0.02 + 0.03 * hash(id + vec2(5.3, 6.3));
                    float sparkle = smoothstep(r, 0.0, shape);
                    
                    vec3 dustColor = vec3(1.0, 0.82, 0.35); // gold
                    if (fi == 1.0) dustColor = vec3(0.35, 0.88, 1.0); // cyan/teal
                    if (fi == 2.0) dustColor = vec3(0.88, 0.45, 1.0); // purple/pink
                    
                    float glow = exp(-dist * 28.0) * 0.35;
                    
                    dust += dustColor * (sparkle + glow) * twinkle * (h - 0.77) * 5.5;
                }
            }
            
            gl_FragColor = vec4(baseColor.rgb + dust, baseColor.a);
        }
    `
};

// Register all custom shader effects
if (window.tuxShowAPI && window.tuxShowAPI.registerShaderEffect) {
    Object.keys(shaders).forEach(id => {
        window.tuxShowAPI.registerShaderEffect('atmospheric-particles', {
            id: id,
            fragmentSource: shaders[id]
        });
        console.log(`[Atmospheric Particles] Registered shader effect: ${id}`);
    });
}

// Register custom inspector panel tab
if (window.tuxShowRegistry && window.tuxShowRegistry.registerInspectorTab) {
    const React = window.React;
    
    const renderTab = ({ activeCue }) => {
        if (!activeCue) {
            return React.createElement('div', { className: 'text-[10px] text-gray-500 italic text-center py-2' }, 
                'Select a cue to inspect.'
            );
        }

        const isMediaCue = ['video', 'image'].includes(activeCue.type);

        return React.createElement('div', { className: 'text-xs text-gray-400 space-y-3 p-3 bg-gray-950/20 rounded border border-gray-800' },
            React.createElement('div', { className: 'flex items-center justify-between' },
                React.createElement('span', { className: 'font-semibold text-gray-200' }, 'Status'),
                React.createElement('span', { className: 'px-2 py-0.5 bg-green-950 text-green-400 border border-green-800 rounded-full text-[9px] font-bold uppercase tracking-wider' }, 'Active')
            ),
            React.createElement('div', { className: 'text-[10px] text-gray-500 leading-relaxed' },
                'Procedural WebGL particle engine runs mathematically directly on the GPU, generating zero video file overhead.'
            ),
            isMediaCue ? React.createElement('div', { className: 'pt-2 border-t border-gray-800/60 space-y-1.5' },
                React.createElement('div', { className: 'text-[10px] text-gray-400 font-bold uppercase tracking-wider' }, 'How to use:'),
                React.createElement('ol', { className: 'list-decimal pl-4 text-[10px] text-gray-500 space-y-1' },
                    React.createElement('li', {}, 'Go to the WebGL Filter dropdown above.'),
                    React.createElement('li', {}, 'Select one of the registered Atmospheric effects.'),
                    React.createElement('li', {}, 'The particle generator will animate the layer in real-time.')
                )
            ) : React.createElement('div', { className: 'p-2 bg-yellow-950/30 border border-yellow-900/50 rounded text-[10px] text-yellow-500' },
                'WebGL filters can only be applied directly to video and image cues.'
            )
        );
    };

    window.tuxShowRegistry.registerInspectorTab({
        id: 'atmospheric-particles',
        name: 'Atmospheric Particles',
        icon: null, // Default
        renderTab: renderTab
    });
    console.log('[Atmospheric Particles] Registered Inspector tab');
}
