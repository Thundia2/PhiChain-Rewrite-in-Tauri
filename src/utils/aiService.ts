// ============================================================
// AI Service Layer — Orchestrates AI chart generation
//
// Handles:
// - Assembling the system prompt + context + user message
// - Calling the Tauri proxy via ipc.ts
// - Parsing and validating the JSON response
// - Conversation history management
//
// Recent change: Updated to use buildSystemPrompt(), added
// questions passthrough for clarification protocol.
// ============================================================

import type { AiCommand } from "./aiCommandSchema";
import { generateAi, generateAiStream } from "./ipc";
import { buildSystemPrompt } from "./aiSystemPrompt";
import { buildAiContext } from "./aiContextBuilder";
import { useSettingsStore } from "../stores/settingsStore";

// ---- Types ----

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiGenerateResult {
  commands: AiCommand[];
  rawResponse: string;
  reasoning?: string;      // If the model outputs a "reasoning" field
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
  /** Clarification questions from the AI (if the request was ambiguous) */
  questions?: string[];
}

export interface AiConfig {
  endpoint: string;       // e.g. "http://localhost:11434" or "https://generativelanguage.googleapis.com/v1beta/openai"
  model: string;          // e.g. "gemma4:27b" or "gemma-3-27b-it"
  temperature: number;    // 0.0-1.0, default 0.2
  maxTokens: number;      // Default 4096
  apiKey?: string;        // Optional API key for remote endpoints
}

// ---- Core function ----

/**
 * Send a user prompt to the local AI model and get back structured commands.
 *
 * @param userMessage  - Natural language request from the user
 * @param history      - Previous messages in this conversation (for multi-turn)
 * @param config       - AI server configuration
 * @returns Parsed commands + metadata
 */
export async function generateAiCommands(
  userMessage: string,
  history: AiMessage[],
  config: AiConfig,
): Promise<AiGenerateResult> {
  // Build the chart context snapshot (pass userMessage for beat-aware filtering)
  const context = buildAiContext(userMessage);

  // Assemble the full system prompt with context + optional custom instructions
  const customPrompt = useSettingsStore.getState().aiCustomPrompt;
  let systemPrompt = buildSystemPrompt() + "\n\n" + context;
  if (customPrompt) {
    systemPrompt += "\n\n## Additional Instructions\n" + customPrompt;
  }

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Call the Tauri proxy command via the typed ipc.ts wrapper.
  // generateAi() already checks isTauri() and throws a helpful error
  // if not running inside Tauri (same pattern as loadProject, saveProject, etc.)
  const response = await generateAi({
    endpoint: config.endpoint,
    model: config.model,
    messages,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    apiKey: config.apiKey || undefined,
  });

  // Parse the JSON response from the AI model
  let parsed: ParsedResponse;
  try {
    parsed = parseAiResponse(response.content);
  } catch (parseErr) {
    // Attach the raw response to the error so the UI can show it for debugging
    const err = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
    (err as AiParseError).rawResponse = response.content;
    throw err;
  }

  return {
    commands: parsed.commands,
    rawResponse: response.content,
    reasoning: parsed.reasoning,
    finishReason: response.finishReason,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    questions: parsed.questions,
  };
}

/** Error with attached raw AI response for debugging */
export interface AiParseError extends Error {
  rawResponse?: string;
}

// ---- Streaming version ----

/**
 * Streaming version of generateAiCommands.
 * Tokens arrive progressively via the onToken callback.
 * Returns the same AiGenerateResult when the stream completes.
 *
 * @param userMessage  - Natural language request from the user
 * @param history      - Previous messages in this conversation
 * @param config       - AI server configuration
 * @param onToken      - Called with each new token as it arrives
 * @param userPrompt   - Raw user prompt for beat-aware context building
 * @returns Parsed commands + metadata (same as non-streaming)
 */
export async function generateAiCommandsStream(
  userMessage: string,
  history: AiMessage[],
  config: AiConfig,
  onToken: (token: string) => void,
): Promise<AiGenerateResult> {
  // Build the chart context snapshot (pass userMessage for beat-aware filtering)
  const context = buildAiContext(userMessage);

  // Assemble the full system prompt with context + optional custom instructions
  const customPrompt = useSettingsStore.getState().aiCustomPrompt;
  let systemPrompt = buildSystemPrompt() + "\n\n" + context;
  if (customPrompt) {
    systemPrompt += "\n\n## Additional Instructions\n" + customPrompt;
  }

  const messages: AiMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Use the streaming IPC wrapper — onChunk forwards tokens to onToken
  const response = await generateAiStream(
    {
      endpoint: config.endpoint,
      model: config.model,
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      apiKey: config.apiKey || undefined,
    },
    (chunk) => {
      if (chunk.content) {
        onToken(chunk.content);
      }
    },
  );

  // Parse the final complete response (identical to non-streaming path)
  let parsed: ParsedResponse;
  try {
    parsed = parseAiResponse(response.content);
  } catch (parseErr) {
    const err = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
    (err as AiParseError).rawResponse = response.content;
    throw err;
  }

  return {
    commands: parsed.commands,
    rawResponse: response.content,
    reasoning: parsed.reasoning,
    finishReason: response.finishReason,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    questions: parsed.questions,
  };
}

