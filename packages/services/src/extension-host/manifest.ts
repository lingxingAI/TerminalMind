import semver from 'semver';
import type {
  ExtensionContributions,
  ExtensionManifest,
  Permission,
} from '@terminalmind/api';

const PERMISSION_VALUES: readonly Permission[] = [
  'terminal.execute',
  'connections.read',
  'connections.write',
  'fs.read',
  'fs.write',
  'ai.invoke',
  'network.outbound',
];

const PERMISSION_SET = new Set<string>(PERMISSION_VALUES);

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid extension manifest: expected object for ${label}`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid extension manifest: "${field}" must be a non-empty string`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) {
    throw new Error(`Invalid extension manifest: "${field}" must be an array of strings`);
  }
  return value as string[];
}

function parsePermissions(raw: unknown): readonly Permission[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const arr = assertStringArray(raw, 'terminalmind.permissions');
  for (const p of arr) {
    if (!PERMISSION_SET.has(p)) {
      throw new Error(`Invalid extension manifest: unknown permission "${p}"`);
    }
  }
  return arr as Permission[];
}

function parseViewDescriptors(
  raw: unknown,
  field: string,
): readonly { readonly id: string; readonly name: string }[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid extension manifest: "${field}" must be an array`);
  }
  return raw.map((item, i) => {
    const o = assertRecord(item, `${field}[${i}]`);
    return {
      id: assertString(o.id, `${field}[${i}].id`),
      name: assertString(o.name, `${field}[${i}].name`),
    };
  });
}

function parseContributions(raw: unknown): ExtensionContributions | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const o = assertRecord(raw, 'terminalmind.contributes');

  let commands: ExtensionContributions['commands'];
  if (o.commands !== undefined) {
    if (!Array.isArray(o.commands)) {
      throw new Error('Invalid extension manifest: contributes.commands must be an array');
    }
    commands = o.commands.map((item, i) => {
      const c = assertRecord(item, `contributes.commands[${i}]`);
      const id =
        typeof c.id === 'string'
          ? c.id
          : typeof c.command === 'string'
            ? c.command
            : '';
      if (!id) {
        throw new Error(
          `Invalid extension manifest: contributes.commands[${i}] needs "id" or "command"`,
        );
      }
      return {
        id,
        title: assertString(c.title, `contributes.commands[${i}].title`),
        category: typeof c.category === 'string' ? c.category : undefined,
      };
    });
  }

  let views: ExtensionContributions['views'];
  if (o.views !== undefined) {
    const v = assertRecord(o.views, 'contributes.views');
    const sidebar = parseViewDescriptors(v.sidebar, 'contributes.views.sidebar');
    const panel = parseViewDescriptors(v.panel, 'contributes.views.panel');
    if (sidebar !== undefined || panel !== undefined) {
      views = { sidebar, panel };
    }
  }

  let menus: ExtensionContributions['menus'];
  if (o.menus !== undefined) {
    if (!Array.isArray(o.menus)) {
      throw new Error('Invalid extension manifest: contributes.menus must be an array');
    }
    menus = o.menus.map((item, i) => {
      const m = assertRecord(item, `contributes.menus[${i}]`);
      return {
        command: assertString(m.command, `contributes.menus[${i}].command`),
        group: typeof m.group === 'string' ? m.group : undefined,
      };
    });
  }

  let keybindings: ExtensionContributions['keybindings'];
  if (o.keybindings !== undefined) {
    if (!Array.isArray(o.keybindings)) {
      throw new Error('Invalid extension manifest: contributes.keybindings must be an array');
    }
    keybindings = o.keybindings.map((item, i) => {
      const k = assertRecord(item, `contributes.keybindings[${i}]`);
      return {
        command: assertString(k.command, `contributes.keybindings[${i}].command`),
        key: assertString(k.key, `contributes.keybindings[${i}].key`),
        when: typeof k.when === 'string' ? k.when : undefined,
      };
    });
  }

  let configuration: ExtensionContributions['configuration'];
  if (o.configuration !== undefined) {
    if (!Array.isArray(o.configuration)) {
      throw new Error('Invalid extension manifest: contributes.configuration must be an array');
    }
    configuration = o.configuration.map((item, i) => {
      const cfg = assertRecord(item, `contributes.configuration[${i}]`);
      return {
        key: assertString(cfg.key, `contributes.configuration[${i}].key`),
        type: assertString(cfg.type, `contributes.configuration[${i}].type`),
        default: cfg.default,
        description: typeof cfg.description === 'string' ? cfg.description : undefined,
      };
    });
  }

  if (!commands && !views && !menus && !keybindings && !configuration) {
    return undefined;
  }

  return { commands, views, menus, keybindings, configuration };
}

/**
 * Validates and normalizes a `package.json` object into a Phase 4 {@link ExtensionManifest}.
 */
export function parseExtensionManifestFromPackageJson(json: unknown): ExtensionManifest {
  const root = assertRecord(json, 'package.json');

  const name = assertString(root.name, 'name');
  const version = assertString(root.version, 'version');
  if (semver.coerce(version) === null) {
    throw new Error('Invalid extension manifest: "version" must be semver-compatible');
  }

  const tm = assertRecord(root.terminalmind, 'terminalmind');
  const entry = assertString(tm.entry, 'terminalmind.entry');
  const activationEvents = assertStringArray(tm.activationEvents, 'terminalmind.activationEvents');
  const permissions = parsePermissions(tm.permissions);
  const contributes = parseContributions(tm.contributes);

  const displayName = typeof root.displayName === 'string' ? root.displayName : undefined;
  const description = typeof root.description === 'string' ? root.description : undefined;
  let author: string | undefined;
  if (typeof root.author === 'string') {
    author = root.author;
  } else if (root.author !== null && typeof root.author === 'object') {
    const n = (root.author as { name?: unknown }).name;
    if (typeof n === 'string' && n.length > 0) {
      author = n;
    }
  }
  const license = typeof root.license === 'string' ? root.license : undefined;
  let repository: string | undefined;
  if (typeof root.repository === 'string') {
    repository = root.repository;
  } else if (root.repository !== null && typeof root.repository === 'object') {
    const url = (root.repository as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) {
      repository = url;
    }
  }

  return {
    name,
    displayName,
    version,
    description,
    author,
    license,
    repository,
    terminalmind: {
      entry,
      activationEvents,
      permissions,
      contributes,
    },
  };
}
