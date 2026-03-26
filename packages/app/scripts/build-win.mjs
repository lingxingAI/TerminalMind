import { execSync } from 'node:child_process';
import { rmSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..');
const stageDir = resolve(appDir, '.stage');

console.log('=== TerminalMind Windows Build ===\n');

// 1. Clean stage dir
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true });
mkdirSync(stageDir, { recursive: true });

// 2. Build electron-vite (ensures out/ is fresh)
console.log('[1/4] Building with electron-vite...');
execSync('npx electron-vite build', { cwd: appDir, stdio: 'inherit' });

// 3. Prepare staging area with only what electron-builder needs
console.log('[2/4] Staging package files...');

// Copy out/ (bundled code)
cpSync(resolve(appDir, 'out'), resolve(stageDir, 'out'), { recursive: true });

// Copy electron-builder config
cpSync(resolve(appDir, 'electron-builder.yml'), resolve(stageDir, 'electron-builder.yml'));

// Copy build resources if any
const buildRes = resolve(appDir, 'build');
if (existsSync(buildRes)) {
  cpSync(buildRes, resolve(stageDir, 'build'), { recursive: true });
}

// Create a clean package.json with only native deps
const pkg = JSON.parse(readFileSync(resolve(appDir, 'package.json'), 'utf-8'));
const nativeDeps = {};
const nativePackages = ['node-pty', 'ssh2', 'cpu-features', 'keytar'];
// Also include transitive deps ssh2 needs
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
for (const [name, version] of Object.entries(allDeps)) {
  if (name.startsWith('@terminalmind/')) continue;
  if (name.startsWith('@xterm/')) continue;
  if (name === 'react' || name === 'react-dom' || name === 'zustand') continue;
  if (name.startsWith('@types/') || name.startsWith('@vitejs/')) continue;
  if (name === 'electron-vite' || name === 'electron-builder' || name === '@electron/rebuild') continue;
  if (name === 'typescript' || name === 'electron') continue;
  nativeDeps[name] = version;
}

// Detect electron version from the monorepo
const electronPkg = JSON.parse(
  readFileSync(resolve(appDir, 'node_modules/electron/package.json'), 'utf-8'),
);
const electronVersion = electronPkg.version;
console.log(`  Electron version: ${electronVersion}`);

const stagePkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  main: pkg.main,
  description: 'CLI-First intelligent terminal for full-stack developers',
  author: 'TerminalMind Team',
  dependencies: nativeDeps,
  devDependencies: {
    electron: `^${electronVersion}`,
    '@electron/rebuild': '^3.0.0',
  },
};
writeFileSync(resolve(stageDir, 'package.json'), JSON.stringify(stagePkg, null, 2));

// 4. Install dependencies via npm (not pnpm, to avoid symlinks)
console.log('[3/4] Installing dependencies...');
execSync('npm install --ignore-scripts', { cwd: stageDir, stdio: 'inherit' });

// Rebuild native modules for Electron
console.log('  Rebuilding native modules for Electron...');
try {
  execSync('npx @electron/rebuild -o node-pty,keytar', { cwd: stageDir, stdio: 'inherit' });
} catch {
  console.warn('  Warning: native module rebuild had issues, continuing...');
}

// 5. Run electron-builder from stage dir
console.log('[4/4] Packaging with electron-builder...');

const mirrorEnv = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

// Build unpacked dir first, then create NSIS installer
// Use --dir to skip code signing tool requirement
execSync('npx electron-builder --win --dir --config electron-builder.yml', {
  cwd: stageDir,
  stdio: 'inherit',
  env: { ...mirrorEnv, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});

console.log('  Unpacked app created. Creating NSIS installer...');

try {
  // Now build NSIS with the already-unpacked app
  execSync('npx electron-builder --win --config electron-builder.yml --prepackaged dist/win-unpacked', {
    cwd: stageDir,
    stdio: 'inherit',
    env: { ...mirrorEnv, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });
} catch {
  console.warn('  NSIS installer creation failed (likely winCodeSign symlink issue).');
  console.warn('  The unpacked app is ready at: .stage/dist/win-unpacked/');
  console.warn('  You can run terminalmind.exe directly from that directory.');
}

// Copy artifacts back
const distSrc = resolve(stageDir, 'dist');
const distDest = resolve(appDir, 'dist');
if (existsSync(distSrc)) {
  if (!existsSync(distDest)) mkdirSync(distDest, { recursive: true });
  cpSync(distSrc, distDest, { recursive: true });
  console.log(`\n✅ Build artifacts copied to: ${distDest}`);
}

console.log('\n=== Build Complete ===');
