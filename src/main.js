import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import './style.css';

const $ = (id) => document.getElementById(id);
let selectedFile = null;
let ffmpeg = null;
let loadingPromise = null;
let outputUrl = null;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};
const safeName = (name) => name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'video';
const showStatus = (message) => { $('status').textContent = message; };

async function loadEngine() {
  if (ffmpeg) return ffmpeg;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    showStatus('Loading the video engine. The first load is larger and needs internet.');
    const engine = new FFmpeg();
    engine.on('log', ({ message }) => console.debug('[ClearCut FFmpeg]', message));
    engine.on('progress', ({ progress }) => {
      if (Number.isFinite(progress)) {
        const pct = Math.max(0, Math.min(99, Math.round(progress * 100)));
        $('progressBar').style.width = `${pct}%`;
        $('progressText').textContent = `Processing… ${pct}% (estimate)`;
      }
    });
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    await engine.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
    });
    ffmpeg = engine;
    return engine;
  })();
  try { return await loadingPromise; }
  finally { loadingPromise = null; }
}

function setFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name)) {
    showStatus('Please choose a video file.'); return;
  }
  selectedFile = file;
  $('fileInfo').classList.remove('hidden');
  $('fileInfo').innerHTML = `<span class="file-icon">▣</span><span class="file-name">${file.name.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span><span class="file-size">${formatBytes(file.size)}</span><button id="removeFile" class="remove-btn" type="button" aria-label="Remove video">×</button>`;
  $('removeFile').addEventListener('click', () => {
    selectedFile = null; $('fileInfo').classList.add('hidden'); $('compressBtn').disabled = true;
    $('compressBtn').innerHTML = 'Choose a video to begin <span>→</span>'; showStatus('Ready when you are.'); $('result').classList.add('hidden');
  });
  $('compressBtn').disabled = false;
  $('compressBtn').innerHTML = 'Compress video <span>→</span>';
  $('result').classList.add('hidden');
  showStatus('Video selected. Ready to compress.');
}

$('fileInput').addEventListener('change', (e) => setFile(e.target.files?.[0]));
const dropzone = $('dropzone');
for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', (e) => setFile(e.dataTransfer?.files?.[0]));

$('compressBtn').addEventListener('click', async () => {
  if (!selectedFile) return;
  const button = $('compressBtn');
  button.disabled = true;
  $('progressWrap').classList.remove('hidden');
  $('result').classList.add('hidden');
  $('progressBar').style.width = '2%';
  $('progressText').textContent = 'Starting…';
  try {
    const engine = await loadEngine();
    showStatus('Preparing your video. Keep this tab open.');
    const ext = (selectedFile.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
    const inputName = `input.${ext}`;
    const outputName = `${safeName(selectedFile.name)}-clearcut.mp4`;
    await engine.writeFile(inputName, await fetchFile(selectedFile));
    showStatus('Compressing locally. Large videos may take several minutes.');
    $('progressText').textContent = 'Processing…';
    const exitCode = await engine.exec([
      '-i', inputName,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      outputName
    ]);
    if (exitCode !== 0) throw new Error(`FFmpeg stopped with code ${exitCode}. This format or codec may not be supported.`);
    const data = await engine.readFile(outputName);
    const blob = new Blob([data], { type: 'video/mp4' });
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    const saved = selectedFile.size > 0 ? Math.round((1 - blob.size / selectedFile.size) * 100) : 0;
    $('result').classList.remove('hidden');
    $('result').innerHTML = `<div class="result-title">Your compressed video is ready</div><div class="comparison"><div><small>Original</small><strong>${formatBytes(selectedFile.size)}</strong></div><div><small>Compressed</small><strong>${formatBytes(blob.size)}</strong></div><div><small>Size change</small><strong>${saved >= 0 ? `${saved}% smaller` : `${Math.abs(saved)}% larger`}</strong></div></div><a class="download-btn" href="${outputUrl}" download="${outputName}">Download MP4 <span>↓</span></a>`;
    $('progressBar').style.width = '100%'; $('progressText').textContent = 'Finished';
    showStatus(blob.size < selectedFile.size ? 'Done. Your video is smaller.' : 'Done. This video did not become smaller; the original may already be efficiently compressed.');
    await engine.deleteFile(inputName).catch(() => {});
    await engine.deleteFile(outputName).catch(() => {});
  } catch (error) {
    console.error(error);
    showStatus(`Could not compress this video: ${error?.message || 'Unknown error'}`);
    $('progressText').textContent = 'Not completed';
  } finally {
    button.disabled = false;
  }
});
