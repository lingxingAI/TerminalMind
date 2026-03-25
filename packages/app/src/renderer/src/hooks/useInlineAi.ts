import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { AICommandContext } from '@terminalmind/api';

export type InlineAiMode = 'normal' | 'composing' | 'waiting' | 'preview';

export interface UseInlineAiResult {
  readonly mode: InlineAiMode;
  readonly prompt: string;
  readonly generatedCommand: string;
  readonly error: string | null;
  readonly handleInput: (data: string) => boolean;
  readonly reset: () => void;
}

function guessOs(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }
  const p = navigator.platform ?? '';
  if (/^Win/i.test(p)) {
    return 'win32';
  }
  if (/^Mac/i.test(p)) {
    return 'darwin';
  }
  return 'linux';
}

async function buildContext(sessionId: string): Promise<AICommandContext> {
  const session = await window.api.terminal.getSession(sessionId);
  const shell = session?.shellPath ?? 'unknown';
  return {
    shell,
    os: guessOs(),
    cwd: '',
  };
}

/** Erase two locally echoed characters (`? `) from the xterm buffer. */
function eraseTwoLocalChars(term: Terminal): void {
  term.write('\x08 \x08\x08 \x08');
}

/** Erase one locally echoed character (`?`). */
function eraseOneLocalChar(term: Terminal): void {
  term.write('\x08 \x08');
}

