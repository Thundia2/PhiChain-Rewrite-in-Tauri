// ============================================================
// AiTab — AI Chat Tab for the Context Panel
//
// Renders inside the Context Panel's existing scrollable content
// area. Provides a compact chat interface for natural language
// chart generation with full response logging.
//
// Recent change: Added full logging — raw AI response is always
// visible via expandable viewer on every response path (success,
// empty commands, and parse errors). Token usage + finish reason
// shown inline after each response.
// ============================================================

import { useRef, useEffect, useCallback, useState } from "react";
import { useAiChatStore } from "../../../stores/aiChatStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { generateAiCommandsStream } from "../../../utils/aiService";
import { executeAiCommands, previewAiCommands } from "../../../utils/aiCommandExecutor";
import type { AiParseError } from "../../../utils/aiService";
import { useToastStore } from "../../../stores/toastStore";

// ---- Styles ----

const COLORS = {
  aiAccent: "#3dd8e0",
  aiAccentDim: "rgba(61, 216, 224, 0.12)",
  aiAccentGlow: "rgba(61, 216, 224, 0.25)",
  userBg: "rgba(108, 138, 255, 0.10)",
  userBorder: "rgba(108, 138, 255, 0.18)",
  assistantBg: "rgba(61, 216, 224, 0.06)",
  assistantBorder: "rgba(61, 216, 224, 0.12)",
  previewBg: "rgba(61, 216, 224, 0.05)",
  previewBorder: "rgba(61, 216, 224, 0.20)",
  dangerFg: "#ff4a6a",
  dangerBg: "rgba(255, 74, 106, 0.08)",
  successFg: "#4aff7a",
  successBg: "rgba(74, 255, 122, 0.08)",
  warnFg: "#ffb74d",
  // Info card (empty commands)
  infoBg: "rgba(108, 138, 255, 0.06)",
  infoBorder: "rgba(108, 138, 255, 0.15)",
};

