import { OpenAiProvider, type OpenAiProviderOptions } from "./openai";

export interface VllmProviderOptions extends Omit<OpenAiProviderOptions, "baseUrl"> {
  /**
   * Either a server proxy mount point (e.g. "/api/ai/chat" — the route handler
   * already maps to chat completions internally) or a direct vLLM URL. Direct
   * URLs that end in "/v1" get "/chat/completions" appended automatically;
   * anything else is used as-is. Trailing slashes are tolerated.
   */
  endpoint: string;
}

/**
 * Thin wrapper around OpenAiProvider preconfigured for a vLLM server.
 *
 * - apiKey defaults to "EMPTY" (vLLM's accepted placeholder when run without auth).
 * - endpoint can be a relative proxy path or a full root URL; the wrapper appends
 *   "/chat/completions" if missing.
 */
export class VllmProvider extends OpenAiProvider {
  readonly name = "vllm";

  constructor(opts: VllmProviderOptions) {
    super({
      ...opts,
      apiKey: opts.apiKey ?? "EMPTY",
      baseUrl: normalizeVllmEndpoint(opts.endpoint),
    });
  }
}

function normalizeVllmEndpoint(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  // Only auto-append for direct vLLM root URLs (e.g. "http://host:8000/v1").
  // Proxy paths like "/api/ai/chat" are passed through unchanged.
  if (/\/v\d+$/.test(trimmed)) return `${trimmed}/chat/completions`;
  return trimmed;
}
