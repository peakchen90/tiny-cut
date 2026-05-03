import en from "../../i18n/en.json";
import de from "../../i18n/de.json";
import es from "../../i18n/es.json";
import fr from "../../i18n/fr.json";
import it from "../../i18n/it.json";
import ja from "../../i18n/ja.json";
import ko from "../../i18n/ko.json";
import ptBR from "../../i18n/pt-BR.json";
import ru from "../../i18n/ru.json";
import zh from "../../i18n/zh.json";
import zhHant from "../../i18n/zh-Hant.json";

const messages = { de, en, es, fr, it, ja, ko, "pt-BR": ptBR, ru, zh, "zh-Hant": zhHant } as const;

type Lang = keyof typeof messages;
type MessageGroup = keyof (typeof messages)["en"];
export type MessageKey = {
  [Group in MessageGroup]: `${Group}.${Extract<keyof (typeof messages)["en"][Group], string>}`;
}[MessageGroup];

function detectLang(): Lang {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("zh")) {
    if (lang.includes("hant") || lang.includes("tw") || lang.includes("hk") || lang.includes("mo")) {
      return "zh-Hant";
    }
    return "zh";
  }
  if (lang.startsWith("de")) return "de";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("it")) return "it";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("ko")) return "ko";
  if (lang.startsWith("pt")) return "pt-BR";
  if (lang.startsWith("ru")) return "ru";
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
