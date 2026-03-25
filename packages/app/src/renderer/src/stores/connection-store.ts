import { create } from 'zustand';
import type { ConnectionProfile, SSHSessionInfo } from '@terminalmind/api';

export interface ConnectionInfo {
  id: string;
  name: string;
  type: 'ssh' | 'local';
  group?: string;
  tags?: string[];
  host?: string;
  port?: number;
  username?: string;
  authType?: 'password' | 'publicKey' | 'agent';
  status?: 'connected' | 'disconnected';
}

function authTypeFromProfile(profile: Readonly<ConnectionProfile>): ConnectionInfo['authType'] {
  const auth = profile.sshConfig?.auth;
  if (!auth) return undefined;
  return auth.type;
}

function profileToConnectionInfo(
  profile: Readonly<ConnectionProfile>,
  sessions: readonly SSHSessionInfo[],
): ConnectionInfo {
  const ssh = profile.sshConfig;
  const host = ssh?.host;
  const port = ssh?.port;
  const username = ssh?.username;
  let status: ConnectionInfo['status'] = 'disconnected';
  if (
    profile.type === 'ssh' &&
    host &&
    username !== undefined &&
    sessions.some(
      (s) =>
        s.status === 'connected' &&
        s.host === host &&
        s.port === (port ?? 22) &&
        s.username === username,
    )
  ) {
    status = 'connected';
  }
  return {
    id: profile.id,
    name: profile.name,
    type: profile.type,
    ...(profile.group !== undefined ? { group: profile.group } : {}),
    ...(profile.tags !== undefined && profile.tags.length > 0
      ? { tags: [...profile.tags] }
      : {}),
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(username !== undefined ? { username } : {}),
    authType: authTypeFromProfile(profile),
    status,
  };
}

interface ConnectionState {
  connections: ConnectionInfo[];
  selectedConnectionId: string | null;
  searchQuery: string;
  isEditorOpen: boolean;
  editingConnection: ConnectionInfo | null;
  setConnections(connections: ConnectionInfo[]): void;
  selectConnection(id: string | null): void;
  setSearchQuery(query: string): void;
  openEditor(connection?: ConnectionInfo): void;
  closeEditor(): void;
  refreshConnections(): Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  selectedConnectionId: null,
  searchQuery: '',
  isEditorOpen: false,
  editingConnection: null,

  setConnections: (connections) => set({ connections }),

  selectConnection: (id) => set({ selectedConnectionId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  openEditor: (connection) =>
    set({
      isEditorOpen: true,
      editingConnection: connection ?? null,
    }),

  closeEditor: () =>
    set({
      isEditorOpen: false,
      editingConnection: null,
    }),

  refreshConnections: async () => {
    const profiles = await window.api.connections.list();
    let sessions: readonly SSHSessionInfo[] = [];
    try {
      sessions = await window.api.ssh.listSessions();
    } catch {
      sessions = [];
    }
    set({
      connections: profiles.map((p) => profileToConnectionInfo(p, sessions)),
    });
  },
}));
