# TerminalMind Build & Packaging Guide

## Project Structure

```
TerminalMind/
├── packages/
│   ├── api/          # IPC type definitions & channel declarations
│   ├── core/         # EventBus and shared foundation modules
│   ├── services/     # AI, SSH, SFTP, Terminal and other service layers
│   └── app/          # Electron app (main + preload + renderer)
├── extensions/       # Built-in / external extensions
├── tools/            # Build utilities
├── pnpm-workspace.yaml
├── vitest.config.ts
└── package.json      # monorepo root
```

`packages/app` is the final packaged Electron application. Other packages are referenced via `workspace:*` and bundled into the `out/` directory by electron-vite at build time.

---

## 1. Prerequisites

| Dependency | Minimum Version | Notes |
|---|---|---|
| Node.js | 18+ | 20 LTS recommended |
| pnpm | 9.15+ | Specified by `packageManager` in `package.json` |
| Python | 3.x | Required by node-gyp for native module compilation |
| C++ Toolchain | — | Windows: Visual Studio Build Tools; macOS: Xcode CLI; Linux: `build-essential` |

### Windows

```powershell
# Install Visual Studio Build Tools (if not already installed)
# Select the "Desktop development with C++" workload
winget install Microsoft.VisualStudio.2022.BuildTools

# Or install via npm
npm install -g windows-build-tools
```

### macOS

```bash
xcode-select --install
```

### Linux

```bash
sudo apt install build-essential libsecret-1-dev
```

---

## 2. Install Dependencies

```bash
# Run from the project root after cloning
pnpm install
```

pnpm automatically links all workspace packages. Native modules (`node-pty`, `keytar`, etc.) are compiled during installation.

If native module compilation fails, rebuild manually:

```bash
pnpm rebuild:native
```

---

## 3. Development Mode

```bash
# Start from root (recommended)
pnpm dev

# Or start from the app package
cd packages/app
pnpm dev
```

electron-vite watches all three entry points (main / preload / renderer) simultaneously. Code changes trigger automatic reloads — the renderer supports HMR, while main/preload changes restart the process.

---

## 4. Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Type checking
pnpm typecheck
```

Tests cover `packages/core` and `packages/services`, powered by Vitest.

---

## 5. Build (Compile Only, No Installer)

```bash
# Compile all workspace packages
pnpm build
```

This runs `pnpm -r build` recursively, producing three directories under `packages/app/out/`:

```
packages/app/out/
├── main/       # Electron main process (Node.js)
├── preload/    # Preload scripts
└── renderer/   # Renderer process (React SPA)
```

---

## 6. Package Installers

### 6.1 Windows (NSIS Installer)

```powershell
cd packages/app
pnpm build:win
```

**Build pipeline** (`scripts/build-win.mjs`):

1. **electron-vite build** — Compiles TypeScript to `out/`
2. **Staging** — Creates a `.stage/` temp directory, copies `out/`, `electron-builder.yml`, and `build/` assets
3. **npm install** — Installs native dependencies in `.stage/` using npm (not pnpm) to avoid symlink path issues
4. **@electron/rebuild** — Recompiles `node-pty` and `keytar` for the current Electron version
5. **electron-builder** — Generates an unpacked directory first, then creates the NSIS installer

> **Why use a staging directory?**
> pnpm's symlink + `.pnpm` store paths on Windows often exceed MAX_PATH (260 characters), causing NSIS packaging to fail. The staging directory uses npm's flat install, keeping paths short and symlink-free.

**Output**:

```
packages/app/dist/
├── win-unpacked/                          # Portable version, run terminalmind.exe directly
└── TerminalMind-0.1.0-setup.exe          # NSIS installer
```

### 6.2 macOS (DMG)

```bash
cd packages/app
pnpm build:mac
```

Produces `dist/terminalmind-0.1.0.dmg`, building for both x64 and arm64 architectures.

> Note: Notarization is currently disabled (`notarize: false`). To distribute to other users, configure an Apple Developer certificate and enable notarization.

### 6.3 Linux (AppImage)

```bash
cd packages/app
pnpm build:linux
```

Produces `dist/terminalmind-0.1.0.AppImage` (x64).

### 6.4 Package Without Recompiling

If you have already run `pnpm build`, you can skip compilation and package directly:

```bash
cd packages/app
pnpm package          # Current OS platform
```

---

## 7. Mirror Acceleration (China Mainland)

The build scripts have npmmirror acceleration built in. To configure manually:

```powershell
# PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

pnpm build:win
```

```bash
# Bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

pnpm build:mac   # or build:linux
```

---

## 8. Troubleshooting

### Q: `node-pty` compilation fails

```
error: no matching function for call to 'Nan::New'
```

Ensure the correct version of the C++ toolchain and Python 3 are installed. On Windows, the "Desktop development with C++" workload in Visual Studio Build Tools is required.

```bash
pnpm rebuild:native
```

### Q: NSIS reports path too long on Windows

This is caused by pnpm store paths exceeding 260 characters. Use `pnpm build:win` instead of calling `electron-builder` directly — the script uses a staging directory to work around this issue.

### Q: `node-pty` fails to load after packaging

`electron-builder.yml` is configured to unpack native modules from the asar archive:

```yaml
asarUnpack:
  - "**/*.node"
  - "**/node-pty/**"
```

If errors persist, verify that `@electron/rebuild` recompiled native modules for the correct Electron version.

### Q: macOS app won't open, shows "damaged" warning

Unsigned apps are blocked by Gatekeeper. During development, bypass temporarily:

```bash
xattr -cr /Applications/TerminalMind.app
```

For production distribution, configure an Apple Developer certificate and enable notarization.

### Q: `keytar` compilation fails on Linux

Install `libsecret-1-dev`:

```bash
sudo apt install libsecret-1-dev
```

---

## 9. Build Output Summary

| Platform | Command | Output Path | Format |
|---|---|---|---|
| Windows | `pnpm build:win` | `packages/app/dist/` | NSIS `.exe` + unpacked directory |
| macOS | `pnpm build:mac` | `packages/app/dist/` | `.dmg` (x64 + arm64) |
| Linux | `pnpm build:linux` | `packages/app/dist/` | `.AppImage` (x64) |
