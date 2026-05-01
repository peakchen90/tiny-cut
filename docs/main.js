(function () {
  "use strict";

  // ---- Language ----

  function detectLang() {
    var saved = localStorage.getItem("tinycut-lang");
    if (saved === "zh" || saved === "en") return saved;
    var nav = navigator.language || navigator.userLanguage || "";
    return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function applyLang(lang) {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";

    var els = document.querySelectorAll("[data-en]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var text = el.getAttribute("data-" + lang);
      if (text !== null) {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = text;
        } else {
          el.textContent = text;
        }
      }
    }

    var btns = document.querySelectorAll(".lang-switch button");
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.toggle("active", btns[j].getAttribute("data-lang") === lang);
    }

    document.title =
      lang === "zh"
        ? "TinyCut - 轻量级视频剪辑应用"
        : "TinyCut - A Lightweight Video Trimming App";

    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content =
        lang === "zh"
          ? "TinyCut 是一款轻量级、开源、跨平台的视频剪辑应用。快速、精准、隐私安全。"
          : "TinyCut is a lightweight, open-source, cross-platform video trimming application. Fast, precise, and privacy-first.";
    }
  }

  function initLangSwitch() {
    var lang = detectLang();
    applyLang(lang);

    var btns = document.querySelectorAll(".lang-switch button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () {
        var newLang = this.getAttribute("data-lang");
        localStorage.setItem("tinycut-lang", newLang);
        applyLang(newLang);
      });
    }
  }

  // ---- Init ----

  document.addEventListener("DOMContentLoaded", function () {
    var yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    initLangSwitch();
  });
})();