// ---- Response parser ----

interface ParsedResponse {
  commands: AiCommand[];
  reasoning?: string;
  /** Clarification questions from the AI */
  questions?: string[];
}

/**
 * Parse the AI model's raw text output into validated commands.
 *
 * The model is instructed to output:
 * {
 *   "reasoning": "...",   // optional chain-of-thought
 *   "commands": [...]     // the structured command array
 * }
 *
 * We also handle edge cases:
 * - Response wrapped in markdown code fences
 * - Response is a bare array (no wrapper object)
 * - Model outputs extra text before/after the JSON
 */
function parseAiResponse(raw: string): ParsedResponse {
  let text = raw.trim();

  // ---- Strip <thought>...</thought> blocks (Gemma 4 chain-of-thought) ----
  // Capture the thought content as reasoning, then remove it so we can find the JSON
  let thoughtReasoning: string | undefined;
  const thoughtMatch = text.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thoughtMatch) {
    thoughtReasoning = thoughtMatch[1].trim();
    // Remove the thought block — the JSON should be after it
    text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
  }
  // Also handle unclosed <thought> tags (model got cut off mid-thought)
  // In this case, check if there's JSON after the thought text
  if (!thoughtMatch && text.includes("<thought>")) {
    const thoughtStart = text.indexOf("<thought>");
    const afterThought = text.slice(thoughtStart + 9);
    // Try to find JSON in the text after <thought>
    const jsonInThought = afterThought.indexOf("{");
    if (jsonInThought !== -1) {
      thoughtReasoning = afterThought.slice(0, jsonInThought).trim();
      text = afterThought.slice(jsonInThought);
    }
  }

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  } else {
    if (text.startsWith("```json")) text = text.slice(7);
    else if (text.startsWith("```")) text = text.slice(3);
    if (text.endsWith("```")) text = text.slice(0, -3);
    text = text.trim();
  }

  // Find the JSON object or array by locating balanced braces/brackets.
  // This handles trailing text, prose after the JSON, etc.
  const jsonStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");

  let json: unknown;

  // Decide if we're looking for an object or array
  let startIdx = -1;
  let openChar = "{";
  let closeChar = "}";

  if (jsonStart !== -1 && (arrayStart === -1 || jsonStart < arrayStart)) {
    startIdx = jsonStart;
    openChar = "{";
    closeChar = "}";
  } else if (arrayStart !== -1) {
    startIdx = arrayStart;
    openChar = "[";
    closeChar = "]";
  }

  if (startIdx === -1) {
    throw new Error("AI response does not contain JSON");
  }

  // Find the matching closing bracket by counting depth.
  // This correctly handles nested objects/arrays and strings.
  const endIdx = findMatchingBracket(text, startIdx, openChar, closeChar);
  if (endIdx === -1) {
    // Fallback: try parsing from startIdx to end (may work if only trailing whitespace)
    try {
      json = JSON.parse(text.slice(startIdx));
    } catch {
      throw new Error(`Unbalanced JSON in AI response (started at pos ${startIdx})`);
    }
  } else {
    const jsonStr = text.slice(startIdx, endIdx + 1);
    json = JSON.parse(jsonStr);
  }

  // Normalize into { reasoning, commands, questions }
  // Use thoughtReasoning (from <thought> tags) as fallback if the JSON doesn't have its own reasoning
  if (Array.isArray(json)) {
    return { commands: json as AiCommand[], reasoning: thoughtReasoning };
  }
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    // Accept both "commands" and "actions" as the array key
    const commands = (obj.commands ?? obj.actions ?? []) as AiCommand[];
    const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : (thoughtReasoning ?? undefined);
    // Extract clarification questions if present
    const questions = Array.isArray(obj.questions)
      ? (obj.questions as unknown[]).filter((q): q is string => typeof q === "string")
      : undefined;
    return { commands, reasoning, questions: questions?.length ? questions : undefined };
  }

  throw new Error("AI response JSON is not an object or array");
}

/**
 * Find the index of the matching closing bracket for the opening bracket at `start`.
 * Handles nested brackets and JSON string literals (skips content inside "...").
 * Returns -1 if no matching bracket is found.
 */
function findMatchingBracket(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1; // Unbalanced
}
