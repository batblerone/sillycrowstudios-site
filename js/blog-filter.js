// Filterable blog for the PaperMod Zola theme.
// Posts are server-rendered; this script filters, searches, sorts and paginates
// them, keeping the state in the URL so every view can be bookmarked/shared.
(function () {
  "use strict";

  var root = document.getElementById("blog");
  if (!root) return;

  var $ = function (sel, el) { return (el || root).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); };

  var pageSize = parseInt(root.dataset.pageSize, 10) || 10;
  var list = $("[data-list]");
  var qInput = $("[data-filter-q]");
  var sortSelect = $("[data-filter-sort]");
  var countEl = $("[data-result-count]");
  var pillsEl = $("[data-active-pills]");
  var emptyEl = $("[data-empty]");
  var pagerEl = $("[data-pager]");
  var activeCountEl = $("[data-active-count]");
  var filtersPanel = document.getElementById("blog-filters");
  var indexStatus = $("[data-index-status]");

  // ---- Model ---------------------------------------------------------------

  var groups = $$(".filter-group[data-kind]").map(function (g) {
    return {
      kind: g.dataset.kind,                    // URL key, e.g. "tags" / "year"
      slug: g.dataset.slug || g.dataset.kind,  // data-tax-<slug> on posts
      el: g,
      chips: $$(".pm-chip[data-term]", g),
      matchButtons: $$(".match-btn", g),
    };
  });
  var groupByKind = {};
  groups.forEach(function (g) { groupByKind[g.kind] = g; });

  var posts = $$("[data-post]").map(function (el, i) {
    var tax = {};
    groups.forEach(function (g) {
      if (g.kind === "year") return;
      try { tax[g.kind] = JSON.parse(el.getAttribute("data-tax-" + g.slug) || "[]"); }
      catch (e) { tax[g.kind] = []; }
    });
    return {
      el: el,
      order: i,
      url: el.dataset.url,
      title: el.dataset.title || "",
      date: el.dataset.date || "",
      year: el.dataset.year || "",
      reading: parseInt(el.dataset.reading, 10) || 0,
      tax: tax,
      text: (el.dataset.text || "") + " " + Object.keys(tax).map(function (k) { return tax[k].join(" "); }).join(" ").toLowerCase(),
      body: "",
    };
  });

  var state = {
    q: "",
    sort: "newest",
    page: 1,
    selected: {}, // kind -> array of terms
    match: {},    // kind -> "any" | "all"
  };
  groups.forEach(function (g) { state.selected[g.kind] = []; state.match[g.kind] = "any"; });

  // ---- URL <-> state -------------------------------------------------------

  function readUrl() {
    var params = new URLSearchParams(location.search);
    state.q = params.get("q") || "";
    state.sort = params.get("sort") || "newest";
    state.page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    groups.forEach(function (g) {
      var v = params.get(g.kind);
      state.selected[g.kind] = v ? v.split(",").map(decodeURIComponent).filter(Boolean) : [];
      state.match[g.kind] = params.get(g.kind + "_match") === "all" ? "all" : "any";
    });
  }

  function writeUrl(push) {
    var params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    groups.forEach(function (g) {
      var sel = state.selected[g.kind];
      if (sel.length) params.set(g.kind, sel.map(encodeURIComponent).join(","));
      if (state.match[g.kind] === "all" && sel.length > 1) params.set(g.kind + "_match", "all");
    });
    if (state.sort !== "newest") params.set("sort", state.sort);
    if (state.page > 1) params.set("page", String(state.page));
    var qs = params.toString().replace(/%2C/g, ",");
    var url = location.pathname + (qs ? "?" + qs : "") + location.hash;
    if (url === location.pathname + location.search + location.hash) return;
    history[push ? "pushState" : "replaceState"](null, "", url);
  }

  // ---- Matching ------------------------------------------------------------

  function tokens() {
    return state.q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matchesQuery(p, toks) {
    if (!toks.length) return true;
    var hay = p.text + " " + p.body;
    return toks.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function termsOf(p, kind) {
    return kind === "year" ? (p.year ? [p.year] : []) : (p.tax[kind] || []);
  }

  function matchesGroup(p, kind, selected) {
    selected = selected || state.selected[kind];
    if (!selected.length) return true;
    var have = termsOf(p, kind);
    var mode = kind === "year" ? "any" : state.match[kind];
    return mode === "all"
      ? selected.every(function (t) { return have.indexOf(t) !== -1; })
      : selected.some(function (t) { return have.indexOf(t) !== -1; });
  }

  function matchesAll(p, toks, exceptKind) {
    if (!matchesQuery(p, toks)) return false;
    for (var i = 0; i < groups.length; i++) {
      var k = groups[i].kind;
      if (k === exceptKind) continue;
      if (!matchesGroup(p, k)) return false;
    }
    return true;
  }

  var sorters = {
    newest: function (a, b) { return (b.date || "").localeCompare(a.date || "") || a.order - b.order; },
    oldest: function (a, b) { return (a.date || "").localeCompare(b.date || "") || a.order - b.order; },
    title: function (a, b) { return a.title.localeCompare(b.title, undefined, { sensitivity: "base" }); },
    longest: function (a, b) { return b.reading - a.reading || a.order - b.order; },
    shortest: function (a, b) { return a.reading - b.reading || a.order - b.order; },
  };

  // ---- Rendering -----------------------------------------------------------

  function render(opts) {
    opts = opts || {};
    var toks = tokens();
    var results = posts.filter(function (p) { return matchesAll(p, toks); });
    results.sort(sorters[state.sort] || sorters.newest);

    var totalPages = Math.max(1, Math.ceil(results.length / pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * pageSize;
    var visible = results.slice(start, start + pageSize);

    // Reorder + show/hide
    var frag = document.createDocumentFragment();
    results.forEach(function (p) { frag.appendChild(p.el); });
    posts.forEach(function (p) { if (results.indexOf(p) === -1) frag.appendChild(p.el); });
    list.appendChild(frag);
    posts.forEach(function (p) { p.el.hidden = visible.indexOf(p) === -1; });

    // Facet counts: how many results each term would give, given the other filters
    groups.forEach(function (g) {
      var base = posts.filter(function (p) { return matchesAll(p, toks, g.kind); });
      // In "all" mode a chip's count is how many current results also have that term
      if (g.kind !== "year" && state.match[g.kind] === "all") {
        base = base.filter(function (p) { return matchesGroup(p, g.kind); });
      }
      if (g.el.classList.contains("is-collapsed") && state.selected[g.kind].length) {
        g.el.classList.remove("is-collapsed");
        var more = $("[data-more]", g.el);
        if (more) more.textContent = "Show less";
      }
      g.chips.forEach(function (chip) {
        var term = chip.dataset.term;
        var on = state.selected[g.kind].indexOf(term) !== -1;
        chip.setAttribute("aria-pressed", on ? "true" : "false");
        var n = base.filter(function (p) { return termsOf(p, g.kind).indexOf(term) !== -1; }).length;
        var c = chip.querySelector("[data-count]");
        if (c) c.textContent = n;
        chip.classList.toggle("is-empty", n === 0 && !on);
      });
      g.matchButtons.forEach(function (b) {
        b.setAttribute("aria-pressed", b.dataset.match === state.match[g.kind] ? "true" : "false");
      });
    });

    // Counts / empty state
    var n = results.length;
    countEl.textContent = n + (n === 1 ? " post" : " posts") +
      (n > pageSize ? " · page " + state.page + " of " + totalPages : "");
    emptyEl.hidden = n !== 0;

    renderPills();
    renderPager(totalPages);
    if (qInput && document.activeElement !== qInput) qInput.value = state.q;
    if (sortSelect) sortSelect.value = state.sort;

    if (opts.scroll) {
      var top = root.getBoundingClientRect().top + window.scrollY - 16;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
    }
  }

  function activeFilterCount() {
    var n = state.q ? 1 : 0;
    groups.forEach(function (g) { n += state.selected[g.kind].length; });
    return n;
  }

  function renderPills() {
    pillsEl.innerHTML = "";
    var add = function (label, onRemove) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pm-chip active-pill";
      b.setAttribute("aria-label", "Remove filter " + label);
      b.textContent = label;
      var x = document.createElement("span");
      x.setAttribute("aria-hidden", "true");
      x.textContent = "×";
      b.appendChild(x);
      b.addEventListener("click", onRemove);
      pillsEl.appendChild(b);
    };
    if (state.q) add("“" + state.q + "”", function () { state.q = ""; update(); });
    groups.forEach(function (g) {
      state.selected[g.kind].forEach(function (t) {
        var prefix = g.kind === "tags" ? "#" : (g.kind === "year" ? "" : g.kind.replace(/_/g, " ") + ": ");
        add(prefix + t, function () { toggleTerm(g.kind, t); });
      });
    });
    var n = activeFilterCount();
    activeCountEl.hidden = n === 0;
    activeCountEl.textContent = n;
  }

  function renderPager(totalPages) {
    pagerEl.innerHTML = "";
    pagerEl.hidden = totalPages <= 1;
    if (totalPages <= 1) return;

    var mk = function (label, page, opts) {
      opts = opts || {};
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pager-btn" + (opts.current ? " current" : "");
      b.textContent = label;
      if (opts.aria) b.setAttribute("aria-label", opts.aria);
      if (opts.current) b.setAttribute("aria-current", "page");
      if (opts.disabled) b.disabled = true;
      else b.addEventListener("click", function () { goto(page); });
      pagerEl.appendChild(b);
    };
    var gap = function () {
      var s = document.createElement("span");
      s.className = "pager-gap";
      s.textContent = "…";
      pagerEl.appendChild(s);
    };

    mk("« Prev", state.page - 1, { disabled: state.page === 1, aria: "Previous page" });
    var pages = [];
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) pages.push(i);
    }
    var last = 0;
    pages.forEach(function (p) {
      if (p - last > 1) gap();
      mk(String(p), p, { current: p === state.page, aria: "Page " + p });
      last = p;
    });
    mk("Next »", state.page + 1, { disabled: state.page === totalPages, aria: "Next page" });
  }

  // ---- Actions -------------------------------------------------------------

  function update(opts) {
    opts = opts || {};
    if (!opts.keepPage) state.page = 1;
    writeUrl(!!opts.push);
    render(opts);
  }

  function goto(page) {
    state.page = page;
    update({ keepPage: true, push: true, scroll: true });
  }

  function toggleTerm(kind, term) {
    var sel = state.selected[kind];
    if (!sel) return;
    var i = sel.indexOf(term);
    if (i === -1) sel.push(term); else sel.splice(i, 1);
    update();
  }

  function clearAll() {
    state.q = "";
    groups.forEach(function (g) { state.selected[g.kind] = []; state.match[g.kind] = "any"; });
    update();
  }

  groups.forEach(function (g) {
    g.chips.forEach(function (chip) {
      chip.addEventListener("click", function () { toggleTerm(g.kind, chip.dataset.term); });
    });
    g.matchButtons.forEach(function (b) {
      b.addEventListener("click", function () {
        state.match[g.kind] = b.dataset.match;
        update();
      });
    });

    // Collapse long chip lists
    var more = $("[data-more]", g.el);
    if (more && g.chips.length > 14) {
      g.el.classList.add("is-collapsed");
      more.hidden = false;
      more.addEventListener("click", function () {
        var collapsed = g.el.classList.toggle("is-collapsed");
        more.textContent = collapsed ? "Show all" : "Show less";
      });
    }
  });

  // Tag chips inside post cards add a filter instead of opening the post
  list.addEventListener("click", function (e) {
    var chip = e.target.closest("[data-add-filter]");
    if (!chip) return;
    e.preventDefault();
    var kind = chip.dataset.addFilter;
    if (!state.selected[kind]) return;
    if (state.selected[kind].indexOf(chip.dataset.term) === -1) toggleTerm(kind, chip.dataset.term);
    if (window.matchMedia("(max-width: 900px)").matches && filtersPanel) filtersPanel.open = false;
  });

  $$("[data-clear-all]").forEach(function (b) { b.addEventListener("click", clearAll); });

  var qTimer;
  if (qInput) {
    qInput.addEventListener("input", function () {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        state.q = qInput.value.trim();
        update();
      }, 160);
    });
    qInput.addEventListener("focus", loadIndex, { once: true });
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      state.sort = sortSelect.value;
      update();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      if (filtersPanel) filtersPanel.open = true;
      qInput && qInput.focus();
    } else if (e.key === "Escape" && document.activeElement === qInput && qInput.value) {
      qInput.value = "";
      state.q = "";
      update();
    }
  });

  window.addEventListener("popstate", function () {
    readUrl();
    render();
  });

  // ---- Full-text: enrich posts with their body from Zola's search index ----

  var indexLoaded = false;
  function loadIndex() {
    var src = root.dataset.searchIndex;
    if (!src || indexLoaded) return;
    indexLoaded = true;
    fetch(src)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (items) {
        var byUrl = {};
        (items || []).forEach(function (it) { byUrl[it.url] = it; });
        posts.forEach(function (p) {
          var it = byUrl[p.url];
          if (it) p.body = ((it.body || "") + " " + (it.description || "")).toLowerCase();
        });
        if (state.q) render();
      })
      .catch(function () {
        if (indexStatus) {
          indexStatus.hidden = false;
          indexStatus.textContent = "Full-text index unavailable — searching titles and summaries.";
        }
      });
  }

  // ---- Init ----------------------------------------------------------------

  // Collapse the filter panel by default on small screens
  if (filtersPanel && window.matchMedia("(max-width: 900px)").matches) filtersPanel.open = false;

  readUrl();
  root.classList.add("is-enhanced");
  render();
  if (state.q) loadIndex();
})();
