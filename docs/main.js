(function () {
  "use strict";

  var REPO = "peakchen90/tiny-cut";
  var API_URL = "https://api.github.com/repos/" + REPO + "/releases/latest";
  var RELEASES_URL = "https://github.com/" + REPO + "/releases/latest";

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

  // ---- Download links ----

  var CACHE_KEY = "tinycut-release";
  var CACHE_TTL = 5 * 60 * 1000;

  function findAsset(assets, test) {
    if (!assets) return null;
    for (var i = 0; i < assets.length; i++) {
      if (test(assets[i].name)) return assets[i];
    }
    return null;
  }

  function getCachedLinks() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cache = JSON.parse(raw);
      if (Date.now() - cache.t > CACHE_TTL) return null;
      return cache.d;
    } catch (e) {
      return null;
    }
  }

  function setCache(arm, x64, win) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        t: Date.now(),
        d: { arm: arm, x64: x64, win: win }
      }));
    } catch (e) {}
  }

  function applyLinks(arm, x64, win) {
    var btnArm = document.getElementById("dl-mac-arm");
    var btnX64 = document.getElementById("dl-mac-x64");
    var btnWin = document.getElementById("dl-win");
    if (btnArm) btnArm.href = arm;
    if (btnX64) btnX64.href = x64;
    if (btnWin) btnWin.href = win;
  }

  function setDownloadLinks() {
    var cached = getCachedLinks();
    if (cached) {
      applyLinks(cached.arm, cached.x64, cached.win);
      return;
    }

    applyLinks(RELEASES_URL, RELEASES_URL, RELEASES_URL);

    fetch(API_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(function (data) {
        var assets = data.assets || [];
        var arm = findAsset(assets, function (n) { return /\.dmg$/i.test(n) && /aarch64|arm64/i.test(n); });
        var x64 = findAsset(assets, function (n) { return /\.dmg$/i.test(n) && !/aarch64|arm64/i.test(n); });
        var win = findAsset(assets, function (n) { return /\.exe$/i.test(n); });

        var armUrl = arm ? arm.browser_download_url : RELEASES_URL;
        var x64Url = x64 ? x64.browser_download_url : RELEASES_URL;
        var winUrl = win ? win.browser_download_url : RELEASES_URL;

        applyLinks(armUrl, x64Url, winUrl);
        setCache(armUrl, x64Url, winUrl);
      })
      .catch(function () {});
  }

  // ---- Init ----

  document.addEventListener("DOMContentLoaded", function () {
    var yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    initLangSwitch();
    setDownloadLinks();
  });
})();
