TuxShow V1.4.0: System Architecture & Capability Report
1. Executive Summary
TuxShow is a high-performance, open-source show control and projection mapping system engineered specifically for live theatrical environments. Built on a hybrid technology stack utilizing Electron, React, Node.js, and Vite, TuxShow bridges the gap between modern web technologies and low-level operating system execution. It is designed to deliver robust, frame-accurate video, audio, and lighting playback while maintaining an intuitive cue-list interface tailored for educational theater, stage managers, and digital scenery designers.

2. Core Architecture & IPC Bridge
The application architecture is strictly bifurcated into two environments to maximize security and performance:

The Frontend (React/Vite): Operates as the visual presentation and state management layer. It handles the highly complex user interface, constructs the 60fps rendering pipeline via HTML5 Canvas and WebGL, and maintains the current state of the show file in memory.
The Backend (Node.js/Electron): Operates as the system execution layer. It manages raw file I/O, spawns child processes, handles network socket binding, and interfaces directly with hardware.
The IPC Bridge: Communication between these layers is governed by a secure, context-isolated Inter-Process Communication (IPC) bridge (coreAppAPI and tuxShowAPI). The frontend never accesses the file system or network directly; instead, it invokes verified backend handlers that perform the dangerous operations and return sanitized results.

The Timeline Worker: To prevent the main React UI thread from locking up during complex shows, TuxShow offloads show-logic to a dedicated Web Worker (timelineWorker.js). This "Brain" continuously evaluates recursive cue logic, evaluates conditional logic gates (e.g., checking OSC variables at 100ms intervals), and calculates heavy mathematical tweens for animations at 60Hz. It communicates back to the main thread via asynchronous message passing, ensuring the UI remains buttery smooth regardless of show complexity.

3. Network Redundancy & Synchronization
TuxShow V1.4.0 introduces an enterprise-grade Multi-Machine Redundancy pipeline, ensuring that a hardware failure on the primary control computer does not stop the show.

UDP Telemetry Sync (The Heartbeat): When configured in "Master" mode, the syncEngine.js module continuously broadcasts the exact timeline state (cue playheads, variables, pausing) over a UDP socket (255.255.255.255:53001). A secondary machine running in "Backup" mode listens to this stream, locking its local UI and slaving its media playback engine to instantly mirror the Master.
TCP/HTTP Pack Tunneling: To ensure the Backup machine has the exact same media files as the Master, the system utilizes a temporary internal HTTP server on port 53002. The Master can seamlessly deploy a .TSPack archive over the LAN directly to the Backup's staging directory, keeping the machines completely synchronized without manual USB drive transfers.
4. File Management & Media Pipeline
The .TSPack Archiving Engine: To solve the portability issues of massive media shows, TuxShow moves archiving logic completely into the Node.js backend to bypass browser memory constraints. When a user packs a workspace, the backend stages the media, rewrites all internal JSON paths to relative ./media/ directories, and executes native Ubuntu tar commands via child processes. On load, the system detects .TSPack files, extracts them to a temporary OS directory, and safely mounts the absolute file paths back into the UI.

The Media Rendering Pipeline: The visual composite engine is built for maximum throughput:

Direct DOM Manipulation: Live media scrubbing, volume fading, and pausing are executed by talking directly to the underlying HTMLMediaElement DOM nodes, bypassing React state lifecycles to eliminate render-thrashing.
Hardware Accelerated Compositing: A central 60fps requestAnimationFrame loop handles the heavy lifting. It routes video frames through WebGL GLSL Shaders (for real-time color correction and custom effects), applies perspective warping via affine canvas transformations, calculates precise polygon masking, and composites everything down into dedicated hardware-accelerated borderless projector windows.
5. Remote Interfaces & Security
TuxShow features a built-in Virtual HTTP Display server that hosts a suite of remote Progressive Web Apps (PWAs), allowing auxiliary crew to interact with the show over Wi-Fi.

Available PWAs: The system dynamically serves a Stage Manager Deck (remote GO/STOP), a Game Show Buzzer, a Mobile Camera (turning smartphones into live WebRTC wireless camera feeds), and a WebRTC Viewer for remote backstage monitors.
The Authentication Gateway: To prevent unauthorized students or audience members from accessing the show control network, the backend HTTP server features a strict Security PIN gateway. If a PIN is configured, the server intercepts all incoming requests. API calls missing the correct tuxshow_auth cookie are rejected with a 401 Unauthorized status, while browser requests are served a custom HTML PIN pad to securely unlock the session.
6. Hardware Integrations
TuxShow serves as a central hub for the entire theater ecosystem:

OSC (Open Sound Control): Full bi-directional support via node-osc. TuxShow can fire network commands to external soundboards/consoles, and can also receive incoming network variables to trigger internal conditional logic.
MSC (MIDI Show Control): Utilizes easymidi and native C++ ALSA bindings to reliably parse and transmit hex-based MIDI Show Control commands to legacy lighting boards.
DMX Lighting: The internal dmxEngine.js acts as an Art-Net emitter, broadcasting 512 channels of lighting data over UDP at a steady 44Hz, calculating smooth crossfades natively.
Projector Management: The projectorEngine.js uses raw TCP sockets to interface with venue projectors via PJLink or custom TCP profiles, allowing the software to automatically open shutters or power on hardware.
System Profiler: A boot-time diagnostic module (SystemProfiler) dynamically evaluates CPU cores, RAM, and GPU capability. It automatically scales the application into High (60fps), Balanced (30fps), or Basic (15fps/No Shaders) performance tiers to guarantee stability on underpowered school hardware.
7. Deployment Topologies
The flexible architecture supports several production topologies:

Standalone (Standard): A single Ubuntu laptop connected via HDMI directly to a projector, handling UI and rendering simultaneously.
Mission Critical (Redundant): An Ubuntu "Master" machine running the show, connected to a Gigabit network switch alongside an Ubuntu "Backup" machine. Both machines output to video switchers, with the Backup silently slaving to the Master's UDP heartbeats.
Distributed Network: An Ubuntu machine securely locked in the server rack rendering media, while the Stage Manager runs the show wirelessly from the wings using a Chromebook or iPad connected to the internal WebRTC PWA Deck.
