# TinyCut

<div style="text-align: center">

**A lightweight, open-source, cross-platform video trimming application**

[![Release](https://img.shields.io/github/v/release/peakchen90/tiny-cut?style=flat-square)](https://github.com/peakchen90/tiny-cut/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)]()

English | **[中文](README-ZH.md)**

</div>

<div style="text-align: center">
  <img src="./docs/screenshot01.png" alt="Screenshot01" style="width: 45%; min-width: 400px;">
  <img src="./docs/screenshot02.png" alt="Screenshot02" style="width: 45%; min-width: 400px;">
</div>

## Features

- **Simple & Intuitive** — Clean interface focused on the essentials
- **Fast Trim** — No re-encoding, preserving original quality
- **Precise Trim** — Frame-accurate cutting with re-encoding
- **Drag & Drop** — Simply drag videos into the app
- **Built-in FFmpeg** — No external dependencies required
- **GPU Acceleration** — Hardware encoding support (VideoToolbox on macOS, NVENC on Windows)
- **Privacy First** — All processing happens locally on your machine
- **Cross Platform** — Works on macOS (Intel & Apple Silicon) and Windows

## Supported Formats

TinyCut supports the following video formats:

| Format | Extension |
|--------|-----------|
| MP4 | `.mp4` |
| MOV | `.mov` |
| AVI | `.avi` |
| MKV | `.mkv` |
| WebM | `.webm` |
| FLV | `.flv` |
| WMV | `.wmv` |
| M4V | `.m4v` |
| 3GP | `.3gp` |

## Download

Download the latest version for your platform from the [Releases](https://github.com/peakchen90/tiny-cut/releases) page.

| Platform | Architecture | File |
|----------|--------------|------|
| macOS | Apple Silicon (M1/M2/M3) | `TinyCut_aarch64.dmg` |
| macOS | Intel | `TinyCut_x64.dmg` |
| Windows | x64 | `TinyCut_x64-setup.exe` |

> **macOS Users**: If you see "app is damaged" when opening, run the following command:
> ```
> xattr -cr /Applications/TinyCut.app
> ```

## Usage

1. Launch TinyCut
2. Drag a video file onto the window, or click to select
3. Use the timeline to set start and end points
4. Click the menu (⋮) and select **Export**
5. Choose save location and wait for processing

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` | Seek backward 0.2s |
| `→` | Seek forward 0.2s |
| `Shift + ←` | Seek backward 2s |
| `Shift + →` | Seek forward 2s |
| `⌘/Ctrl + N` | New project |
| `⌘/Ctrl + I` | Video info |
| `⌘/Ctrl + E` | Export |
| `Esc` | Close dialog |

### Video Info

Click **More (⋮) → Info** to view detailed video information:

- File name and size
- Resolution and frame rate
- Video codec and color space
- Bitrate and duration
- Audio codec, sample rate, channels, and bitrate

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Yarn](https://yarnpkg.com/) 1.x
- [Rust](https://www.rust-lang.org/tools/install) (stable)

### Setup

```bash
# Clone the repository
git clone https://github.com/peakchen90/tiny-cut.git
cd tiny-cut

# Install frontend dependencies
yarn install

# Start development server
yarn tauri:dev
```

### Build

```bash
# Build for production
yarn tauri:build
```

The built application will be in `src-tauri/target/release/bundle/`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, Vite |
| Backend | Rust, Tauri v2 |
| Video Processing | FFmpeg (bundled) |
| GPU Acceleration | VideoToolbox (macOS), NVENC (Windows) |

## Project Structure

```
tiny-cut/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── lib/                # Utilities (i18n, time helpers)
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Rust backend
│   ├── src/                # Rust source code
│   ├── binaries/           # Bundled FFmpeg binaries
│   └── capabilities/       # Tauri permissions
├── docs/                   # Documentation
└── .github/                # GitHub workflows and templates
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### FFmpeg License

TinyCut bundles FFmpeg binaries. FFmpeg is licensed under the [GNU Lesser General Public License (LGPL) v2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html) or later, or the [GNU General Public License (GPL) v2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) or later, depending on the build configuration. See [docs/ffmpeg-license.md](docs/ffmpeg-license.md) for details.

## Acknowledgments

- [Tauri](https://tauri.app/) — For the amazing desktop app framework
- [FFmpeg](https://ffmpeg.org/) — For video processing capabilities
