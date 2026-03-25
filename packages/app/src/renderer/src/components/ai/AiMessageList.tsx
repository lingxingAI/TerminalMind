import React, { useCallback, useRef, useEffect } from 'react';
import type { AIMessageDisplay } from '../../stores/ai-store';
import { useTabStore } from '../../stores/tab-store';

export interface AiMessageListProps {
  readonly messages: readonly AIMessageDisplay[];
  readonly isStreaming: boolean;
  readonly streamingContent: string;
}

type Segment = { readonly type: 'text'; readonly content: string } | { readonly type: 'code'; readonly content: string };

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```(?:([\w-]+)\s*)?\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) {
      const raw = text.slice(last, m.index).trim();
      if (raw) {
        segments.push({ type: 'text', content: raw });
      }
    }
    const body = (m[2] ?? '').trim();
    if (body) {
      segments.push({ type: 'code', content: body });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const raw = text.slice(last).trim();
    if (raw) {
      segments.push({ type: 'text', content: raw });
    }
  }
  return segments;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function MessageBody({
  content,
  align,
  showSendToTerminal,
}: {
  readonly content: string;
  readonly align: 'left' | 'right';
  readonly showSendToTerminal: boolean;
}): React.ReactElement {
  const segments = parseSegments(content);
  const activeSessionId = useTabStore((s) => {
    const tab = s.tabs.find((t) => t.isActive);
    return tab?.terminalSessionId ?? null;
  });

  const sendToTerminal = useCallback(
    (cmd: string) => {
      if (!activeSessionId || !cmd.trim()) {
        return;
      }
      window.api.terminal.sendInput(activeSessionId, cmd.endsWith('\n') ? cmd : `${cmd}\n`);
    },
    [activeSessionId],
  );

  if (segments.length === 0) {
    return <span className="ai-msg-text">{content}</span>;
  }

  return (
    <div className={`ai-msg-body ai-msg-body--${align}`}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return (
            <div key={`t-${i}`} className="ai-msg-text-blocks">
              {splitParagraphs(seg.content).map((p, j) => (
                <p key={j} className="ai-msg-paragraph">
                  {p}
                </p>
              ))}
            </div>
          );
        }
        return (
          <div key={`c-${i}`} className="ai-code-block-wrap">
            <div className="ai-code-toolbar">
              <button type="button" className="ai-code-copy" onClick={() => void copyToClipboard(seg.content)}>
                Copy
              </button>
              {showSendToTerminal ? (
                <button
                  type="button"
                  className="ai-code-terminal"
                  disabled={!activeSessionId}
                  title={activeSessionId ? 'Paste into active terminal' : 'No active terminal'}
                  onClick={() => sendToTerminal(seg.content)}
                >
                  Send to Terminal
                </button>
              ) : null}
            </div>
            <pre className="ai-code-pre">
              <code>{seg.content}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
}

export function AiMessageList({
  messages,
  isStreaming,
  streamingContent,
}: AiMessageListProps): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingContent, isStreaming]);

  return (
    <div className="ai-message-list">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`ai-message-row ai-message-row--${m.role === 'user' ? 'user' : 'assistant'}`}
        >
          <div className={`ai-message-bubble ai-message-bubble--${m.role === 'user' ? 'user' : 'assistant'}`}>
            <MessageBody
              content={m.content}
              align={m.role === 'user' ? 'right' : 'left'}
              showSendToTerminal={m.role === 'assistant'}
            />
          </div>
        </div>
      ))}
      {isStreaming ? (
        <div className="ai-message-row ai-message-row--assistant">
          <div className="ai-message-bubble ai-message-bubble--assistant ai-message-bubble--streaming">
            {streamingContent ? (
              <MessageBody content={streamingContent} align="left" showSendToTerminal={false} />
            ) : (
              <div className="ai-typing" aria-label="Generating">
                <span className="ai-typing-dot" />
                <span className="ai-typing-dot" />
                <span className="ai-typing-dot" />
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
