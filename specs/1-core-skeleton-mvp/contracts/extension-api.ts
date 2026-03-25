/**
 * TerminalMind Extension API — Phase 1 最小子集契约
 *
 * 本文件定义 Phase 1 Extension API 的公共接口。
 * 内置扩展（ext-terminal）和未来第三方扩展使用完全相同的 API。
 * Phase 2+ 扩充新命名空间，不改变已有接口。
 */

import type {
  Disposable,
  EventBus,
  EventType,
  EventPayloadMap,
} from './core-types';

// ─── 扩展生命周期 ────────────────────────────────────────

/**
 * 扩展入口文件必须导出的接口。
 */
export interface ExtensionModule {
  activate(ctx: ExtensionContext, api: TerminalMindAPI): void;
  deactivate?(): void;
}

/**
 * 扩展生命周期上下文。activate 时由 Extension Host 创建并传入。
 * deactivate 时 subscriptions 中的所有 Disposable 自动调用 dispose()。
 */
export interface ExtensionContext {
  readonly extensionId: string;
  readonly subscriptions: Disposable[];
}

// ─── 扩展清单 ────────────────────────────────────────────

/**
 * package.json 中的 "terminalmind" 字段。
 */
export interface ExtensionManifest {
  readonly entry: string;
  readonly activationEvents: readonly string[];
  readonly contributes: ExtensionContributions;
}

export interface ExtensionContributions {
  readonly commands?: readonly CommandContribution[];
  readonly views?: readonly ViewContribution[];
}

export interface CommandContribution {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
}

export interface ViewContribution {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly location: 'sidebar' | 'panel';
}

// ─── TerminalMindAPI（Phase 1 子集） ────────────────────

/**
 * 传递给 activate() 的 API 对象。
 * Phase 1 仅包含 commands、views、events 三个命名空间。
 * 后续 Phase 追加 terminal、connections、ai、fs、pipeline、config、window。
 */
export interface TerminalMindAPI {
  readonly commands: CommandsNamespace;
  readonly views: ViewsNamespace;
  readonly events: EventsNamespace;
}

// ─── commands 命名空间 ──────────────────────────────────

export interface CommandsNamespace {
  /**
   * 注册一个命令。返回 Disposable 用于注销。
   * 通常将返回值推入 ctx.subscriptions。
   */
  register(
    id: string,
    handler: (args?: unknown) => Promise<unknown>
  ): Disposable;

  /**
   * 执行已注册的命令。
   */
  execute<T = unknown>(id: string, args?: unknown): Promise<T>;

  /**
   * 获取所有已注册命令的 ID 列表。
   */
  getRegisteredCommands(): readonly string[];
}

// ─── views 命名空间 ─────────────────────────────────────

/**
 * 侧边栏视图的渲染提供者。
 * Phase 1 的 GUI Shell 通过此接口在侧边栏区域渲染扩展提供的视图。
 */
export interface SidebarViewProvider {
  readonly viewId: string;
  readonly title: string;
  readonly icon: string;
}

export interface ViewsNamespace {
  /**
   * 注册一个侧边栏视图。返回 Disposable 用于注销。
   */
  registerSidebarView(
    viewId: string,
    provider: SidebarViewProvider
  ): Disposable;
}

// ─── events 命名空间 ────────────────────────────────────

export interface EventsNamespace {
  /**
   * 订阅全局事件。返回 Disposable 用于取消订阅。
   */
  on<T extends EventType>(
    type: T,
    handler: (payload: Readonly<EventPayloadMap[T]>) => void
  ): Disposable;
}

// ─── ext-terminal 使用示例 ──────────────────────────────
//
// // extensions/ext-terminal/src/index.ts
// import type { ExtensionContext, TerminalMindAPI } from '@terminalmind/api';
//
// export function activate(ctx: ExtensionContext, api: TerminalMindAPI): void {
//   ctx.subscriptions.push(
//     api.commands.register('terminal.new', async (args) => {
//       // 通过 ServiceToken 获取 TerminalService 并创建会话
//     })
//   );
//
//   ctx.subscriptions.push(
//     api.commands.register('terminal.close', async (args) => {
//       // 关闭指定终端会话
//     })
//   );
//
//   ctx.subscriptions.push(
//     api.views.registerSidebarView('terminal-list', {
//       viewId: 'terminal-list',
//       title: 'Terminals',
//       icon: 'terminal',
//     })
//   );
// }
//
// export function deactivate(): void {}
