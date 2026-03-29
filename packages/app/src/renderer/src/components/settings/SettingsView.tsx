import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIModelInfo } from '@terminalmind/api';
import { useThemeStore } from '../../stores/theme-store';
import type { ThemeMode } from '../../stores/theme-store';
import { useTerminalSettingsStore } from '../../stores/terminal-settings-store';
import { supportedLanguages } from '../../i18n';
import type { SupportedLanguage } from '../../i18n';

const NAV_ITEMS = [
  { id: 'general', labelKey: 'settings.general', icon: 'tune' },
  { id: 'terminal', labelKey: 'settings.terminal', icon: 'terminal' },
  { id: 'appearance', labelKey: 'settings.appearance', icon: 'palette' },
  { id: 'ai', labelKey: 'settings.ai', icon: 'smart_toy' },
  { id: 'ssh', labelKey: 'settings.ssh', icon: 'vpn_key' },
  { id: 'keybindings', labelKey: 'settings.keybindings', icon: 'keyboard' },
  { id: 'extensions', labelKey: 'settings.extensions', icon: 'extension' },
  { id: 'privacy', labelKey: 'settings.privacy', icon: 'shield' },
] as const;

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }): React.ReactElement {
  return (
    <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={onClick}>
      <div className="thumb" />
    </button>
  );
}

const THEME_OPTIONS: { value: ThemeMode; labelKey: string; icon: string }[] = [
  { value: 'dark', labelKey: 'settings.themeDark', icon: 'dark_mode' },
  { value: 'light', labelKey: 'settings.themeLight', icon: 'light_mode' },
];


