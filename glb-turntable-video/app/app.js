import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FFmpeg } from './vendor/ffmpeg/ffmpeg/esm/index.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('view');
const dropHint = $('drop-hint');
const fileInput = $('file');
const renderBtn = $('render');
const statusEl = $('status');
const progressWrap = $('progress-wrap');
const bar = $('bar');
const progressLabel = $('progress-label');

const setStatus = (msg, kind = '') => { statusEl.textContent = msg; statusEl.className = kind; };
const setProgress = (frac, label) => {
  progressWrap.classList.add('show');
  bar.style.width = Math.round(frac * 100) + '%';
  if (label !== undefined) progressLabel.textContent = label;
};
const hideProgress = () => progressWrap.classList.remove('show');

// ---------- Three.js ----------
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 5, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.8);
rim.position.set(-4, 2, -3);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;

let pivot = null;          // group holding the centered model
let modelRadius = 1;       // bounding sphere radius
const ELEVATION = THREE.MathUtils.degToRad(18);
// Camera viewing direction (unit, from target to camera). Updated as the user
// orbits, so resolution changes and the export preserve the chosen angle.
const viewDir = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).normalize();

const readTurns = () => { const v = parseFloat($('turns').value); return (isFinite(v) && v > 0) ? v : 1; };
const readDir = () => +$('direction').value;
const readType = () => $('rotation-type').value;

// Incremental rotation for a given loop fraction (0..1), relative to identity.
// turntable: spin about the vertical (Y) axis.
// spherical: simultaneously spin (Y) and tumble (X) so every angle is shown.
// Returns to identity when `turns` is a whole number (seamless loop).
const _AXIS_Y = new THREE.Vector3(0, 1, 0);
const _AXIS_X = new THREE.Vector3(1, 0, 0);
function motionQuat(frac, turns, dir, type) {
  const a = dir * turns * Math.PI * 2 * frac;
  const q = new THREE.Quaternion().setFromAxisAngle(_AXIS_Y, a);
  if (type === 'spherical') q.multiply(new THREE.Quaternion().setFromAxisAngle(_AXIS_X, a));
  return q;
}

function currentResolution() {
  const v = $('resolution').value;
  let w, h;
  if (v === 'custom') { w = +$('cw').value; h = +$('ch').value; }
  else { [w, h] = v.split('x').map(Number); }
  w = Math.max(16, Math.round(w / 2) * 2);
  h = Math.max(16, Math.round(h / 2) * 2);
  return { w, h };
}

function frameCamera() {
  // Preserve the user's current orbit direction; only refit the distance.
  const d = camera.position.clone().sub(controls.target);
  if (d.lengthSq() > 1e-6) viewDir.copy(d).normalize();
  const aspect = camera.aspect;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const dist = Math.max(modelRadius / Math.sin(vFov / 2), modelRadius / Math.sin(hFov / 2)) * 1.3;
  controls.target.set(0, 0, 0);
  camera.position.copy(controls.target).addScaledVector(viewDir, dist);
  camera.near = Math.max(0.001, dist - modelRadius * 2);
  camera.far = dist + modelRadius * 4;
  camera.updateProjectionMatrix();
  controls.update();
}

function setPreviewSize() {
  const { w, h } = currentResolution();
  const aspect = w / h;
  camera.aspect = aspect;
  // fit the largest box of this aspect inside the stage
  const maxW = stage.clientWidth - 32, maxH = stage.clientHeight - 32;
  let pw = maxW, ph = maxW / aspect;
  if (ph > maxH) { ph = maxH; pw = maxH * aspect; }
  renderer.setPixelRatio(DPR);
  renderer.setSize(Math.floor(pw), Math.floor(ph), true);
  frameCamera();
}

// ---------- Preview loop ----------
let exporting = false;
let previewPhase = 0;
// Grabbing the model to orbit pauses auto-spin so you can set a start angle.
controls.addEventListener('start', () => { $('autospin').checked = false; });
function animate() {
  requestAnimationFrame(animate);
  if (exporting) return;
  if (pivot && $('autospin').checked) {
    previewPhase = (previewPhase + 0.003) % 1;
    pivot.quaternion.copy(motionQuat(previewPhase, 1, readDir(), readType()));
  }
  controls.update();
  applyBackground();
  renderer.render(scene, camera);
}
animate();

