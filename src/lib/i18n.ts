import en from "../../i18n/en.json";
import zh from "../../i18n/zh.json";

const messages = { en, zh } as const;

type Lang = keyof typeof messages;
type MessageGroup = keyof (typeof messages)["en"];
export type MessageKey = {
  [Group in MessageGroup]: `${Group}.${Extract<keyof (typeof messages)["en"][Group], string>}`;
}[MessageGroup];

function detectLang(): Lang {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

let currentLang: Lang = detectLang();

export function t(key: MessageKey): string {
  const [group, name] = key.split(".") as [MessageGroup, string];
  const currentMessages = messages[currentLang][group] as Record<string, string>;
  const fallbackMessages = messages.en[group] as Record<string, string>;
  return currentMessages[name] || fallbackMessages[name] || key;
}

export function setLang(lang: Lang) {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}
