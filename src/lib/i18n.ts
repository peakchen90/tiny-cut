const messages = {
  en: {
    appTitle: "TinyCut",
    openVideo: "Open Video",
    noVideo: "No video loaded",
    loadVideo: "Load a video to set trim range",
    start: "Start",
    end: "End",
    fastTrim: "Fast Trim",
    fastTrimDesc: "No re-encode, faster, slight time offset",
    preciseTrim: "Precise Trim",
    preciseTrimDesc: "Re-encode, accurate, slower",
    export: "Export",
    exporting: "Exporting...",
    exportSuccess: "Export completed!",
    exportFailed: "Export failed",
    selectVideo: "Select a video file to start",
    dropVideo: "Select or drop a video",
    more: "More",
    newProject: "New",
    exportVideo: "Export",
    exportSettings: "Export Settings",
    videoInfo: "Video Info",
    resolution: "Resolution",
    fps: "FPS",
    format: "Format",
    bitrate: "Bitrate",
    exportPath: "Export Path",
    select: "Select",
    estimatedSize: "Estimated Size",
    trimDuration: "Trim Duration",
    duration: "Duration",
    loadingVideoInfo: "Loading video info...",
    original: "Original",
  },
  zh: {
    appTitle: "TinyCut",
    openVideo: "打开视频",
    noVideo: "未加载视频",
    loadVideo: "加载视频后设置裁剪区间",
    start: "起始",
    end: "结束",
    fastTrim: "快速剪切",
    fastTrimDesc: "不重新编码，速度快，时间点略有偏差",
    preciseTrim: "精准剪切",
    preciseTrimDesc: "重新编码，时间精准，速度较慢",
    export: "导出",
    exporting: "导出中...",
    exportSuccess: "导出完成",
    exportFailed: "导出失败",
    selectVideo: "选择一个视频文件开始",
    dropVideo: "选择或拖入视频",
    more: "更多",
    newProject: "新建",
    exportVideo: "导出",
    exportSettings: "导出设置",
    videoInfo: "原视频信息",
    resolution: "分辨率",
    fps: "帧率",
    format: "格式",
    bitrate: "码率",
    exportPath: "导出位置",
    select: "选择",
    estimatedSize: "预估大小",
    trimDuration: "剪切时长",
    duration: "时长",
    loadingVideoInfo: "读取视频信息...",
    original: "原始",
  },
} as const;

type Lang = keyof typeof messages;
export type MessageKey = keyof (typeof messages)["en"];

function detectLang(): Lang {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

let currentLang: Lang = detectLang();

export function t(key: MessageKey): string {
  return messages[currentLang][key] || messages.en[key];
}

export function setLang(lang: Lang) {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}
