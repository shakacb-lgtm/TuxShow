Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

[1.5.0] - 2026-06-11

Added

- **IoT Webhook Cue:** Added native backend fetch handling to bypass browser CORS constraints, allowing seamless HTTP requests (GET, POST, PUT, PATCH, DELETE) to smart controllers (e.g., Philips Hue, Shelly relays) directly from the timeline.
- **Projector Control Modules:** Implemented `PJLINK:CONTROL` permissions to securely issue power and shutter commands to remote hardware targets.
- **Layer & DMX Modifiers:** Added `LAYER:MODIFY` routing and Custom Cue Faders to dynamically target standard DMX channels.
- **Stage Panic Button:** Added a dedicated safety cue utilizing `core.cue.fire` to instantly trigger safety lighting and stage-clear commands.
- **System Architecture Plugins:** Introduced modular support for multi-machine synchronization and system redundancy.
- **Sequence / Timeline Cue:** Added automated multitrack parent containers for orchestrating complex action sequences.
- **Memo / Operator Note Cue:** Added visual console logging (danger, warning, safety info) directly into the operator's contextual inspector.
- **Multi-Projector Stage Preview Tabs:** Added dedicated tab controls (Composite view, WebRTC virtual stream, and individual hardware displays) to the Stage Preview when multiple outputs are detected, allowing operators to dynamically isolate and preview individual display targets.
- **Mixed Audio Canvas Recording:** Enhanced the canvas recording (`REC` button) to capture all playback audio (both video and audio cues) in the exported WebM file via a custom Web Audio API graph, bypassing local monitoring mutes.
- **User Manual PDF Compiler:** Created a headless Electron-based compilation script that parses the markdown user manual, formats it with premium typography and booth comm design sheets, and prints it to a polished A4 PDF.

Optimized & Hardened

- Performance Refactoring: Wrapped `localStorage` saves in a 1000ms debouncer using custom structural change checking to prevent active playhead ticks from causing main thread disk I/O lag.
- Inspector Memoization: Shielded the React Inspector panel from background playhead updates using custom `areInspectorPropsEqual` memoization to block redundant re-renders.
- Advanced Batch Editing UX: Added italicized `<Multiple Values>` placeholders and Lucide warning icons for mixed selection properties. Conflicting inputs clear automatically on focus.
- Live JSON Validation: Enabled live syntax validation and red border styling for headers and body JSON textareas, preventing malformed saves.
- Webhook Exception Protection: Enclosed backend network parsing and fetches in strict try/catch blocks with a dedicated `webhook-error` IPC bridge.
- Floating Toast Notifications: Registered UI listener to present a red-themed floating operator warning toast on webhook delivery failures.
- Surtitle Auto-Advance Lock: Established a 150ms lock preventing double-skips from manual trigger and auto-advance collisions.

[1.4.1] - 2026-06-05

Optimized

- High-Frequency IPC reduction: Silenced background timelineWorker.js `ANIMATION_TICK` postMessages when the timeline is completely idle.
- GC & Memory Pressure optimization: Replaced `JSON.parse(JSON.stringify)` deep cloning of animation modifiers in App.jsx's 60Hz loop with a lightweight shallow-copy loop.
- Array Traversal optimization: Consolidated two separate `.filter()` scans over cues inside timelineWorker.js into a single `for` loop traversal.
- Art-Net buffer optimization: Replaced continuous buffer allocations/concatenations in dmxEngine.js's 44Hz loop with a pre-allocated single packet and mapped `subarray` view.
- Render closure elimination: Removed closure and array instantiation from `renderLoop` (replaced inner `[1, 2].forEach` with standard `for` loop and moved `drawToCtx`/`drawWrapper` helpers out of the loops).
- Worker sync throttling: Added state-change tracking (`lastSyncHashRef`) to avoid posting worker updates during high-frequency visual dragging/positioning.

[1.4.0] - 2026-06-03

Added

