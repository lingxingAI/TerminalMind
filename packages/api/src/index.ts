export type {
  ExtensionModule,
  ExtensionContext,
  ExtensionManifest,
  ExtensionContributions,
  CommandContribution,
  ViewContribution,
  TerminalMindAPI,
  CommandsNamespace,
  ViewsNamespace,
  EventsNamespace,
  SidebarViewProvider,
} from './extension-api';

export { IpcChannels, IpcEventChannels } from './ipc/index';
export type {
  TerminalCreateOptions,
  TerminalSessionInfo,
  ShellInfo,
  CommandInfo,
  PtyDataPayload,
  PtyInputPayload,
  EventBroadcastPayload,
  PreloadAPI,
} from './ipc/index';
