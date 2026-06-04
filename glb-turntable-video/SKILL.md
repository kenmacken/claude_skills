---
name: glb-turntable-video
description: >-
  Render a rotating "turntable" video of a 3D model (.glb / GLB file) with a
  transparent background, as a single-page web app. Use when the user wants to
  turn a GLB/glTF model into a spinning video, make a transparent rotating
  animation of a 3D object, preview a .glb as a looping video, or asks to open
  the GLB turntable / 3D rotation video tool. Lets them pick the file, duration,
  resolution, fps, and download location, and exports a transparent WebM.
---

# GLB Turntable Video

A self-contained, client-side web app that loads a GLB model, spins it 360°,
and exports a **transparent WebM** (VP8 + alpha). Rendering (Three.js) and video
encoding (ffmpeg.wasm) both run in the browser — there is no render backend and
nothing is uploaded anywhere.

## Launching it

Run the launcher (it starts a static server for `app/` and opens the browser):

```
python "<skill_dir>/serve.py"
```

To auto-load a specific model the user already has, pass it:

```
python "<skill_dir>/serve.py" --model "C:/path/to/model.glb"
```

- `serve.py` picks port 8777 (or the next free port) and opens the default
  browser to the app. Keep the process running while the user works; stop it
  with Ctrl+C when they're done.
- Use the user's **Chrome or Edge** for the best experience (the "Save as…"
  folder picker uses the File System Access API). Other browsers fall back to a
  normal download into the Downloads folder.
- If the user just wants to use it, tell them to drag a `.glb` onto the page (or
  click "Choose .glb file…"), set duration / resolution / fps, then click
  **Render & Save WebM**.

## What the app does

- **Input:** drag-and-drop or file-picker for a `.glb`. Auto-frames and lights
  the model with an image-based environment for clean PBR shading.
- **Controls:** duration (0.5–30 s), resolution (480²/720²/1080²/2048² square,
  1280×720 / 1920×1080 widescreen, or custom), fps (24/30/60), rotation type
  (turntable spin or spherical tumble that shows all angles), number of rotations
  (any number, default 1), spin direction, and transparent vs. solid-color
  background. A whole number of rotations loops seamlessly.
- **Output:** a seamlessly-looping transparent `.webm` saved to a location the
  user chooses.

## Notes / gotchas

- The first render downloads the ffmpeg.wasm core (~30 MB, vendored locally at
  `app/vendor/ffmpeg/core/`, served from disk — no internet needed) and
  initializes it; subsequent renders are faster.
- The encoder is **VP8 + alpha**, not VP9: VP9 currently crashes in ffmpeg.wasm
  ("memory access out of bounds"). VP8-alpha WebM is widely supported (Chrome,
  Edge, Firefox, OBS, most editors). MP4/H.264 cannot carry alpha at all.
- Transparent WebM will look opaque/black in apps that don't support alpha video
  (Windows Media Player, the Photos app, PowerPoint). View it in a browser, OBS,
  or an NLE that supports alpha WebM.
- Higher resolutions and longer durations are slower to encode and use more
  memory (everything runs in one browser tab). 720²–1080² for a couple of
  seconds is the comfortable range.

## Layout

```
glb-turntable-video/
├── SKILL.md          # this file
├── README.md         # user-facing docs + architecture
├── serve.py          # static-server launcher (opens the browser)
└── app/
    ├── index.html    # single-page UI
    ├── app.js        # Three.js rendering + ffmpeg.wasm encoding
    └── vendor/       # three.js + ffmpeg.wasm core (all offline)
```
