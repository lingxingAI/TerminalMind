import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { useInlineAi } from '../../hooks/useInlineAi';
import { InlineAiOverlay } from './InlineAiOverlay';

interface TerminalViewProps {
  sessionId: string;
  visible: boolean;
}

export function TerminalView({ sessionId, visible }: TerminalViewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const atLineStartRef = useRef(true);

  const inlineAi = useInlineAi(sessionId, visible, terminalRef, atLineStartRef);
  const handleInlineInputRef = useRef(inlineAi.handleInput);
  handleInlineInputRef.current = inlineAi.handleInput;

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, monospace",
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
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.unicode.activeVersion = '11';

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.onData((data) => {
      if (handleInlineInputRef.current(data)) {
        return;
      }
      window.api.terminal.sendInput(sessionId, data);
    });

    const unsubData = window.api.terminal.onData(sessionId, (data) => {
      if (data.includes('\n') || data.includes('\r')) {
        atLineStartRef.current = true;
      }
      terminal.write(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          window.api.terminal.resize(sessionId, dims.cols, dims.rows);
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      unsubData();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, inlineAi]);

  useEffect(() => {
    if (visible && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      });
    }
  }, [visible]);

  return (
    <div
      className="terminal-view-host"
      style={{
        width: '100%',
        height: '100%',
        display: visible ? 'block' : 'none',
        position: 'relative',
      }}
    >
      <div ref={containerRef} className="terminal-view-xterm" style={{ width: '100%', height: '100%' }} />
      <InlineAiOverlay
        mode={inlineAi.mode}
        prompt={inlineAi.prompt}
        generatedCommand={inlineAi.generatedCommand}
        error={inlineAi.error}
      />
    </div>
  );
}
