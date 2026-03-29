import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const isOpen = useConnectionStore((s) => s.isEditorOpen);
  const editing = useConnectionStore((s) => s.editingConnection);
  const closeEditor = useConnectionStore((s) => s.closeEditor);
  const refreshConnections = useConnectionStore((s) => s.refreshConnections);

  const [form, setForm] = useState<FormState>(defaultForm);
  const [existingProfile, setExistingProfile] = useState<ConnectionProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForm(defaultForm);
      setExistingProfile(null);
      setTestResult(null);
      setShowPassword(false);
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

  const handleTestConnection = useCallback(async () => {
    const host = form.host.trim();
    const username = form.username.trim();
    if (!host || !username) {
      setTestResult({ ok: false, message: t('connections.editor.testRequired') });
      return;
    }
    const port = Math.min(65535, Math.max(1, parseInt(form.port, 10) || 22));
    const existingSsh = existingProfile?.sshConfig;
    const auth = buildAuth(form, existingSsh);
    const sshConfig: SSHConnectOptions = { host, port, username, auth };

    setTesting(true);
    setTestResult(null);
    try {
      const info = await window.api.ssh.connect(sshConfig);
      await window.api.ssh.disconnect(info.sessionId);
      setTestResult({ ok: true, message: t('connections.editor.testSuccess', { host, port }) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  }, [form, existingProfile, t]);

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
    <div className="dialog-overlay" onClick={closeEditor}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>{editing ? t('connections.editor.titleEdit') : t('connections.editor.titleNew')}</h2>
          <button type="button" className="close-btn" onClick={closeEditor}>
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
        <div className="dialog-body">
          <div className="form-group">
            <label className="form-label">{t('connections.editor.name')}</label>
            <input className="form-input" placeholder={t('connections.editor.namePlaceholder')} value={form.name} onChange={(e) => update({ name: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">{t('connections.editor.group')}</label>
            <input className="form-input" placeholder={t('connections.editor.groupPlaceholder')} value={form.group} onChange={(e) => update({ group: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 3 }}>
              <label className="form-label">{t('connections.editor.host')}</label>
              <input className="form-input" placeholder={t('connections.editor.hostPlaceholder')} value={form.host} onChange={(e) => update({ host: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('connections.editor.port')}</label>
              <input className="form-input" placeholder="22" value={form.port} onChange={(e) => update({ port: e.target.value })} inputMode="numeric" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('connections.editor.username')}</label>
            <input className="form-input" placeholder={t('connections.editor.usernamePlaceholder')} value={form.username} onChange={(e) => update({ username: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('connections.editor.auth')}</label>
            <div className="auth-tabs">
              <button type="button" className={`auth-tab ${form.authType === 'password' ? 'active' : ''}`} onClick={() => update({ authType: 'password' })}>{t('connections.editor.authPassword')}</button>
              <button type="button" className={`auth-tab ${form.authType === 'publicKey' ? 'active' : ''}`} onClick={() => update({ authType: 'publicKey' })}>{t('connections.editor.authKeyFile')}</button>
              <button type="button" className={`auth-tab ${form.authType === 'agent' ? 'active' : ''}`} onClick={() => update({ authType: 'agent' })}>{t('connections.editor.authAgent')}</button>
            </div>
          </div>
          {form.authType === 'password' && (
            <div className="form-group">
              <label className="form-label">{t('connections.editor.password')}</label>
              <div className="input-with-action">
                <input className="form-input" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => update({ password: e.target.value })} placeholder={editing ? t('connections.editor.passwordKeepSaved') : ''} autoComplete="off" />
                <button type="button" className="input-action-btn" onClick={() => setShowPassword((v) => !v)} title={showPassword ? t('connections.editor.hidePassword') : t('connections.editor.showPassword')}>
                  <span className="material-symbols-rounded">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>
          )}
          {form.authType === 'publicKey' && (
            <div className="form-group">
              <label className="form-label">{t('connections.editor.keyPath')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" style={{ flex: 1 }} value={form.keyPath} onChange={(e) => update({ keyPath: e.target.value })} placeholder={t('connections.editor.keyPathPlaceholder')} />
                <button type="button" className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}>{t('connections.editor.browse')}</button>
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t('connections.editor.jumpHost')}</label>
            <select className="form-select">
              <option>{t('connections.editor.jumpNone')}</option>
              <option>bastion-01 (10.0.0.5)</option>
              <option>bastion-02 (10.0.0.6)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('connections.editor.tags')}</label>
            <input className="form-input" value={form.tags} onChange={(e) => update({ tags: e.target.value })} placeholder={t('connections.editor.tagsPlaceholder')} />
          </div>
        </div>
        {testResult && (
          <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>
            <span className="material-symbols-rounded">{testResult.ok ? 'check_circle' : 'error'}</span>
            {testResult.message}
          </div>
        )}
        <div className="dialog-footer">
          <button type="button" className="btn btn-ghost" onClick={() => void handleTestConnection()} disabled={testing || saving}>
            {testing ? t('connections.editor.testing') : t('connections.editor.testConnection')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={closeEditor} disabled={saving}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t('connections.editor.saving') : t('connections.editor.saveConnect')}
          </button>
        </div>
      </div>
    </div>
  );
}
