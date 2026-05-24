import { OpenAiProvider, type OpenAiProviderOptions } from "./openai";

export interface VllmProviderOptions extends Omit<OpenAiProviderOptions, "baseUrl"> {
  /**
   * Either a server proxy mount point (e.g. "/api/ai/chat") or a full vLLM root URL
   * (e.g. "http://my-host:8000/v1"). Trailing slashes and a trailing "/chat/completions"
   * suffix are both tolerated — the path is normalised to ".../chat/completions".
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
  return `${trimmed}/chat/completions`;
}
