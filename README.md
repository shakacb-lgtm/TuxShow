# TuxShow: Theatrical Show Control & Mapping

TuxShow is an enterprise-grade, open-source projection mapping and show control system engineered for Ubuntu Linux. Built on a hybrid Electron/React/Node.js stack, TuxShow bridges the gap between modern web technologies and mission-critical hardware execution. 

Designed with educational and community theater in mind, TuxShow empowers students and stage managers to execute flawless, frame-accurate AV shows—with built-in fail-safes designed to "Student-proof the booth."

### 🎭 Why TuxShow?

Professional show control software is often prohibitively expensive for public schools and community theaters. TuxShow provides a completely free alternative without sacrificing professional capabilities:
* **Hardware Agnostic:** A built-in System Profiler dynamically scales WebGL shaders to 60fps, 30fps, or 15fps depending on your hardware, ensuring older school-issued laptops never crash mid-show.
* **Theatrical Logic:** Designed around a standard cue-list workflow familiar to Stage Managers and Designers.
* **Isolated Rendering:** The React UI is completely firewalled from the `timelineWorker.js` execution engine. Even if the UI lags, your audio, video, and hardware triggers fire with millisecond precision.

### ✨ Version 1.4.0 Capabilities

* **Multi-Machine Redundancy:** Deploy a Master and Backup laptop on the same network. The Master broadcasts UDP heartbeats at 60Hz. If the Master dies, the Backup is already perfectly slaved to the exact frame.
* **PWA Security Gateway:** Broadcast ultra-low latency WebRTC stage monitors, mobile camera feeds, and an interactive Stage Manager Deck to crew iPads over Wi-Fi, protected by a strict PIN-auth gateway.
* **Hardware Integration:** Natively output OSC network strings, MSC hex packets via ALSA, DMX Art-Net lighting universes (44Hz), and raw PJLink TCP commands to venue projectors.
* **Advanced Projection Mapping:** Independent 4-point affine perspective warping and polygon masking for every individual media cue.
* **Native .TSPack Archiving:** Instantly bundle massive 40GB+ show files and all relative media into a highly compressed, portable `.TSPack` archive via native OS `tar` threads.
* **Plugin Extensibility:** A robust `contextBridge` API allows you to safely install third-party Python/Node.js logic extensions and custom React UI panels to extend the software's capabilities.

### 💻 System Requirements

TuxShow is optimized for Linux but can be deployed on Windows via WSLg.
* **OS:** Ubuntu 22.04 LTS (or later) / Windows 11 (via WSLg).
* **Hardware Minimum:** 4GB RAM, Dual-core processor.
* **Hardware Recommended:** 8GB RAM, Dedicated GPU (for complex warping).

### 🚀 Getting Started

1. **Download:** Grab the latest `.deb` installer from the Releases page.
2. **Install:** Double-click the file or run `sudo dpkg -i tuxshow.deb` in your terminal.
3. **Launch:** Open TuxShow from your applications menu.
4. **Learn:** Download the Official Technical Manual from the Releases page.

### 🤝 Contributing

We love help from the community! Whether you are a professional developer, a theater teacher with feedback, or a student who found a bug, please see our `CONTRIBUTING.md` guide to get involved.

### 📄 License

This project is licensed under the GNU GPLv3 License — ensuring that TuxShow remains free and open for every student, forever.
