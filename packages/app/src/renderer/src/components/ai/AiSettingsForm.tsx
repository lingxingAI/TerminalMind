import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AIModelInfo, AISettings } from '@terminalmind/api';

const OPENROUTER_ID = 'openrouter';

export interface AiSettingsFormProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function AiSettingsForm({ open, onClose }: AiSettingsFormProps): React.ReactElement | null {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<readonly AIModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState(OPENROUTER_ID);
  const [defaultModel, setDefaultModel] = useState('openai/gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [recentCommandsCount, setRecentCommandsCount] = useState(5);
  const [includeRecentOutput, setIncludeRecentOutput] = useState(false);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const list = await window.api.ai.listModels();
      setModels(list);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const s = await window.api.ai.getSettings();
        if (cancelled) {
          return;
        }
        setActiveProviderId(s.activeProviderId);
        setDefaultModel(s.defaultModel);
        setTemperature(s.temperature);
        setMaxTokens(s.maxTokens);
        setSystemPrompt(s.systemPrompt);
        setIncludeContext(s.includeContext);
        setRecentCommandsCount(s.recentCommandsCount);
        setIncludeRecentOutput(s.includeRecentOutput);
        setApiKey('');
        setModelQuery('');
        await loadModels();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loadModels]);

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) {
      return [...models];
    }
    return models.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }, [models, modelQuery]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<AISettings> = {
        activeProviderId,
        defaultModel,
        temperature,
        maxTokens,
        systemPrompt,
        includeContext,
        recentCommandsCount,
        includeRecentOutput,
      };
      await window.api.ai.updateSettings(patch);
      if (apiKey.trim().length > 0) {
        await window.api.ai.setApiKey(OPENROUTER_ID, apiKey.trim());
      }
      await window.api.ai.setActiveProvider(activeProviderId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onOverlayPointerDown = (e: React.PointerEvent): void => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  const selectedModelLabel =
    models.find((m) => m.id === defaultModel)?.name ?? defaultModel;

  return (
    <div
      className="ai-settings-overlay"
      role="presentation"
      onPointerDown={onOverlayPointerDown}
    >
      <div
        className="ai-settings-modal"
        role="dialog"
        aria-labelledby="ai-settings-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="ai-settings-header">
          <h2 id="ai-settings-title">AI settings</h2>
          <button type="button" className="ai-settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ai-settings-body">
          {loading ? (
            <div className="ai-settings-loading">Loading…</div>
          ) : (
            <>
              {error ? <div className="ai-settings-error">{error}</div> : null}

              <label className="ai-settings-label">
                Provider
                <select
                  className="ai-settings-select"
                  value={activeProviderId}
                  onChange={(e) => setActiveProviderId(e.target.value)}
                >
                  <option value={OPENROUTER_ID}>OpenRouter</option>
                </select>
              </label>

              <label className="ai-settings-label">
                API key
                <div className="ai-settings-key-row">
                  <input
                    className="ai-settings-input"
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    placeholder="Leave blank to keep existing key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ai-settings-toggle-key"
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <label className="ai-settings-label">
                Default model
                <div className="ai-model-dropdown">
                  <input
                    type="text"
                    className="ai-settings-input"
                    placeholder={modelsLoading ? 'Loading models…' : 'Search models…'}
                    value={modelMenuOpen ? modelQuery : selectedModelLabel}
                    onChange={(e) => {
                      setModelQuery(e.target.value);
                      setModelMenuOpen(true);
                    }}
                    onFocus={() => {
                      setModelMenuOpen(true);
                      setModelQuery('');
                    }}
                    disabled={modelsLoading}
                  />
                  {modelMenuOpen ? (
                    <div className="ai-model-dropdown-list">
                      {filteredModels.length === 0 ? (
                        <div className="ai-model-dropdown-empty">
                          {modelsLoading ? 'Loading…' : 'No matches'}
                        </div>
                      ) : (
                        filteredModels.slice(0, 80).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`ai-model-dropdown-item ${m.id === defaultModel ? 'selected' : ''}`}
                            onClick={() => {
                              setDefaultModel(m.id);
                              setModelMenuOpen(false);
                              setModelQuery('');
                            }}
                          >
                            <span className="ai-model-dropdown-name">{m.name}</span>
                            <span className="ai-model-dropdown-meta">
                              {m.contextLength !== undefined ? `${m.contextLength} ctx` : m.id}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="ai-settings-label">
                Temperature ({temperature.toFixed(1)})
                <input
                  type="range"
                  className="ai-settings-range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number.parseFloat(e.target.value))}
                />
              </label>

              <label className="ai-settings-label">
                Max tokens
                <input
                  type="number"
                  className="ai-settings-input"
                  min={1}
                  max={200000}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number.parseInt(e.target.value, 10) || 2048)}
                />
              </label>

              <label className="ai-settings-label">
                System prompt
                <textarea
                  className="ai-settings-textarea"
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Optional custom system prompt"
                />
              </label>

              <label className="ai-settings-check">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                />
                Include terminal context (OS, shell, cwd, recent commands)
              </label>

              <label className="ai-settings-label">
                Recent commands count
                <input
                  type="number"
                  className="ai-settings-input"
                  min={0}
                  max={50}
                  value={recentCommandsCount}
                  onChange={(e) =>
                    setRecentCommandsCount(Number.parseInt(e.target.value, 10) || 0)
                  }
                />
              </label>

              <label className="ai-settings-check">
                <input
                  type="checkbox"
                  checked={includeRecentOutput}
                  onChange={(e) => setIncludeRecentOutput(e.target.checked)}
                />
                Include recent terminal output in context
              </label>
            </>
          )}
        </div>

        <div className="ai-settings-footer">
          <button type="button" className="ai-settings-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ai-settings-btn primary"
            disabled={loading || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
