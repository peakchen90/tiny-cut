import {execSync} from "child_process";
import {existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from "fs";
import {resolve, dirname} from "path";
import {fileURLToPath} from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BINARIES_DIR = resolve(__dirname, "../src-tauri/binaries");
const SIZE_SUFFIX = ".size";
const MAX_RETRIES = 3;

const FFMPEG_BASE_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0";

const PLATFORM_MAP = {
  "darwin-arm64": {file: "ffmpeg-aarch64-apple-darwin", remote: "ffmpeg-darwin-arm64"},
  "darwin-x64": {file: "ffmpeg-x86_64-apple-darwin", remote: "ffmpeg-darwin-x64"},
  "win32-x64": {file: "ffmpeg-x86_64-pc-windows-msvc.exe", remote: "ffmpeg-win32-x64"},
};

const key = `${process.platform}-${process.arch}`;
const config = PLATFORM_MAP[key];

if (!config) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

const binaryPath = resolve(BINARIES_DIR, config.file);
const sizePath = binaryPath + SIZE_SUFFIX;
const url = `${FFMPEG_BASE_URL}/${config.remote}`;
const isWin = process.platform === "win32";

function fetchRemoteSize(targetUrl) {
  return new Promise((resolve, reject) => {
    const request = (href) => {
      https.get(href, {method: "HEAD"}, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
        } else if (res.statusCode === 200) {
          const size = parseInt(res.headers["content-length"], 10);
          resolve(isNaN(size) ? 0 : size);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      }).on("error", reject);
    };
    request(targetUrl);
  });
}

function verifySize(filePath, sizeFilePath) {
  if (!existsSync(filePath) || !existsSync(sizeFilePath)) return false;
  const expected = parseInt(readFileSync(sizeFilePath, "utf8").trim(), 10);
  const actual = statSync(filePath).size;
  return expected > 0 && actual === expected;
}

async function downloadWithRetry(targetUrl, destPath) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`Downloading FFmpeg (attempt ${attempt}/${MAX_RETRIES}): ${targetUrl}`);

    try {
      if (isWin) {
        execSync(`powershell -Command "Invoke-WebRequest -Uri '${targetUrl}' -OutFile '${destPath}'"`, {stdio: "inherit"});
      } else {
        execSync(`curl -L --http1.1 --retry 3 -o "${destPath}" "${targetUrl}"`, {stdio: "inherit"});
      }
    } catch {
      if (existsSync(destPath)) unlinkSync(destPath);
      continue;
    }

    if (existsSync(destPath) && verifySize(destPath, sizePath)) {
      return true;
    }

    console.error(`Size verification failed, retrying...`);
    if (existsSync(destPath)) unlinkSync(destPath);
  }
  return false;
}

async function main() {
  // Check existing binary with size file
  if (existsSync(binaryPath) && verifySize(binaryPath, sizePath)) {
    if (!isWin) {
      const mode = statSync(binaryPath).mode;
      if ((mode & 0o111) === 0) {
        console.log(`Fixing execute permission: ${config.file}`);
        execSync(`chmod +x "${binaryPath}"`, {stdio: "inherit"});
      }
    }
    console.log(`FFmpeg already exists: ${config.file}`);
    return;
  }

  // Existing binary is corrupted or missing size file
  if (existsSync(binaryPath)) {
    console.error(`Binary integrity check failed, re-downloading...`);
    unlinkSync(binaryPath);
  }

  if (!existsSync(BINARIES_DIR)) {
    mkdirSync(BINARIES_DIR, {recursive: true});
  }

  // Fetch expected size via HEAD and save locally (only if .size file doesn't exist)
  if (!existsSync(sizePath)) {
    console.log(`Fetching remote file size: ${url}`);
    const remoteSize = await fetchRemoteSize(url);
    if (!remoteSize) {
      console.error(`Failed to get remote file size`);
      process.exit(1);
    }
    writeFileSync(sizePath, String(remoteSize));
    console.log(`Expected size: ${remoteSize} bytes`);
  }

  const success = await downloadWithRetry(url, binaryPath);
  if (!success) {
    console.error(`Failed to download FFmpeg after ${MAX_RETRIES} attempts`);
    process.exit(1);
  }

  if (!isWin) {
    execSync(`chmod +x "${binaryPath}"`, {stdio: "inherit"});
  }

  console.log(`Done: ${config.file}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
