import type { AINamespace, AICompletionRequest, AIProvider } from '@terminalmind/api';
import type { AIProviderService } from '../../ai/ai-provider-service.js';
import type { IPermissionManager } from '@terminalmind/api';
import { requirePermission } from '../permission.js';

export function createAINamespace(
  ai: AIProviderService,
  extensionId: string,
  isBuiltin: boolean,
  permissionManager: IPermissionManager | undefined
): AINamespace {
  return {
    async complete(request: AICompletionRequest) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'ai.invoke');
      return ai.complete(request);
    },
    stream(request: AICompletionRequest) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'ai.invoke');
      return ai.stream(request);
    },
    registerProvider(provider: AIProvider) {
      requirePermission(isBuiltin, permissionManager, extensionId, 'ai.invoke');
      return ai.registerProvider(provider);
    },
    listProviders() {
      requirePermission(isBuiltin, permissionManager, extensionId, 'ai.invoke');
      return [...ai.listProviders()];
    },
  };
}
