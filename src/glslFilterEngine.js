class GLSLFilterEngine {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true }) || this.canvas.getContext('experimental-webgl');
        this.programCache = {};
        this.customShaders = {
            'invert': `
                precision mediump float;
                varying vec2 v_texCoord;
                uniform sampler2D u_image;
                void main() {
                    vec4 color = texture2D(u_image, v_texCoord);
                    gl_FragColor = vec4(1.0 - color.rgb, color.a);
                }
            `,
            'grayscale': `
                precision mediump float;
                varying vec2 v_texCoord;
                uniform sampler2D u_image;
                void main() {
                    vec4 color = texture2D(u_image, v_texCoord);
                    // Standard luminance conversion
                    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                    gl_FragColor = vec4(gray, gray, gray, color.a);
                }
            `
        };
        
        if (!this.gl) console.warn('[WebGL] GPU Acceleration not supported on this hardware.');
        
        this.DEFAULT_VS = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y); // Flip Y for 2D Canvas compatibility
            }
        `;
        
        this.DEFAULT_FS = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_image;
            void main() {
                gl_FragColor = texture2D(u_image, v_texCoord);
            }
        `;
        
        this._initBuffers();
    }

    _initBuffers() {
        if (!this.gl) return;
        const gl = this.gl;
        
        // Setup a simple rectangle that fills the offscreen canvas
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0,  1.0, -1.0,  -1.0, 1.0,  1.0, 1.0]), gl.STATIC_DRAW);

        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0,  1.0, 0.0,  0.0, 1.0,  1.0, 1.0]), gl.STATIC_DRAW);
        
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('[WebGL] Shader Compile Error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    getShaderProgram(shaderId) {
        const gl = this.gl;
        if (!shaderId || !this.customShaders[shaderId]) shaderId = 'default';

        if (!this.programCache[shaderId]) {
            const fsSource = shaderId === 'default' ? this.DEFAULT_FS : this.customShaders[shaderId];
            const vs = this.compileShader(gl.VERTEX_SHADER, this.DEFAULT_VS);
            const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
            
            if (!vs || !fs) return this.programCache['default'];

            const program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            
            this.programCache[shaderId] = program;
        }
        return this.programCache[shaderId];
    }

    updateShader(id, fragmentSource) {
        this.customShaders[id] = fragmentSource;
        if (this.programCache[id]) delete this.programCache[id]; // Force recompile on next frame
    }

    processFrame(mediaElement, shaderId, width, height) {
        if (!this.gl || !mediaElement) return mediaElement;
        
        this.canvas.width = width;
        this.canvas.height = height;
        const gl = this.gl;

        gl.viewport(0, 0, width, height);
        const program = this.getShaderProgram(shaderId);
        gl.useProgram(program);

        // Upload current video/image frame to GPU
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mediaElement);

        // Setup Attributes
        const posLoc = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        const texLoc = gl.getAttribLocation(program, "a_texCoord");
        gl.enableVertexAttribArray(texLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

        // Draw!
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        return this.canvas; // Return the offscreen canvas to be drawn by the 2D engine
    }
}

export const glslEngine = new GLSLFilterEngine();