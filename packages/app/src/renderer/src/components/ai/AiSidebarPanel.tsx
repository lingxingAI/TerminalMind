import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIModelInfo } from '@terminalmind/api';
import { useAIStore } from '../../stores/ai-store';
import { AiSettingsForm } from './AiSettingsForm';

export function AiSidebarPanel(): React.ReactElement {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [models, setModels] = useState<readonly AIModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useAIStore((s) => s.messages);
  const streamingContent = useAIStore((s) => s.streamingContent);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const error = useAIStore((s) => s.error);
  const sendMessage = useAIStore((s) => s.sendMessage);
  const clearConversation = useAIStore((s) => s.clearConversation);
  const setError = useAIStore((s) => s.setError);

  useEffect(() => {
    if (settingsOpen) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const s = await window.api.ai.getSettings();
        if (!cancelled) {
          setSelectedModel(s.defaultModel);
        }
        const list = await window.api.ai.listModels();
        if (!cancelled) {
          setModels(list);
        }
      } catch {
        if (!cancelled) {
          setModels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsOpen]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(scrollToBottom, 50);
    return () => window.clearTimeout(t);
  }, [messages, streamingContent, isStreaming, scrollToBottom]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) {
      return;
    }
    setInput('');
    void sendMessage(text);
  }, [input, isStreaming, sendMessage]);

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedModel(id);
    void window.api.ai.updateSettings({ defaultModel: id }).catch(() => {});
  }, []);

  const modelSelectOptions = useMemo(() => {
    const ids = new Set(models.map((m) => m.id));
    const opts = models.map((m) => (
      <option key={m.id} value={m.id}>
        {m.name}
      </option>
    ));
    if (selectedModel && !ids.has(selectedModel)) {
      opts.unshift(
        <option key={selectedModel} value={selectedModel}>
          {selectedModel}
        </option>,
      );
    }
    return opts;
  }, [models, selectedModel]);

  const showStreamingBubble = isStreaming;
  const hasListContent = messages.length > 0 || showStreamingBubble;

  return (
    <div className="ai-sidebar">
      <div className="sidebar-header">
        <h2>{t('ai.sidebar.title')}</h2>
        <div className="sb-actions">
          <button
            type="button"
            title={t('ai.sidebar.newChat')}
            aria-label={t('ai.sidebar.newChat')}
            onClick={() => {
              clearConversation();
              setHistoryOpen(false);
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
              add
            </span>
          </button>
          <button
            type="button"
            title={t('ai.sidebar.history')}
            aria-label={t('ai.sidebar.history')}
            onClick={() => setHistoryOpen((o) => !o)}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
              history
            </span>
          </button>
          <button
            type="button"
            title={t('ai.sidebar.settings')}
            aria-label={t('ai.sidebar.settings')}
            onClick={() => setSettingsOpen(true)}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
              settings
            </span>
          </button>
        </div>
      </div>

      {historyOpen ? (
        <div
          className="sidebar-placeholder"
          style={{
            padding: '10px 14px 14px',
            textAlign: 'left',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <p style={{ margin: '0 0 10px', lineHeight: 1.45 }}>{t('ai.sidebar.historyPlaceholder')}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setHistoryOpen(false)}>
            {t('ai.sidebar.dismiss')}
          </button>
        </div>
      ) : null}

      <div className="ai-messages">
        {!hasListContent ? (
          <div className="sidebar-placeholder" style={{ padding: '40px 14px' }}>
            {t('ai.sidebar.emptyPrompt')}
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const rowClass = isUser ? 'user' : 'bot';
              const avatar = isUser ? t('ai.sidebar.avatarUser') : t('ai.sidebar.avatarBot');
              return (
                <div key={msg.id} className={`ai-msg ${rowClass}`}>
                  <div className="avatar" aria-hidden>
                    {avatar}
                  </div>
                  <div className="bubble">{msg.content}</div>
                </div>
              );
            })}
            {showStreamingBubble ? (
              <div className="ai-msg bot">
                <div className="avatar" aria-hidden>
                  {t('ai.sidebar.avatarBot')}
                </div>
                <div className="bubble">
                  {streamingContent.length > 0 ? streamingContent : '…'}
                </div>
              </div>
            ) : null}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error ? (
        <div
          style={{
            padding: '8px 14px',
            fontSize: 11,
            color: 'var(--red)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ flex: 1, lineHeight: 1.4 }}>{error}</span>
          <button
            type="button"
            className="sidebar-header-action"
            title={t('ai.sidebar.dismissError')}
            aria-label={t('ai.sidebar.dismissError')}
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="ai-input-bar">
        <select
          className="ai-model-select"
          aria-label={t('ai.sidebar.modelAria')}
          value={selectedModel}
          onChange={handleModelChange}
          disabled={isStreaming}
        >
          {modelSelectOptions.length > 0 ? (
            modelSelectOptions
          ) : (
            <option value={selectedModel || ''}>{selectedModel || t('ai.sidebar.defaultModel')}</option>
          )}
        </select>
        <input
          type="text"
          placeholder={t('ai.sidebar.inputPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSend();
            }
          }}
          disabled={isStreaming}
        />
        <button
          type="button"
          className="send"
          title={t('ai.sidebar.send')}
          aria-label={t('ai.sidebar.send')}
          onClick={handleSend}
          disabled={isStreaming}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
            arrow_upward
          </span>
        </button>
      </div>

      <AiSettingsForm open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
