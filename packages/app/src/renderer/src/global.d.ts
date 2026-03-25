import type { PreloadAPI } from '@terminalmind/api';

declare global {
  interface Window {
    readonly api: PreloadAPI;
  }
}

export {};
