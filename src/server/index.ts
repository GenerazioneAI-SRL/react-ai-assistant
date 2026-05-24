/**
 * Framework-agnostic proxy handlers. They take a Web `Request` and return a
 * `Response`, so they drop straight into a Next.js App Router route handler:
 *
 *   // app/api/ai/anthropic/route.ts
 *   import { createAnthropicProxy } from "@generazioneai/ai-assistant/server";
 *   export const POST = createAnthropicProxy({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *
 * Then point the client provider at it:
 *   new ClaudeProvider({ baseUrl: "/api/ai/anthropic" })
 */

export interface ProxyOptions {
  apiKey: string;
  /** Restrict which models may be requested (defense in depth). */
  allowModels?: string[];
  /** Hook to authenticate the incoming request (throw or return false to reject). */
  authorize?: (req: Request) => boolean | Promise<boolean>;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function guard(req: Request, opts: ProxyOptions): Promise<Response | { body: any }> {
  if (opts.authorize) {
    const allowed = await opts.authorize(req);
    if (!allowed) return json({ error: "Unauthorized" }, 401);
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (opts.allowModels && body?.model && !opts.allowModels.includes(body.model)) {
    return json({ error: `Model not allowed: ${body.model}` }, 400);
  }
  return { body };
}

export function createAnthropicProxy(opts: ProxyOptions) {
  return async (req: Request): Promise<Response> => {
    const g = await guard(req, opts);
    if (g instanceof Response) return g;
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(g.body),
    });
    return passthrough(upstream);
  };
}

export function createOpenAiProxy(opts: ProxyOptions & { baseUrl?: string }) {
  const url = opts.baseUrl ?? "https://api.openai.com/v1/chat/completions";
  return async (req: Request): Promise<Response> => {
    const g = await guard(req, opts);
    if (g instanceof Response) return g;
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(g.body),
    });
    return passthrough(upstream);
  };
}

export function createGeminiProxy(opts: ProxyOptions & { model?: string }) {
  return async (req: Request): Promise<Response> => {
    const g = await guard(req, opts);
    if (g instanceof Response) return g;
    const model = g.body?.__model ?? opts.model ?? "gemini-2.0-flash";
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(g.body),
      }
    );
    return passthrough(upstream);
  };
}

async function passthrough(upstream: Response): Promise<Response> {
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
