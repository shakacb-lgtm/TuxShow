# TuxShow - App Preview & Architecture

## Visual Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              TUXSHOW MAIN WINDOW                           │
├────────────────────────────────────────────────────────────────────────────┤
│ [Menu] [Save] [Load] [Add Cue ▼] [New Project] [Settings] [GPU: Enabled]  │
│ [Play] [Pause] [Stop] [⊞ Mapping] [Stats] [🖥 Projector ON]                │
├──────────────────────┬────────────────────────────────────────────────────┤
│                      │                                                    │
│   CUE LIST           │          STAGE PREVIEW                            │
│  (Left 1/3)          │          (Top 2/3 - Projection Mapping Canvas)    │
│                      │                                                    │
│  1    Background     │    ┌──────────────────────────────────────────┐   │
│  1.1  ▶ Video        │    │  [Live Stage Preview - Black Screen]     │   │
│  1.2    Audio        │    │  FPS: 60 | RES: 1920x1080               │   │
│  1.3    Title        │    │                                          │   │
│  1.4    Blackout     │    │  (Projection Mapping Grid: 1x1)          │   │
│  1.5    GoTo         │    │  ◉ Corner Pins (editable when mapping)   │   │
│  2     Sequence      │    │                                          │   │
│  3     Loop Cue      │    └──────────────────────────────────────────┘   │
│                      │                                                    │
│  [+] Add Cue         │    INSPECTOR PANEL (Bottom 1/3)                   │
│  [±] Renumber        │    ┌──────────────────────────────────────────┐   │
│  [🔧] Settings       │    │ CUE PROPERTIES                           │   │
│  [🗂️] New Folder      │    │ ────────────────────────────────────────│   │
│                      │    │ Name:          [Background Loop______]   │   │
│                      │    │ Type:          [Video ▼]                │   │
│                      │    │ File:          [media.mp4]             │   │
│                      │    │ ────────────────────────────────────────│   │
│                      │    │ Duration: 0s  │ Follow: None ▼        │   │
│                      │    │ Volume:   [████████ 100%]              │   │
│                      │    │ Fade In: 2.0s │ Fade Out: 2.0s        │   │
│                      │    │ ────────────────────────────────────────│   │
│                      │    │ ▼ Video Effects                         │   │
│                      │    │   [✓] Chroma Key (Green Screen)         │   │
│                      │    │   [✓] Mask Enable  [Edit Mask Shape]    │   │
│                      │    │   Similarity: [0.4] Smoothness: [0.1]   │   │
│                      │    │ ────────────────────────────────────────│   │
│                      │    │ ▼ Color Correction                      │   │
│                      │    │   Hue: [120°]  Sat: [100%]  Bri: [100%]│   │
│                      │    │ ────────────────────────────────────────│   │
│                      │    │ ▼ Geometry & Warp                       │   │
│                      │    │   Scale X: 100%  Scale Y: 100%          │   │
│                      │    │   Pos X: 50%     Pos Y: 50%             │   │
│                      │    │   [✓] Perspective Warp [Edit Pins]      │   │
│                      │    │ ────────────────────────────────────────│   │
│                      │    │ [Cancel] [Apply to All] [✓ Save]        │   │
│                      │    └──────────────────────────────────────────┘   │
├──────────────────────┴────────────────────────────────────────────────────┤
│ 127.0.0.1 │ VIRTUAL HTTP: ON (http://127.0.0.1:8554/display1)            │
│ OSC RX: PORT 53000 ◇ │ MSC RX: DEV [0] ◇                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

## Key UI Components

### Header Toolbar
- **Playback Controls**: Play (▶), Pause (⏸), Stop (⏹), Stop All
- **File Management**: Save, Load, New Project
- **Cue Operations**: Add Cue, Renumber Cues, Edit Folder
- **Display Controls**: Mapping Mode Toggle, Stats Display, Projector Window Toggle
- **Settings**: Hardware displays, OSC/MIDI config, Virtual Display RTSP
- **Status**: GPU Status indicator, Network IP display

### Left Panel - Cue List (1/3 width)
- **Hierarchical Cue Display**:
  - Numbered cues (1, 2, 3... or point cues like 1.5)
  - Group folders (collapsible/expandable)
  - Visual indicators:
    - ⏵ Playing (green)
    - ⏸ Paused (yellow)
    - ⏹ Stopped
    - ⏱ Countdown timer tag
    - Media duration/FPS stats
    - Audio visualizer (animated bars)
    
- **Drag & Drop**:
  - Reorder cues within list
  - Import media files
  - Drop to add new cues
  
- **Inline Controls**:
  - Play button for each cue
  - Duration/follow timer display
  - Inline editing (cue name, number)

### Right Panel - Rendering & Inspector (2/3 width)

#### Stage Preview (Top 2/3)
- **Live Projection Canvas**:
  - Black background (ready for content)
  - Aspect ratio: 16:9 (aspect video)
  - Shows composite of all active cues
  
- **Projection Mapping Overlay** (when mapping mode enabled):
  - Configurable mesh grid (1x1 to 4x4)
  - Interactive corner pins (blue circles)
  - Affine matrix transformation visualization
  - Triangle-based warping for precise projection
  
- **Stats Overlay** (when enabled):
  - FPS counter
  - Resolution display
  - Live video/camera frame capture

#### Inspector Panel (Bottom 1/3)
- **Cue Type-Specific Properties**:
  
  **Video/Audio**:
  - File selector
  - Volume slider
  - Loop toggle
  - Media sync offset
  - Fade in/out controls
  - Color correction (HSB)
  - Chroma keying with similarity/smoothness
  - Masking with polygon drawing
  - Geometry (scale, position, crop, warp)
  
  **Image/Text/Timer**:
  - Content editor
  - Text formatting (font, size, bold, italic, shadow)
  - Color picker
  - Alignment options
  - Scale and position controls
  
  **Behavioral Cues** (GoTo, Counter, Conditional, MSC, OSC):
  - Target cue number selection
  - Logic configuration (if/then)
  - Network settings (IP, port, paths)
  - Loop/repeat parameters
  
  **Timing & Follow**:
  - Duration input
  - Follow action selector (None / Auto-Follow)
  - Trigger behavior (Overlap / Hard Stop)
  - Multi-cue bulk editing

### Bottom - Status Bar
- **Network Info**: Local IP address (e.g., 127.0.0.1)
- **Virtual Display Status**: RTSP HTTP stream URL (when enabled)
- **Hardware I/O Status**:
  - OSC RX (with pulse indicator when listening)
  - MSC RX (with pulse indicator when connected)
  - Port/device info

## Cue Type Icons & Colors

| Cue Type | Icon | Color | Purpose |
|----------|------|-------|---------|
| Video | 🎬 | Blue | Plays video files with playback sync |
| Audio | 🎵 | Blue | Plays audio tracks with fade control |
| Image | 🖼️ | Blue | Static images with effects |
| Camera | 📷 | Cyan | Live hardware camera input |
| Text | 📝 | Blue | Dynamic text rendering with formatting |
| Timer | ⏱️ | Teal | Countdown/count-up display |
| Transition | ✨ | Pink | Vision mixer scene transitions (Wipe, Iris, etc.) |
| GoTo | ↙️ | Blue | Jump to specific or random cue |
| Counter/Loop | 🔄 | Orange | Repeat cues N times before advancing |
| Pause | ⏸ | Gray | Pause playback |
| Blackout | 🌑 | Gray | Full stage blackout |
| Stop | ⏹ | Red | Stop specific cue during playback |
| MSC | 🎛️ | Purple | MIDI Show Control network message |
| OSC | 📡 | Cyan | Open Sound Control network message |
| Group/Folder | 📁 | Indigo | Container for sub-cues (fire-all or fire-first) |
| Conditional | ⎇ | Emerald | If/Then logic based on cue state or OSC |

## Rendering Engine

### Master Canvas System
- **Hidden Canvas Elements** (not displayed but used for rendering):
  - Individual media players (video/audio elements)
  - Text rendering canvas
  - Timer rendering canvas
  - Chroma key framebuffer objects (FBO)
  - Mask images

- **Composite Pipeline**:
  1. Media plays invisibly in background
  2. Content drawn to hidden canvases with effects applied
  3. Chroma keying applied via WebGL shaders (green screen removal)
  4. Content composited onto master canvas
  5. Master canvas drawn through quad mesh with affine transforms
  6. Output to projector windows

### Projection Mapping
- **Dynamic Mesh Grid**: 
  - Configurable 1x1 to 4x4 grid of quads
  - Each quad warped via 2D affine transformation
  - Corner pins define quad vertices
  - Supports trapezoidal, perspective, and 3D warp effects

- **Framebuffer Objects (FBO)**:
  - Used for vision mixer transitions
  - Captures previous frame for transition effect
  - Supports Iris, Wipe, Curtain, Ripple, Windblown effects

## Key Features Demonstrated in UI

### 1. **Non-Destructive Timeline**
- Cues can be reordered, renamed, reconfigured without affecting source files
- Full undo/redo capable via state management
- Point cue numbering (e.g., 1.5 between cues 1 and 2)

### 2. **Real-Time Editing**
- Changes to cue properties immediately reflected in preview
- Live camera input preview
- FPS/resolution monitoring

### 3. **Advanced Rendering**
- WebGL chroma keying with adjustable parameters
- Vision mixer transitions (6+ effect types)
- Multi-layer projection mapping

### 4. **Hardware Integration**
- Multi-display routing (select specific display per cue)
- OSC network control (receive commands, send commands)
- MIDI Show Control (broadcast MSC messages)
- Virtual RTSP stream output for remote displays

### 5. **Professional Workflow**
- Bulk multi-cue selection and editing
- Group/folder organization with fire-all/fire-first modes
- Auto-advance timers with countdown display
- Media sync offset (skip into track or delay fire)
- Comprehensive file save/load with .TSW workspace format

## Color Scheme

- **Background**: Dark gray/black (`bg-gray-900`, `bg-gray-950`, `bg-black`)
- **Text**: Light gray (`text-gray-100`)
- **Accent Colors**:
  - Blue: Primary actions, video, generics
  - Cyan: OSC, camera, network
  - Green: Auto-follow, chroma key, audio
  - Orange: Scheduled/time-based
  - Pink: Transitions, special effects
  - Purple: MIDI Show Control
  - Teal: Timers
  - Emerald: Conditionals
  - Yellow: Warnings, legacy format
  - Red: Stop, danger actions

## Responsive Design

- **Docking Layouts**: 
  - Left panel (cue list) fixed 1/3 width
  - Right panel (stage + inspector) 2/3 width
  - Vertically responsive (stage auto-sized to aspect ratio)
  
- **Grid System**: Tailwind CSS 4 with zero-config responsive classes
- **Scrollable Regions**: Custom scrollbars in dark theme
  - Cue list scrolls independently
  - Inspector scrolls independently (long cue properties)

## Accessibility Features

- **Keyboard Navigation**:
  - Arrow keys for cue selection
  - Enter to play
  - Space to pause
  - Shift+N for new cue
  - Ctrl+S for save
  
- **Drag & Drop**: Full accessibility support via pointer events
- **Visual Feedback**: Hover states, active indicators, pulse animations
- **High Contrast**: Color scheme optimized for visibility

---

**This is a professional, QLab-inspired show control software with advanced projection mapping, hardware control, and real-time rendering capabilities entirely in React/Electron.**
