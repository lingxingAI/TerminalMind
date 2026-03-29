import { create } from 'zustand';
import type { AICompletionRequest, AIStreamChunk, AIMessage, AICommandContext } from '@terminalmind/api';

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: number;
}

interface TerminalAiChatState {
  visible: boolean;
  selectedText: string;
  context: AICommandContext | null;
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  activeStreamId: string | null;
  error: string | null;

  open(selectedText: string, context: AICommandContext): void;
  close(): void;
  sendMessage(content: string): Promise<void>;
  cancelStream(): void;
  ingestStreamChunk(streamId: string, chunk: AIStreamChunk): void;
  clearChat(): void;
}

function buildSystemPrompt(context: AICommandContext, selectedText: string): string {
  const parts: string[] = [
    'You are a terminal command assistant embedded in TerminalMind, an SSH & terminal client.',
    `The user is working on a ${context.os} system with ${context.shell} shell.`,
  ];
  if (context.cwd) {
    parts.push(`Current working directory / host: ${context.cwd}`);
  }
  parts.push(
    '',
    'The user has selected the following terminal content for reference:',
    '```',
    selectedText,
    '```',
    '',
    'Your task:',
    '- Analyze the selected terminal content and help the user with command recommendations, troubleshooting, or explanations.',
    '- Always provide commands wrapped in markdown fenced code blocks (```bash ... ``` or ```powershell ... ```) so they can be easily copied.',
    '- Be concise and practical. Focus on actionable commands.',
    '- If the content shows an error, diagnose it and suggest a fix.',
    '- Adapt commands to the detected OS and shell.',
    '- Respond in the same language the user writes in.',
  );
  return parts.join('\n');
}

function toApiMessages(
  msgs: readonly ChatMessage[],
  systemPrompt: string,
): readonly AIMessage[] {
  const result: AIMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const m of msgs) {
    result.push({ role: m.role, content: m.content });
  }
  return result;
}

export const useTerminalAiChatStore = create<TerminalAiChatState>((set, get) => {
  let unsubChunk: (() => void) | null = null;

  function ensureChunkSubscription(): void {
    if (unsubChunk) return;
    unsubChunk = window.api.ai.onStreamChunk((payload) => {
      get().ingestStreamChunk(payload.streamId, payload.chunk);
    });
  }

  return {
    visible: false,
    selectedText: '',
    context: null,
    messages: [],
    streamingContent: '',
    isStreaming: false,
    activeStreamId: null,
    error: null,

    open(selectedText, context) {
      set({
        visible: true,
        selectedText,
        context,
        messages: [],
        streamingContent: '',
        isStreaming: false,
        activeStreamId: null,
        error: null,
      });
      ensureChunkSubscription();
    },

    close() {
      const { isStreaming, activeStreamId } = get();
      if (isStreaming && activeStreamId) {
        window.api.ai.streamCancel(activeStreamId).catch(() => {});
      }
      set({
        visible: false,
        isStreaming: false,
        activeStreamId: null,
        streamingContent: '',
      });
    },

    clearChat() {
      const { isStreaming, activeStreamId } = get();
      if (isStreaming && activeStreamId) {
        window.api.ai.streamCancel(activeStreamId).catch(() => {});
      }
      set({
        messages: [],
        streamingContent: '',
        isStreaming: false,
        activeStreamId: null,
        error: null,
      });
    },

    cancelStream() {
      const { activeStreamId } = get();
      if (activeStreamId) {
        window.api.ai.streamCancel(activeStreamId).catch(() => {});
      }
      const partial = get().streamingContent;
      if (partial) {
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: partial,
          timestamp: Date.now(),
        };
        set((s) => ({
          messages: [...s.messages, msg],
          streamingContent: '',
          isStreaming: false,
          activeStreamId: null,
        }));
      } else {
        set({ isStreaming: false, activeStreamId: null, streamingContent: '' });
      }
    },

    ingestStreamChunk(streamId, chunk) {
      const { activeStreamId, isStreaming } = get();
      if (!isStreaming || streamId !== activeStreamId) return;

      if (chunk.content) {
        set((s) => ({ streamingContent: s.streamingContent + chunk.content }));
      }
      if (chunk.done) {
        const text = get().streamingContent;
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        };
        set((s) => ({
          messages: [...s.messages, msg],
          streamingContent: '',
          isStreaming: false,
          activeStreamId: null,
        }));
      }
    },

    async sendMessage(content: string) {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (get().isStreaming) return;

      const { context, selectedText } = get();
      if (!context) return;

      ensureChunkSubscription();

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, userMsg],
        error: null,
        streamingContent: '',
        isStreaming: true,
      }));

      const settings = await window.api.ai.getSettings();
      const systemPrompt = buildSystemPrompt(context, selectedText);
      const allMessages = toApiMessages(get().messages, systemPrompt);

      const request: AICompletionRequest = {
        model: settings.defaultModel,
        messages: allMessages,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      };

      try {
        const streamId = await window.api.ai.streamStart(request);
        set({ activeStreamId: streamId });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        set({
          isStreaming: false,
          activeStreamId: null,
          streamingContent: '',
          error: message,
        });
      }
    },
  };
});