function AppearanceSection(): React.ReactElement {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="settings-section">
      <h3>{t('settings.appearance')}</h3>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.theme')}</div>
          <div className="setting-desc">{t('settings.themeDesc')}</div>
        </div>
        <div className="setting-control">
          <div className="theme-selector">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`theme-option ${theme === opt.value ? 'active' : ''}`}
                onClick={() => setTheme(opt.value)}
              >
                <span className="material-symbols-rounded">{opt.icon}</span>
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsView(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const [activeNav, setActiveNav] = useState('general');
  const [startMinimized, setStartMinimized] = useState(false);
  const [restoreSessions, setRestoreSessions] = useState(true);
  const [language, setLanguage] = useState<SupportedLanguage>(i18n.language as SupportedLanguage);
  const termSettings = useTerminalSettingsStore();
  const {
    defaultShellPath, shells, fontFamily, fontSize, scrollback, copyOnSelect, availableFonts,
    setDefaultShellPath, setFontFamily, setFontSize, setScrollback, setCopyOnSelect,
  } = termSettings;

  const [aiBaseUrl, setAiBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiModels, setAiModels] = useState<readonly AIModelInfo[]>([]);
  const [aiDefaultModel, setAiDefaultModel] = useState('');
  const [aiModelsLoading, setAiModelsLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [sm, rs] = await Promise.all([
        window.api.config.get<boolean>('general.startMinimized', false),
        window.api.config.get<boolean>('general.restoreSessions', true),
      ]);
      setStartMinimized(sm);
      setRestoreSessions(rs);
    })();
  }, []);

  const toggleSetting = useCallback(
    (key: string, setter: React.Dispatch<React.SetStateAction<boolean>>) => {
      setter((prev) => {
        const next = !prev;
        void window.api.config.set(key, next);
        return next;
      });
    },
    [],
  );

  const handleLanguageChange = useCallback(
    (lang: SupportedLanguage) => {
      setLanguage(lang);
      void i18n.changeLanguage(lang);
      void window.api.config.set('general.language', lang);
    },
    [i18n],
  );

  const loadAiSettings = useCallback(async () => {
    try {
      const settings = await window.api.ai.getSettings();
      setAiBaseUrl(settings.baseUrl || 'https://openrouter.ai/api/v1');
      setAiDefaultModel(settings.defaultModel);
      setAiApiKeyMasked(true);
      setAiApiKey('');
    } catch { /* ignore */ }
  }, []);

  const loadAiModels = useCallback(async () => {
    setAiModelsLoading(true);
    try {
      const list = await window.api.ai.listModels();
      setAiModels(list);
    } catch {
      setAiModels([]);
    } finally {
      setAiModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeNav === 'ai') {
      void loadAiSettings();
      void loadAiModels();
    }
  }, [activeNav, loadAiSettings, loadAiModels]);

  const handleAiSave = useCallback(async () => {
    try {
      await window.api.ai.updateSettings({
        baseUrl: aiBaseUrl.trim(),
        defaultModel: aiDefaultModel,
      });
      if (aiApiKey.trim()) {
        await window.api.ai.setApiKey('openrouter', aiApiKey.trim());
      }
      setAiApiKeyMasked(true);
      setAiApiKey('');
      setShowApiKey(false);
    } catch (e) {
      console.error('Failed to save AI settings:', e);
    }
  }, [aiBaseUrl, aiDefaultModel, aiApiKey]);

  return (
    <div className="settings-view">
      <div className="settings-nav">
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`settings-nav-item ${activeNav === item.id ? 'active' : ''}`}
            onClick={() => setActiveNav(item.id)}
          >
            <span className="material-symbols-rounded">{item.icon}</span>
            {t(item.labelKey)}
          </div>
        ))}
      </div>
      <div className="settings-content">
        {activeNav === 'general' && (
          <div className="settings-section">
            <h3>{t('settings.general')}</h3>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.language')}</div>
                <div className="setting-desc">{t('settings.languageDesc')}</div>
              </div>
              <div className="setting-control">
                <select
                  className="form-select"
                  style={{ width: 160 }}
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
                >
                  {supportedLanguages.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.startMinimized')}</div>
                <div className="setting-desc">{t('settings.startMinimizedDesc')}</div>
              </div>
              <div className="setting-control">
                <Toggle on={startMinimized} onClick={() => toggleSetting('general.startMinimized', setStartMinimized)} />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.restoreSessions')}</div>
                <div className="setting-desc">{t('settings.restoreSessionsDesc')}</div>
              </div>
              <div className="setting-control">
                <Toggle on={restoreSessions} onClick={() => toggleSetting('general.restoreSessions', setRestoreSessions)} />
              </div>
            </div>
          </div>
        )}
        {activeNav === 'terminal' && (
          <div className="settings-section">
            <h3>{t('settings.terminal')}</h3>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.defaultShell')}</div>
                <div className="setting-desc">{t('settings.defaultShellDesc')}</div>
              </div>
              <div className="setting-control">
                <select
                  className="form-select"
                  style={{ width: 200 }}
                  value={defaultShellPath}
                  onChange={(e) => setDefaultShellPath(e.target.value)}
                >
                  <option value="">{t('settings.systemDefault')}</option>
                  {shells.map((s) => (
                    <option key={s.id} value={s.path}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.fontFamily')}</div>
                <div className="setting-desc">{t('settings.fontFamilyDesc')}</div>
              </div>
              <div className="setting-control">
                <select
                  className="form-select"
                  style={{ width: 200 }}
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                >
                  {availableFonts.map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.fontSize')}</div>
                <div className="setting-desc">{t('settings.fontSizeDesc')}</div>
              </div>
              <div className="setting-control">
                <input
                  className="form-input"
                  type="number"
                  min={8}
                  max={72}
                  style={{ width: 80, textAlign: 'center' }}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.scrollbackLines')}</div>
                <div className="setting-desc">{t('settings.scrollbackLinesDesc')}</div>
              </div>
              <div className="setting-control">
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={100000}
                  style={{ width: 80, textAlign: 'center' }}
                  value={scrollback}
                  onChange={(e) => setScrollback(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.copyOnSelect')}</div>
                <div className="setting-desc">{t('settings.copyOnSelectDesc')}</div>
              </div>
              <div className="setting-control">
                <Toggle on={copyOnSelect} onClick={() => setCopyOnSelect(!copyOnSelect)} />
              </div>
            </div>
          </div>
        )}
        {activeNav === 'ai' && (
          <div className="settings-section">
            <h3>{t('settings.aiConfig')}</h3>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.apiEndpoint')}</div>
                <div className="setting-desc">{t('settings.apiEndpointDesc')}</div>
              </div>
              <div className="setting-control">
                <input
                  className="form-input"
                  style={{ width: 320 }}
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.apiKey')}</div>
                <div className="setting-desc">{t('settings.apiKeyDesc')}</div>
              </div>
              <div className="setting-control">
                <div className="input-with-action" style={{ width: 240 }}>
                  <input
                    className="form-input"
                    type={showApiKey ? 'text' : 'password'}
                    value={aiApiKeyMasked && !aiApiKey ? '••••••••' : aiApiKey}
                    onFocus={() => {
                      if (aiApiKeyMasked && !aiApiKey) setAiApiKeyMasked(false);
                    }}
                    onChange={(e) => {
                      setAiApiKeyMasked(false);
                      setAiApiKey(e.target.value);
                    }}
                    placeholder="sk-..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={async () => {
                      if (!showApiKey && aiApiKeyMasked && !aiApiKey) {
                        try {
                          const real = await window.api.ai.getApiKey('openrouter');
                          if (real) {
                            setAiApiKey(real);
                            setAiApiKeyMasked(false);
                          }
                        } catch { /* ignore */ }
                      }
                      setShowApiKey((v) => !v);
                    }}
                    title={showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                  >
                    <span className="material-symbols-rounded">{showApiKey ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('settings.defaultModel')}</div>
                <div className="setting-desc">{t('settings.defaultModelDesc')}</div>
              </div>
              <div className="setting-control">
                <select
                  className="form-select"
                  style={{ width: 240 }}
                  value={aiDefaultModel}
                  onChange={(e) => setAiDefaultModel(e.target.value)}
                  disabled={aiModelsLoading}
                >
                  {aiModelsLoading && <option value="">{t('settings.loadingModels')}</option>}
                  {!aiModelsLoading && aiModels.length === 0 && (
                    <option value={aiDefaultModel}>{aiDefaultModel || t('settings.noModels')}</option>
                  )}
                  {aiModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleAiSave()}
              >
                {t('settings.saveAiSettings')}
              </button>
            </div>
          </div>
        )}
        {activeNav === 'appearance' && <AppearanceSection />}
        {!['general', 'terminal', 'ai', 'appearance'].includes(activeNav) && (
          <div className="settings-section">
            <h3>{t(`settings.${activeNav}` as never)}</h3>
            <div className="sidebar-placeholder" style={{ padding: '40px 0' }}>
              {t('common.comingSoon')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
