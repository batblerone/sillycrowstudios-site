// Projects gallery: search, renderer filter, category scroll-spy and a WebGPU
// support banner (the gallery equivalent of bevy.org's support warning).
(function () {
  "use strict";
  var root = document.getElementById("projects");
  if (!root) return;

  var input = root.querySelector("[data-project-q]");
  var cells = Array.prototype.slice.call(root.querySelectorAll("[data-project]"));
  var groups = Array.prototype.slice.call(root.querySelectorAll("[data-group]"));
  var empty = root.querySelector("[data-projects-empty]");
  var rendererButtons = Array.prototype.slice.call(root.querySelectorAll("[data-renderer-filter]"));
  var renderer = "all";

  function apply() {
    var toks = (input.value || "").toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    cells.forEach(function (c) {
      var okText = toks.every(function (t) { return c.dataset.search.indexOf(t) !== -1; });
      var okRenderer = renderer === "all" || c.dataset.renderer === renderer;
      c.hidden = !(okText && okRenderer);
      if (!c.hidden) shown++;
    });
    // Hide category sections (innermost first) that have nothing visible
    groups.slice().reverse().forEach(function (g) {
      var visible = g.querySelector("[data-project]:not([hidden])");
      g.hidden = !visible;
    });
    empty.hidden = shown !== 0;
    rendererButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.rendererFilter === renderer ? "true" : "false");
    });
    var params = new URLSearchParams(location.search);
    if (input.value) params.set("q", input.value); else params.delete("q");
    if (renderer !== "all") params.set("renderer", renderer); else params.delete("renderer");
    var qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  var t;
  input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(apply, 120); });
  rendererButtons.forEach(function (b) {
    b.addEventListener("click", function () { renderer = b.dataset.rendererFilter; apply(); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });

  var params = new URLSearchParams(location.search);
  if (params.get("q")) input.value = params.get("q");
  if (params.get("renderer")) renderer = params.get("renderer");
  if (input.value || renderer !== "all") apply();

  // Scroll-spy: highlight the category currently in view
  var links = Array.prototype.slice.call(root.querySelectorAll("[data-menu-link]"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (l) { byId[l.dataset.menuLink] = l; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (l) { l.classList.remove("active"); });
        var l = byId[en.target.id];
        if (l) l.classList.add("active");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    groups.forEach(function (g) { if (g.id) io.observe(g); });
  }

  // WebGPU support banner
  var status = root.querySelector("[data-gpu-status]");
  if (status && cells.some(function (c) { return c.dataset.renderer === "webgpu"; })) {
    detectWebGPU().then(function (ok) {
      status.hidden = false;
      status.classList.add(ok ? "is-ok" : "is-warn");
      status.innerHTML = ok
        ? "<strong>WebGPU is available.</strong> Click a project to run it in your browser."
        : "<strong>WebGPU isn’t available in this browser.</strong> WebGPU projects need a recent Chrome, Edge or Safari " +
          "(or Firefox with WebGPU enabled) on a device with a supported GPU. WebGL2 projects still work.";
    });
  }

  function detectWebGPU() {
    if (!navigator.gpu) return Promise.resolve(false);
    return navigator.gpu.requestAdapter().then(function (a) { return !!a; }, function () { return false; });
  }
})();
