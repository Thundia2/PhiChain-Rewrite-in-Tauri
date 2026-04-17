// ============================================================
// AI Proxy Command — Tauri IPC handler
//
// Proxies AI chat completion requests from the frontend to a
// local inference server (Ollama, vLLM, llama.cpp). This exists
// because the app's CSP blocks frontend fetch() to localhost
// ports other than the Tauri dev server.
//
// Recent change (bug audit #10 + #11):
//   - Token counts from `usage.prompt_tokens` / `completion_tokens`
//     now saturate-cast from u64 to u32 instead of silently wrapping
//     via `as u32`. Large-context models returning > 4.3B tokens
//     would have reported nonsense counts in the UI.
//   - Error messages echoed to the frontend now strip the query
//     string from the endpoint URL via `sanitize_url_for_display`.
//     Gemini supports ?key=API_KEY in the URL — without this, a
//     timeout or connect error would leak the key into the toast
//     and any user-provided logs.
// ============================================================

use serde::{Deserialize, Serialize};
use futures_util::StreamExt;
use tauri::Emitter;

/// Strip the query string from a URL before echoing it back to the
/// frontend in error messages. Some providers (Google Gemini) accept
/// the API key as `?key=…` in the URL, so we must not reflect it in
/// logs or user-visible toasts.
///
/// Example: "https://…/v1/chat/completions?key=SECRET" → "https://…/v1/chat/completions"
fn sanitize_url_for_display(url: &str) -> &str {
    match url.split_once('?') {
        Some((before, _)) => before,
        None => url,
    }
}

/// Saturating cast from u64 to u32, for token usage counts.
/// Returns u32::MAX if the value would overflow, preserving a
/// meaningful large-number signal rather than wrapping silently.
#[inline]
fn u64_to_u32_sat(v: u64) -> u32 {
    if v > u32::MAX as u64 { u32::MAX } else { v as u32 }
}

/// A single message in the chat conversation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessage {
    pub role: String,    // "system" | "user" | "assistant"
    pub content: String,
}

/// Request payload from the TypeScript frontend.
/// Field names are camelCase to match TypeScript conventions.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateRequest {
    pub endpoint: String,           // e.g. "http://localhost:11434" or "https://generativelanguage.googleapis.com/v1beta/openai"
    pub model: String,              // e.g. "gemma4:27b" or "gemma-3-27b-it"
    pub messages: Vec<AiMessage>,   // Full conversation including system prompt
    pub temperature: Option<f32>,   // Default 0.2 (low for structured output)
    pub max_tokens: Option<u32>,    // Default 4096
    pub api_key: Option<String>,    // Optional API key for remote endpoints (sent as Bearer token)
}

/// Response payload sent back to the TypeScript frontend.
/// Field names are camelCase to match TypeScript conventions.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateResponse {
    pub content: String,            // The raw text response from the model
    pub finish_reason: String,      // "stop", "length", etc.
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

