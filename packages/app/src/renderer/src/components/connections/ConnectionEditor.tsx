import React, { useCallback, useEffect, useState } from 'react';
import type { ConnectionProfile, SSHAuthMethod, SSHConnectOptions } from '@terminalmind/api';
import { useConnectionStore } from '../../stores/connection-store';

type AuthChoice = 'password' | 'publicKey' | 'agent';

interface FormState {
  name: string;
  host: string;
  port: string;
  username: string;
  authType: AuthChoice;
  password: string;
  keyPath: string;
  group: string;
  tags: string;
}

const defaultForm: FormState = {
  name: '',
  host: '',
  port: '22',
  username: '',
  authType: 'password',
  password: '',
  keyPath: '',
  group: '',
  tags: '',
};

function getProfileCreatedAt(p: ConnectionProfile | null | undefined): number {
  if (!p) return Date.now();
  const extended = p as ConnectionProfile & { createdAt?: number };
  if (typeof extended.createdAt === 'number') return extended.createdAt;
  if (p.timestamps && typeof p.timestamps.createdAt === 'number') return p.timestamps.createdAt;
  return Date.now();
}

function formFromProfile(profile: ConnectionProfile): FormState {
  const ssh = profile.sshConfig;
  const auth = ssh?.auth;
  let authType: AuthChoice = 'agent';
  let password = '';
  let keyPath = '';
  if (auth?.type === 'password') {
    authType = 'password';
    password = auth.password;
  } else if (auth?.type === 'publicKey') {
    authType = 'publicKey';
    keyPath = auth.privateKeyPath;
  } else if (auth?.type === 'agent') {
    authType = 'agent';
  }
  return {
    name: profile.name,
    host: ssh?.host ?? '',
    port: String(ssh?.port ?? 22),
    username: ssh?.username ?? '',
    authType,
    password,
    keyPath,
    group: profile.group ?? '',
    tags: profile.tags?.join(', ') ?? '',
  };
}

function buildAuth(form: FormState, existing?: SSHConnectOptions): SSHAuthMethod {
  if (form.authType === 'password') {
    const pw = form.password;
    if (pw === '' && existing?.auth.type === 'password') {
      return { type: 'password', password: existing.auth.password };
    }
    return { type: 'password', password: pw };
  }
  if (form.authType === 'publicKey') {
    return { type: 'publicKey', privateKeyPath: form.keyPath.trim() };
  }
  return { type: 'agent' };
}

export function ConnectionEditor(): React.ReactElement {
  const isOpen = useConnectionStore((s) => s.isEditorOpen);
  const editing = useConnectionStore((s) => s.editingConnection);
  const closeEditor = useConnectionStore((s) => s.closeEditor);
  const refreshConnections = useConnectionStore((s) => s.refreshConnections);

  const [form, setForm] = useState<FormState>(defaultForm);
  const [existingProfile, setExistingProfile] = useState<ConnectionProfile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForm(defaultForm);
      setExistingProfile(null);
      return;
    }
    if (editing) {
      void window.api.connections.get(editing.id).then((p) => {
        if (p) {
          setExistingProfile(p);
          setForm(formFromProfile(p));
        } else {
          setExistingProfile(null);
          setForm(defaultForm);
        }
      });
    } else {
      setExistingProfile(null);
      setForm(defaultForm);
    }
  }, [isOpen, editing]);

  const update = useCallback((patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    const name = form.name.trim();
    const host = form.host.trim();
    const username = form.username.trim();
    if (!name || !host || !username) return;

    const port = Math.min(65535, Math.max(1, parseInt(form.port, 10) || 22));
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const group = form.group.trim();

    const id = editing?.id ?? crypto.randomUUID();
    const existingSsh = existingProfile?.sshConfig;
    const auth = buildAuth(form, existingSsh);

    const sshConfig: SSHConnectOptions = {
      host,
      port,
      username,
      auth,
    };

    const createdAt = getProfileCreatedAt(existingProfile);
    const updatedAt = Date.now();

    const profile = {
      id,
      name,
      type: 'ssh' as const,
      ...(group ? { group } : {}),
      tags,
      sshConfig,
      timestamps: { createdAt, updatedAt },
    } as ConnectionProfile;

    setSaving(true);
    try {
      await window.api.connections.save(profile);
      await refreshConnections();
      closeEditor();
    } catch (e) {
      console.error('Failed to save connection:', e);
    } finally {
      setSaving(false);
    }
  }, [closeEditor, editing?.id, existingProfile, form, refreshConnections]);

  if (!isOpen) return <></>;

  return (
    <div className="connection-editor-overlay" role="dialog" aria-modal="true" aria-labelledby="connection-editor-title">
      <button type="button" className="connection-editor-backdrop" aria-label="Close" onClick={closeEditor} />
      <div className="connection-editor-panel">
        <h2 id="connection-editor-title" className="connection-editor-title">
          {editing ? 'Edit connection' : 'New connection'}
        </h2>

        <label className="connection-editor-field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => update({ name: e.target.value })} autoFocus />
        </label>

        <label className="connection-editor-field">
          <span>Host</span>
          <input value={form.host} onChange={(e) => update({ host: e.target.value })} />
        </label>

        <label className="connection-editor-field">
          <span>Port</span>
          <input value={form.port} onChange={(e) => update({ port: e.target.value })} inputMode="numeric" />
        </label>

        <label className="connection-editor-field">
          <span>Username</span>
          <input value={form.username} onChange={(e) => update({ username: e.target.value })} />
        </label>

        <label className="connection-editor-field">
          <span>Auth type</span>
          <select
            value={form.authType}
            onChange={(e) => update({ authType: e.target.value as AuthChoice })}
          >
            <option value="password">Password</option>
            <option value="publicKey">Public key</option>
            <option value="agent">SSH agent</option>
          </select>
        </label>

        {form.authType === 'password' ? (
          <label className="connection-editor-field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => update({ password: e.target.value })}
              placeholder={editing ? 'Leave blank to keep saved password' : ''}
              autoComplete="off"
            />
          </label>
        ) : null}

        {form.authType === 'publicKey' ? (
          <label className="connection-editor-field">
            <span>Private key path</span>
            <input value={form.keyPath} onChange={(e) => update({ keyPath: e.target.value })} placeholder="~/.ssh/id_rsa" />
          </label>
        ) : null}

        <label className="connection-editor-field">
          <span>Group</span>
          <input value={form.group} onChange={(e) => update({ group: e.target.value })} placeholder="Optional" />
        </label>

        <label className="connection-editor-field">
          <span>Tags</span>
          <input value={form.tags} onChange={(e) => update({ tags: e.target.value })} placeholder="Comma-separated" />
        </label>

        <div className="connection-editor-actions">
          <button type="button" className="connection-editor-btn secondary" onClick={closeEditor} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="connection-editor-btn primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
