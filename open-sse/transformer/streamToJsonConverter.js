/**
 * Stream-to-JSON Converter
 * Converts Responses API SSE stream to single JSON response
 * Used when client requests non-streaming but provider forces streaming (e.g., Codex)
 */

import { ROLE, RESPONSES_ITEM } from "../translator/schema/index.js";

function toResponseId(id) {
  const raw = String(id || "").trim();
  if (!raw) return `resp_${Date.now()}`;
  if (raw.startsWith("resp_")) return raw;
  return `resp_${raw.replace(/^chatcmpl-/, "")}`;
}

function mapUsage(usage = {}) {
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens);
  const mapped = { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens };
  if (usage.input_tokens_details) mapped.input_tokens_details = usage.input_tokens_details;
  if (usage.output_tokens_details) mapped.output_tokens_details = usage.output_tokens_details;
  if (usage.prompt_tokens_details?.cached_tokens != null) {
    mapped.input_tokens_details = {
      ...mapped.input_tokens_details,
      cached_tokens: usage.prompt_tokens_details.cached_tokens,
    };
  }
  if (usage.completion_tokens_details?.reasoning_tokens != null) {
    mapped.output_tokens_details = {
      ...mapped.output_tokens_details,
      reasoning_tokens: usage.completion_tokens_details.reasoning_tokens,
    };
  }
  return mapped;
}

/**
 * Convert a non-streaming OpenAI chat.completion JSON body to Responses API format.
 * Used when /v1/responses clients receive chat.completion from providers that default to JSON.
 */
export function convertChatCompletionToResponses(completion) {
  if (!completion || typeof completion !== "object") return completion;
  if (completion.object === "response") return completion;
  if (completion.object !== "chat.completion") return completion;

  const choice = completion.choices?.[0];
  const message = choice?.message || {};
  const responseId = toResponseId(completion.id);
  const output = [];
  let outputIndex = 0;

  const reasoning = message.reasoning_content || "";
  if (reasoning) {
    output.push({
      id: `rs_${responseId}_${outputIndex}`,
      type: RESPONSES_ITEM.REASONING,
      summary: [{ type: RESPONSES_ITEM.SUMMARY_TEXT, text: reasoning }],
    });
    outputIndex++;
  }

  const text = typeof message.content === "string" ? message.content : "";
  if (text || (!reasoning && !(message.tool_calls || []).length)) {
    output.push({
      id: `msg_${responseId}_${outputIndex}`,
      type: RESPONSES_ITEM.MESSAGE,
      role: ROLE.ASSISTANT,
      content: [{
        type: RESPONSES_ITEM.OUTPUT_TEXT,
        annotations: [],
        logprobs: [],
        text,
      }],
    });
    outputIndex++;
  }

  for (const tc of message.tool_calls || []) {
    const callId = tc.id || `call_${outputIndex}`;
    const args = typeof tc.function?.arguments === "string"
      ? tc.function.arguments
      : JSON.stringify(tc.function?.arguments || {});
    output.push({
      id: `fc_${callId}`,
      type: RESPONSES_ITEM.FUNCTION_CALL,
      call_id: callId,
      name: tc.function?.name || "",
      arguments: args,
    });
    outputIndex++;
  }

  const result = {
    id: responseId,
    object: "response",
    created_at: completion.created || Math.floor(Date.now() / 1000),
    status: "completed",
    background: false,
    error: null,
    output,
    usage: mapUsage(completion.usage),
  };

  if (completion.model) result.model = completion.model;
  return result;
}

/**
 * Process a single SSE message and update state accordingly.
 */
function processSSEMessage(msg, state) {
  if (!msg.trim()) return;

  const eventMatch = msg.match(/^event:\s*(.+)$/m);
  const dataMatch = msg.match(/^data:\s*(.+)$/m);
  if (!eventMatch || !dataMatch) return;

  const eventType = eventMatch[1].trim();
  const dataStr = dataMatch[1].trim();
  if (dataStr === "[DONE]") return;

  let parsed;
  try { parsed = JSON.parse(dataStr); }
  catch { return; }

  if (eventType === "response.created") {
    state.responseId = parsed.response?.id || state.responseId;
    state.created = parsed.response?.created_at || state.created;
  } else if (eventType === "response.output_item.done") {
    state.items.set(parsed.output_index ?? 0, parsed.item);
  } else if (eventType === "response.completed" || eventType === "response.done") {
    state.status = "completed";
    if (parsed.response?.usage) {
      state.usage.input_tokens = parsed.response.usage.input_tokens || 0;
      state.usage.output_tokens = parsed.response.usage.output_tokens || 0;
      state.usage.total_tokens = parsed.response.usage.total_tokens || 0;
    }
  } else if (eventType === "response.failed") {
    state.status = "failed";
  }
}

const EMPTY_RESPONSE = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

/**
 * Convert Responses API SSE stream to single JSON response
 * @param {ReadableStream} stream - SSE stream from provider
 * @returns {Promise<Object>} Final JSON response in Responses API format
 */
export async function convertResponsesStreamToJson(stream) {
  if (!stream || typeof stream.getReader !== "function") {
    return { id: `resp_${Date.now()}`, object: "response", created_at: Math.floor(Date.now() / 1000), status: "failed", output: [], usage: { ...EMPTY_RESPONSE } };
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const state = {
    responseId: "",
    created: Math.floor(Date.now() / 1000),
    status: "in_progress",
    usage: { ...EMPTY_RESPONSE },
    items: new Map()
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || "";

      for (const msg of messages) {
        processSSEMessage(msg, state);
      }
    }

    // Flush remaining buffer (last event may not end with \n\n)
    if (buffer.trim()) {
      processSSEMessage(buffer, state);
    }
  } finally {
    reader.releaseLock();
  }

  // Build output array from accumulated items (ordered by index)
  const output = [];
  const maxIndex = state.items.size > 0 ? Math.max(...state.items.keys()) : -1;
  for (let i = 0; i <= maxIndex; i++) {
    output.push(state.items.get(i) || { type: "message", content: [], role: "assistant" });
  }

  return {
    id: state.responseId || `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "response",
    created_at: state.created,
    status: state.status || "completed",
    output,
    usage: state.usage
  };
}
