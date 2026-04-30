# Contributing to TinyCut

Thank you for your interest in contributing to TinyCut! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

- Check if the bug has already been reported in [Issues](https://github.com/peakchen90/tiny-cut/issues)
- If not, create a new issue using the **Bug Report** template
- Include detailed steps to reproduce the problem
- Include your OS version and TinyCut version

### Suggesting Features

- Check if the feature has already been suggested
- Create a new issue using the **Feature Request** template
- Explain the use case and why it would be valuable

### Submitting Code

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Yarn](https://yarnpkg.com/) 1.x
- [Rust](https://www.rust-lang.org/tools/install) (stable)

### Getting Started

```bash
# Fork and clone your fork
git clone https://github.com/peakchen90/tiny-cut.git
cd tiny-cut

# Add upstream remote
git remote add upstream https://github.com/peakchen90/tiny-cut.git

# Install dependencies
yarn install

# Start development
yarn tauri:dev
```

### Building

```bash
yarn tauri:build
```

## Pull Request Process

1. **Keep PRs focused** — One feature or fix per PR
2. **Write clear commits** — Use descriptive commit messages
3. **Update documentation** — If you change functionality, update README or docs
4. **Test your changes** — Ensure the app builds and works correctly
5. **Fill the PR template** — Use the provided template completely

### PR Title Format

Use conventional commits format:

- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `refactor: improve code structure`
- `test: add tests`
- `chore: maintenance tasks`

## Coding Standards

### TypeScript / React

- Use TypeScript for all new code
- Follow existing code style and patterns
- Use functional components with hooks
- Keep components small and focused

### Rust

- Follow standard Rust formatting (`cargo fmt`)
- Run `cargo clippy` to catch common issues
- Write doc comments for public functions
- Handle errors properly, avoid unwrap in production code

### General

- No unnecessary comments in code
- Keep functions short and focused
- Use meaningful variable and function names
- Follow existing naming conventions

## Reporting Issues

When reporting issues, please include:

1. **OS and version** (e.g., macOS 14.2, Windows 11)
2. **TinyCut version** (from About menu or release tag)
3. **Steps to reproduce**
4. **Expected behavior**
5. **Actual behavior**
6. **Screenshots** if applicable
7. **Video file details** (format, codec, size) if relevant

## Questions?

Feel free to open an issue for any questions about contributing.

Thank you for helping make TinyCut better!