/// Proxy an AI chat completion request to a local inference server.
///
/// This exists because the frontend's CSP blocks fetch() to localhost
/// ports other than the Tauri dev server. The Rust backend has no
/// such restriction.
///
/// Supports any OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp).
#[tauri::command]
pub async fn ai_generate(request: AiGenerateRequest) -> Result<AiGenerateResponse, String> {
    // Build the OpenAI-compatible request body
    let body = serde_json::json!({
        "model": request.model,
        "messages": request.messages.iter().map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        }).collect::<Vec<_>>(),
        "temperature": request.temperature.unwrap_or(0.2),
        "max_tokens": request.max_tokens.unwrap_or(4096),
        // Request JSON mode if supported (Ollama supports this)
        "response_format": { "type": "json_object" },
    });

    // Build the full endpoint URL for the chat completions API.
    // If the user already included the path (e.g. pasted a full URL), don't double-append it.
    let base = request.endpoint.trim_end_matches('/');
    let url = if base.contains("/chat/completions") {
        base.to_string()
    } else if base.ends_with("/v1") || base.ends_with("/v1beta") || base.ends_with("/openai") {
        format!("{}/chat/completions", base)
    } else {
        format!("{}/v1/chat/completions", base)
    };

    // Create HTTP client with a generous timeout for AI inference
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Send the request to the AI server (local or remote)
    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json");

    // Add Authorization header if an API key is provided (for remote APIs like Google Gemini)
    if let Some(ref key) = request.api_key {
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = req
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            // Bug audit #11: sanitize URL to strip any ?key=… before echoing.
            let safe_url = sanitize_url_for_display(&url);
            if e.is_timeout() {
                format!("AI server timed out (120s). URL: {}", safe_url)
            } else if e.is_connect() {
                format!("Cannot connect to AI server at {}. Check that the endpoint URL is correct and the server is reachable.", safe_url)
            } else {
                format!("AI request failed: {} (URL: {})", e, safe_url)
            }
        })?;

    // Check for non-success HTTP status codes
    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("AI server returned {}: {}", status, body_text));
    }

    // Parse the JSON response from the inference server
    let resp_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;

    // Extract the assistant message from OpenAI-format response
    // Response shape: { choices: [{ message: { content: "..." }, finish_reason: "stop" }], usage: { ... } }
    let content = resp_json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let finish_reason = resp_json["choices"][0]["finish_reason"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    // Bug audit #10: saturating cast — models with very long contexts
    // can report > u32::MAX total tokens; wrapping would show nonsense.
    let prompt_tokens = resp_json["usage"]["prompt_tokens"].as_u64().map(u64_to_u32_sat);
    let completion_tokens = resp_json["usage"]["completion_tokens"].as_u64().map(u64_to_u32_sat);

    Ok(AiGenerateResponse {
        content,
        finish_reason,
        prompt_tokens,
        completion_tokens,
    })
}

// ============================================================
// Streaming AI generation via SSE (Server-Sent Events)
// ============================================================

/// Payload emitted to the frontend for each streaming chunk.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamChunk {
    pub content: String,              // The new token text (empty on final/error chunks)
    pub done: bool,                   // true on the final chunk
    pub finish_reason: Option<String>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub error: Option<String>,        // Non-None if an error occurred during streaming
}

