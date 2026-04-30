# TinyCut 初版方案文档

## 1. 项目目标

**TinyCut** 是一个轻量级、开源、跨平台的视频剪切客户端软件。

初版目标：

* 支持 Windows
* 支持 macOS
* 本地打开视频
* 本地预览视频
* 选择开始时间和结束时间
* 导出裁剪后的视频
* 内置 FFmpeg
* 不上传视频
* 不要求用户额外安装 FFmpeg

项目命名：

* 展示名：TinyCut
* 项目名：`tiny-cut`
* 仓库名：`tiny-cut`
* package name：`tiny-cut`

---

## 2. 产品定位

TinyCut 只做一个核心功能：

> 从本地视频中截取一段，并导出为新视频。

初版不做完整视频编辑器能力。

不支持：

* 多轨道
* 字幕
* 滤镜
* 转场
* 视频拼接
* 音频编辑
* 云端处理

---

## 3. 技术选型

初版使用：

* Tauri v2
* React
* TypeScript
* Vite
* FFmpeg sidecar

整体流程：

```text
React 前端界面
  ↓
Tauri Command
  ↓
Rust 后端
  ↓
FFmpeg 本地二进制
  ↓
输出裁剪后的视频
```

---

## 4. 核心架构

### 4.1 前端

前端负责界面和交互。

主要职责：

* 打开视频
* 播放 / 暂停视频
* 展示视频时长
* 选择开始时间
* 选择结束时间
* 选择导出模式
* 触发导出
* 展示导出状态

前端不直接处理视频编码。

---

### 4.2 Rust 层

Rust 层负责本地能力。

主要职责：

* 接收前端参数
* 校验参数
* 调用 FFmpeg sidecar
* 返回执行结果

---

### 4.3 FFmpeg 层

FFmpeg 负责实际视频剪切。

FFmpeg 作为内置二进制随应用打包，用户不需要单独安装。

---

## 5. FFmpeg 内置方式

FFmpeg 二进制放在项目源码中。

建议路径：

```text
src-tauri/
  binaries/
    ffmpeg-x86_64-pc-windows-msvc.exe
    ffmpeg-x86_64-apple-darwin
    ffmpeg-aarch64-apple-darwin
```

Tauri 配置中通过 `externalBin` 引入：

```json
{
  "bundle": {
    "externalBin": [
      "binaries/ffmpeg"
    ]
  }
}
```

构建时按平台打包对应的 FFmpeg 二进制。

---

## 6. 初版功能

### 6.1 打开视频

用户可以选择本地视频文件。

初版重点支持：

* mp4
* mov

---

### 6.2 视频预览

选择视频后，用户可以在应用内预览。

需要支持：

* 播放
* 暂停
* 跳转时间
* 显示当前时间
* 显示总时长

---

### 6.3 选择裁剪区间

用户可以设置：

* 开始时间
* 结束时间

基础规则：

* 开始时间不能小于 0
* 结束时间不能大于视频总时长
* 开始时间必须小于结束时间

初版使用简单时间轴即可，不要求缩略图。

---

### 6.4 导出视频

用户选择裁剪区间后，可以导出新视频。

导出流程：

```text
选择裁剪区间
  ↓
选择导出模式
  ↓
选择保存路径
  ↓
调用 FFmpeg
  ↓
生成新视频
```

---

### 6.5 导出模式

初版支持两种模式。

#### 快速剪切

特点：

* 速度快
* 尽量不重新编码
* 画质基本无损
* 时间点可能有轻微偏差

#### 精准剪切

特点：

* 时间点更准确
* 需要重新编码
* 导出较慢
* 输出兼容性更稳定

---

## 7. 页面结构

初版只需要一个主页面。

页面区域：

```text
┌──────────────────────────────┐
│ TinyCut                      │
├──────────────────────────────┤
│ 打开视频区域                  │
├──────────────────────────────┤
│ 视频预览区域                  │
├──────────────────────────────┤
│ 裁剪区间选择区域              │
├──────────────────────────────┤
│ 导出模式选择区域              │
├──────────────────────────────┤
│ 导出按钮 / 状态提示区域        │
└──────────────────────────────┘
```

---

## 8. 推荐项目结构

```text
tiny-cut/
  README.md
  LICENSE
  package.json
  index.html
  vite.config.ts
  tsconfig.json

  src/
    main.tsx
    App.tsx
    components/
      VideoOpenButton.tsx
      VideoPlayer.tsx
      Timeline.tsx
      ExportPanel.tsx
    lib/
      time.ts
      tauri.ts
    types/
      trim.ts

  src-tauri/
    tauri.conf.json
    Cargo.toml
    capabilities/
    src/
      main.rs
      commands.rs
      ffmpeg.rs
    binaries/
      README.md
      ffmpeg-x86_64-pc-windows-msvc.exe
      ffmpeg-x86_64-apple-darwin
      ffmpeg-aarch64-apple-darwin

  docs/
    ffmpeg-license.md

  .github/
    workflows/
      release.yml
```

---

## 9. 核心模块

### 9.1 VideoOpenButton

负责选择本地视频。

主要职责：

* 触发文件选择
* 获取视频路径
* 将视频信息传递给主页面

---

### 9.2 VideoPlayer

负责视频播放和预览。

主要职责：

