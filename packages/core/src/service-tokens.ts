import { createServiceToken } from './types/service-token';
import type { IServiceContainer } from './service-container';
import type { ICommandRegistry } from './command-registry';
import type { IEventBus } from './event-bus';
import type { PipelineEngine } from './pipeline-engine-stub';

export const ServiceTokens = {
  ServiceContainer: createServiceToken<IServiceContainer>('IServiceContainer'),
  CommandRegistry: createServiceToken<ICommandRegistry>('ICommandRegistry'),
  EventBus: createServiceToken<IEventBus>('IEventBus'),
  PipelineEngine: createServiceToken<PipelineEngine>('PipelineEngine'),
} as const;
