// grok-web & xai should default to non-streaming JSON when body.stream is omitted (OpenAI-compatible).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({
    execute: executeMock,
    refreshCredentials: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: vi.fn(async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logError: vi.fn(),
  })),
}));

vi.mock("../../open-sse/utils/clientDetector.js", () => ({
  detectClientTool: vi.fn(() => null),
  isNativePassthrough: vi.fn(() => false),
}));

vi.mock("../../open-sse/utils/bypassHandler.js", () => ({
  handleBypassRequest: vi.fn(() => null),
}));

vi.mock("../../open-sse/utils/streamHandler.js", () => ({
  createStreamController: vi.fn(() => ({
    signal: undefined,
    handleComplete: vi.fn(),
    handleError: vi.fn(),
  })),
}));

vi.mock("../../open-sse/services/tokenRefresh.js", () => ({
  refreshWithRetry: vi.fn(),
}));

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  default: vi.fn(),
  proxyAwareFetch: vi.fn(),
}));

vi.mock("../../open-sse/translator/index.js", () => ({
  translateRequest: vi.fn((_sourceFormat, _targetFormat, model, body) => ({ ...body, model })),
  translateResponse: vi.fn(),
  needsTranslation: vi.fn(() => false),
  register: vi.fn(),
}));

vi.mock("../../open-sse/translator/formats/claude.js", () => ({
  normalizeClaudePassthrough: vi.fn(),
}));

vi.mock("../../open-sse/utils/toolDeduper.js", () => ({
  dedupeTools: vi.fn((tools) => ({ tools, stripped: [] })),
}));

vi.mock("../../open-sse/rtk/caveman.js", () => ({
  injectCaveman: vi.fn(),
}));

vi.mock("../../open-sse/rtk/ponytail.js", () => ({
  injectPonytail: vi.fn(),
}));

vi.mock("../../open-sse/rtk/index.js", () => ({
  compressMessages: vi.fn(() => null),
  formatRtkLog: vi.fn(() => ""),
}));

vi.mock("../../open-sse/rtk/headroom.js", () => ({
  compressWithHeadroom: vi.fn(async () => null),
  formatHeadroomLog: vi.fn(() => ""),
  formatHeadroomSizeLog: vi.fn(() => ""),
  isHeadroomPhantomSavings: vi.fn(() => false),
}));

vi.mock("../../open-sse/providers/capabilities.js", () => ({
  getCapabilitiesForModel: vi.fn(() => ({})),
}));

vi.mock("../../open-sse/translator/concerns/modality.js", () => ({
  stripUnsupportedModalities: vi.fn(() => false),
}));

vi.mock("../../open-sse/translator/concerns/prefetch.js", () => ({
  prefetchRemoteImages: vi.fn(async () => 0),
}));

vi.mock("../../open-sse/handlers/chatCore/requestDetail.js", () => ({
  buildRequestDetail: vi.fn((detail) => detail),
  extractRequestConfig: vi.fn((body, stream) => ({ body, stream })),
}));

vi.mock("../../open-sse/handlers/chatCore/nonStreamingHandler.js", () => ({
  handleNonStreamingResponse: vi.fn(async () => ({ success: true })),
}));

vi.mock("../../open-sse/handlers/chatCore/streamingHandler.js", () => ({
  handleStreamingResponse: vi.fn(async () => ({ success: true })),
  buildOnStreamComplete: vi.fn(() => ({ onStreamComplete: vi.fn(), streamDetailId: null })),
}));

vi.mock("../../open-sse/handlers/chatCore/sseToJsonHandler.js", () => ({
  handleForcedSSEToJson: vi.fn(async () => null),
}));

vi.mock("../../open-sse/utils/error.js", () => ({
  createErrorResult: vi.fn((status, message) => ({ success: false, status, error: message })),
  formatProviderError: vi.fn((error) => error.message),
  parseUpstreamError: vi.fn(),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(() => Promise.resolve()),
  saveRequestDetail: vi.fn(() => Promise.resolve()),
}));

function makeOptions({ provider, model, bodyStream, url }) {
  const body = {
    model,
    messages: [{ role: "user", content: "hello" }],
  };
  if (bodyStream !== undefined) body.stream = bodyStream;

  return {
    body,
    modelInfo: { provider, model },
    credentials: { apiKey: "test-api-key" },
    clientRawRequest: {
      endpoint: "/v1/chat/completions",
      body,
      headers: {},
    },
    connectionId: "test-connection",
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    _url: url,
  };
}

function setupExecuteMock(url) {
  executeMock.mockReset();
  executeMock.mockResolvedValue({
    response: new Response(JSON.stringify({ id: "chatcmpl-test", choices: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    url,
    headers: {},
    transformedBody: {},
  });
}

async function expectStreamFlag({ provider, model, bodyStream, url, expected }) {
  setupExecuteMock(url);
  const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");

  await handleChatCore(makeOptions({ provider, model, bodyStream, url }));

  expect(executeMock).toHaveBeenCalledTimes(1);
  expect(executeMock.mock.calls[0][0].stream).toBe(expected);
}

describe.each([
  {
    provider: "grok-web",
    model: "grok-4.1-fast",
    url: "https://grok.com/rest/app-chat/conversations/new",
  },
  {
    provider: "xai",
    model: "grok-4",
    url: "https://api.x.ai/v1/chat/completions",
  },
])("$provider stream default", ({ provider, model, url }) => {
  it("defaults to non-streaming when body.stream is omitted", async () => {
    await expectStreamFlag({ provider, model, bodyStream: undefined, url, expected: false });
  });

  it("uses non-streaming when body.stream is false", async () => {
    await expectStreamFlag({ provider, model, bodyStream: false, url, expected: false });
  });

  it("uses streaming when body.stream is true", async () => {
    await expectStreamFlag({ provider, model, bodyStream: true, url, expected: true });
  });
});