export function useInlineAi(
  sessionId: string,
  visible: boolean,
  terminalRef: RefObject<Terminal | null>,
  atLineStartRef: MutableRefObject<boolean>,
): UseInlineAiResult {
  const [mode, setMode] = useState<InlineAiMode>('normal');
  const [prompt, setPrompt] = useState('');
  const [generatedCommand, setGeneratedCommand] = useState('');
  const [error, setError] = useState<string | null>(null);

  const modeRef = useRef(mode);
  const promptRef = useRef(prompt);
  const generatedCommandRef = useRef(generatedCommand);
  const pendingQuestionMarkRef = useRef(false);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);
  useEffect(() => {
    generatedCommandRef.current = generatedCommand;
  }, [generatedCommand]);

  const resetStateOnly = useCallback(
    (opts?: Readonly<{ atLineStart?: boolean }>) => {
      requestGenerationRef.current += 1;
      pendingQuestionMarkRef.current = false;
      modeRef.current = 'normal';
      setMode('normal');
      setPrompt('');
      setGeneratedCommand('');
      setError(null);
      promptRef.current = '';
      generatedCommandRef.current = '';
      atLineStartRef.current = opts?.atLineStart ?? true;
    },
    [atLineStartRef],
  );

  const reset = useCallback(() => {
    const term = terminalRef.current;
    const m = modeRef.current;
    const pending = pendingQuestionMarkRef.current;
    if (term) {
      if (m === 'composing' || m === 'waiting' || m === 'preview') {
        eraseTwoLocalChars(term);
      } else if (pending) {
        eraseOneLocalChar(term);
      }
    }
    resetStateOnly();
  }, [resetStateOnly, terminalRef]);

  const cancelComposing = useCallback(() => {
    const term = terminalRef.current;
    if (term) {
      eraseTwoLocalChars(term);
    }
    pendingQuestionMarkRef.current = false;
    modeRef.current = 'normal';
    setMode('normal');
    setPrompt('');
    setError(null);
    promptRef.current = '';
    atLineStartRef.current = true;
  }, [atLineStartRef, terminalRef]);

  const flushPendingQuestion = useCallback(
    (rest: string) => {
      window.api.terminal.sendInput(sessionId, `?${rest}`);
      pendingQuestionMarkRef.current = false;
      atLineStartRef.current = false;
    },
    [atLineStartRef, sessionId],
  );

  useEffect(() => {
    if (!visible) {
      reset();
    }
  }, [visible, reset]);

  const handleInput = useCallback(
    (data: string): boolean => {
      const term = terminalRef.current;
      if (!term) {
        return false;
      }

      const m = modeRef.current;

      if (m === 'waiting') {
        return true;
      }

      if (m === 'preview') {
        if (data === '\r' || data === '\n') {
          const cmd = generatedCommandRef.current;
          eraseTwoLocalChars(term);
          window.api.terminal.sendInput(sessionId, `${cmd}\r`);
          resetStateOnly({ atLineStart: false });
          return true;
        }
        if (data === '\x1b') {
          eraseTwoLocalChars(term);
          resetStateOnly();
          return true;
        }
        if (data === '\t') {
          const cmd = generatedCommandRef.current;
          eraseTwoLocalChars(term);
          window.api.terminal.sendInput(sessionId, cmd);
          resetStateOnly({ atLineStart: false });
          return true;
        }
        return true;
      }

      if (m === 'composing') {
        if (data === '\x03') {
          cancelComposing();
          return true;
        }
        if (data === '\x1b') {
          cancelComposing();
          return true;
        }
        if (data.startsWith('\x1b')) {
          return true;
        }
        if (data === '\r' || data === '\n') {
          const p = promptRef.current.trim();
          if (!p) {
            setError('Enter a description of the command.');
            return true;
          }
          setError(null);
          requestGenerationRef.current += 1;
          const gen = requestGenerationRef.current;
          modeRef.current = 'waiting';
          setMode('waiting');
          void (async () => {
            try {
              const context = await buildContext(sessionId);
              if (gen !== requestGenerationRef.current) {
                return;
              }
              const result = await window.api.ai.generateCommand(p, context);
              if (gen !== requestGenerationRef.current) {
                return;
              }
              if (!result.command?.trim()) {
                setError('No command was generated.');
                modeRef.current = 'composing';
                setMode('composing');
                return;
              }
              generatedCommandRef.current = result.command;
              setGeneratedCommand(result.command);
              modeRef.current = 'preview';
              setMode('preview');
            } catch (e) {
              if (gen !== requestGenerationRef.current) {
                return;
              }
              const msg = e instanceof Error ? e.message : String(e);
              setError(msg);
              modeRef.current = 'composing';
              setMode('composing');
            }
          })();
          return true;
        }
        if (data === '\x7f' || data === '\b') {
          if (promptRef.current.length > 0) {
            const next = promptRef.current.slice(0, -1);
            promptRef.current = next;
            setPrompt(next);
          }
          return true;
        }
        if (data === '\t') {
          const next = `${promptRef.current}\t`;
          promptRef.current = next;
          setPrompt(next);
          return true;
        }
        for (let i = 0; i < data.length; i++) {
          const code = data.charCodeAt(i);
          if (code >= 32 || code === 9) {
            continue;
          }
          return true;
        }
        const next = promptRef.current + data;
        promptRef.current = next;
        setPrompt(next);
        return true;
      }

      if (pendingQuestionMarkRef.current) {
        if (data === ' ') {
          term.write(' ');
          pendingQuestionMarkRef.current = false;
          modeRef.current = 'composing';
          setMode('composing');
          setPrompt('');
          setError(null);
          promptRef.current = '';
          return true;
        }
        if (data.length === 1) {
          flushPendingQuestion(data);
          return true;
        }
        if (data[0] === ' ') {
          term.write(' ');
          pendingQuestionMarkRef.current = false;
          modeRef.current = 'composing';
          setMode('composing');
          setError(null);
          const rest = data.slice(1);
          promptRef.current = rest;
          setPrompt(rest);
          return true;
        }
        flushPendingQuestion(data);
        return true;
      }

      if (atLineStartRef.current) {
        if (data === '?') {
          pendingQuestionMarkRef.current = true;
          term.write('?');
          return true;
        }
        if (data.startsWith('? ')) {
          term.write('? ');
          pendingQuestionMarkRef.current = false;
          modeRef.current = 'composing';
          setMode('composing');
          setError(null);
          const initial = data.slice(2);
          promptRef.current = initial;
          setPrompt(initial);
          return true;
        }
      }

      atLineStartRef.current = false;
      return false;
    },
    [
      atLineStartRef,
      cancelComposing,
      flushPendingQuestion,
      resetStateOnly,
      sessionId,
      terminalRef,
    ],
  );

  return {
    mode,
    prompt,
    generatedCommand,
    error,
    handleInput,
    reset,
  };
}
