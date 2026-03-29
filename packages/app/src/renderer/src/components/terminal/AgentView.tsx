import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIGenerateCommandResult } from '@terminalmind/api';
import { useTabStore } from '../../stores/tab-store';
import { buildTerminalContext } from '../../hooks/useTerminalContext';

const AI_REQUEST_TIMEOUT_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentSuggestion {
  command: string;
  explanation: string;
  userInput: string;
}

export interface UseAgentModeResult {
  readonly suggestion: AgentSuggestion | null;
  readonly thinking: boolean;
  readonly infoText: string;
  readonly isIdle: boolean;
  readonly hasInput: boolean;
  readonly handleInput: (data: string) => boolean;
  readonly execute: () => void;
  readonly reject: () => void;
  readonly updateCommand: (cmd: string) => void;
  readonly dismissInfo: () => void;
  readonly cancelThinking: () => void;
}

/** Force-AI prefix: user types ? or ？ at start of line to bypass command detection. */
const AI_PREFIX_RE = /^[?？]\s*/;

const IS_LOCAL_WINDOWS =
  typeof navigator !== 'undefined' && /^Win/i.test(navigator.platform ?? '');

/**
 * Build a sequence that reliably clears the shell's input buffer.
 *
 * - SSH / local Unix: Ctrl+U (0x15) — readline erases from cursor to line start.
 * - Local Windows (cmd / PowerShell via ConPTY): individual backspaces (0x7F)
 *   because Ctrl+U is unbound and a bare 0x1B may be mis-parsed as an ANSI
 *   escape-sequence leader by ConPTY.
 */
function buildClearSequence(
  connectionType: 'local' | 'ssh',
  bufferLen: number,
): string {
  if (connectionType === 'local' && IS_LOCAL_WINDOWS) {
    return '\x7f'.repeat(bufferLen);
  }
  return '\x15';
}

