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
  profileSessionMap: ReadonlyMap<string, string>,
): ConnectionInfo {
  const ssh = profile.sshConfig;
  const host = ssh?.host;
  const port = ssh?.port;
  const username = ssh?.username;
  let status: ConnectionInfo['status'] = 'disconnected';
  if (profile.type === 'ssh' && host && username !== undefined) {
    const boundSessionId = profileSessionMap.get(profile.id);
    if (
      boundSessionId
        ? sessions.some((s) => s.id === boundSessionId && s.status === 'connected')
        : sessions.some(
            (s) =>
              s.status === 'connected' &&
              s.host === host &&
              s.port === (port ?? 22) &&
              s.username === username,
          )
    ) {
      status = 'connected';
    }
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
  /** Maps connection profile ID -> SSH session ID for precise status tracking. */
  profileSessionMap: Map<string, string>;
  setConnections(connections: ConnectionInfo[]): void;
  selectConnection(id: string | null): void;
  setSearchQuery(query: string): void;
  openEditor(connection?: ConnectionInfo): void;
  closeEditor(): void;
  bindSession(profileId: string, sshSessionId: string): void;
  unbindSession(profileId: string): void;
  refreshConnections(): Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  selectedConnectionId: null,
  searchQuery: '',
  isEditorOpen: false,
  editingConnection: null,
  profileSessionMap: new Map(),

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

  bindSession: (profileId, sshSessionId) => {
    const next = new Map(get().profileSessionMap);
    next.set(profileId, sshSessionId);
    set({ profileSessionMap: next });
  },

  unbindSession: (profileId) => {
    const prev = get().profileSessionMap;
    if (!prev.has(profileId)) return;
    const next = new Map(prev);
    next.delete(profileId);
    set({ profileSessionMap: next });
  },

  refreshConnections: async () => {
    const profiles = await window.api.connections.list();
    let sessions: readonly SSHSessionInfo[] = [];
    try {
      sessions = await window.api.ssh.listSessions();
    } catch {
      sessions = [];
    }
    const psMap = get().profileSessionMap;
    const activeSids = new Set(sessions.filter((s) => s.status === 'connected').map((s) => s.id));
    let mapChanged = false;
    const nextMap = new Map(psMap);
    for (const [pid, sid] of nextMap) {
      if (!activeSids.has(sid)) {
        nextMap.delete(pid);
        mapChanged = true;
      }
    }
    set({
      connections: profiles.map((p) => profileToConnectionInfo(p, sessions, nextMap)),
      ...(mapChanged ? { profileSessionMap: nextMap } : {}),
    });
  },
}));
