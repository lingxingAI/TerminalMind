#!/usr/bin/env node
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function usage(): void {
  console.error('Usage: terminalmind-create-extension <name>');
  console.error('Example: terminalmind-create-extension my-extension');
  process.exit(1);
}

function assertValidExtensionName(name: string): void {
  if (!name || name === '.' || name === '..') {
    throw new Error('Extension name must be a non-empty npm package name.');
  }
  if (name.includes(path.sep) || name.includes('/') || name.includes('\\')) {
    throw new Error('Extension name must not contain path separators; use a package name like "my-ext" or "@scope/my-ext".');
  }
  // Loose npm-style check (scoped or unscoped)
  const ok =
    /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(name) &&
    name.length <= 214;
  if (!ok) {
    throw new Error(
      `Invalid package name "${name}". Use lowercase letters, digits, dots, underscores, or hyphens (scoped names: @scope/name).`,
    );
  }
}

function directoryForName(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(i + 1)! : name;
}

function commandIdBase(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(i + 1)! : name;
}

function toDisplayName(name: string): string {
  const base = commandIdBase(name);
  const words = base.split(/[-_.]+/).filter(Boolean);
  if (words.length === 0) {
    return base;
  }
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    usage();
  }

  assertValidExtensionName(name);

  const root = process.cwd();
  const dirName = directoryForName(name);
  const target = path.join(root, dirName);

  const pkg = {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    terminalmind: {
      entry: './dist/index.js',
      activationEvents: [`onCommand:${commandIdBase(name)}.*`],
      permissions: [],
      contributes: {
        commands: [
          {
            id: `${commandIdBase(name)}.hello`,
            title: `${toDisplayName(name)}: Hello World`,
          },
        ],
        views: {},
      },
    },
    scripts: {
      build: 'tsc',
      dev: 'tsc --watch',
    },
    dependencies: {
      '@terminalmind/api': 'workspace:*',
    },
    devDependencies: {
      typescript: '^5.4.0',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      declaration: true,
      outDir: './dist',
      strict: true,
      esModuleInterop: true,
    },
    include: ['src'],
  };

  const cmdBase = commandIdBase(name);
  const indexTs = `import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';

export function activate(ctx: ExtensionContext, api: TerminalMindAPI): void {
  ctx.subscriptions.push(
    api.commands.register('${cmdBase}.hello', async () => {
      api.window.showNotification('Hello from ${name}!');
    }),
  );
}

export function deactivate(): void {}
`;

  const readme = `# ${name}

TerminalMind extension scaffold. Run \`pnpm install\` (from the monorepo root) and \`pnpm run build\` in this folder, then load the built package according to your TerminalMind setup.

## Commands

- **${cmdBase}.hello** — shows a notification via \`api.window.showNotification\`.
`;

  try {
    await access(target, fsConstants.F_OK);
    throw new Error(
      `Directory "${path.relative(root, target) || '.'}" already exists. Remove it or pick another name.`,
    );
  } catch (e) {
    if ((e as { code?: string }).code !== 'ENOENT') {
      throw e;
    }
  }

  try {
    await mkdir(path.join(target, 'src'), { recursive: true });
  } catch (e) {
    throw new Error(`Could not create directory "${target}": ${String(e)}`);
  }

  await writeFile(path.join(target, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

  await writeFile(path.join(target, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  await writeFile(path.join(target, 'src', 'index.ts'), indexTs);
  await writeFile(path.join(target, 'README.md'), readme);

  console.log(`Created extension scaffold at ${path.relative(root, target) || '.'}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
