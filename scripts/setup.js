import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARIES_DIR = resolve(__dirname, "../src-tauri/binaries");

const FFMPEG_BASE_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0";

const PLATFORM_MAP = {
  "darwin-arm64": { file: "ffmpeg-aarch64-apple-darwin", remote: "ffmpeg-darwin-arm64" },
  "darwin-x64": { file: "ffmpeg-x86_64-apple-darwin", remote: "ffmpeg-darwin-x64" },
  "win32-x64": { file: "ffmpeg-x86_64-pc-windows-msvc.exe", remote: "ffmpeg-win32-x64" },
};

const key = `${process.platform}-${process.arch}`;
const config = PLATFORM_MAP[key];

if (!config) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

const binaryPath = resolve(BINARIES_DIR, config.file);

if (existsSync(binaryPath)) {
  console.log(`FFmpeg already exists: ${config.file}`);
  process.exit(0);
}

if (!existsSync(BINARIES_DIR)) {
  mkdirSync(BINARIES_DIR, { recursive: true });
}

const url = `${FFMPEG_BASE_URL}/${config.remote}`;
const isWin = process.platform === "win32";

console.log(`Downloading FFmpeg: ${url}`);

if (isWin) {
  execSync(`powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${binaryPath}'"`, { stdio: "inherit" });
} else {
  execSync(`curl -L -o "${binaryPath}" "${url}"`, { stdio: "inherit" });
  execSync(`chmod +x "${binaryPath}"`, { stdio: "inherit" });
}

console.log(`Done: ${config.file}`);
