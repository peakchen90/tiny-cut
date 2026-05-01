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

  function findAsset(assets, test) {
    if (!assets) return null;
    for (var i = 0; i < assets.length; i++) {
      if (test(assets[i].name)) {
        return assets[i];
      }
    }
    return null;
  }

  function isDmg(name) {
    return /\.dmg$/i.test(name);
  }

  function isExe(name) {
    return /\.exe$/i.test(name);
  }

  function setDownloadLinks() {
    var btnArm = document.getElementById("dl-mac-arm");
    var btnX64 = document.getElementById("dl-mac-x64");
    var btnWin = document.getElementById("dl-win");

    var btns = [btnArm, btnX64, btnWin];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i]) btns[i].setAttribute("disabled", "disabled");
    }

    fetch(API_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(function (data) {
        var assets = data.assets || [];
        var tag = data.tag_name || "";

        var armAsset = findAsset(assets, function (n) {
          return isDmg(n) && /aarch64|arm64/i.test(n);
        });
        var x64Asset = findAsset(assets, function (n) {
          return isDmg(n) && !/aarch64|arm64/i.test(n);
        });
        var winAsset = findAsset(assets, function (n) {
          return isExe(n);
        });

        if (armAsset && btnArm) {
          btnArm.href = armAsset.browser_download_url;
          btnArm.removeAttribute("disabled");
        } else if (btnArm) {
          btnArm.href = RELEASES_URL;
          btnArm.removeAttribute("disabled");
        }

        if (x64Asset && btnX64) {
          btnX64.href = x64Asset.browser_download_url;
          btnX64.removeAttribute("disabled");
        } else if (btnX64) {
          btnX64.href = RELEASES_URL;
          btnX64.removeAttribute("disabled");
        }

        if (winAsset && btnWin) {
          btnWin.href = winAsset.browser_download_url;
          btnWin.removeAttribute("disabled");
        } else if (btnWin) {
          btnWin.href = RELEASES_URL;
          btnWin.removeAttribute("disabled");
        }

        // Update version display if tag is available
        if (tag) {
          var version = tag.replace(/^v/, "");
          document.title = document.title + " " + version;
        }
      })
      .catch(function () {
        // Fallback: link to releases page
        var fallbackBtns = [btnArm, btnX64, btnWin];
        for (var i = 0; i < fallbackBtns.length; i++) {
          if (fallbackBtns[i]) {
            fallbackBtns[i].href = RELEASES_URL;
            fallbackBtns[i].removeAttribute("disabled");
          }
        }
      });
  }

  // ---- Init ----

  document.addEventListener("DOMContentLoaded", function () {
    var yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    initLangSwitch();
    setDownloadLinks();
  });
})();