const NL_STARTERS_EN =
  /^(how|what|why|where|when|who|which|can\s+(you|i|we)|could\s+(you|i|we)|would\s+(you|i)|should\s+(i|we)|is\s+(there|it|this)|are\s+(there|these|they)|do\s+(i|we|you)|does\s|did\s|will\s|please\s|help\s+me|show\s+me|explain|tell\s+me|describe|i\s+(want|need|would|am|have|don't)|search\s+for|look\s+for|look\s+up|let's|let\s+me|give\s+me)/i;

const NL_PATTERNS_ZH =
  /怎[么样]|什么|为什么|如何|能否|是否|可[以不]|帮我|请问|告诉|解释|查[看找]|显示|列[出举]|哪[个些里]|多少|[吗呢吧啊嘛]$/;

/**
 * Classify user input as natural language (→ AI) or terminal command (→ passthrough).
 *
 * Design: instead of maintaining a hardcoded command list (impossible to keep
 * complete), we detect *natural language* signals and *structural command*
 * patterns. NL is far more stable and recognisable than the infinite set of
 * terminal commands.
 *
 * Users can type ? / ？ at the start of a line to force AI mode for any input.
 */
function classifyInput(text: string): 'ai' | 'command' {
  const t = text.trim();
  if (!t) return 'command';

  if (AI_PREFIX_RE.test(t)) return 'ai';

  /* ---- Strong natural-language signals ---- */

  // First token contains any CJK character → NL (no terminal command starts with Chinese)
  if (/^[^\s]*[\u4e00-\u9fff]/.test(t)) return 'ai';

  if (NL_STARTERS_EN.test(t)) return 'ai';
  if (NL_PATTERNS_ZH.test(t)) return 'ai';

  // Ends with sentence-ending punctuation
  if (/[？?。！!]$/.test(t)) return 'ai';

  /* ---- Strong command signals (structural, not name-based) ---- */

  // Path-based execution: ./  /  ~/  C:\
  if (/^(\.\/|\.\\|\/|~[/\\]|[A-Z]:\\)/i.test(t)) return 'command';

  // Shell operators: pipe, logical AND/OR, semicolon, redirect, subshell
  if (/\|{1,2}|&&|[;<>]|\d+>|\$[({]/.test(t)) return 'command';

  // sudo / doas prefix
  if (/^(sudo|doas)\s/.test(t)) return 'command';

  // Variable assignment: FOO=bar, export FOO=bar
  if (/^(export\s+|set\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(t)) return 'command';

  // Contains flag-like arguments: -x, --flag
  if (/\s+-{1,2}[a-zA-Z]/.test(t)) return 'command';

  // Single token (no whitespace) → almost always a command: ls, pwd, htop, …
  if (/^[a-zA-Z0-9._\/:~\\-]+$/.test(t)) return 'command';

  // Short (≤ 3 tokens), all look like command/arg tokens
  const words = t.split(/\s+/);
  if (words.length <= 3 && words.every((w) => /^[a-zA-Z0-9._\/:~\\"'-]+$/.test(w))) {
    return 'command';
  }

  // Longer all-ASCII text without any command structure → likely NL
  if (words.length >= 5 && !/[|&;<>]/.test(t) && !/\s+-{1,2}[a-zA-Z]/.test(t)) {
    return 'ai';
  }

  // Default: treat short ambiguous input as command (user can retry with ? prefix)
  return 'command';
}

const INTRO_PATTERNS: ReadonlyArray<{ re: RegExp; key: string }> = [
  { re: /^(你是谁|who\s*are\s*you|你叫什么|介绍一?下你自己|自我介绍)/i, key: 'who' },
  { re: /^(你能干什么|你能做什么|你会什么|有什么功能|help|帮助|怎么用|怎么使用|你有什么用)/i, key: 'what' },
  { re: /^(你好|hello|hi|hey|嗨|哈喽|打个招呼)/i, key: 'hello' },
];

const INTRO_REPLIES: Record<string, string> = {
  who: [
    '我是 TerminalMind Agent —— 你的智能终端助手。',
    '',
    '我运行在 TerminalMind 内部，能理解你的自然语言意图，将其转化为精准的终端命令。',
    '无论你连接的是本地终端还是远程 SSH 服务器，我都会根据当前操作系统、Shell 环境和历史命令来推荐最合适的命令。',
  ].join('\n'),
  what: [
    '作为你的终端 AI 助手，我可以帮你：',
    '',
    '⚡ 自然语言转命令 —— 告诉我你想做什么，我帮你生成对应的终端命令',
    '🔍 智能感知环境 —— 自动识别当前连接是 Linux、macOS 还是 Windows',
    '📜 理解上下文 —— 结合你的历史命令和当前目录给出更精准的建议',
    '✅ 命令确认机制 —— 生成的命令你可以预览、修改或拒绝，确认后才会执行',
    '',
    '试试输入你想做的事情，比如：',
    '  · "查看当前目录下最大的 10 个文件"',
    '  · "查看系统内存使用情况"',
    '  · "找出占用 8080 端口的进程"',
    '',
    '💡 小技巧：输入 ? 开头可强制触发 AI（例如 ?disk usage）',
  ].join('\n'),
  hello: [
    '你好！👋 我是 TerminalMind Agent。',
    '',
    '很高兴见到你！我是你的智能终端助手，可以帮你把自然语言转换成终端命令。',
    '直接告诉我你想做什么，我来帮你搞定。',
  ].join('\n'),
};

function getBuiltinReply(text: string): string | null {
  const t = text.trim();
  for (const { re, key } of INTRO_PATTERNS) {
    if (re.test(t)) return INTRO_REPLIES[key] ?? null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Hook: useAgentMode                                                 */
/* ------------------------------------------------------------------ */

export function useAgentMode(
  sessionId: string,
  agentMode: boolean,
): UseAgentModeResult {
  const { t } = useTranslation();
  const [suggestion, setSuggestion] = useState<AgentSuggestion | null>(null);
  const [thinking, setThinking] = useState(false);
  const [infoText, setInfoText] = useState('');
  const [hasInput, setHasInput] = useState(false);

  const lineBufferRef = useRef('');
  const suggestionRef = useRef<AgentSuggestion | null>(null);
  const thinkingRef = useRef(false);
  const infoTextRef = useRef('');
  const agentModeRef = useRef(agentMode);
  const requestGenRef = useRef(0);
  const thinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  suggestionRef.current = suggestion;
  thinkingRef.current = thinking;
  infoTextRef.current = infoText;
  agentModeRef.current = agentMode;

  const activeTab = useTabStore((s) => s.tabs.find((t) => t.isActive));
  const connectionTypeRef = useRef<'local' | 'ssh'>(activeTab?.connectionType ?? 'local');
  const sshSessionIdRef = useRef(activeTab?.sshSessionId);
  connectionTypeRef.current = activeTab?.connectionType ?? 'local';
  sshSessionIdRef.current = activeTab?.sshSessionId;

  const syncHasInput = useCallback(() => {
    const nonEmpty = lineBufferRef.current.length > 0;
    setHasInput((prev) => (prev !== nonEmpty ? nonEmpty : prev));
  }, []);

  useEffect(() => {
    if (!agentMode) {
      setSuggestion(null);
      setThinking(false);
      setInfoText('');
      lineBufferRef.current = '';
      setHasInput(false);
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
    }
  }, [agentMode]);

  const execute = useCallback(() => {
    const sg = suggestionRef.current;
    if (!sg) return;
    setSuggestion(null);
    suggestionRef.current = null;
    window.api.terminal.sendInput(sessionId, `${sg.command}\r`);
  }, [sessionId]);

  const reject = useCallback(() => {
    setSuggestion(null);
    suggestionRef.current = null;
  }, []);

  const updateCommand = useCallback((cmd: string) => {
    const sg = suggestionRef.current;
    if (!sg) return;
    const updated = { ...sg, command: cmd };
    setSuggestion(updated);
    suggestionRef.current = updated;
  }, []);

  const dismissInfo = useCallback(() => {
    setInfoText('');
    infoTextRef.current = '';
  }, []);

  const cancelThinking = useCallback(() => {
    requestGenRef.current += 1;
    setThinking(false);
    thinkingRef.current = false;
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }
  }, []);

  const triggerAi = useCallback(
    (line: string, shellBufferLen: number) => {
      const clearSeq = buildClearSequence(connectionTypeRef.current, shellBufferLen);
      window.api.terminal.sendInput(sessionId, clearSeq);
      setThinking(true);
      thinkingRef.current = true;
      requestGenRef.current += 1;
      const gen = requestGenRef.current;

      if (thinkingTimeoutRef.current) clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = setTimeout(() => {
        if (gen !== requestGenRef.current) return;
        thinkingTimeoutRef.current = null;
        setThinking(false);
        thinkingRef.current = false;
        const msg = t('terminal.agent.timeout');
        setInfoText(msg);
        infoTextRef.current = msg;
      }, AI_REQUEST_TIMEOUT_MS);

      void (async () => {
        try {
          const context = await buildTerminalContext(
            sessionId,
            connectionTypeRef.current,
            sshSessionIdRef.current,
          );
          if (gen !== requestGenRef.current) return;
          const result: AIGenerateCommandResult = await window.api.ai.generateCommand(
            line,
            context,
            sessionId,
          );
          if (gen !== requestGenRef.current) return;
          if (thinkingTimeoutRef.current) {
            clearTimeout(thinkingTimeoutRef.current);
            thinkingTimeoutRef.current = null;
          }
          setThinking(false);
          thinkingRef.current = false;

          if (result.command?.trim()) {
            const newSg: AgentSuggestion = {
              command: result.command.trim(),
              explanation: result.explanation ?? '',
              userInput: line,
            };
            setSuggestion(newSg);
            suggestionRef.current = newSg;
          } else {
            const fallback = t('terminal.agent.noCommand');
            setInfoText(result.explanation ?? fallback);
            infoTextRef.current = result.explanation ?? fallback;
          }
        } catch (e) {
          if (gen !== requestGenRef.current) return;
          if (thinkingTimeoutRef.current) {
            clearTimeout(thinkingTimeoutRef.current);
            thinkingTimeoutRef.current = null;
          }
          setThinking(false);
          thinkingRef.current = false;
          const msg = e instanceof Error ? e.message : String(e);
          const errLine = `${t('terminal.agent.errorPrefix')} ${msg}`;
          setInfoText(errLine);
          infoTextRef.current = errLine;
        }
      })();
    },
    [sessionId, t],
  );

  const processEnter = useCallback((): boolean => {
    const shellBufferLen = lineBufferRef.current.length;
    const line = lineBufferRef.current.trim();
    lineBufferRef.current = '';
    setHasInput(false);

    if (!line) return false;

    const intro = getBuiltinReply(line);
    if (intro) {
      const clearSeq = buildClearSequence(connectionTypeRef.current, shellBufferLen);
      window.api.terminal.sendInput(sessionId, clearSeq);
      setInfoText(intro);
      infoTextRef.current = intro;
      return true;
    }

    const classification = classifyInput(line);
    if (classification === 'command') return false;

    const aiInput = line.replace(AI_PREFIX_RE, '').trim();
    if (!aiInput) return false;
    triggerAi(aiInput, shellBufferLen);
    return true;
  }, [sessionId, triggerAi]);

  const handleInput = useCallback(
    (data: string): boolean => {
      if (!agentModeRef.current) return false;

      if (thinkingRef.current) {
        if (data === '\x1b' || data === '\x03') {
          cancelThinking();
          return true;
        }
        return true;
      }

      if (infoTextRef.current) {
        if (data === '\x1b' || data === '\r' || data === '\n' || data === '\x03') {
          setInfoText('');
          infoTextRef.current = '';
          return true;
        }
        return true;
      }

      const sg = suggestionRef.current;
      if (sg) {
        if (data === '\r' || data === '\n') {
          setSuggestion(null);
          suggestionRef.current = null;
          window.api.terminal.sendInput(sessionId, `${sg.command}\r`);
          return true;
        }
        if (data === '\x1b' || data === '\x03') {
          reject();
          return true;
        }
        return true;
      }

      if (data === '\r' || data === '\n') {
        return processEnter();
      }

      if (data.startsWith('\x1b')) {
        lineBufferRef.current = '';
        return false;
      }

      if (data === '\x7f' || data === '\b') {
        lineBufferRef.current = lineBufferRef.current.slice(0, -1);
        syncHasInput();
        return false;
      }

      if (data === '\x03' || data === '\x15') {
        lineBufferRef.current = '';
        syncHasInput();
        return false;
      }

      if (data.length > 1) {
        const nlIdx = data.indexOf('\r') >= 0 ? data.indexOf('\r') : data.indexOf('\n');
        if (nlIdx >= 0) {
          const textBefore = data.slice(0, nlIdx);
          if (textBefore) lineBufferRef.current += textBefore;
          const intercepted = processEnter();
          if (intercepted) return true;
          lineBufferRef.current = '';
          syncHasInput();
          return false;
        }
        lineBufferRef.current += data;
        syncHasInput();
        return false;
      }

      if (data.charCodeAt(0) >= 32) {
        lineBufferRef.current += data;
        syncHasInput();
      }

      return false;
    },
    [sessionId, processEnter, syncHasInput, cancelThinking],
  );

  const isIdle = !thinking && !suggestion && !infoText;

  return {
    suggestion,
    thinking,
    infoText,
    isIdle,
    hasInput,
    handleInput,
    execute,
    reject,
    updateCommand,
    dismissInfo,
    cancelThinking,
  };
}

/* ------------------------------------------------------------------ */
/*  Overlay Component                                                  */
/* ------------------------------------------------------------------ */

interface AgentOverlayProps {
  suggestion: AgentSuggestion | null;
  thinking: boolean;
  infoText: string;
  onExecute: () => void;
  onReject: () => void;
  onUpdateCommand: (cmd: string) => void;
  onDismissInfo: () => void;
  onCancelThinking: () => void;
}

export function AgentCommandOverlay(props: AgentOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  const { suggestion, thinking, infoText, onExecute, onReject, onUpdateCommand, onDismissInfo, onCancelThinking } = props;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (!suggestion) setEditing(false);
  }, [suggestion]);

  if (!thinking && !suggestion && !infoText) return null;

  return (
    <div className="agent-overlay">
      {thinking && (
        <div className="agent-overlay-card">
          <div className="agent-overlay-thinking">
            <span className="agent-thinking-dot" />
            <span>{t('terminal.agent.thinking')}</span>
            <button
              type="button"
              className="agent-cancel-btn"
              onClick={onCancelThinking}
              title={t('terminal.agent.cancelTitle')}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>close</span>
            </button>
          </div>
        </div>
      )}

      {infoText && !thinking && (
        <div className="agent-overlay-card agent-overlay-info-card">
          <div className="agent-overlay-info">{infoText}</div>
          <div className="agent-overlay-actions">
            <button className="agent-overlay-btn" onClick={onDismissInfo}>
              {t('terminal.agent.dismiss')} <kbd>Esc</kbd>
            </button>
          </div>
        </div>
      )}

      {suggestion && !editing && !thinking && (
        <div className="agent-overlay-card">
          <div className="agent-overlay-question">{t('terminal.agent.confirmQuestion')}</div>
          {suggestion.explanation && (
            <div className="agent-overlay-explanation">{suggestion.explanation}</div>
          )}
          <div className="agent-overlay-cmd">
            <code>{suggestion.command}</code>
          </div>
          <div className="agent-overlay-actions">
            <button className="agent-overlay-btn execute" onClick={onExecute}>
              {t('terminal.agent.execute')} <kbd>Enter</kbd>
            </button>
            <button
              className="agent-overlay-btn edit"
              onClick={() => {
                setEditValue(suggestion.command);
                setEditing(true);
              }}
            >
              {t('terminal.agent.edit')}
            </button>
            <button className="agent-overlay-btn reject" onClick={onReject}>
              {t('terminal.agent.reject')} <kbd>Esc</kbd>
            </button>
          </div>
        </div>
      )}

      {suggestion && editing && !thinking && (
        <div className="agent-overlay-card">
          <div className="agent-overlay-question">{t('terminal.agent.editTitle')}</div>
          <div className="agent-overlay-cmd editing">
            <input
              className="agent-overlay-edit-input"
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const v = editValue.trim();
                  if (v) { onUpdateCommand(v); setEditing(false); }
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              autoFocus
              spellCheck={false}
            />
          </div>
          <div className="agent-overlay-actions">
            <button
              className="agent-overlay-btn execute"
              onClick={() => {
                const v = editValue.trim();
                if (v) { onUpdateCommand(v); setEditing(false); }
              }}
            >
              {t('terminal.agent.save')} <kbd>Enter</kbd>
            </button>
            <button className="agent-overlay-btn reject" onClick={() => setEditing(false)}>
              {t('terminal.agent.cancel')} <kbd>Esc</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
