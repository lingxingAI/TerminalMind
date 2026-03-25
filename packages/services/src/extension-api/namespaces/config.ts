import type { ConfigNamespace } from '@terminalmind/api';
import type { IConfigService } from '../../config/index.js';

function scopedKey(extensionId: string, key: string, isBuiltin: boolean): string {
  if (isBuiltin) return key;
  return `extension.${extensionId}.${key}`;
}

export function createConfigNamespace(
  config: IConfigService,
  extensionId: string,
  isBuiltin: boolean
): ConfigNamespace {
  return {
    get<T>(key: string, defaultValue: T): T {
      return config.get(scopedKey(extensionId, key, isBuiltin), defaultValue);
    },
    async set(key: string, value: unknown): Promise<void> {
      await config.set(scopedKey(extensionId, key, isBuiltin), value);
    },
    onDidChange(key: string, callback: (value: unknown) => void) {
      return config.onChange(scopedKey(extensionId, key, isBuiltin), callback);
    },
  };
}
