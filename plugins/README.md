# TuxShow Developed Plugins Directory

Welcome to the developed plugins repository for **TuxShow FOSS**, a theatrical show control and projection mapping system.

This directory serves as a centralized registry of officially developed plugins that enhance the capabilities of the TuxShow runtime environment. Developers can inspect, copy, or package these plugins to extend their own local installations.

---

## 🔌 Available Plugins

### 1. 🌌 Atmospheric Particle Generator
* **ID**: `atmospheric-particles`
* **Template**: React / UI Inspector Tab (`ui.js`)
* **Description**: A highly interactive component that injects a customizable dynamic particle canvas/compositor into the inspector tab. It allows real-time tuning of wind vectors, gravity modifiers, color hues, and density configurations for ambient projection design.
* **Source Folder**: [`plugins/atmospheric-particles/`](file:///home/christopher-baker/my-mapper-app/plugins/atmospheric-particles/)

### 2. 🗃️ Panic Proof Importer
* **ID**: `panic-proof-importer`
* **Template**: React / UI Inspector Tab (`ui.js`)
* **Description**: An advanced, fail-safe schema importer that lets show operators load cue sheets, configurations, and assets with dry-run verification. Includes an inline editor with real-time JSON validation to guarantee cue sheet integrity before starting live show sequences.
* **Source Folder**: [`plugins/panic-proof-importer/`](file:///home/christopher-baker/my-mapper-app/plugins/panic-proof-importer/)

### 3. 🛡️ Dummy Diagnostics
* **ID**: `dev.tuxshow.dummy-diagnostics`
* **Template**: React / UI Inspector Tab (`ui.js`)
* **Description**: A diagnostics tab useful for testing show environments. It renders status checks, tracks frame rates, simulates network triggers, and audits permission scopes.
* **Source Folder**: [`plugins/dev.tuxshow.dummy-diagnostics/`](file:///home/christopher-baker/my-mapper-app/plugins/dev.tuxshow.dummy-diagnostics/)

---

## 📥 Installation Guide

TuxShow imports plugins as zipped archive packages (`.zip`). To deploy any of the plugins above to another installation:

1. **Compress the plugin folder**:
   Zip the directory of the target plugin, making sure that `manifest.json` is at the root of the archive.
   ```bash
   # Example: package the Atmospheric Particle Generator
   cd plugins/
   zip -r atmospheric-particles.zip atmospheric-particles/
   ```

2. **Import in TuxShow**:
   - Open TuxShow.
   - Access the **Plugin Manager Modal** inside the Settings / Inspector panel.
   - Click **Install Plugin ZIP** and select your generated `.zip` file.
   - Enable the plugin from the toggle status controls.
