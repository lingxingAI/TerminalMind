import { create } from 'zustand';
import type { AICompletionRequest, AIStreamChunk, AIMessage } from '@terminalmind/api';

export interface AIMessageDisplay {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface AIState {
  conversationId: string | null;
  messages: AIMessageDisplay[];
  isStreaming: boolean;
  streamingContent: string;
  inputDraft: string;
  error: string | null;
  /** Matches the last started stream; used to ignore other streams. */
  activeStreamId: string | null;

  setConversationId(id: string | null): void;
  addMessage(msg: AIMessageDisplay): void;
  setMessages(msgs: AIMessageDisplay[]): void;
  setStreaming(streaming: boolean): void;
  appendStreamContent(content: string): void;
  clearStreamContent(): void;
  setInputDraft(draft: string): void;
  setError(error: string | null): void;
  clearConversation(): void;
  sendMessage(content: string): Promise<void>;
  ingestStreamChunk(streamId: string, chunk: AIStreamChunk): void;
}

function toApiMessages(msgs: readonly AIMessageDisplay[]): readonly AIMessage[] {
  return msgs
    .filter((m) => m.role !== 'system' || m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
}

export const useAIStore = create<AIState>((set, get) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  inputDraft: '',
  error: null,
  activeStreamId: null,

  setConversationId: (id) => set({ conversationId: id }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  setMessages: (msgs) => set({ messages: msgs }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  appendStreamContent: (content) =>
    set((s) => ({ streamingContent: s.streamingContent + content })),

  clearStreamContent: () => set({ streamingContent: '' }),

  setInputDraft: (draft) => set({ inputDraft: draft }),

  setError: (error) => set({ error }),

  clearConversation: () =>
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      error: null,
      activeStreamId: null,
    }),

  ingestStreamChunk: (streamId, chunk) => {
    const { activeStreamId, isStreaming } = get();
    if (!isStreaming || streamId !== activeStreamId) {
      return;
    }
    if (chunk.content) {
      get().appendStreamContent(chunk.content);
    }
    if (chunk.done) {
      if (!get().isStreaming) {
        return;
      }
      const text = get().streamingContent;
      const assistant: AIMessageDisplay = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, assistant],
        streamingContent: '',
        isStreaming: false,
        activeStreamId: null,
      }));
    }
  },

  sendMessage: async (content) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    const { isStreaming } = get();
    if (isStreaming) {
      return;
    }

    if (!get().conversationId) {
      set({ conversationId: crypto.randomUUID() });
    }

    const userMsg: AIMessageDisplay = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    get().addMessage(userMsg);
    set({ inputDraft: '', error: null });
    get().clearStreamContent();
    set({ isStreaming: true });

    const settings = await window.api.ai.getSettings();
    const history = get().messages.filter((m) => !m.isStreaming);
    const messagesForApi = toApiMessages(history);

    const request: AICompletionRequest = {
      model: settings.defaultModel,
      messages: messagesForApi,
      ...(settings.systemPrompt.trim() ? { systemPrompt: settings.systemPrompt } : {}),
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
}));
