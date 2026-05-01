import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_DIR = resolve(__dirname, "../i18n");

if (!existsSync(I18N_DIR)) {
  console.error("i18n directory not found.");
  process.exit(1);
}

const files = readdirSync(I18N_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error("No i18n JSON files found.");
  process.exit(1);
}

const messages = files.map((file) => {
  const filePath = resolve(I18N_DIR, file);
  try {
    const json = JSON.parse(readFileSync(filePath, "utf8"));
    if (!json || Array.isArray(json) || typeof json !== "object") {
      throw new Error("root value must be an object");
    }
    const keys = [];
    for (const [moduleName, moduleMessages] of Object.entries(json)) {
      if (!moduleMessages || Array.isArray(moduleMessages) || typeof moduleMessages !== "object") {
        throw new Error(`${moduleName} must be an object`);
      }
      for (const [key, value] of Object.entries(moduleMessages)) {
        if (typeof value !== "string") {
          throw new Error(`${moduleName}.${key} must be a string`);
        }
        keys.push(`${moduleName}.${key}`);
      }
    }
    return { file, keys: keys.sort() };
  } catch (err) {
    console.error(`Invalid i18n file ${file}: ${err.message}`);
    process.exit(1);
  }
});

const base = messages[0];
let hasError = false;

for (const message of messages.slice(1)) {
  const baseKeys = new Set(base.keys);
  const currentKeys = new Set(message.keys);
  const missing = base.keys.filter((key) => !currentKeys.has(key));
  const extra = message.keys.filter((key) => !baseKeys.has(key));

  if (missing.length > 0 || extra.length > 0) {
    hasError = true;
    console.error(`i18n keys mismatch: ${base.file} vs ${message.file}`);
    if (missing.length > 0) {
      console.error(`  Missing in ${message.file}: ${missing.join(", ")}`);
    }
    if (extra.length > 0) {
      console.error(`  Extra in ${message.file}: ${extra.join(", ")}`);
    }
  }
}

if (hasError) {
  process.exit(1);
}

console.log(`i18n keys validated: ${files.join(", ")}`);
