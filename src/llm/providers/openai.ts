import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmToolCall } from "../../types";
import { openAiTools, parseError } from "../provider";
import { uid } from "../../util/id";

export interface OpenAiProviderOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  /** Chat completions endpoint. Override for Azure / proxy. */
  baseUrl?: string;
  extraHeaders?: Record<string, string>;
}

export class OpenAiProvider implements LlmProvider {
  readonly name: string = "openai";
  private model: string;
  private temperature: number;
  private baseUrl: string;
  private apiKey?: string;
  private extraHeaders?: Record<string, string>;

  constructor(opts: OpenAiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gpt-4o";
    this.temperature = opts.temperature ?? 0.2;
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1/chat/completions";
    this.extraHeaders = opts.extraHeaders;
  }

  async sendMessage(req: LlmRequest): Promise<LlmResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(this.extraHeaders ?? {}),
    };
    if (this.apiKey) headers["authorization"] = `Bearer ${this.apiKey}`;

    const messages: any[] = [];
    if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
    for (const m of req.messages) {
      if (m.role === "tool") {
        messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content ?? "" });
      } else if (m.role === "assistant" && m.toolCalls?.length) {
        messages.push({
          role: "assistant",
          content: m.content ?? "",
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.arguments) },
          })),
        });
      } else {
        messages.push({ role: m.role, content: m.content ?? "" });
      }
    }

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        messages,
        tools: openAiTools(req.tools),
        tool_choice: "auto",
      }),
      signal: req.signal,
    });
    if (!res.ok) await parseError(res);

    const data: any = await res.json();
    const choice = data.choices?.[0]?.message ?? {};
    const toolCalls: LlmToolCall[] = (choice.tool_calls ?? []).map((tc: any) => ({
      id: tc.id ?? uid("call"),
      name: tc.function?.name,
      arguments: safeParse(tc.function?.arguments),
    }));
    return {
      text: choice.content || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };
  }
}

function safeParse(s: unknown): Record<string, any> {
  if (typeof s !== "string") return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
