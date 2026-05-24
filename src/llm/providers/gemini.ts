import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmToolCall } from "../../types";
import { geminiTools, parseError } from "../provider";
import { uid } from "../../util/id";

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  /** Base path; the model + ":generateContent" is appended. Override for a proxy. */
  baseUrl?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private apiKey?: string;
  private model: string;
  private temperature: number;
  private baseUrl: string;

  constructor(opts: GeminiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gemini-2.0-flash";
    this.temperature = opts.temperature ?? 0.2;
    this.baseUrl = opts.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/models";
  }

  async sendMessage(req: LlmRequest): Promise<LlmResponse> {
    const url =
      `${this.baseUrl}/${this.model}:generateContent` + (this.apiKey ? `?key=${this.apiKey}` : "");

    const body = {
      systemInstruction: req.systemPrompt ? { parts: [{ text: req.systemPrompt }] } : undefined,
      contents: this.toContents(req.messages),
      tools: geminiTools(req.tools),
      generationConfig: { temperature: this.temperature },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok) await parseError(res);

    const data: any = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    let text = "";
    const toolCalls: LlmToolCall[] = [];
    for (const p of parts) {
      if (p.text) text += p.text;
      else if (p.functionCall) {
        toolCalls.push({ id: uid("call"), name: p.functionCall.name, arguments: p.functionCall.args ?? {} });
      }
    }
    return { text: text || undefined, toolCalls: toolCalls.length ? toolCalls : undefined };
  }

  private toContents(messages: LlmMessage[]): any[] {
    const out: any[] = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        out.push({
          role: "user",
          parts: [{ functionResponse: { name: m.toolName, response: { result: m.content ?? "" } } }],
        });
      } else if (m.role === "assistant" && m.toolCalls?.length) {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const c of m.toolCalls) parts.push({ functionCall: { name: c.name, args: c.arguments } });
        out.push({ role: "model", parts });
      } else {
        out.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content ?? "" }] });
      }
    }
    return out;
  }
}
