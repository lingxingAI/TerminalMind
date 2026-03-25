import type { ISecretStore } from '../connection/secret-store';

/** Secret key pattern: `ai:${providerId}:apiKey` */
export function aiProviderApiKeySecretKey(providerId: string): string {
  return `ai:${providerId}:apiKey`;
}

/** Thin wrapper around {@link ISecretStore} for AI provider API keys. */
export class AiSecretStore {
  constructor(private readonly secrets: ISecretStore) {}

  getApiKey(providerId: string): Promise<string | null> {
    return this.secrets.get(aiProviderApiKeySecretKey(providerId));
  }

  setApiKey(providerId: string, key: string): Promise<void> {
    return this.secrets.set(aiProviderApiKeySecretKey(providerId), key);
  }
}