Plugin Extensibility & Canvas Firewall: Introduced a secure `contextBridge` API for custom third-party plugins.
Plugin Manager GUI: Operators can now install, monitor, and toggle third-party logic extensions safely.
Multi-Machine Redundancy: Introduced Master and Backup networking modes. The Master broadcasts timeline state via UDP, and the Backup instantly slaves its playback engine to provide mission-critical hot-standby redundancy.
Native .TSPack Archiving: Re-engineered the "Pack Workspace" utility to use the Node.js backend and native Ubuntu `tar` commands, bypassing browser memory constraints for massive shows.
PWA Security Gateway: Added a PIN protection layer to the Virtual HTTP Display server to secure remote WebRTC feeds and PWA control surfaces (Deck, Buzzer, etc.) from unauthorized network access.
Live Media Monitor: Transformed the Inspector into a dual-mode panel. Operators can now switch to a "Live Media" tab to view, scrub, pause, or kill currently active media directly via the DOM without altering saved cue states.
Sequence Snippets: Added the ability to natively save and load Sequence cue children as portable `.tssnip` JSON template files.

Fixed & Optimized

Projector Animation Sync: Fixed a bug where `animate` tweens were dropping payloads on spawned projector windows by shifting the interpolation math directly into the main 60Hz rendering loop.
Backend Socket Hardening: Patched critical unhandled exceptions (`EADDRINUSE`) in the UDP `syncEngine` and missing file stream error handlers that could cause complete application crashes during port collisions or locked directories.
ES Module Refactor: Upgraded internal backend engines (`syncEngine.js`, etc.) to strict ES Modules to match the Vite/Node ecosystem standards and resolve `ERR_REQUIRE_ESM` boot crashes.
Native Open/Save Dialogs: Unified the Workspace loader to handle `.TSW`, `.TSShow`, and automatic extraction of `.TSPack` archives natively via OS-level dialogs rather than hidden HTML inputs.

[1.3.0] - 2026-05-29

Added

Canvas Recording: Added the ability to record the master projection canvas directly to a WebM video file.

Undo / Redo History: Added a comprehensive undo/redo stack (Ctrl+Z / Ctrl+Shift+Z) to safely revert workspace and cue edits.

Copy / Paste & Context Menu: Added right-click context menus to the cue list for quickly copying, pasting, and deleting cues or entire groups.

Animate / Tween Cues: Introduced a new cue type to animate the properties (Position, Scale, Opacity) of other cues over time. Features a custom SVG Motion Path editor for complex animations.

PDF Manual Uploads: The automated release script now supports bundling and uploading PDF manuals from the `./docs/` directory to GitHub Releases.

Resizable UI Panels & Layout: Added a draggable divider between the cue list and the projection preview/inspector panes. Panel widths are now freely customizable and save automatically across sessions.

Auto-Scroll to Playhead: Added a professional auto-scroll toggle that centers the active/selected cue in the list. Scrolling manually seamlessly disengages the lock to prevent fighting the user's focus.

Master Volume Control: Exposed a global master volume slider in the bottom status bar for quick, emergency audio overrides.

Native Text Context Menu: Text inputs and textareas across the app now use a native OS-level context menu for clipboard actions (Cut/Copy/Paste/Undo), drastically improving accessibility without bloating the React DOM.

Stage Preview Boundaries: Added a distinct drafting-grid background and shadow drop to the Stage Preview to clearly define the physical bounds of the projection canvas against the dark theme.

Fixed & Optimized

Inspector Performance: Debounced disk writes and IPC state broadcasts by 500ms to protect the main thread from locking up or lagging during rapid text input.

Undo History Spam: Fixed an issue where typing in the Inspector would create a new undo history state for every single keystroke. Edits are now intelligently batched.

Animation Render Loop: Optimized the main 60fps composite loop's modifier calculations. The engine now bypasses expensive array reallocations every frame, significantly improving playback performance during complex tweens.

