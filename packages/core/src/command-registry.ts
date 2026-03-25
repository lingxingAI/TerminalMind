import type { Disposable } from './types/disposable';
import type { IServiceContainer } from './service-container';
import type { EventBus } from './event-bus';
import type { PipelineEngine } from './pipeline-engine-stub';

export interface Command<TArgs = unknown, TResult = unknown> {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  /** Set when the command is registered via the extension API. */
  readonly sourceExtensionId?: string;
  readonly handler: (
    args: Readonly<TArgs>,
    ctx: Readonly<CommandContext>
  ) => Promise<TResult>;
}

export interface CommandContext {
  readonly services: IServiceContainer;
  readonly events: EventBus;
  readonly pipeline: PipelineEngine;
}

export interface ICommandRegistry {
  register<TArgs, TResult>(command: Readonly<Command<TArgs, TResult>>): Disposable;
  execute<TResult>(id: string, args?: unknown): Promise<TResult>;
  getCommand(id: string): Command | undefined;
  getCommands(): readonly Command[];
  getCommandsByCategory(category: string): readonly Command[];
}

export class CommandRegistryImpl implements ICommandRegistry {
  private readonly commands = new Map<string, Command>();
  private readonly commandContext: Readonly<CommandContext>;

  constructor(deps: Readonly<{ services: IServiceContainer; events: EventBus; pipeline: PipelineEngine }>) {
    this.commandContext = {
      services: deps.services,
      events: deps.events,
      pipeline: deps.pipeline,
    };
  }

  register<TArgs, TResult>(command: Readonly<Command<TArgs, TResult>>): Disposable {
    if (this.commands.has(command.id)) {
      throw new Error(`Command already registered: ${command.id}`);
    }
    this.commands.set(command.id, command as Command);
    return {
      dispose: () => {
        this.commands.delete(command.id);
      },
    };
  }

  async execute<TResult>(id: string, args?: unknown): Promise<TResult> {
    const command = this.commands.get(id);
    if (!command) {
      throw new Error(`Command not found: ${id}`);
    }
    return command.handler(
      (args === undefined ? {} : args) as Readonly<unknown> as Readonly<Parameters<Command['handler']>[0]>,
      this.commandContext
    ) as Promise<TResult>;
  }

  getCommand(id: string): Command | undefined {
    return this.commands.get(id);
  }

  getCommands(): readonly Command[] {
    return [...this.commands.values()];
  }

  getCommandsByCategory(category: string): readonly Command[] {
    return [...this.commands.values()].filter((c) => c.category === category);
  }
}
