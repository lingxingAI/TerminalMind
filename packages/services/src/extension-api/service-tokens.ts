import { createServiceToken } from '@terminalmind/core';
import type { AIProviderService } from '../ai/ai-provider-service.js';
import type { IPipelineEngine } from '../ai/pipeline/pipeline-engine.js';
import type { IConfigService } from '../config/index.js';
import type { IConnectionStore } from '../connection/index.js';
import type { ITerminalService } from '../terminal/terminal-service.js';

export const EXTENSION_TERMINAL_SERVICE = createServiceToken<ITerminalService>('ExtensionAPI.ITerminalService');
export const EXTENSION_CONNECTION_STORE = createServiceToken<IConnectionStore>('ExtensionAPI.IConnectionStore');
export const EXTENSION_AI_PROVIDER_SERVICE = createServiceToken<AIProviderService>('ExtensionAPI.AIProviderService');
export const EXTENSION_PIPELINE_ENGINE = createServiceToken<IPipelineEngine>('ExtensionAPI.IPipelineEngine');
export const EXTENSION_CONFIG_SERVICE = createServiceToken<IConfigService>('ExtensionAPI.IConfigService');
