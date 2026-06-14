// jidoka client-side JS — embedded via include_str!()

(function () {
  "use strict";

  function preserveMermaidSource() {
    var diagrams = document.querySelectorAll("pre.mermaid");
    diagrams.forEach(function (el) {
      el.setAttribute("data-source", el.textContent);
    });
  }

  function initMermaid() {
    var theme = document.documentElement.getAttribute("data-theme");
    mermaid.initialize({
      startOnLoad: true,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "loose",
      flowchart: { useMaxWidth: true, htmlLabels: true },
    });
  }

  function rerenderMermaid(theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === "dark" ? "dark" : "default",
      securityLevel: "loose",
      flowchart: { useMaxWidth: true, htmlLabels: true },
    });

    var diagrams = document.querySelectorAll("pre.mermaid");
    diagrams.forEach(function (el) {
      var source = el.getAttribute("data-source");
      if (!source) return;
      el.removeAttribute("data-processed");
      el.innerHTML = source;
    });

    mermaid.run({ nodes: Array.from(diagrams) });
  }

  function initThemeToggle() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("jidoka-theme", next);
      rerenderMermaid(next);
    });
  }

  function initPngDownload() {
    var btn = document.getElementById("download-png");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var svgs = document.querySelectorAll("pre.mermaid svg");
      if (svgs.length === 0) return;

      var svg = svgs[0];
      var svgData = new XMLSerializer().serializeToString(svg);
      var svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
      });
      var url = URL.createObjectURL(svgBlob);

      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var scale = 2;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        var ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
        ctx.fillRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(function (blob) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "jidoka-topology.png";
          a.click();
          URL.revokeObjectURL(a.href);
          URL.revokeObjectURL(url);
        }, "image/png");
      };
      img.src = url;
    });
  }

  function initPlanRendering() {
    if (typeof window.__planMarkdown === "undefined") return;
    var container = document.getElementById("plan-content");
    if (!container) return;

    if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
      container.textContent = window.__planMarkdown;
      return;
    }

    var rawHtml = marked.parse(window.__planMarkdown);
    container.innerHTML = DOMPurify.sanitize(rawHtml);
  }

  function renderMarkdownInto(el, source) {
    if (!el || !source) return;
    if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
      el.textContent = source;
      return;
    }
    el.innerHTML = DOMPurify.sanitize(marked.parse(source));
  }

  function initJidokaRendering() {
    if (typeof window.__overviewMarkdown !== "undefined") {
      renderMarkdownInto(document.getElementById("overview-md"), window.__overviewMarkdown);
    }
    if (Array.isArray(window.__unitBodies)) {
      window.__unitBodies.forEach(function (body, i) {
        var el = document.querySelector('.unit-body[data-key="' + i + '"]');
        renderMarkdownInto(el, body);
      });
    }
  }

  function restoreTheme() {
    var saved = localStorage.getItem("jidoka-theme");
    if (saved) {
      document.documentElement.setAttribute("data-theme", saved);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    restoreTheme();
    initJidokaRendering();
    preserveMermaidSource();
    initMermaid();
    initThemeToggle();
    initPngDownload();
    initPlanRendering();
  });
})();
