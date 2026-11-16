// About page team section:
//  - the "#" next to a person or group copies a link to it instead of jumping to it
//  - icons for handles with no profile URL (e.g. Discord) copy the handle
(function () {
  "use strict";

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for plain-http previews
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }

  function tip(el, message) {
    el.setAttribute("data-tip", message);
    el.classList.add("is-copied");
    clearTimeout(el._tipTimer);
    el._tipTimer = setTimeout(function () {
      el.classList.remove("is-copied");
    }, 1600);
  }

  document.addEventListener("click", function (ev) {
    if (!ev.target.closest) return;

    var anchor = ev.target.closest(".team .anchor");
    if (anchor) {
      // Let ctrl/cmd/shift-click and middle-click behave like a normal link
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      var url = anchor.href; // absolute, e.g. https://sillycrow.ca/about/#justin-clouthier
      copy(url).then(
        function () { tip(anchor, "Link copied"); },
        function () { window.location.hash = anchor.hash; }
      );
      return;
    }

    var btn = ev.target.closest(".team-link[data-copy]");
    if (btn) {
      var text = btn.getAttribute("data-copy");
      copy(text).then(function () { tip(btn, "Copied " + text); }, function () {});
    }
  });
})();
