import { describe, expect, it } from "vitest";
import { convertChatCompletionToResponses } from "../../open-sse/transformer/streamToJsonConverter.js";

describe("convertChatCompletionToResponses", () => {
  it("converts a simple assistant message to Responses API format", () => {
    const input = {
      id: "e3745ddf-ba44-9ec6-9a0e-c57c2bc21a37",
      object: "chat.completion",
      created: 1783147615,
      model: "grok-build",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "Hello! 👋\n\nHow can I help you today?",
          refusal: null,
        },
        finish_reason: "stop",
      }],
      usage: {},
      system_fingerprint: "fp_36bb860c5ab2a013",
      service_tier: "default",
    };

    const out = convertChatCompletionToResponses(input);

    expect(out.object).toBe("response");
    expect(out.id).toBe("resp_e3745ddf-ba44-9ec6-9a0e-c57c2bc21a37");
    expect(out.created_at).toBe(1783147615);
    expect(out.status).toBe("completed");
    expect(out.model).toBe("grok-build");
    expect(out.output).toHaveLength(1);
    expect(out.output[0]).toMatchObject({
      type: "message",
      role: "assistant",
      content: [{
        type: "output_text",
        text: "Hello! 👋\n\nHow can I help you today?",
      }],
    });
    expect(out.usage).toEqual({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
    expect(out.system_fingerprint).toBeUndefined();
    expect(out.choices).toBeUndefined();
  });

  it("maps prompt/completion token usage fields", () => {
    const out = convertChatCompletionToResponses({
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    });

    expect(out.usage).toEqual({ input_tokens: 12, output_tokens: 3, total_tokens: 15 });
  });

  it("passes through existing Responses API bodies unchanged", () => {
    const input = {
      id: "resp_test",
      object: "response",
      created_at: 1,
      status: "completed",
      output: [],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    };

    expect(convertChatCompletionToResponses(input)).toBe(input);
  });
});