* 播放视频
* 暂停视频
* 跳转到指定时间
* 显示当前时间
* 显示视频总时长

---

### 9.3 Timeline

负责选择开始时间和结束时间。

主要职责：

* 展示视频时间范围
* 设置开始时间
* 设置结束时间
* 保证时间范围合法

---

### 9.4 ExportPanel

负责导出相关操作。

主要职责：

* 选择导出模式
* 触发导出
* 展示导出中状态
* 展示导出结果
* 展示错误信息

---

### 9.5 commands.rs

负责暴露 Tauri command 给前端调用。

主要职责：

* 接收前端参数
* 调用 Rust 内部逻辑
* 返回执行结果

---

### 9.6 ffmpeg.rs

负责 FFmpeg 相关逻辑。

主要职责：

* 调用 FFmpeg sidecar
* 处理 FFmpeg 执行结果
* 返回成功或失败状态

---

## 10. 数据流

### 10.1 打开视频流程

```text
用户点击打开视频
  ↓
前端调用 Tauri 文件选择能力
  ↓
用户选择本地视频
  ↓
前端加载视频
  ↓
读取视频时长
  ↓
初始化裁剪区间
```

---

### 10.2 导出视频流程

```text
用户选择开始时间和结束时间
  ↓
用户选择导出模式
  ↓
用户选择导出路径
  ↓
前端调用 Tauri Command
  ↓
Rust 调用 FFmpeg
  ↓
FFmpeg 输出新视频
  ↓
Rust 返回执行结果
  ↓
前端展示导出成功或失败
```

---

## 11. 初版实现阶段

### 阶段一：项目初始化

目标：

* 初始化 Tauri + React + TypeScript 项目
* 设置项目名为 `tiny-cut`
* 设置应用展示名为 `TinyCut`
* 应用可以正常启动

验收：

* 本地可以启动桌面应用
* 页面显示 TinyCut

---

### 阶段二：集成 FFmpeg

目标：

* 将 FFmpeg 二进制放入 `src-tauri/binaries`
* 配置 Tauri sidecar
* Rust 层可以调用 FFmpeg

验收：

* 应用可以检测 FFmpeg 是否可用

---

### 阶段三：视频预览

目标：

* 支持选择本地视频
* 支持视频播放
* 支持读取视频时长

验收：

* 用户可以打开视频
* 视频可以播放 / 暂停
* 页面显示视频时长

---

### 阶段四：裁剪区间

目标：

* 支持设置开始时间
* 支持设置结束时间
* 保证时间范围合法

验收：

* 用户可以调整裁剪区间
* 起止时间不会出现非法状态

---

### 阶段五：导出视频

目标：

* 支持选择保存路径
* 支持快速剪切
* 支持精准剪切
* 生成裁剪后的视频文件

验收：

* 导出文件可以正常播放
* 快速模式可用
* 精准模式可用

---

### 阶段六：开源发布

目标：

* 补充 README
* 补充 LICENSE
* 补充 FFmpeg 说明
* 配置 GitHub Actions
* 发布 Windows 和 macOS 安装包

验收：

* GitHub Release 中有可下载安装包
* 文档说明清楚项目用途和 FFmpeg 依赖

---

## 12. 开源发布要求

### 12.1 License

项目代码建议使用：

* MIT License

同时需要单独说明 FFmpeg 的许可证情况。

---

### 12.2 README

README 需要说明：

* TinyCut 是什么
* 支持的平台
* 核心功能
* 本地处理，不上传视频
* 内置 FFmpeg
* 如何开发
* 如何构建
* 如何发布

---

### 12.3 FFmpeg 说明

需要创建：

```text
docs/ffmpeg-license.md
```

文档中说明：

* 项目内置 FFmpeg
* FFmpeg 二进制来源
* FFmpeg 版本
* FFmpeg 许可证
* FFmpeg 相关链接

---

### 12.4 GitHub Release

初版发布到 GitHub Releases。

目标产物：

* Windows 安装包
* macOS Intel 安装包
* macOS Apple Silicon 安装包

初版可以不处理代码签名，但需要在 README 中说明：

* Windows 可能出现安全提示
* macOS 可能提示应用未签名

---

## 13. 初版验收标准

初版完成后需要满足：

* Windows 可以运行
* macOS 可以运行
* 不需要用户安装 FFmpeg
* 可以打开本地视频
* 可以预览视频
* 可以选择开始时间
* 可以选择结束时间
* 可以选择快速剪切
* 可以选择精准剪切
* 可以导出裁剪后的视频
* 导出文件可以正常播放
* 处理过程完全在本地完成
* 项目可以发布到 GitHub 开源

---

## 14. 明确不做的内容

初版不做：

* 完整视频编辑器
* 多轨道时间线
* 云端转码
* 用户登录
* 项目工程文件
* 多视频合并
* 视频压缩工具
* 视频格式转换工具
* 复杂素材管理
* 在线协作

---

## 15. 实现原则

初版实现时遵守：

* 只做视频剪切
* 不做完整视频编辑器
* 先跑通完整链路
* 不做复杂 UI
* 不引入复杂视频编辑库
* 不依赖云端服务
* 不要求用户安装额外软件
* 前端只负责交互
* Rust 负责调用本地能力
* FFmpeg 负责实际视频处理
* 内置 FFmpeg，不要求用户额外安装
