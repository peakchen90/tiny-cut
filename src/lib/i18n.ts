import en from "../../i18n/en.json";
import zh from "../../i18n/zh.json";

const messages = { en, zh } as const;

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
