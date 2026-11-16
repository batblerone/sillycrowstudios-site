// In-browser player for wasm-bindgen (`--target web`) builds such as Bevy games.
//
// Inspired by bevy.org's example pages: the game is only downloaded when the
// visitor presses Play, download progress is shown for the .wasm and for every
// asset the game fetches, and WebGPU support is checked up front.

const root = document.getElementById("game");

if (root) {
  const frame = root.querySelector("[data-frame]");
  const overlay = root.querySelector("[data-overlay]");
  const playBtn = root.querySelector("[data-play]");
  const progress = root.querySelector("[data-progress]");
  const progressFile = root.querySelector("[data-progress-file]");
  const progressBar = root.querySelector("[data-progress-bar]");
  const errorBox = root.querySelector("[data-error]");
  const errorText = root.querySelector("[data-error-text]");
  const support = root.querySelector("[data-support]");
  const gpuWarning = root.querySelector("[data-gpu-warning]");
  const sizeHint = root.querySelector("[data-size-hint]");
  const fullscreenBtn = root.querySelector("[data-fullscreen]");
  const reloadBtns = document.querySelectorAll("[data-reload]");
  const canvas = document.getElementById("bevy");

  const jsUrl = root.dataset.js;
  const wasmUrl = root.dataset.wasm;
  const renderer = root.dataset.renderer;
  let started = false;

  // ---------------------------------------------------------------- support

  async function detect() {
    const out = { webgpu: false, webgl2: false };
    try {
      if (navigator.gpu) out.webgpu = !!(await navigator.gpu.requestAdapter());
    } catch (_) { /* ignore */ }
    try {
      out.webgl2 = !!document.createElement("canvas").getContext("webgl2");
    } catch (_) { /* ignore */ }
    return out;
  }

  detect().then((caps) => {
    const ok = renderer === "webgpu" ? caps.webgpu : caps.webgl2;
    const name = renderer === "webgpu" ? "WebGPU" : "WebGL2";
    support.innerHTML = ok
      ? `<span class="dot ok"></span>${name} supported`
      : `<span class="dot warn"></span>${name} not detected`;
    if (!ok && renderer === "webgpu") gpuWarning.hidden = false;
  });

  // Show the download size without downloading the file.
  fetch(wasmUrl, { method: "HEAD" })
    .then((r) => {
      const len = Number(r.headers.get("content-length"));
      if (r.ok && len) sizeHint.textContent += ` · ${formatBytes(len)} download`;
    })
    .catch(() => {});

  // ---------------------------------------------------------------- progress

  const inflight = new Map();
  let hideTimer = 0;

  function formatBytes(n) {
    if (!n) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
  }

  function fileName(resource) {
    const s = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource && resource.url ? resource.url : "";
    try { return decodeURIComponent(new URL(s, location.href).pathname.split("/").pop()) || s; } catch (_) { return s; }
  }

  function showProgress(name, loaded, total) {
    clearTimeout(hideTimer);
    progress.hidden = false;
    progressFile.textContent = total
      ? `${name} — ${formatBytes(loaded)} / ${formatBytes(total)}`
      : `${name} — ${formatBytes(loaded)}`;
    const indeterminate = !total || loaded > total; // compressed transfer: length is unknown
    progressBar.classList.toggle("is-indeterminate", indeterminate);
    progressBar.style.width = indeterminate ? "" : `${Math.min(100, (loaded / total) * 100)}%`;
  }

  function maybeHideProgress() {
    clearTimeout(hideTimer);
    // Small delay so the bar doesn't flash between consecutive asset loads.
    hideTimer = setTimeout(() => { if (!inflight.size) progress.hidden = true; }, 250);
  }

  // Wrap a fetch so its body streams through a progress-reporting TransformStream.
  async function trackedFetch(origFetch, resource, init) {
    const response = await origFetch(resource, init);
    if (!response.ok || !response.body || (init && init.method && init.method !== "GET")) return response;
    const name = fileName(resource);
    const total = Number(response.headers.get("content-length")) || 0;
    const id = Symbol(name);
    let loaded = 0;
    inflight.set(id, name);
    showProgress(name, 0, total);
    const stream = response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        showProgress(name, loaded, total);
        controller.enqueue(chunk);
      },
      flush() {
        inflight.delete(id);
        maybeHideProgress();
      },
    }));
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  }

  // ---------------------------------------------------------------- canvas

  // Bevy renders into <canvas id="bevy"> when the game sets
  // `canvas: Some("#bevy".into())`. Games that don't will append their own
  // canvas to <body>; adopt it into the frame so the page still works.
  const adopt = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLCanvasElement && node !== canvas && node.parentElement === document.body) {
          canvas.remove();
          node.classList.add("game__canvas");
          node.removeAttribute("style");
          frame.prepend(node);
        }
      }
    }
  });

  function currentCanvas() {
    return frame.querySelector("canvas");
  }

  // ---------------------------------------------------------------- start

  function fail(err) {
    console.error(err);
    progress.hidden = true;
    errorBox.hidden = false;
    let msg = (err && (err.message || String(err))) || "Unknown error";
    if (renderer === "webgpu" && !navigator.gpu) msg = "This browser does not support WebGPU. " + msg;
    errorText.textContent = msg;
  }

  async function start() {
    if (started) return;
    started = true;
    overlay.hidden = true;
    root.classList.add("is-running");
    showProgress(fileName(jsUrl), 0, 0);
    adopt.observe(document.body, { childList: true });

    // Track every fetch the game makes (the .wasm itself and its assets/).
    const origFetch = window.fetch.bind(window);
    window.fetch = (resource, init) => trackedFetch(origFetch, resource, init);

    try {
      const mod = await import(jsUrl);
      const init = mod.default;
      const wasm = fetch(wasmUrl);
      try {
        // wasm-bindgen >= 0.2.93 takes an options object.
        await init({ module_or_path: wasm });
      } catch (err) {
        // winit drives Bevy's event loop by throwing this on purpose.
        if (!isControlFlow(err)) throw err;
      }
      maybeHideProgress();
      fullscreenBtn.disabled = false;
      reloadBtns.forEach((b) => (b.disabled = false));
      const c = currentCanvas();
      if (c) c.focus({ preventScroll: true });
    } catch (err) {
      if (isControlFlow(err)) return;
      fail(err);
    }
  }

  function isControlFlow(err) {
    return !!(err && err.message && err.message.startsWith("Using exceptions for control flow"));
  }

  window.addEventListener("error", (e) => {
    if (started && isControlFlow(e.error)) e.preventDefault();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isControlFlow(e.reason)) e.preventDefault();
  });

  playBtn.addEventListener("click", start);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) start(); });

  reloadBtns.forEach((b) => b.addEventListener("click", () => {
    // Bevy can't be re-initialised in the same page, so restart = reload + autoplay.
    const u = new URL(location.href);
    u.searchParams.set("play", "1");
    location.href = u.toString();
  }));

  fullscreenBtn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.requestFullscreen && frame.requestFullscreen().catch(() => {});
  });
  document.addEventListener("fullscreenchange", () => {
    root.classList.toggle("is-fullscreen", document.fullscreenElement === frame);
    const c = currentCanvas();
    if (c) c.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "f" && started && document.activeElement && document.activeElement.tagName !== "CANVAS"
        && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      fullscreenBtn.click();
    }
  });

  const params = new URLSearchParams(location.search);
  if (root.dataset.autoplay === "true" || params.has("play")) {
    if (params.has("play")) {
      params.delete("play");
      const qs = params.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }
    start();
  }
}
