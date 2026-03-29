import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLayoutStore } from '../../stores/layout-store';
import { useAIStore } from '../../stores/ai-store';

const PANEL_TABS = [
  { labelKey: 'layout.aiChat', icon: 'smart_toy' },
  { labelKey: 'layout.output', icon: 'output' },
  { labelKey: 'layout.problems', icon: 'bug_report', badge: 3 },
] as const;

const OUTPUT_LINES: Array<{ ts: string; level: 'info' | 'warn' | 'err'; text: string }> = [
  { ts: '[14:32:01]', level: 'info', text: 'SSH connection established to web-server-01 (10.0.1.12)' },
  { ts: '[14:32:01]', level: 'info', text: 'Shell type detected: bash 5.1.16' },
  { ts: '[14:32:05]', level: 'info', text: 'SSH connection established to web-server-02 (10.0.1.13)' },
  { ts: '[14:32:12]', level: 'warn', text: 'Disk usage on web-server-01:/data exceeds 80% (82%)' },
  { ts: '[14:33:45]', level: 'info', text: 'SFTP session opened for web-server-01' },
  { ts: '[14:34:02]', level: 'info', text: 'Extension loaded: Docker Manager v2.1.0' },
  { ts: '[14:34:02]', level: 'info', text: 'Extension loaded: Redis Client v1.3.2' },
  { ts: '[14:34:03]', level: 'warn', text: 'Extension "Git Graph" has a newer version available (v3.1.0)' },
  { ts: '[14:35:10]', level: 'err', text: 'Connection to staging-app (10.0.2.10) timed out after 30s' },
];

const LOG_LEVEL_CLASS = { info: 'log-info', warn: 'log-warn', err: 'log-err' } as const;

export function PanelArea(): React.ReactElement {
  const { t } = useTranslation();
  const visible = useLayoutStore((s) => s.panelVisible);
  const height = useLayoutStore((s) => s.panelHeight);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [input, setInput] = useState('');
  const [aiModel, setAiModel] = useState('claude-4-sonnet');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useAIStore((s) => s.messages);
  const sendMessage = useAIStore((s) => s.sendMessage);
  const streaming = useAIStore((s) => s.isStreaming);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void sendMessage(text);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [input, streaming, sendMessage]);

  if (!visible) return <></>;

  const collapsed = !panelExpanded;

  return (
    <div
      className={`panel-area${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { height }}
    >
      <div className="panel-tabs">
        {PANEL_TABS.map((tab, i) => (
          <button
            key={tab.labelKey}
            type="button"
            className={`panel-tab ${i === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>{tab.icon}</span>
            {t(tab.labelKey)}
            {'badge' in tab && tab.badge > 0 && <span className="panel-badge">{tab.badge}</span>}
          </button>
        ))}
        <div className="panel-spacer" />
        <button
          type="button"
          className="panel-action"
          onClick={() => setPanelExpanded((e) => !e)}
          title={t('layout.togglePanel')}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
            {panelExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        <button type="button" className="panel-action" onClick={togglePanel} title={t('layout.closePanel')}>
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>
      <div
        className="panel-body"
        style={
          activeTab === 0
            ? { padding: 0 }
            : activeTab === 1 || activeTab === 2
              ? { padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }
              : undefined
        }
      >
        {activeTab === 0 ? (
          <div className="ai-chat">
            <div className="ai-messages">
              {messages.length === 0 ? (
                <div className="sidebar-placeholder" style={{ padding: '40px 0' }}>
                  {t('layout.askAi')}
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`ai-msg ${msg.role === 'user' ? 'user' : 'bot'}`}>
                    <div className="avatar">{msg.role === 'user' ? 'U' : 'AI'}</div>
                    <div className="bubble">{msg.content}</div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="ai-input-bar">
              <select
                className="ai-model-select"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                aria-label="AI model"
              >
                <option value="claude-4-sonnet">claude-4-sonnet</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="deepseek-v3">deepseek-v3</option>
              </select>
              <input
                type="text"
                placeholder={t('layout.askAi')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                disabled={streaming}
              />
              <button type="button" className="send" onClick={handleSend} disabled={streaming}>
                <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_upward</span>
              </button>
            </div>
          </div>
        ) : activeTab === 1 ? (
          <div className="output-log">
            {OUTPUT_LINES.map((line) => (
              <div key={`${line.ts}-${line.text}`}>
                <span className="ts">{line.ts}</span>
                {' '}
                <span className={LOG_LEVEL_CLASS[line.level]}>
                  {line.level === 'info' ? 'INFO' : line.level === 'warn' ? 'WARN' : 'ERROR'}
                </span>
                {'  '}
                {line.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="problems-list">
            <div className="problem-row">
              <span className="material-symbols-rounded" style={{ color: 'var(--yellow)' }}>warning</span>
              <span>Disk usage on /data exceeds 80% threshold</span>
              <span className="p-file">web-server-01</span>
            </div>
            <div className="problem-row">
              <span className="material-symbols-rounded" style={{ color: 'var(--red)' }}>error</span>
              <span>Connection failed: staging-app (10.0.2.10) — timeout</span>
              <span className="p-file">Connections</span>
            </div>
            <div className="problem-row">
              <span className="material-symbols-rounded" style={{ color: 'var(--yellow)' }}>warning</span>
              <span>SSL certificate for web-server-02 expires in 14 days</span>
              <span className="p-file">web-server-02</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