function applyBackground() {
  if ($('transparent').checked) {
    renderer.setClearColor(0x000000, 0);
    scene.background = null;
  } else {
    const c = new THREE.Color($('bgcolor').value);
    renderer.setClearColor(c, 1);
    scene.background = null;
  }
}

window.addEventListener('resize', () => { if (!exporting) setPreviewSize(); });

// ---------- Load GLB ----------
const loader = new GLTFLoader();
function loadGLB(arrayBuffer, name) {
  loader.parse(arrayBuffer, '', (gltf) => {
    if (pivot) { scene.remove(pivot); pivot.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    modelRadius = Math.max(0.0001, size.length() / 2);
    model.position.sub(center);
    pivot = new THREE.Group();
    pivot.add(model);
    scene.add(pivot);
    previewPhase = 0;
    setPreviewSize();
    dropHint.style.display = 'none';
    $('model-name').textContent = name;
    if (!$('filename').value.trim()) {
      $('filename').value = defaultName();
      if (dirHandle) $('dest-hint').textContent = `Saving to: ${dirHandle.name}/ · ${outName()}`;
    }
    renderBtn.disabled = false;
    setStatus('Loaded · drag to orbit the preview', 'ok');
  }, (err) => {
    console.error(err);
    setStatus('Failed to parse GLB: ' + (err?.message || err), 'err');
  });
}

function handleFile(file) {
  if (!file) return;
  if (!/\.glb$/i.test(file.name)) { setStatus('Please choose a .glb file', 'err'); return; }
  setStatus('Loading ' + file.name + '…');
  const reader = new FileReader();
  reader.onload = () => loadGLB(reader.result, file.name);
  reader.readAsArrayBuffer(file);
}

fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
stage.addEventListener('drop', (e) => {
  e.preventDefault(); stage.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});

// ---------- Controls UI ----------
$('resolution').addEventListener('change', () => {
  $('custom-res').style.display = $('resolution').value === 'custom' ? 'flex' : 'none';
  if (pivot) setPreviewSize();
});
$('cw').addEventListener('change', () => { if (pivot) setPreviewSize(); });
$('ch').addEventListener('change', () => { if (pivot) setPreviewSize(); });
$('transparent').addEventListener('change', () => { $('bgcolor').disabled = $('transparent').checked; });

// ---------- ffmpeg.wasm ----------
let ffmpeg = null;
async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => console.debug('[ffmpeg]', message));
  setStatus('Loading video encoder (~30 MB, first time only)…');
  await ffmpeg.load({
    coreURL: new URL('./vendor/ffmpeg/core/ffmpeg-core.js', location.href).href,
    wasmURL: new URL('./vendor/ffmpeg/core/ffmpeg-core.wasm', location.href).href,
  });
  return ffmpeg;
}

function dataURLtoU8(durl) {
  const bin = atob(durl.split(',')[1]);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const yieldUI = () => new Promise(r => setTimeout(r, 0));

// ---------- Save destination ----------
let dirHandle = null; // a chosen output folder (File System Access API)

function defaultName() {
  const b = ($('model-name').textContent || 'turntable').replace(/\.glb$/i, '') || 'turntable';
  return b + '_rotation.webm';
}
function outName() {
  let n = ($('filename').value || '').trim() || defaultName();
  if (!/\.webm$/i.test(n)) n += '.webm';
  return n.replace(/[\\/:*?"<>|]/g, '_');
}
async function ensurePerm(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

$('choose-dir').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    setStatus('Folder picking needs Chrome or Edge — a Save dialog will be used instead.', '');
    return;
  }
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'glb-turntable-out' });
    $('dest-hint').textContent = `Saving to: ${dirHandle.name}/ · ${outName()}`;
    setStatus('Output folder set.', 'ok');
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('Could not open folder: ' + (e.message || e), 'err');
  }
});
$('clear-dir').addEventListener('click', () => {
  dirHandle = null;
  $('dest-hint').textContent = 'A Save dialog will open after rendering.';
});
$('filename').addEventListener('input', () => {
  if (dirHandle) $('dest-hint').textContent = `Saving to: ${dirHandle.name}/ · ${outName()}`;
});

