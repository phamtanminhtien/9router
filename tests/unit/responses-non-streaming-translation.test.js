import { describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/translator/index.js", () => ({
  needsTranslation: vi.fn(),
  register: vi.fn(),
}));

vi.mock("../../open-sse/translator/response/ollama-to-openai.js", () => ({
  ollamaBodyToOpenAI: vi.fn((body) => body),
}));

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(),
  saveRequestDetail: vi.fn(),
}));

import { translateNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

describe("translateNonStreamingResponse openai-responses client", () => {
  it("converts chat.completion upstream bodies to Responses API format", () => {
    const upstream = {
      id: "a758e2b3-31dc-9d6a-894f-7bb9e8c7c09b",
      object: "chat.completion",
      created: 1783148176,
      model: "grok-build",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "Hello! 👋 How can I help you today?",
          refusal: null,
        },
        finish_reason: "stop",
      }],
      usage: {},
      system_fingerprint: "fp_36bb860c5ab2a013",
      service_tier: "default",
    };

    const out = translateNonStreamingResponse(
      upstream,
      FORMATS.OPENAI,
      FORMATS.OPENAI_RESPONSES,
    );

    expect(out.object).toBe("response");
    expect(out.id).toBe("resp_a758e2b3-31dc-9d6a-894f-7bb9e8c7c09b");
    expect(out.output[0].content[0].text).toBe("Hello! 👋 How can I help you today?");
    expect(out.choices).toBeUndefined();
  });
});