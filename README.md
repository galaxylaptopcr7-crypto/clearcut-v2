ClearCut 2.0
Quality-first browser video compression, built with Vite and ffmpeg.wasm. GitHub Actions builds and deploys the site to GitHub Pages.
Important
Files are processed locally in the browser; they are not uploaded to a server.
The first use downloads the FFmpeg WebAssembly engine.
Browser memory and device performance limit how large/long a video can be processed.
Balanced settings use H.264 CRF 23, `veryfast`, and AAC 192 kbps. The original dimensions are retained.