Header Overflow Protection: Truncated the Active Playhead text list in the top header to prevent layout-breaking UI overflows when triggering massive, simultaneous cue groups.

Backend Resiliency: Made the WebM duration metadata injection module robust against missing dependencies and ES Module interop errors to ensure the main application process always boots safely.

[1.2.0] - 2026-05-21

Added

Media Sync Offset: Added a precise timing slider for Audio and Video cues. Cues can be positively offset to skip ahead into a track, or negatively offset to introduce a pre-wait delay, allowing for exact synchronization between separate AV elements.

Conditional Logic Cues: Introduced the "If/Then/Else" Conditional cue type. Cues can now evaluate network OSC payload values or check the playback status of other cues on the timeline, automatically branching playback to different paths based on the result.

Timer Cues: A new generative cue type that renders real-time Countup and Countdown clocks directly onto the projection canvas. Timers inherit the complete typography styling suite built for Text cues.

Color Correction Pipeline: Visual cues now support real-time hardware-accelerated HSB (Hue, Saturation, Brightness) color filtering directly via the Inspector panel.

WebRTC Virtual Display & Receiver Mode: Overhauled the network streaming engine to use ultra-low latency WebRTC. Added a new Dedicated Receiver Mode to easily run TuxShow as a wireless projection node on a secondary computer.

Mobile Camera PWA: Turn any smartphone on the local network into a wireless live camera feed via the new Progressive Web App integration.

Custom Polygon Masking: Added an interactive Mask Editor overlay allowing users to draw complex, multi-point polygon masks to cut out or isolate specific areas of Video, Image, and Camera cues.

Native MIDI Integration: Replaced legacy MIDI handling with `easymidi` and native C++ ALSA bindings for robust, hardware-level MIDI Show Control (MSC) integration.

Fixed

Group Hierarchy Integrity: Completely rewrote the Drag-and-Drop system logic. When dragging a cue onto a Group Folder in the cue list, it now strictly adopts the folder's groupId and is forced physically inside the folder's dropdown hierarchy in the tree structure, rather than floating ambiguously adjacent to it.

[1.1.0] - 2026-05-17

Added

Pack Workspace Feature: New ability to bundle all media files and the .TSW show file into a portable folder using relative ./media/ paths, allowing shows to easily move between computers.

Advanced Geometry & Outline Pipeline: Visual cues (Video, Image, Camera, Text) now support per-cue Scale (X/Y), Position (X/Y), Cropping bounds, and customizable Colored Outlines.

Perspective Warp Engine: Visual cues can now be individually warped using a 4-point affine transform editor, completely independent of the master stage mapping grid.

Workspace Tracking: The name of the active loaded/saved workspace is now dynamically displayed in the OS Title Bar.

UI Versioning: The current software version is now cleanly displayed in the top header next to the "Show Control" subtitle.

Fixed

Virtual Display Crash (EADDRINUSE): Completely replaced the FFmpeg built-in web server with a dedicated Node.js HTTP server. This fixes the crash caused by VLC "probe" requests and allows multiple devices to safely watch the stream simultaneously.

Crop Distortion: Fixed a rendering bug where cropped images would inappropriately stretch to fill the projection destination. Added "Keep Aspect Ratio" enforcement to correctly pillarbox/letterbox media.

Settings Modal Crash: Fixed a fatal React ReferenceError caused by missing X and Check icon imports that occurred when opening the I/O settings.

Missing Volume UI: Restored the Volume slider for Video and Audio cues in the Inspector that was accidentally hidden by CSS grid layouts.

[1.0.0] - 2026-05-16

Added

Initial stable release of TuxShow Show Control.

Universal timing architecture (Fade In, Fade Out, Duration, Follow Actions).

Support for Video, Audio, Image, Text, Camera, OSC, MSC, and Logic cues.

2D Canvas-based projection mapping (Mesh warping via affine transforms).
