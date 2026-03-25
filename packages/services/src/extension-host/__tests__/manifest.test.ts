/// <reference types="vitest/globals" />

import { ExtensionHost } from '../extension-host';
import { parseExtensionManifestFromPackageJson } from '../manifest';

describe('parseExtensionManifestFromPackageJson', () => {
  it('parses terminalmind.permissions and full contributes', () => {
    const m = parseExtensionManifestFromPackageJson({
      name: 'ext-demo',
      version: '1.2.3',
      terminalmind: {
        entry: './dist/index.js',
        activationEvents: ['onStartup'],
        permissions: ['fs.read', 'ai.invoke'],
        contributes: {
          commands: [{ id: 'ext.cmd', title: 'Do' }],
          views: {
            sidebar: [{ id: 'v1', name: 'One' }],
            panel: [{ id: 'v2', name: 'Two' }],
          },
          menus: [{ command: 'ext.cmd', group: 'navigation' }],
          keybindings: [{ command: 'ext.cmd', key: 'ctrl+shift+x', when: 'true' }],
          configuration: [
            { key: 'ext.setting', type: 'boolean', default: false, description: 'x' },
          ],
        },
      },
    });
    expect(m.name).toBe('ext-demo');
    expect(m.terminalmind.permissions).toEqual(['fs.read', 'ai.invoke']);
    expect(m.terminalmind.contributes?.commands?.[0]).toEqual({ id: 'ext.cmd', title: 'Do' });
    expect(m.terminalmind.contributes?.views?.sidebar?.[0]).toEqual({ id: 'v1', name: 'One' });
    expect(m.terminalmind.contributes?.keybindings?.[0]?.key).toBe('ctrl+shift+x');
  });

  it('normalizes contributes.commands from legacy "command" field', () => {
    const m = parseExtensionManifestFromPackageJson({
      name: 'legacy',
      version: '2.0.0',
      terminalmind: {
        entry: 'index.js',
        activationEvents: [],
        contributes: {
          commands: [{ command: 'old.id', title: 'T' }],
        },
      },
    });
    expect(m.terminalmind.contributes?.commands?.[0]?.id).toBe('old.id');
  });

  it('rejects unknown permission', () => {
    expect(() =>
      parseExtensionManifestFromPackageJson({
        name: 'bad',
        version: '1.0.0',
        terminalmind: {
          entry: 'x.js',
          activationEvents: [],
          permissions: ['not.real'],
        },
      }),
    ).toThrow('unknown permission');
  });
});

describe('ExtensionHost.parsePackageJsonManifest', () => {
  it('delegates to manifest parser', () => {
    const json = {
      name: 'x',
      version: '0.0.1',
      terminalmind: { entry: 'e.js', activationEvents: ['*'] },
    };
    expect(ExtensionHost.parsePackageJsonManifest(json).name).toBe('x');
  });
});