export function AiTab() {
  const {
    messages,
    pendingCommands,
    pendingPreview,
    pendingReasoning,
    isGenerating,
    error,
    lastTokenUsage,
    lastRawResponse,
    lastFinishReason,
    streamingContent,
    pendingQuestions,
    addUserMessage,
    addAssistantMessage,
    setPending,
    clearPending,
    setGenerating,
    setError,
    setTokenUsage,
    setLastRawResponse,
    appendStreamingContent,
    clearStreamingContent,
    setPendingQuestions,
    clearConversation,
  } = useAiChatStore();

  const aiEnabled = useSettingsStore((s) => s.aiEnabled);
  const aiEndpoint = useSettingsStore((s) => s.aiEndpoint);
  const aiModel = useSettingsStore((s) => s.aiModel);
  const aiTemperature = useSettingsStore((s) => s.aiTemperature);
  const aiMaxTokens = useSettingsStore((s) => s.aiMaxTokens);
  const aiApiKey = useSettingsStore((s) => s.aiApiKey);

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [errorRaw, setErrorRaw] = useState<string | null>(null);
  const [errorRawExpanded, setErrorRawExpanded] = useState(false);
  // Abort flag — when set to true, the streaming handler stops processing chunks
  const abortRef = useRef(false);

  // Auto-scroll to bottom when messages change
  // Use instant scroll during streaming to avoid animation jank
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isGenerating ? "auto" : "smooth" });
  }, [messages, pendingPreview, error, isGenerating, streamingContent, lastRawResponse]);

  // Auto-resize textarea to fit content
  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  // ---- Generate handler ----
  const handleGenerate = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    addUserMessage(trimmed);
    setGenerating(true);
    clearPending();
    clearStreamingContent();
    setErrorRaw(null);
    setErrorRawExpanded(false);
    setLastRawResponse(null);
    abortRef.current = false;

    try {
      // Use streaming — tokens arrive progressively via appendStreamingContent
      const result = await generateAiCommandsStream(
        trimmed,
        messages,
        {
          endpoint: aiEndpoint,
          model: aiModel,
          temperature: aiTemperature,
          maxTokens: aiMaxTokens,
          apiKey: aiApiKey || undefined,
        },
        (token) => {
          // Stop processing tokens if the user clicked Stop
          if (abortRef.current) return;
          appendStreamingContent(token);
        },
      );

      // If aborted, save whatever we got so far and stop
      if (abortRef.current) {
        const partial = useAiChatStore.getState().streamingContent ?? "";
        clearStreamingContent();
        if (partial) {
          addAssistantMessage(partial);
          setLastRawResponse(partial, "stopped");
        }
        setGenerating(false);
        return;
      }

      // Streaming complete — clear the streaming state
      clearStreamingContent();

      // Always store the raw response and token usage for visibility
      setLastRawResponse(result.rawResponse, result.finishReason);
      if (result.promptTokens !== undefined && result.completionTokens !== undefined) {
        setTokenUsage({ prompt: result.promptTokens, completion: result.completionTokens });
      }

      // Check for clarification questions from the AI
      if (result.questions && result.questions.length > 0) {
        setPendingQuestions(result.questions);
      }

      if (result.commands.length === 0) {
        addAssistantMessage(result.rawResponse);
        setGenerating(false);
        return;
      }

      // Generate preview and store pending commands
      const preview = previewAiCommands(result.commands);
      setPending(result.commands, preview, result.reasoning);
      addAssistantMessage(result.rawResponse);
      setGenerating(false);
    } catch (err) {
      clearStreamingContent();
      if (abortRef.current) {
        // User stopped — not an error
        setGenerating(false);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const rawResp = (err as AiParseError)?.rawResponse;
      setError(message);
      setErrorRaw(rawResp ?? null);
      if (rawResp) setLastRawResponse(rawResp);
    }
  }, [input, isGenerating, messages, aiEndpoint, aiModel, aiTemperature, aiMaxTokens, aiApiKey,
    addUserMessage, addAssistantMessage, setGenerating, clearPending, setPending, setError,
    setTokenUsage, setLastRawResponse, appendStreamingContent, clearStreamingContent, setPendingQuestions]);

  // ---- Apply handler ----
  const handleApply = useCallback(() => {
    if (!pendingCommands) return;
    try {
      const result = executeAiCommands(pendingCommands);
      clearPending();
      useToastStore.getState().addToast({
        message: `AI applied: ${result.notesCreated} notes, ${result.eventsCreated} events, ${result.linesCreated} lines`,
        type: "success",
      });
    } catch (err) {
      useToastStore.getState().addToast({
        message: `AI execution failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "error",
      });
    }
  }, [pendingCommands, clearPending]);

  const handleDiscard = useCallback(() => { clearPending(); }, [clearPending]);

  // ---- Stop handler — aborts the current streaming generation ----
  const handleStop = useCallback(() => {
    abortRef.current = true;
    // Save whatever streamed so far as a partial response
    const partial = useAiChatStore.getState().streamingContent ?? "";
    clearStreamingContent();
    if (partial) {
      addAssistantMessage(partial);
      setLastRawResponse(partial, "stopped");
    }
    setGenerating(false);
  }, [clearStreamingContent, addAssistantMessage, setLastRawResponse, setGenerating]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
  }, [handleGenerate]);

  // ---- Not enabled state ----
  if (!aiEnabled) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "32px 16px", textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: COLORS.aiAccentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
          <span style={{ color: COLORS.aiAccent, filter: "brightness(1.2)" }}>&#x2726;</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          AI generation is disabled.<br />
          Enable it in <span style={{ color: COLORS.aiAccent }}>Settings &gt; AI Generation</span>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", minHeight: 0 }}>
      {/* ---- Messages area ---- */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6, minHeight: 0 }}>
        {/* Empty state */}
        {messages.length === 0 && !isGenerating && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 8px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 16, color: COLORS.aiAccent, letterSpacing: "0.08em", fontWeight: 600 }}>&#x2726; AI Chart Generation</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 220 }}>
              Describe what to generate in natural language. The AI will output structured commands that you can preview and apply.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginTop: 4 }}>
              {["5 tap notes from beat 6 to 11", "Circle motion from beat 0 to 32", "Fade in the selected line", "Add a sine wave of drag notes"].map((s) => (
                <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9, border: `1px solid ${COLORS.assistantBorder}`, background: COLORS.assistantBg, color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.aiAccent; e.currentTarget.style.color = COLORS.aiAccent; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.assistantBorder; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}

        {/* Streaming / generating bubble */}
        {isGenerating && (
          <div style={{ borderRadius: 6, background: COLORS.assistantBg, border: `1px solid ${COLORS.assistantBorder}`, overflow: "hidden" }}>
            <div style={{ padding: "6px 10px" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: COLORS.aiAccent, marginBottom: 3, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {"\u2726"} AI
              </div>
              {streamingContent ? (
                /* Tokens are arriving — show text progressively */
                <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {streamingContent}
                  <span style={{ display: "inline-flex", marginLeft: 2, verticalAlign: "middle" }}><LoadingDots /></span>
                </div>
              ) : (
                /* Waiting for first token */
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                  <LoadingDots />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Generating...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={{ borderRadius: 6, background: COLORS.dangerBg, border: `1px solid rgba(255, 74, 106, 0.2)`, overflow: "hidden" }}>
            <div style={{ padding: "8px 10px", fontSize: 11, color: COLORS.dangerFg, lineHeight: 1.4, wordBreak: "break-word" }}>
              <strong>Error:</strong> {error}
            </div>
            {errorRaw && (
              <ExpandableRaw label="Raw AI response" content={errorRaw} expanded={errorRawExpanded} onToggle={() => setErrorRawExpanded(!errorRawExpanded)} accentColor={COLORS.dangerFg} />
            )}
          </div>
        )}

        {/* ---- Token usage + finish reason (shown after last response) ---- */}
        {!isGenerating && (lastTokenUsage || lastFinishReason) && messages.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px", fontSize: 9, fontFamily: "monospace", color: "var(--text-muted)", opacity: 0.6 }}>
            {lastTokenUsage && <span>{lastTokenUsage.prompt}p + {lastTokenUsage.completion}c = {lastTokenUsage.prompt + lastTokenUsage.completion} tokens</span>}
            {lastFinishReason && <span>finish: {lastFinishReason}</span>}
          </div>
        )}

        {/* ---- Raw response viewer (always available after any response) ---- */}
        {!isGenerating && lastRawResponse && !error && (
          <RawResponseCard rawResponse={lastRawResponse} />
        )}

        {/* ---- Clarification questions card ---- */}
        {pendingQuestions && pendingQuestions.length > 0 && (
          <div style={{ borderRadius: 6, border: `1px solid ${COLORS.warnFg}33`, background: `${COLORS.warnFg}0a`, overflow: "hidden" }}>
            <div style={{ padding: "7px 10px", fontSize: 11, fontWeight: 600, color: COLORS.warnFg, letterSpacing: "0.04em" }}>
              Clarification needed
            </div>
            <div style={{ padding: "2px 10px 8px", fontSize: 11, lineHeight: 1.6, color: "var(--text-secondary)" }}>
              {pendingQuestions.map((q, i) => (
                <div key={i} style={{ marginBottom: 3 }}>
                  {i + 1}. {q}
                </div>
              ))}
            </div>
            <div style={{ padding: "0 10px 8px", fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>
              Type your answer below to continue.
            </div>
          </div>
        )}

        {/* ---- Preview card ---- */}
        {pendingCommands && pendingPreview && (
          <div style={{ borderRadius: 6, border: `1px solid ${COLORS.previewBorder}`, background: COLORS.previewBg, overflow: "hidden" }}>
            {/* Header */}
            <button onClick={() => setPreviewExpanded(!previewExpanded)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", background: "none", border: "none", cursor: "pointer", color: COLORS.aiAccent, fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>
              <span>Preview ({pendingCommands.length} command{pendingCommands.length !== 1 ? "s" : ""})</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>{previewExpanded ? "COLLAPSE" : "EXPAND"}</span>
            </button>
            {/* Reasoning */}
            {previewExpanded && pendingReasoning && (
              <div style={{ padding: "4px 10px 6px", fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.4, borderBottom: `1px solid ${COLORS.assistantBorder}` }}>
                {pendingReasoning}
              </div>
            )}
            {/* Preview lines */}
            {previewExpanded && (
              <div style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 10, lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {pendingPreview.split("\n").map((line, i) => {
                  let c = "var(--text-secondary)";
                  if (line.startsWith("+")) c = COLORS.successFg;
                  else if (line.startsWith("-")) c = COLORS.dangerFg;
                  else if (line.startsWith("!")) c = COLORS.warnFg;
                  else if (line.startsWith("~")) c = COLORS.aiAccent;
                  else if (line.startsWith("#")) c = "var(--accent-primary)";
                  return <div key={i} style={{ color: c }}>{line}</div>;
                })}
              </div>
            )}
            {/* Apply / Discard */}
            <div style={{ display: "flex", gap: 6, padding: "6px 10px 8px", borderTop: `1px solid ${COLORS.assistantBorder}` }}>
              <button onClick={handleApply}
                style={{ flex: 1, padding: "5px 0", borderRadius: 5, border: "none", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: COLORS.aiAccent, color: "#0a0a12", transition: "filter 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none"; }}>
                Apply
              </button>
              <button onClick={handleDiscard}
                style={{ flex: 1, padding: "5px 0", borderRadius: 5, border: "1px solid var(--border-color)", fontSize: 11, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", background: "transparent", color: "var(--text-secondary)", transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.dangerFg; e.currentTarget.style.color = COLORS.dangerFg; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
                Discard
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ---- Input area ---- */}
      <div style={{ flexShrink: 0, borderTop: "1px solid var(--border-color)", paddingTop: 8 }}>
        <div style={{ position: "relative", borderRadius: 6, border: `1px solid ${isGenerating ? COLORS.aiAccentGlow : "var(--border-color)"}`, background: "var(--bg-primary)", overflow: "hidden", transition: "border-color 0.2s" }}>
          <textarea ref={textareaRef} value={input}
            onChange={(e) => { setInput(e.target.value); handleTextareaInput(); }}
            onKeyDown={handleKeyDown} placeholder="Describe what to generate..." disabled={isGenerating} rows={1}
            style={{ width: "100%", padding: "8px 10px", border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", fontSize: 11, fontFamily: "inherit", lineHeight: 1.5, resize: "none", minHeight: 20, maxHeight: 120 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isGenerating ? (
              /* Stop button — shown during generation */
              <button onClick={handleStop}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: 5, border: `1px solid ${COLORS.dangerFg}`, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: COLORS.dangerBg, color: COLORS.dangerFg, transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 74, 106, 0.18)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.dangerBg; }}>
                <span style={{ fontSize: 11 }}>{"\u25A0"}</span> Stop
              </button>
            ) : (
              /* Generate button — shown when idle */
              <button onClick={handleGenerate} disabled={!input.trim()}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: 5, border: "none", fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: !input.trim() ? "default" : "pointer", background: !input.trim() ? "var(--bg-active)" : COLORS.aiAccent, color: !input.trim() ? "var(--text-muted)" : "#0a0a12", transition: "all 0.15s" }}>
                <span style={{ fontSize: 13 }}>&#x2726;</span> Generate
              </button>
            )}
            {messages.length > 0 && !isGenerating && (
              <button onClick={clearConversation}
                style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--border-color)", fontSize: 10, fontFamily: "inherit", cursor: "pointer", background: "transparent", color: "var(--text-muted)", transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.dangerFg; e.currentTarget.style.borderColor = "rgba(255,74,106,0.3)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

/** Expandable raw text viewer — used for errors and raw response cards */
function ExpandableRaw({ label, content, expanded, onToggle, accentColor }: {
  label: string; content: string; expanded: boolean; onToggle: () => void; accentColor: string;
}) {
  return (
    <div style={{ borderTop: `1px solid ${accentColor}22` }}>
      <button onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: "none", border: "none", cursor: "pointer", color: accentColor, fontSize: 10, fontFamily: "inherit", opacity: 0.8 }}>
        <span>{label} ({content.length} chars)</span>
        <span>{expanded ? "HIDE" : "SHOW"}</span>
      </button>
      {expanded && (
        <pre style={{ padding: "6px 10px 8px", margin: 0, fontSize: 9, fontFamily: "monospace", color: "var(--text-secondary)", lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 250, overflowY: "auto", borderTop: `1px solid ${accentColor}15` }}>
          {content}
        </pre>
      )}
    </div>
  );
}

/** Card that shows the raw AI response — always visible after a response */
function RawResponseCard({ rawResponse }: { rawResponse: string }) {
  const [expanded, setExpanded] = useState(false);

  // Try to extract a display summary from the raw response
  let summary = "";
  let prettyJson = "";
  try {
    const parsed = JSON.parse(rawResponse);
    if (parsed.reasoning) summary = parsed.reasoning;
    prettyJson = JSON.stringify(parsed, null, 2);
  } catch {
    // Not valid JSON — show as raw text
    prettyJson = rawResponse;
  }

  return (
    <div style={{ borderRadius: 6, border: `1px solid ${COLORS.infoBorder}`, background: COLORS.infoBg, overflow: "hidden" }}>
      {/* Summary line */}
      {summary && (
        <div style={{ padding: "6px 10px", fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.4 }}>
          {summary}
        </div>
      )}
      {/* Expandable raw */}
      <ExpandableRaw
        label="Raw response"
        content={prettyJson}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        accentColor="var(--accent-primary)"
      />
    </div>
  );
}

/** Message bubble for user and assistant messages */
function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  const [rawExpanded, setRawExpanded] = useState(false);

  // For assistant messages, extract reasoning as the display text
  let displayContent = content;
  let hasRawJson = false;
  let prettyRaw = content;

  if (!isUser) {
    try {
      const parsed = JSON.parse(content);
      hasRawJson = true;
      prettyRaw = JSON.stringify(parsed, null, 2);
      if (parsed.reasoning) {
        displayContent = parsed.reasoning;
      } else {
        // No reasoning field — show a brief summary
        const cmdCount = Array.isArray(parsed.commands) ? parsed.commands.length : 0;
        displayContent = cmdCount > 0
          ? `Generated ${cmdCount} command${cmdCount !== 1 ? "s" : ""}.`
          : "Response received (no commands).";
      }
    } catch {
      // Not JSON — show as-is but still offer expandable view if long
      hasRawJson = content.length > 200;
      prettyRaw = content;
      if (content.length > 400) {
        displayContent = content.slice(0, 400) + "...";
      }
    }
  }

  return (
    <div style={{ borderRadius: 6, background: isUser ? COLORS.userBg : COLORS.assistantBg, border: `1px solid ${isUser ? COLORS.userBorder : COLORS.assistantBorder}`, overflow: "hidden" }}>
      <div style={{ padding: "6px 10px" }}>
        {/* Role label */}
        <div style={{ fontSize: 9, fontWeight: 600, color: isUser ? "var(--accent-primary)" : COLORS.aiAccent, marginBottom: 3, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {isUser ? "You" : "\u2726 AI"}
        </div>
        {/* Content */}
        <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {displayContent}
        </div>
      </div>
      {/* Expandable raw for assistant messages */}
      {!isUser && hasRawJson && (
        <ExpandableRaw
          label="Full response"
          content={prettyRaw}
          expanded={rawExpanded}
          onToggle={() => setRawExpanded(!rawExpanded)}
          accentColor={COLORS.aiAccent}
        />
      )}
    </div>
  );
}

/** Animated loading dots */
function LoadingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      <style>{`@keyframes aiDot { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }`}</style>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: COLORS.aiAccent, animation: `aiDot 1.2s ease-in-out ${i * 0.15}s infinite` }} />
      ))}
    </span>
  );
}
