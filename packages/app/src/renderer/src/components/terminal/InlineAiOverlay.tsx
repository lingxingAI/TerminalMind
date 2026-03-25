import React from 'react';
import type { InlineAiMode } from '../../hooks/useInlineAi';

export interface InlineAiOverlayProps {
  readonly mode: InlineAiMode;
  readonly prompt: string;
  readonly generatedCommand: string;
  readonly error: string | null;
}

function highlightShellCommand(cmd: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const tokenRe = /(\|+|&&|\|\||;|`[^`]*`|"[^"]*"|'[^']*'|\S+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = tokenRe.exec(cmd)) !== null) {
    if (m.index > last) {
      parts.push(cmd.slice(last, m.index));
    }
    const t = m[0];
    let cls = 'inline-ai-cmd-word';
    if (t === '|' || t === '||' || t === '&&' || t === ';') {
      cls = 'inline-ai-cmd-op';
    } else if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) || t.startsWith('`')) {
      cls = 'inline-ai-cmd-string';
    }
    parts.push(
      <span key={k++} className={cls}>
        {t}
      </span>,
    );
    last = m.index + t.length;
  }
  if (last < cmd.length) {
    parts.push(cmd.slice(last));
  }
  return parts.length > 0 ? parts : cmd;
}

export function InlineAiOverlay({
  mode,
  prompt,
  generatedCommand,
  error,
}: InlineAiOverlayProps): React.ReactElement | null {
  if (mode === 'normal') {
    return null;
  }

  return (
    <div className="inline-ai-overlay" aria-live="polite">
      <div className="inline-ai-overlay-inner">
        {mode === 'composing' && (
          <>
            <div className="inline-ai-overlay-header">
              <span className="inline-ai-icon" aria-hidden>
                ✦
              </span>
              <span className="inline-ai-title">Inline AI</span>
            </div>
            <div className="inline-ai-prompt-line">
              <span className="inline-ai-prefix">? </span>
              <span className="inline-ai-prompt-text">{prompt || '\u00a0'}</span>
            </div>
            {error ? <div className="inline-ai-error">{error}</div> : null}
            <div className="inline-ai-hint">Press Enter to generate, Esc to cancel</div>
          </>
        )}
        {mode === 'waiting' && (
          <>
            <div className="inline-ai-overlay-header">
              <span className="inline-ai-spinner" aria-hidden />
              <span className="inline-ai-title">Inline AI</span>
            </div>
            <div className="inline-ai-waiting-text">Generating command…</div>
          </>
        )}
        {mode === 'preview' && (
          <>
            <div className="inline-ai-overlay-header">
              <span className="inline-ai-icon" aria-hidden>
                ✦
              </span>
              <span className="inline-ai-title">Command preview</span>
            </div>
            <pre className="inline-ai-command-block">
              <code>{highlightShellCommand(generatedCommand)}</code>
            </pre>
            <div className="inline-ai-hint">Enter to execute, Esc to cancel, Tab to edit</div>
          </>
        )}
      </div>
    </div>
  );
}
