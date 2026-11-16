// Source browser for project pages: reads the project's source.zip in the
// browser (JSZip), shows a file tree and syntax-highlighted code (highlight.js).
(function () {
  "use strict";
  var root = document.getElementById("source-browser");
  if (!root) return;

  var tree = root.querySelector("[data-tree]");
  var codeEl = root.querySelector("[data-code]");
  var pathEl = root.querySelector("[data-path]");
  var copyBtn = root.querySelector("[data-copy]");
  var zipUrl = root.dataset.zip;
  var mainFile = root.dataset.main;

  var MAX_TEXT = 512 * 1024;
  var IGNORE = /(^|\/)(\.git|target|node_modules|\.DS_Store|__MACOSX)(\/|$)/;
  var LANG = {
    rs: "rust", toml: "ini", wgsl: "glsl", glsl: "glsl", vert: "glsl", frag: "glsl",
    js: "javascript", mjs: "javascript", ts: "typescript", json: "json", ron: "rust",
    md: "markdown", html: "xml", xml: "xml", svg: "xml", css: "css", sh: "bash",
    yml: "yaml", yaml: "yaml", py: "python", txt: "plaintext", lock: "ini", cfg: "ini",
  };
  var IMAGE = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i;
  var AUDIO = /\.(ogg|mp3|wav|flac)$/i;

  var zip = null;
  var files = [];
  var prefix = "";
  var current = null;
  var currentText = "";
  var objectUrl = null;

  function note(msg) {
    var p = document.createElement("p");
    p.className = "source-browser__note";
    p.textContent = msg;
    return p;
  }

  function ext(name) {
    var m = /\.([^.\/]+)$/.exec(name);
    return m ? m[1].toLowerCase() : "";
  }

  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  // Build a nested tree { dirs: {name: node}, files: [entry] }
  function buildTree(entries) {
    var rootNode = { dirs: {}, files: [] };
    entries.forEach(function (e) {
      var parts = e.rel.split("/");
      var node = rootNode;
      for (var i = 0; i < parts.length - 1; i++) {
        node = node.dirs[parts[i]] = node.dirs[parts[i]] || { dirs: {}, files: [] };
      }
      node.files.push(e);
    });
    return rootNode;
  }

  function renderTree(node, depth, openPath) {
    var ul = document.createElement("ul");
    Object.keys(node.dirs).sort().forEach(function (name) {
      var li = document.createElement("li");
      var d = document.createElement("details");
      var childPath = (openPath.base ? openPath.base + "/" : "") + name;
      d.open = depth === 0 || (openPath.target || "").indexOf(childPath + "/") === 0;
      var s = document.createElement("summary");
      s.textContent = name;
      s.className = "dir";
      d.appendChild(s);
      d.appendChild(renderTree(node.dirs[name], depth + 1, { base: childPath, target: openPath.target }));
      li.appendChild(d);
      ul.appendChild(li);
    });
    node.files.sort(function (a, b) { return a.rel.localeCompare(b.rel); }).forEach(function (e) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "file";
      b.textContent = e.rel.split("/").pop();
      b.title = e.rel + " (" + fmtSize(e.size) + ")";
      b.dataset.path = e.rel;
      b.addEventListener("click", function () { open(e.rel, true); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    return ul;
  }

  function open(rel, updateHash) {
    var entry = files.find(function (f) { return f.rel === rel; });
    if (!entry) return;
    current = entry;
    pathEl.textContent = rel;
    tree.querySelectorAll("button.file").forEach(function (b) {
      b.classList.toggle("active", b.dataset.path === rel);
    });
    if (updateHash) history.replaceState(null, "", "#src=" + encodeURIComponent(rel));
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    copyBtn.disabled = true;
    codeEl.innerHTML = "";

    if (IMAGE.test(rel) || AUDIO.test(rel)) {
      entry.file.async("blob").then(function (blob) {
        var type = /\.svg$/i.test(rel) ? "image/svg+xml" : blob.type;
        objectUrl = URL.createObjectURL(type ? blob.slice(0, blob.size, type) : blob);
        var el;
        if (AUDIO.test(rel)) { el = document.createElement("audio"); el.controls = true; }
        else { el = document.createElement("img"); el.alt = rel; }
        el.src = objectUrl;
        var wrap = document.createElement("div");
        wrap.className = "source-browser__media";
        wrap.appendChild(el);
        codeEl.appendChild(wrap);
      });
      return;
    }
    if (entry.size > MAX_TEXT) {
      codeEl.appendChild(note("This file is " + fmtSize(entry.size) + " — too large to preview. Download the zip to view it."));
      return;
    }
    entry.file.async("uint8array").then(function (bytes) {
      if (looksBinary(bytes)) {
        codeEl.appendChild(note("Binary file (" + fmtSize(entry.size) + ")."));
        return;
      }
      currentText = new TextDecoder("utf-8").decode(bytes);
      renderCode(currentText, LANG[ext(rel)] || "plaintext");
      copyBtn.disabled = false;
    });
  }

  function looksBinary(bytes) {
    var n = Math.min(bytes.length, 8000);
    for (var i = 0; i < n; i++) if (bytes[i] === 0) return true;
    return false;
  }

  function renderCode(text, lang) {
    var lines = text.replace(/\n$/, "").split("\n").length;
    var wrap = document.createElement("div");
    wrap.className = "source-browser__pre";
    var gutter = document.createElement("pre");
    gutter.className = "source-browser__gutter";
    gutter.setAttribute("aria-hidden", "true");
    var nums = [];
    for (var i = 1; i <= lines; i++) nums.push(i);
    gutter.textContent = nums.join("\n");
    var pre = document.createElement("pre");
    var code = document.createElement("code");
    code.className = "hljs language-" + lang;
    if (window.hljs && window.hljs.getLanguage(lang) && text.length < 200000) {
      code.innerHTML = window.hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    } else {
      code.textContent = text;
    }
    pre.appendChild(code);
    wrap.appendChild(gutter);
    wrap.appendChild(pre);
    codeEl.appendChild(wrap);
  }

  copyBtn.addEventListener("click", function () {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(currentText).then(function () {
      copyBtn.textContent = "Copied!";
      setTimeout(function () { copyBtn.textContent = "Copy"; }, 1500);
    });
  });

  function load() {
    if (!window.JSZip) { tree.innerHTML = ""; tree.appendChild(note("Could not load the zip reader.")); return; }
    fetch(zipUrl)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.arrayBuffer();
      })
      .then(function (buf) { return window.JSZip.loadAsync(buf); })
      .then(function (z) {
        zip = z;
        var names = [];
        z.forEach(function (path, file) { if (!file.dir && !IGNORE.test(path)) names.push(path); });
        // If everything lives in one top-level folder (common for zips), strip it.
        var tops = {};
        names.forEach(function (n) { tops[n.split("/")[0]] = true; });
        var topKeys = Object.keys(tops);
        if (topKeys.length === 1 && names.every(function (n) { return n.indexOf("/") !== -1; })) prefix = topKeys[0] + "/";
        files = names.map(function (n) {
          var f = z.file(n);
          return { rel: n.slice(prefix.length), file: f, size: (f._data && f._data.uncompressedSize) || 0 };
        });
        if (!files.length) throw new Error("The zip is empty.");

        var fromHash = /^#src=(.+)$/.exec(location.hash);
        var target = fromHash ? decodeURIComponent(fromHash[1]) : mainFile;
        if (!files.some(function (f) { return f.rel === target; })) {
          var guess = ["src/main.rs", "src/lib.rs", "README.md", "Cargo.toml"].find(function (g) {
            return files.some(function (f) { return f.rel === g; });
          });
          target = guess || files[0].rel;
        }
        tree.innerHTML = "";
        tree.appendChild(renderTree(buildTree(files), 0, { base: "", target: target }));
        open(target, false);
      })
      .catch(function (err) {
        tree.innerHTML = "";
        tree.appendChild(note("Could not load source.zip (" + err.message + ")."));
      });
  }

  // Load once the browser is visible-ish to avoid fetching for visitors who never scroll.
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: "600px 0px" });
    io.observe(root);
  } else {
    load();
  }
})();
