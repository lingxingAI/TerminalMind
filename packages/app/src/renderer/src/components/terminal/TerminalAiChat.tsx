import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTerminalAiChatStore, type ChatMessage } from '../../stores/terminal-ai-chat-store';

/* ------------------------------------------------------------------ */
/*  Code block parsing                                                 */
/* ------------------------------------------------------------------ */

interface ContentSegment {
  type: 'text' | 'code';
  content: string;
  lang?: string;
}

const CODE_FENCE_RE = /```(\w*)\n?([\s\S]*?)```/g;

function parseContent(raw: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of raw.matchAll(CODE_FENCE_RE)) {
    const before = raw.slice(lastIndex, match.index);
    if (before) segments.push({ type: 'text', content: before });
    segments.push({ type: 'code', content: match[2].trimEnd(), lang: match[1] || undefined });
    lastIndex = (match.index ?? 0) + match[0].length;
  }

  const tail = raw.slice(lastIndex);
  if (tail) segments.push({ type: 'text', content: tail });
  return segments;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CodeBlock({ code }: { code: string }): React.ReactElement {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = useCallback(() => {
    window.api.clipboard.writeText(code);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [code]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="tac-code-block">
      <pre><code>{code}</code></pre>
      <button
        type="button"
        className="tac-copy-btn"
        onClick={handleCopy}
        title={copied ? t('ai.chat.copied') : t('ai.chat.copyCommand')}
      >
        <span className="material-symbols-rounded">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }): React.ReactElement {
  const isUser = msg.role === 'user';
  const segments = isUser ? [{ type: 'text' as const, content: msg.content }] : parseContent(msg.content);

  return (
    <div className={`tac-msg ${isUser ? 'user' : 'bot'}`}>
      <div className="tac-msg-avatar">
        <span className="material-symbols-rounded">
          {isUser ? 'person' : 'smart_toy'}
        </span>
      </div>
      <div className="tac-msg-bubble">
        {segments.map((seg, i) =>
          seg.type === 'code' ? (
            <CodeBlock key={i} code={seg.content} />
          ) : (
            <span key={i} className="tac-msg-text">{seg.content}</span>
          ),
        )}
      </div>
    </div>
  );
}

function StreamingBubble({ content }: { content: string }): React.ReactElement {
  const segments = parseContent(content);
  return (
    <div className="tac-msg bot">
      <div className="tac-msg-avatar">
        <span className="material-symbols-rounded">smart_toy</span>
      </div>
      <div className="tac-msg-bubble">
        {segments.length > 0
          ? segments.map((seg, i) =>
              seg.type === 'code' ? (
                <CodeBlock key={i} code={seg.content} />
              ) : (
                <span key={i} className="tac-msg-text">{seg.content}</span>
              ),
            )
          : <span className="tac-msg-text tac-streaming-dots">●●●</span>}
        <span className="tac-cursor-blink" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TerminalAiChat(): React.ReactElement | null {
  const { t } = useTranslation();
  const visible = useTerminalAiChatStore((s) => s.visible);
  const selectedText = useTerminalAiChatStore((s) => s.selectedText);
  const context = useTerminalAiChatStore((s) => s.context);
  const messages = useTerminalAiChatStore((s) => s.messages);
  const streamingContent = useTerminalAiChatStore((s) => s.streamingContent);
  const isStreaming = useTerminalAiChatStore((s) => s.isStreaming);
  const error = useTerminalAiChatStore((s) => s.error);

  const close = useTerminalAiChatStore((s) => s.close);
  const sendMessage = useTerminalAiChatStore((s) => s.sendMessage);
  const cancelStream = useTerminalAiChatStore((s) => s.cancelStream);
  const clearChat = useTerminalAiChatStore((s) => s.clearChat);

  const [input, setInput] = useState('');
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      setInput('');
      setContextCollapsed(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, close]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    sendMessage(trimmed);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!visible) return null;

  const osLabel = context?.os === 'win32' ? 'Windows' : context?.os === 'darwin' ? 'macOS' : 'Linux';
  const shellLabel = context?.shell?.split('/').pop() ?? context?.shell ?? 'shell';

  return (
    <div
      className="terminal-ai-chat"
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="tac-header">
        <div className="tac-header-left">
          <span className="material-symbols-rounded tac-header-icon">smart_toy</span>
          <span className="tac-header-title">{t('ai.chat.title')}</span>
          <span className="tac-badge">{osLabel}</span>
          <span className="tac-badge">{shellLabel}</span>
        </div>
        <div className="tac-header-right">
          <button
            type="button"
            className="tac-icon-btn"
            onClick={clearChat}
            title={t('ai.chat.clearChat')}
          >
            <span className="material-symbols-rounded">delete_sweep</span>
          </button>
          <button
            type="button"
            className="tac-icon-btn"
            onClick={close}
            title={t('ai.chat.closeEsc')}
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
      </div>

      {/* Selected context */}
      <div className="tac-context">
        <button
          type="button"
          className="tac-context-toggle"
          onClick={() => setContextCollapsed(!contextCollapsed)}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>
            {contextCollapsed ? 'expand_more' : 'expand_less'}
          </span>
          <span>{t('ai.chat.selectedContent')}</span>
        </button>
        {!contextCollapsed && (
          <pre className="tac-context-code">{selectedText}</pre>
        )}
      </div>

      {/* Messages */}
      <div className="tac-messages">
        {messages.length === 0 && !isStreaming && (
          <div className="tac-empty">
            <span className="material-symbols-rounded" style={{ fontSize: 32, opacity: 0.3 }}>
              chat_bubble_outline
            </span>
            <p>描述你的需求，AI 将结合选中内容为你推荐命令</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isStreaming && <StreamingBubble content={streamingContent} />}
        {error && (
          <div className="tac-error">
            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>error</span>
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="tac-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="tac-input"
          placeholder={t('ai.chat.inputPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button type="button" className="tac-send-btn cancel" onClick={cancelStream} title={t('ai.chat.stopGeneration')}>
            <span className="material-symbols-rounded">stop</span>
          </button>
        ) : (
          <button
            type="button"
            className="tac-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            title={t('ai.chat.send')}
          >
            <span className="material-symbols-rounded">send</span>
          </button>
        )}
      </div>
    </div>
  );
}
