import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmToolCall } from "../../types";
import { anthropicTools, parseError } from "../provider";
import { uid } from "../../util/id";

export interface ClaudeProviderOptions {
  /** Anthropic API key. Omit when calling through your own proxy (baseUrl). */
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Full messages endpoint. Override for a proxy, e.g. "/api/ai/anthropic". */
  baseUrl?: string;
  anthropicVersion?: string;
  /** Set true to allow direct calls from the browser (dev only). */
  dangerousBrowserAccess?: boolean;
  extraHeaders?: Record<string, string>;
}

export class ClaudeProvider implements LlmProvider {
  readonly name = "claude";
  private o: Required<Omit<ClaudeProviderOptions, "apiKey" | "extraHeaders" | "dangerousBrowserAccess">> &
    Pick<ClaudeProviderOptions, "apiKey" | "extraHeaders" | "dangerousBrowserAccess">;

  constructor(opts: ClaudeProviderOptions) {
    this.o = {
      apiKey: opts.apiKey,
      model: opts.model ?? "claude-sonnet-4-5",
      maxTokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.2,
      baseUrl: opts.baseUrl ?? "https://api.anthropic.com/v1/messages",
      anthropicVersion: opts.anthropicVersion ?? "2023-06-01",
      dangerousBrowserAccess: opts.dangerousBrowserAccess,
      extraHeaders: opts.extraHeaders,
    };
  }

  async sendMessage(req: LlmRequest): Promise<LlmResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "anthropic-version": this.o.anthropicVersion,
      ...(this.o.extraHeaders ?? {}),
    };
    if (this.o.apiKey) headers["x-api-key"] = this.o.apiKey;
    if (this.o.dangerousBrowserAccess) headers["anthropic-dangerous-direct-browser-access"] = "true";

    const body = {
      model: this.o.model,
      max_tokens: this.o.maxTokens,
      temperature: this.o.temperature,
      system: req.systemPrompt,
      tools: anthropicTools(req.tools),
      messages: this.toAnthropicMessages(req.messages),
    };

    const res = await fetch(this.o.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok) await parseError(res);

    const data: any = await res.json();
    let text = "";
    const toolCalls: LlmToolCall[] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id ?? uid("call"), name: block.name, arguments: block.input ?? {} });
      }
    }
    return { text: text || undefined, toolCalls: toolCalls.length ? toolCalls : undefined };
  }

  private toAnthropicMessages(messages: LlmMessage[]): any[] {
    const out: any[] = [];
    for (const m of messages) {
      if (m.role === "system") continue; // handled via top-level system
      if (m.role === "tool") {
        out.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.toolCallId,
              content: m.content ?? "",
            },
          ],
        });
        continue;
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        const content: any[] = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const c of m.toolCalls) {
          content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
        }
        out.push({ role: "assistant", content });
        continue;
      }
      out.push({ role: m.role, content: m.content ?? "" });
    }
    return mergeAdjacent(out);
  }
}

/** Anthropic requires alternating-ish roles; merge consecutive same-role blocks. */
function mergeAdjacent(messages: any[]): any[] {
  const out: any[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      const lc = Array.isArray(last.content) ? last.content : [{ type: "text", text: last.content }];
      const mc = Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }];
      last.content = [...lc, ...mc];
    } else {
      out.push({ ...m });
    }
  }
  return out;
}
