# TerminalMind extensions

Developer guide for third-party and built-in extensions: manifest shape, permissions, API surface, lifecycle, and distribution.

## Manifest (`package.json`)

TerminalMind reads the **`terminalmind`** object inside the extension’s `package.json`. It works alongside normal npm fields (`name`, `version`, `description`, etc.).

| Field | Required | Description |
| --- | --- | --- |
| `entry` | Yes | Path to the compiled main file (typically `./dist/index.js`). The host loads this module. |
| `activationEvents` | Yes | Strings that describe when the extension should activate (for example `*` for always, or `onCommand:myext.*` for command-driven activation). |
| `permissions` | No | Declared capabilities; runtime access is gated by the permission manager (see below). |
| `contributes` | No | Declarative UI and configuration: commands, views, menus, keybindings, configuration keys. |

### `contributes` overview

- **commands** — `{ id, title, category? }[]`. Command `id` is what you pass to `api.commands.register` and `api.commands.execute`.
- **views** — Optional `sidebar` / `panel` arrays of `{ id, name }` for contributed views.
- **menus**, **keybindings**, **configuration** — Optional; see types in `@terminalmind/api` (`ExtensionContributions`).

The host normalizes manifests (for example command entries may use `command` as an alias for `id`). Invalid values produce a clear parse error at load time.

## Permissions

Extensions declare **`terminalmind.permissions`** as an array of permission strings. Built-in extensions may bypass checks; external / worker-hosted code should declare everything they need so the user can grant or deny access.

| Permission | What it controls |
| --- | --- |
| `terminal.execute` | Creating terminals, sending input, listening to output/exit (terminal namespace). |
| `connections.read` | Reading connection profiles from the connection store. |
| `connections.write` | Creating, updating, or removing connection profiles. |
| `fs.read` | Reading files and directory listings via the extension API. |
| `fs.write` | Writing or deleting files and creating directories via the extension API. |
| `ai.invoke` | Calling AI completion/stream APIs and registering providers. |
| `network.outbound` | Outbound network access where the host enforces this permission. |

If you omit a permission, calls into the corresponding guarded APIs may be denied or prompt the user, depending on host configuration.

## `TerminalMindAPI` namespaces (10)

All extension code receives a single **`TerminalMindAPI`** in `activate`. Namespaces are:

1. **`commands`** — Register and execute commands; list registered command ids.
2. **`views`** — Register sidebar views, panel views, and status bar items.
3. **`events`** — Subscribe to application event bus events (typed by `EventType`).
4. **`terminal`** — Create and control terminal sessions (requires `terminal.execute` when enforced).
5. **`connections`** — List, get, save, and remove stored connection profiles (read/write permissions).
6. **`ai`** — Complete/stream AI requests and register providers (`ai.invoke`).
7. **`fs`** — File read/write and directory operations (`fs.read` / `fs.write`).
8. **`pipeline`** — Register pipeline steps, compose pipelines, execute them.
9. **`config`** — Get/set extension-related config and subscribe to changes.
10. **`window`** — Notifications, quick pick, input box, and other lightweight UI prompts.

Worker-hosted extensions may expose a **subset** of these methods; treat the in-process API as the full reference and consult host documentation for worker differences.

## Lifecycle

- **`activate(ctx, api)`** — Called when the extension is started. Use `ctx.extensionId` for logging and identity. Push disposables (for example from `api.commands.register`) onto **`ctx.subscriptions`** so the host can clean them up when the extension deactivates.
- **`deactivate()`** — Optional. Called when the extension is shut down; release any resources that are not tied to `ctx.subscriptions`.

Keep `activate` fast; defer heavy work until a command or event runs.

## Publishing (GitHub Releases)

A common pattern for open-source extensions:

1. **Version** — Bump `version` in `package.json` (semver).
2. **Build** — Run `pnpm run build` (or `npm run build`) so `dist/` is up to date.
3. **Package** — Create an archive of the extension root (include `package.json`, `dist/`, and `README` / license). Many teams use a `.tgz` aligned with npm’s layout or a zip named with the version.
4. **Release** — Create a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and attach the archive. Consumers download, verify checksums if you publish them, and install via TerminalMind’s extension / marketplace flow when available.

Until a marketplace is wired end-to-end, document your release artifact layout (file names, required paths) in your repo’s README.

## Scaffold CLI

The helper package is `@terminalmind/create-extension`. Its published bin is compiled to `tools/create-extension/dist/index.js` (the `dist/` folder is gitignored; `pnpm install` runs `prepare` / `tsc` so the binary exists locally).

From the TerminalMind monorepo, after installing dependencies:

```bash
pnpm exec terminalmind-create-extension my-extension
```

Or build and run the tool directly:

```bash
pnpm --filter @terminalmind/create-extension build
node tools/create-extension/dist/index.js my-extension
```

To run the TypeScript source with Node you still need a TS-aware runner or the compiled output above—plain `node tools/create-extension/index.ts` is not supported without extra flags or tooling.

This creates a folder (by default the last segment of the name, e.g. `my-extension` or `foo` for `@scope/foo`) with `package.json`, `tsconfig.json`, `src/index.ts`, and a short `README.md`.

## Example: build and test locally (monorepo)

1. **Generate** — Run the scaffold command above inside the repo (or move the generated folder under `extensions/`).
2. **Workspace** — Ensure the new package is under a pnpm workspace glob (for example `extensions/my-extension`) so `"@terminalmind/api": "workspace:*"` resolves.
3. **Install** — From the repository root: `pnpm install`.
4. **Compile** — In the extension directory: `pnpm run build`.
5. **Wire-up for manual testing** — Today, built-in extensions are registered in the app main process; third-party loading from disk is evolving with the plugin system. For local iteration you can temporarily register your built module alongside built-ins (same pattern as existing `extensions/ext-*` packages), or use whatever install path your branch provides for unpacked extensions.

After changes, rebuild the extension and restart the app so the host reloads `dist/`.

## Further reading

- Type definitions: `@terminalmind/api` (`TerminalMindAPI`, `ExtensionContext`, `ExtensionManifest`, `Permission`).
- Manifest parsing and validation: `packages/services/src/extension-host/manifest.ts`.
