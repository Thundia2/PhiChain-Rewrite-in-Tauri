// ============================================================
// AI Chat Store — Zustand
//
// Manages conversation state for the AI generation feature.
// Lives in a Zustand store (NOT React component state) because
// the Context Panel destroys and recreates tab content components
// when switching modes. A Zustand store persists across these
// remounts, preserving the conversation history.
//
// Recent change: Added pendingQuestions state for the AI
// clarification protocol.
// ============================================================

import { create } from "zustand";
import type { AiMessage } from "../utils/aiService";
import type { AiCommand } from "../utils/aiCommandSchema";

export interface AiChatState {
  /** Full conversation history (system prompt is NOT stored here — injected at call time) */
  messages: AiMessage[];
  /** Commands from the latest AI response, awaiting user confirmation */
  pendingCommands: AiCommand[] | null;
  /** Human-readable preview of pendingCommands */
  pendingPreview: string | null;
  /** AI reasoning text from latest response */
  pendingReasoning: string | null;
  /** True while waiting for AI server response */
  isGenerating: boolean;
  /** Last error message (cleared on next generation) */
  error: string | null;
  /** Token usage from last request */
  lastTokenUsage: { prompt: number; completion: number } | null;
  /** Raw AI response text from last request (for debugging) */
  lastRawResponse: string | null;
  /** Finish reason from last request (e.g. "stop", "length") */
  lastFinishReason: string | null;
  /** Accumulated text during streaming (null = not streaming) */
  streamingContent: string | null;
  /** Clarification questions from AI (shown as a card, user answers naturally) */
  pendingQuestions: string[] | null;

  // Actions
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  setPending: (commands: AiCommand[], preview: string, reasoning?: string) => void;
  clearPending: () => void;
  setGenerating: (generating: boolean) => void;
  setError: (error: string | null) => void;
  setTokenUsage: (usage: { prompt: number; completion: number } | null) => void;
  setLastRawResponse: (raw: string | null, finishReason?: string) => void;
  appendStreamingContent: (token: string) => void;
  clearStreamingContent: () => void;
  setPendingQuestions: (questions: string[] | null) => void;
  clearConversation: () => void;
}

export const useAiChatStore = create<AiChatState>()((set) => ({
  messages: [],
  pendingCommands: null,
  pendingPreview: null,
  pendingReasoning: null,
  isGenerating: false,
  error: null,
  lastTokenUsage: null,
  lastRawResponse: null,
  lastFinishReason: null,
  streamingContent: null,
  pendingQuestions: null,

  addUserMessage: (content) =>
    set((s) => ({ messages: [...s.messages, { role: "user" as const, content }] })),

  addAssistantMessage: (content) =>
    set((s) => ({ messages: [...s.messages, { role: "assistant" as const, content }] })),

  setPending: (commands, preview, reasoning) =>
    set({ pendingCommands: commands, pendingPreview: preview, pendingReasoning: reasoning ?? null }),

  clearPending: () =>
    set({ pendingCommands: null, pendingPreview: null, pendingReasoning: null, pendingQuestions: null }),

  setGenerating: (generating) =>
    set((s) => ({ isGenerating: generating, error: generating ? null : s.error })),

  setError: (error) =>
    set({ error, isGenerating: false }),

  setTokenUsage: (usage) =>
    set({ lastTokenUsage: usage }),

  setLastRawResponse: (raw, finishReason) =>
    set({ lastRawResponse: raw, lastFinishReason: finishReason ?? null }),

  appendStreamingContent: (token) =>
    set((s) => ({ streamingContent: (s.streamingContent ?? "") + token })),

  clearStreamingContent: () =>
    set({ streamingContent: null }),

  setPendingQuestions: (questions) =>
    set({ pendingQuestions: questions }),

  clearConversation: () =>
    set({
      messages: [],
      pendingCommands: null,
      pendingPreview: null,
      pendingReasoning: null,
      error: null,
      lastTokenUsage: null,
      lastRawResponse: null,
      lastFinishReason: null,
      streamingContent: null,
      pendingQuestions: null,
    }),
}));