// Write the finished blob to the chosen destination.
// 1) chosen folder (no prompt)  2) Save dialog  3) plain download to Downloads.
async function saveOutput(blob) {
  const name = outName();
  if (dirHandle) {
    if (await ensurePerm(dirHandle)) {
      const fh = await dirHandle.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return dirHandle.name + '/' + name;
    }
    setStatus('Folder permission denied — falling back to a Save dialog.', '');
  }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'WebM video', accept: { 'video/webm': ['.webm'] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return handle.name;
    } catch (e) {
      if (e.name === 'AbortError') return null; // user cancelled
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name + ' (Downloads)';
}

// ---------- Export ----------
async function exportVideo() {
  if (!pivot || exporting) return;
  exporting = true;
  renderBtn.disabled = true;
  controls.enabled = false;
  // Start the rotation from exactly the orientation shown in the viewer.
  const startQuat = pivot.quaternion.clone();

  try {
    const { w: W, h: H } = currentResolution();
    const fps = +$('fps').value;
    const duration = Math.min(30, Math.max(0.5, +$('duration').value));
    const turns = readTurns();
    const dir = readDir();
    const type = readType();
    const total = Math.max(2, Math.round(duration * fps));
    const transparent = $('transparent').checked;

    // switch renderer to exact export resolution
    renderer.setPixelRatio(1);
    camera.aspect = W / H;
    renderer.setSize(W, H, false);
    frameCamera();
    applyBackground();

    const ff = await getFFmpeg();
    setProgress(0, 'Rendering frames…');

    const pad = (n) => String(n).padStart(4, '0');
    for (let i = 0; i < total; i++) {
      pivot.quaternion.copy(motionQuat(i / total, turns, dir, type)).multiply(startQuat);
      renderer.render(scene, camera);
      const u8 = dataURLtoU8(canvas.toDataURL('image/png'));
      await ff.writeFile('f' + pad(i) + '.png', u8);
      setProgress(0.6 * (i + 1) / total, `Rendering frame ${i + 1}/${total}`);
      if (i % 3 === 0) await yieldUI();
    }

    setProgress(0.62, 'Encoding transparent WebM…');
    ff.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) setProgress(0.62 + 0.36 * progress, 'Encoding transparent WebM…');
    });

    // VP8 (libvpx) in both cases — VP9 currently crashes in ffmpeg.wasm.
    // yuva420p keeps the alpha channel; yuv420p for a solid background.
    const args = ['-framerate', String(fps), '-i', 'f%04d.png',
      '-c:v', 'libvpx', '-pix_fmt', transparent ? 'yuva420p' : 'yuv420p',
      '-b:v', '0', '-crf', '10', '-qmin', '0', '-qmax', '42',
      '-auto-alt-ref', '0', '-an', 'out.webm'];
    await ff.exec(args);

    const data = await ff.readFile('out.webm');
    const blob = new Blob([data.buffer], { type: 'video/webm' });

    // cleanup virtual FS
    for (let i = 0; i < total; i++) { try { await ff.deleteFile('f' + pad(i) + '.png'); } catch (e) {} }
    try { await ff.deleteFile('out.webm'); } catch (e) {}

    setProgress(1, 'Done');
    window.__lastBlob = blob; // exposed for debugging/automation
    const kb = (blob.size / 1024).toFixed(0);
    const saved = window.__skipSave ? '(test)' : await saveOutput(blob);
    if (saved === null) setStatus('Save cancelled.', '');
    else setStatus(`Saved ${saved} · ${W}×${H}, ${duration}s, ${kb} KB`, 'ok');
  } catch (e) {
    console.error(e);
    setStatus('Render failed: ' + (e?.message || e), 'err');
  } finally {
    pivot.quaternion.copy(startQuat); // restore the orientation shown before export
    exporting = false;
    controls.enabled = true;
    renderBtn.disabled = false;
    setPreviewSize();
    setTimeout(hideProgress, 1500);
  }
}

renderBtn.addEventListener('click', exportVideo);

// Debug/automation hook (harmless): inspect the live scene objects.
window.__debug = { get camera() { return camera; }, get controls() { return controls; }, get pivot() { return pivot; } };

setPreviewSize();
setStatus('Drop a .glb file to begin');

// Optional deep-link: ?model=<url> auto-loads a GLB
const _modelURL = new URLSearchParams(location.search).get('model');
if (_modelURL) {
  setStatus('Loading ' + _modelURL + '…');
  fetch(_modelURL).then(r => r.arrayBuffer())
    .then(buf => loadGLB(buf, _modelURL.split('/').pop()))
    .catch(e => setStatus('Could not load model: ' + e, 'err'));
}
