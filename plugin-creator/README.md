# TuxShow Plugin Creator

The **TuxShow Plugin Creator** is an AI-powered developer sandbox built specifically for **TuxShow FOSS**. It runs entirely in the browser and leverages the Google Gemini API to design, validate, and bundle custom plugins.

## Features

1. **Structured Metadata Panel**: Choose plugin names, IDs, versioning schemes, and runtime environments (Node.js, Python, or custom React UI tabs).
2. **Granular Permissions Checkbox**: Explicitly configure which hardware integration hooks or system scopes (such as OSC, Art-Net DMX, or PJLink) your plugin uses.
3. **LLM Synthesis**: Directly query Gemini models (e.g., `gemini-1.5-flash` or `gemini-1.5-pro`) using system instruction dictionaries that model the core TuxShow APIs.
4. **"The Gatekeeper" Security Audit**:
   - Parses the manifest.json format and enforces 1:1 correspondence of permission scopes.
   - Audits headless Node/Python scripts for illegal browser DOM references (`document`, `window`, `querySelector`, etc.).
   - Recommends exception recovery (try/catch blocks) inside core lifecycle scripts.
5. **In-Memory Zip Compilation**: Uses `JSZip` to compile the package instantly in-memory, letting you download the ready-to-install `.zip` plugin package with a single click.

---

## File Structure

- [index.html](file:///home/christopher-baker/my-mapper-app/plugin-creator/index.html): The workspace user interface, layout, and control grids.
- [style.css](file:///home/christopher-baker/my-mapper-app/plugin-creator/style.css): Custom dark-mode design system, glassmorphism UI cards, animations, and typography.
- [app.js](file:///home/christopher-baker/my-mapper-app/plugin-creator/app.js): Application logic, Gemini API client integrations, validator engines, and packaging scripts.

---

## How to Run Locally

Since this tool is built entirely client-side using standard HTML5, CSS, and ES Modules, you can run it using any local static web server. 

Because the parent project uses **Vite**, you can serve it directly from the workspace:

### Option 1: Using the Existing Vite Dev Server (Recommended)
If your dev server is already running (`npm run dev`), simply open your browser and navigate to:
```
http://localhost:5173/plugin-creator/index.html
```

### Option 2: Standalone Static Server
To run a dedicated server inside the `plugin-creator/` directory:
```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx http-server -p 8000
```
Then open: [http://localhost:8000](http://localhost:8000)