/// Streaming version of ai_generate. Emits "ai-stream-chunk" events as tokens arrive,
/// then returns the fully assembled response.
///
/// Uses the OpenAI SSE streaming format:
///   data: {"choices":[{"delta":{"content":"token"},"finish_reason":null}]}
///   data: [DONE]
///
/// If the server ignores `stream: true` and returns a regular JSON response,
/// falls back to non-streaming behavior (emits one chunk with the full content).
#[tauri::command]
pub async fn ai_generate_stream(
    window: tauri::Window,
    request: AiGenerateRequest,
) -> Result<AiGenerateResponse, String> {
    // Build the request body — same as non-streaming but with stream: true
    // and WITHOUT response_format (not all providers support it with streaming)
    let body = serde_json::json!({
        "model": request.model,
        "messages": request.messages.iter().map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        }).collect::<Vec<_>>(),
        "temperature": request.temperature.unwrap_or(0.2),
        "max_tokens": request.max_tokens.unwrap_or(4096),
        "stream": true,
    });

    // Build URL (same logic as non-streaming)
    let base = request.endpoint.trim_end_matches('/');
    let url = if base.contains("/chat/completions") {
        base.to_string()
    } else if base.ends_with("/v1") || base.ends_with("/v1beta") || base.ends_with("/openai") {
        format!("{}/chat/completions", base)
    } else {
        format!("{}/v1/chat/completions", base)
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180)) // Longer timeout for streaming
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(ref key) = request.api_key {
        if !key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = req
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            // Bug audit #11: sanitize URL to strip any ?key=… before echoing.
            let safe_url = sanitize_url_for_display(&url);
            if e.is_timeout() {
                format!("AI server timed out (180s). URL: {}", safe_url)
            } else if e.is_connect() {
                format!("Cannot connect to AI server at {}. Check that the endpoint URL is correct and the server is reachable.", safe_url)
            } else {
                format!("AI request failed: {} (URL: {})", e, safe_url)
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!("AI server returned {}: {}", status, body_text));
    }

    // Check Content-Type to decide streaming vs fallback
    let content_type = response.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // ---- Non-streaming fallback ----
    // If the server returned a regular JSON response (ignoring stream: true),
    // parse it the same way as ai_generate and emit a single done chunk.
    if !content_type.contains("text/event-stream") && !content_type.contains("text/plain") {
        let resp_json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse AI response: {}", e))?;

        let content = resp_json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let finish_reason = resp_json["choices"][0]["finish_reason"]
            .as_str()
            .unwrap_or("stop")
            .to_string();
        // Bug audit #10: saturating cast — see comment on u64_to_u32_sat.
        let prompt_tokens = resp_json["usage"]["prompt_tokens"].as_u64().map(u64_to_u32_sat);
        let completion_tokens = resp_json["usage"]["completion_tokens"].as_u64().map(u64_to_u32_sat);

        // Emit a single chunk with the full content
        let _ = window.emit("ai-stream-chunk", AiStreamChunk {
            content: content.clone(),
            done: true,
            finish_reason: Some(finish_reason.clone()),
            prompt_tokens,
            completion_tokens,
            error: None,
        });

        return Ok(AiGenerateResponse { content, finish_reason, prompt_tokens, completion_tokens });
    }

    // ---- SSE streaming path ----
    let mut stream = response.bytes_stream();
    let mut line_buffer = String::new();
    let mut accumulated_content = String::new();
    let mut last_finish_reason = "unknown".to_string();
    let mut prompt_tokens: Option<u32> = None;
    let mut completion_tokens: Option<u32> = None;

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(bytes) => bytes,
            Err(e) => {
                // Emit error chunk and return
                let _ = window.emit("ai-stream-chunk", AiStreamChunk {
                    content: String::new(),
                    done: true,
                    finish_reason: None,
                    prompt_tokens,
                    completion_tokens,
                    error: Some(format!("Stream error: {}", e)),
                });
                return Err(format!("Stream error: {}", e));
            }
        };

        // Decode bytes to string (lossy handles partial UTF-8)
        let text = String::from_utf8_lossy(&chunk);
        line_buffer.push_str(&text);

        // Process complete lines from the buffer
        while let Some(newline_pos) = line_buffer.find('\n') {
            let line = line_buffer[..newline_pos].trim().to_string();
            line_buffer = line_buffer[newline_pos + 1..].to_string();

            // Skip empty lines and SSE comments
            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            // Handle the data: prefix
            if !line.starts_with("data:") {
                continue;
            }

            let data = line.strip_prefix("data:").unwrap().trim();

            // Check for stream termination
            if data == "[DONE]" {
                break;
            }

            // Parse the JSON chunk
            let chunk_json: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => {
                    // Malformed line — skip it, don't abort the stream
                    tracing::warn!("Malformed SSE data line: {}", data);
                    continue;
                }
            };

            // Extract the delta content token
            if let Some(token) = chunk_json["choices"][0]["delta"]["content"].as_str() {
                if !token.is_empty() {
                    accumulated_content.push_str(token);
                    // Emit the token to the frontend
                    if window.emit("ai-stream-chunk", AiStreamChunk {
                        content: token.to_string(),
                        done: false,
                        finish_reason: None,
                        prompt_tokens: None,
                        completion_tokens: None,
                        error: None,
                    }).is_err() {
                        // Window closed — stop streaming
                        break;
                    }
                }
            }

            // Extract finish reason if present
            if let Some(reason) = chunk_json["choices"][0]["finish_reason"].as_str() {
                last_finish_reason = reason.to_string();
            }

            // Extract token usage (usually on the last chunk before [DONE]).
            // Bug audit #10: saturating cast — see comment on u64_to_u32_sat.
            if let Some(pt) = chunk_json["usage"]["prompt_tokens"].as_u64() {
                prompt_tokens = Some(u64_to_u32_sat(pt));
            }
            if let Some(ct) = chunk_json["usage"]["completion_tokens"].as_u64() {
                completion_tokens = Some(u64_to_u32_sat(ct));
            }
        }
    }

    // Emit final done chunk
    let _ = window.emit("ai-stream-chunk", AiStreamChunk {
        content: String::new(),
        done: true,
        finish_reason: Some(last_finish_reason.clone()),
        prompt_tokens,
        completion_tokens,
        error: None,
    });

    Ok(AiGenerateResponse {
        content: accumulated_content,
        finish_reason: last_finish_reason,
        prompt_tokens,
        completion_tokens,
    })
}
