# GLB Turntable Video

Turn a `.glb` 3D model into a rotating video with a **transparent background**,
entirely in the browser. Pick the file, duration, resolution, fps, and where to
save it — out comes a transparent WebM.

![flow](https://img.shields.io/badge/pipeline-Three.js%20%E2%86%92%20PNG%20frames%20%E2%86%92%20ffmpeg.wasm%20%E2%86%92%20WebM-2f81f7)

## Quick start

```bash
python serve.py
# or auto-load a model:
python serve.py --model path/to/model.glb
```

This serves the `app/` folder and opens it in your default browser. Use
**Chrome or Edge** for the native "Save as…" folder picker. Then:

1. Drag a `.glb` onto the page (or click **Choose .glb file…**).
2. Set **duration**, **resolution**, **fps**, **rotation type** (turntable spin
   or spherical tumble), **number of rotations**, **direction**, and
   **background** (transparent by default).
3. Click **Render & Save WebM**.

## How it works

Everything runs client-side — nothing is uploaded.

1. **Render** — [Three.js](https://threejs.org) loads the GLB, centers and
   auto-frames it, lights it with an image-based `RoomEnvironment` for proper
   PBR shading, and renders each rotation frame to a WebGL canvas with a
   transparent clear color.
2. **Capture** — each frame is read off the canvas as an RGBA PNG.
3. **Encode** — [ffmpeg.wasm](https://ffmpegwasm.netlify.app) muxes the frames
   into a WebM using `libvpx` (VP8) with `yuva420p`, preserving the alpha
   channel.
4. **Save** — via the File System Access API (folder picker) where supported,
   otherwise a normal download.

## Why VP8 and not VP9

- Browsers **cannot natively encode** a transparent WebM: WebCodecs exposes an
  `alpha: 'keep'` option but `VideoEncoder.isConfigSupported` rejects it for
  vp8/vp9/av1 — alpha *encoding* was never shipped. So encoding is done with
  ffmpeg compiled to WebAssembly instead.
- In ffmpeg.wasm, **VP9 encoding crashes** ("memory access out of bounds"), but
  **VP8 with alpha works** and is just as widely supported. VP8-alpha WebM plays
  in Chrome, Edge, Firefox, OBS, and most non-linear editors.
- H.264 / MP4 cannot store an alpha channel at all.

## Viewing transparent WebM

Transparent WebM shows its alpha in **browsers, OBS, and editors** that support
it. It will look opaque (black) in apps that don't — Windows Media Player, the
Windows Photos app, and PowerPoint. To check transparency quickly, drag the
file into a browser tab.

## Performance

Resolution × duration × fps = frames, and each frame is rendered, PNG-encoded,
and fed through a single-threaded wasm encoder. 720²–1080² for ~2 s is
comfortable; 2048² or long clips take noticeably longer and use more memory
(it's all one browser tab).

## Offline

All dependencies (Three.js, the ffmpeg.wasm core, etc.) are vendored under
`app/vendor/`, so the app works with no internet connection.
