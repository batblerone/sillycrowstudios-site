// PaperMod search, adapted from hugo-PaperMod's fastsearch.js (MIT) for Zola's
// `fuse_json` search index (fields: url, title, description, body).
(function () {
  "use strict";
  var cfg = window.PAPERMOD_SEARCH || {};
  var resList = document.getElementById("searchResults");
  var sInput = document.getElementById("searchInput");
  var searchBox = document.getElementById("searchbox");
  if (!sInput || !resList) return;

  var fuse = null;
  var firstResult = null;
  var lastResult = null;

  function debounce(fn, delay) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, delay);
    };
  }

  function reset() {
    firstResult = lastResult = null;
    resList.innerHTML = "";
    sInput.value = "";
    sInput.focus();
  }

  function setActive(el) {
    document.querySelectorAll(".focus").forEach(function (n) { n.classList.remove("focus"); });
    if (!el) return;
    el.focus();
    if (el.parentElement) el.parentElement.classList.add("focus");
  }

  var chevrons = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevrons-right">' +
    '<polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>';

  function render(results) {
    resList.innerHTML = "";
    firstResult = lastResult = null;
    if (!results || !results.length) return;
    var frag = document.createDocumentFragment();
    results.forEach(function (r) {
      var li = document.createElement("li");
      li.appendChild(document.createTextNode(r.item.title || r.item.url));
      li.insertAdjacentHTML("beforeend", chevrons);
      var a = document.createElement("a");
      a.className = "entry-link";
      a.href = r.item.url;
      a.setAttribute("aria-label", r.item.title || r.item.url);
      li.appendChild(a);
      frag.appendChild(li);
    });
    resList.appendChild(frag);
    firstResult = resList.firstElementChild;
    lastResult = resList.lastElementChild;
  }

  function search() {
    if (!fuse) return;
    var q = sInput.value.trim();
    if (!q) { render([]); return; }
    render(fuse.search(q, { limit: cfg.limit || 20 }));
  }

  fetch(cfg.index)
    .then(function (r) {
      if (!r.ok) throw new Error("Search index load failed: " + r.status);
      return r.json();
    })
    .then(function (data) {
      fuse = new Fuse(data, {
        distance: cfg.distance || 100,
        threshold: cfg.threshold == null ? 0.4 : cfg.threshold,
        ignoreLocation: true,
        keys: [
          { name: "title", weight: 3 },
          { name: "description", weight: 2 },
          { name: "body", weight: 1 }
        ]
      });
      sInput.disabled = false;
      sInput.focus();
      var q = new URLSearchParams(location.search).get("q");
      if (q) { sInput.value = q; search(); }
    })
    .catch(function (e) { console.error(e); });

  sInput.addEventListener("input", debounce(search, 150));
  sInput.addEventListener("search", function () { if (!sInput.value) reset(); });

  document.addEventListener("keydown", function (e) {
    var active = document.activeElement;
    var inBox = searchBox && searchBox.contains(active);
    if (e.key === "Escape") { reset(); return; }
    if (!firstResult || !inBox) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (active === sInput) setActive(firstResult.querySelector(".entry-link"));
      else if (active.parentElement !== lastResult) {
        var n = active.parentElement.nextElementSibling;
        setActive(n && n.querySelector(".entry-link"));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (active.parentElement === firstResult) setActive(sInput);
      else if (active !== sInput) {
        var p = active.parentElement.previousElementSibling;
        setActive(p && p.querySelector(".entry-link"));
      }
    } else if (e.key === "ArrowRight") {
      if (active.matches && active.matches(".entry-link")) active.click();
    }
  });
})();
