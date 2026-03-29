import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { useInlineAi } from '../../hooks/useInlineAi';
import { InlineAiOverlay } from './InlineAiOverlay';
import { useAgentMode, AgentCommandOverlay } from './AgentView';
import { TerminalAiChat } from './TerminalAiChat';
import { useLayoutStore } from '../../stores/layout-store';
import { useTabStore } from '../../stores/tab-store';
import { useTerminalAiChatStore } from '../../stores/terminal-ai-chat-store';
import { useTerminalSettingsStore } from '../../stores/terminal-settings-store';
import { buildTerminalContext } from '../../hooks/useTerminalContext';

function getCursorPixelPos(term: Terminal | null): { left: number; top: number } | null {
  if (!term) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (term as any)._core;
  const dims = core?._renderService?.dimensions;
  if (!dims?.css?.cell?.width || !dims?.css?.cell?.height) return null;
  const x = term.buffer.active.cursorX;
  const y = term.buffer.active.cursorY;
  return { left: x * dims.css.cell.width, top: y * dims.css.cell.height };
}

function isAtShellPrompt(term: Terminal): boolean {
  const buffer = term.buffer.active;
  const line = buffer.getLine(buffer.cursorY);
  if (!line) return false;
  const text = line.translateToString(true, 0, buffer.cursorX).trimEnd();
  if (!text) return false;
  return /[$#>%]\s*$/.test(text);
}

interface TerminalViewProps {
  sessionId: string;
  visible: boolean;
  agentMode?: boolean;
}

export function TerminalView({ sessionId, visible, agentMode = false }: TerminalViewProps): React.ReactElement {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const atLineStartRef = useRef(true);
  const visibleRef = useRef(visible);
  const lastDimsRef = useRef<{ cols: number; rows: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    showCopy: boolean;
  } | null>(null);
  const [termSettled, setTermSettled] = useState(false);
  const [atPrompt, setAtPrompt] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  visibleRef.current = visible;

  const sidebarVisible = useLayoutStore((s) => s.sidebarVisible);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const panelHeight = useLayoutStore((s) => s.panelHeight);

  const termFontFamily = useTerminalSettingsStore((s) => s.fontFamily);
  const termFontSize = useTerminalSettingsStore((s) => s.fontSize);
  const termScrollback = useTerminalSettingsStore((s) => s.scrollback);
  const termCopyOnSelect = useTerminalSettingsStore((s) => s.copyOnSelect);

  const inlineAi = useInlineAi(sessionId, visible, terminalRef, atLineStartRef);
  const handleInlineInputRef = useRef(inlineAi.handleInput);
  handleInlineInputRef.current = inlineAi.handleInput;

  const agent = useAgentMode(sessionId, agentMode);
  const handleAgentInputRef = useRef(agent.handleInput);
  handleAgentInputRef.current = agent.handleInput;

  const showHint = agentMode && agent.isIdle && !agent.hasInput && termSettled && atPrompt;
  const [hintPos, setHintPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!showHint) {
      setHintPos(null);
      return;
    }
    const pos = getCursorPixelPos(terminalRef.current);
    if (pos) {
      setHintPos(pos);
      return;
    }
    const timer = setTimeout(() => {
      setHintPos(getCursorPixelPos(terminalRef.current));
    }, 200);
    return () => clearTimeout(timer);
  }, [showHint, visible]);

  useEffect(() => {
    if (!containerRef.current) return;

    const settings = useTerminalSettingsStore.getState();
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      theme: {
        background: '#0a0e14',
        foreground: '#e0e0e0',
        cursor: '#7c5cff',
        cursorAccent: '#0a0e14',
        selectionBackground: '#7c5cff40',
        black: '#0a0e14',
        red: '#ef5350',
        green: '#4caf50',
        yellow: '#ffeb3b',
        blue: '#42a5f5',
        magenta: '#ab47bc',
        cyan: '#26c6da',
        white: '#e0e0e0',
        brightBlack: '#606878',
        brightRed: '#ff7043',
        brightGreen: '#66bb6a',
        brightYellow: '#fff176',
        brightBlue: '#64b5f6',
        brightMagenta: '#ce93d8',
        brightCyan: '#4dd0e1',
        brightWhite: '#ffffff',
      },
      scrollback: settings.scrollback,
      allowProposedApi: true,
      rightClickSelectsWord: false,
    });

    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    const containerEl = containerRef.current;
    terminal.open(containerEl);
    fitAddon.fit();

    const onXtermContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        showCopy: terminal.hasSelection(),
      });
    };
    containerEl.addEventListener('contextmenu', onXtermContextMenu, true);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const isPaste =
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') ||
        (e.shiftKey && e.key === 'Insert');
      if (!isPaste) return true;
      e.preventDefault();
      e.stopPropagation();
      try {
        const text = window.api.clipboard.readText();
        if (text) {
          if (!handleAgentInputRef.current(text) && !handleInlineInputRef.current(text)) {
            window.api.terminal.sendInput(sessionId, text);
          }
        }
      } catch { /* clipboard denied */ }
      terminal.focus();
      return false;
    });

    terminal.onData((data) => {
      if (handleAgentInputRef.current(data)) return;
      if (handleInlineInputRef.current(data)) return;
      window.api.terminal.sendInput(sessionId, data);
    });

    terminal.onSelectionChange(() => {
      if (useTerminalSettingsStore.getState().copyOnSelect && terminal.hasSelection()) {
        const sel = terminal.getSelection();
        if (sel) window.api.clipboard.writeText(sel);
      }
    });

    const unsubData = window.api.terminal.onData(sessionId, (data) => {
      if (data.includes('\n') || data.includes('\r')) {
        atLineStartRef.current = true;
      }
      terminal.write(data);
      setTermSettled(false);
      setAtPrompt(false);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        setTermSettled(true);
        setAtPrompt(isAtShellPrompt(terminal));
      }, 300);
    });

    const doResize = () => {
      if (!visibleRef.current || !fitAddonRef.current || !terminalRef.current) return;
      fitAddonRef.current.fit();
      const cols = terminalRef.current.cols;
      const rows = terminalRef.current.rows;
      const last = lastDimsRef.current;
      if (last && last.cols === cols && last.rows === rows) return;
      lastDimsRef.current = { cols, rows };
      window.api.terminal.resize(sessionId, cols, rows);
    };

    const resizeObserver = new ResizeObserver(() => doResize());
    resizeObserver.observe(containerRef.current);

    const onWindowResize = () => requestAnimationFrame(doResize);
    window.addEventListener('resize', onWindowResize);

    return () => {
      containerEl.removeEventListener('contextmenu', onXtermContextMenu, true);
      window.removeEventListener('resize', onWindowResize);
      resizeObserver.disconnect();
      unsubData();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    term.options.fontFamily = termFontFamily;
    term.options.fontSize = termFontSize;
    term.options.scrollback = termScrollback;
    fitAddonRef.current?.fit();
  }, [termFontFamily, termFontSize, termScrollback]);

  useEffect(() => {
    if (!visible || !fitAddonRef.current || !terminalRef.current) return;
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    requestAnimationFrame(() => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      fitAddon.fit();
      const cols = term.cols;
      const rows = term.rows;
      const last = lastDimsRef.current;
      if (!last || last.cols !== cols || last.rows !== rows) {
        lastDimsRef.current = { cols, rows };
        window.api.terminal.resize(sessionId, cols, rows);
      }
      term.focus();
    });
  }, [visible, sessionId]);

  useEffect(() => {
    if (!visible || !fitAddonRef.current || !terminalRef.current) return;
    const doFit = () => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      fitAddonRef.current.fit();
      const cols = terminalRef.current.cols;
      const rows = terminalRef.current.rows;
      const last = lastDimsRef.current;
      if (!last || last.cols !== cols || last.rows !== rows) {
        lastDimsRef.current = { cols, rows };
        window.api.terminal.resize(sessionId, cols, rows);
      }
    };
    const rafId = requestAnimationFrame(doFit);
    const timerId = setTimeout(doFit, 100);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [visible, sessionId, sidebarVisible, sidebarWidth, panelVisible, panelHeight]);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  const handleTerminalContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      showCopy: Boolean(terminalRef.current?.hasSelection()),
    });
  }, []);

  const handleCopy = useCallback(() => {
    const sel = terminalRef.current?.getSelection();
    if (sel) {
      window.api.clipboard.writeText(sel);
    }
    setCtxMenu(null);
  }, []);

  const doPaste = useCallback(() => {
    try {
      const text = window.api.clipboard.readText();
      if (text) {
        if (handleAgentInputRef.current(text)) return;
        if (handleInlineInputRef.current(text)) return;
        window.api.terminal.sendInput(sessionId, text);
      }
    } catch {
      /* clipboard access denied */
    }
  }, [sessionId]);

  const handlePaste = useCallback(() => {
    doPaste();
    setCtxMenu(null);
  }, [doPaste]);

  const activeTab = useTabStore((s) => s.tabs.find((t) => t.isActive));

  const handleAiAssistant = useCallback(async () => {
    const sel = terminalRef.current?.getSelection();
    if (!sel) return;
    setCtxMenu(null);
    const connType = activeTab?.connectionType ?? 'local';
    const sshSid = activeTab?.sshSessionId;
    const ctx = await buildTerminalContext(sessionId, connType, sshSid);
    useTerminalAiChatStore.getState().open(sel, ctx);
  }, [sessionId, activeTab]);

  return (
    <div
      className="terminal-view-host"
      style={{ display: visible ? 'block' : 'none' }}
      onContextMenu={handleTerminalContextMenu}
    >
      <div ref={containerRef} className="terminal-view-xterm" />
      {showHint && hintPos && (
        <div
          className="agent-hint-overlay"
          style={{ left: hintPos.left, top: hintPos.top }}
        >
          {t('terminal.agent.agentHint')}
        </div>
      )}
      <InlineAiOverlay
        mode={inlineAi.mode}
        prompt={inlineAi.prompt}
        generatedCommand={inlineAi.generatedCommand}
        error={inlineAi.error}
        onCancel={inlineAi.reset}
      />
      {agentMode && (
        <AgentCommandOverlay
          suggestion={agent.suggestion}
          thinking={agent.thinking}
          infoText={agent.infoText}
          onExecute={agent.execute}
          onReject={agent.reject}
          onUpdateCommand={agent.updateCommand}
          onDismissInfo={agent.dismissInfo}
          onCancelThinking={agent.cancelThinking}
        />
      )}

      {ctxMenu && (
        <div
          className="terminal-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y, position: 'fixed' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={handleCopy}
            disabled={!ctxMenu.showCopy}
            style={!ctxMenu.showCopy ? { opacity: 0.4, cursor: 'default' } : undefined}
          >
            <span className="material-symbols-rounded">content_copy</span>
            {t('terminal.contextMenu.copy')}
          </button>
          <button type="button" className="context-menu-item" onClick={handlePaste}>
            <span className="material-symbols-rounded">content_paste</span>
            {t('terminal.contextMenu.paste')}
          </button>
          <div className="context-menu-divider" />
          <button
            type="button"
            className="context-menu-item"
            onClick={handleAiAssistant}
            disabled={!ctxMenu.showCopy}
            style={!ctxMenu.showCopy ? { opacity: 0.4, cursor: 'default' } : undefined}
          >
            <span className="material-symbols-rounded">smart_toy</span>
            {t('terminal.contextMenu.aiAssistant')}
          </button>
        </div>
      )}
      <TerminalAiChat />
    </div>
  );
}
