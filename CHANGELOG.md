Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

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
