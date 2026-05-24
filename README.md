# @generazioneai/ai-assistant

Drop-in **autonomous AI assistant** for React & Next.js apps. Reads your live UI through the **DOM / accessibility tree**, executes multi-step tasks via a **ReAct loop** (Reason → Act → Observe), and works with **Claude, OpenAI, Gemini, vLLM, or any LLM**.

Plug-and-play for Next.js — one component:

```tsx
import { NextAssistantWidget } from "@generazioneai/ai-assistant/next";

<NextAssistantWidget
  vllm={{ endpoint: "/api/ai/chat", model: "google/gemma-4-31B-it" }}
  locale="it"
/>
```

A floating button appears. Users type *"tell me about Private AI"* or *"go to the contact form"* and the assistant searches, scrolls, highlights, clicks, fills, and navigates — autonomously.

---

## What you get

- **DOM walker** that serializes every visible interactive element with a stable `data-ai-id` — no widget keys, no coordinates.
- **Page-text extraction** so the agent can answer questions about article copy, product descriptions, etc. (not just buttons).
- **Animated "AI aura"** highlight on the source block when the assistant references a passage — Perplexity / Antigravity style.
- **Typewriter chat** with Markdown rendering, auto-scroll, and a floating widget.
- **Built-in i18n** for `en / it / fr / es / de / pt`; override any string per locale.
- **Provider-agnostic**: ships Claude, OpenAI, Gemini, vLLM helpers + a single-method interface for custom backends.
- **Server proxies** so your LLM keys never reach the browser.
- **Destructive-action handoff**: purchases / deletes stop and pass control back to the user.

## How it works

```
User command
   │
   ▼
DomWalker      reads the accessibility tree → every button, link, field with a stable #id,
               plus a readable text excerpt of the page body
   │
   ▼
ReAct Agent    LLM plans, calls tools, observes the updated screen, repeats
   │
   ▼
ActionExecutor click / type / scroll / navigate / scroll_to_text + AI-aura highlight
```

Anything inside `[data-ai-ignore]` is invisible to the agent — use it for credit-card forms, the widget's own chrome, anything sensitive.

## Install

```bash
npm i github:GenerazioneAI-SRL/react-ai-assistant
```

(or use a fork / publish to npm later). Peer deps: `react` / `react-dom` >= 18, plus `next` >= 14 *only if* you use the `/next` entry. The package's `prepare` script builds the dist on install, so installing from a git URL just works.

## Entry points

| Path | What | Bundle has `"use client"` |
|---|---|---|
| `@generazioneai/ai-assistant` | Core: types, walker, agent, providers (no React). | — |
| `@generazioneai/ai-assistant/react` | `<AiAssistantProvider>`, `<AiAssistantWidget>`, `useAiAssistant()`. | ✓ |
| `@generazioneai/ai-assistant/next` | `<NextAssistantWidget>` — plug-and-play for App Router. | ✓ |
| `@generazioneai/ai-assistant/server` | `createAnthropicProxy / createOpenAiProxy / createGeminiProxy`. | — |

## Quick start — Next.js App Router (plug-and-play)

**1. Proxy the LLM** — `app/api/ai/chat/route.js`:

```js
import { createOpenAiProxy } from "@generazioneai/ai-assistant/server";

export const runtime = "nodejs";
export const POST = createOpenAiProxy({
  apiKey: process.env.VLLM_API_KEY ?? "EMPTY",
  baseUrl: `${process.env.VLLM_ENDPOINT}/chat/completions`,
  allowModels: [process.env.VLLM_MODEL],
});
```

(For Anthropic / OpenAI / Gemini swap in `createAnthropicProxy` etc.)

**2. Drop the widget into your layout** — `app/[locale]/layout.js`:

```jsx
import { NextAssistantWidget } from "@generazioneai/ai-assistant/next";

export default async function Layout({ children, params }) {
  const { locale } = await params;
  return (
    <html lang={locale}>
      <body>
        {children}
        <NextAssistantWidget
          vllm={{ endpoint: "/api/ai/chat", model: "google/gemma-4-31B-it" }}
          locale={locale}
          appPurpose="Help visitors explore services and reach the contact form."
          knownRoutes={["/", "/about", "/contact", "/products"]}
          initialSuggestions={[
            { label: "Contact us", message: "I want to contact the team" },
          ]}
        />
      </body>
    </html>
  );
}
```

That's it. `NextAssistantWidget` auto-wires `useRouter` for navigation, `usePathname` for route tracking, picks the right UI strings for the locale, and falls back to English for unknown locales.

## Quick start — any React app

Without the Next bindings:

```tsx
"use client";
import { AiAssistantProvider, OpenAiProvider } from "@generazioneai/ai-assistant/react";

<AiAssistantProvider
  config={{
    provider: new OpenAiProvider({ baseUrl: "/api/ai/chat", model: "gpt-4o" }),
    locale: "en",
    navigate: (path) => router.push(path),       // your router
    knownRoutes: ["/", "/store", "/cart"],
  }}
>
  <YourApp />
</AiAssistantProvider>
```

`route={pathname}` is optional but recommended — keeps the agent aware of the current page.

## LLM providers

All implement the same `LlmProvider` interface (`name` + `sendMessage`).

```ts
new ClaudeProvider({ baseUrl: "/api/ai/anthropic", model: "claude-sonnet-4-5" });
new OpenAiProvider({ baseUrl: "/api/ai/openai",   model: "gpt-4o" });
new GeminiProvider({ baseUrl: "/api/ai/gemini",   model: "gemini-2.0-flash" });
new VllmProvider  ({ endpoint: "/api/ai/chat",    model: "google/gemma-4-31B-it" });
```

`VllmProvider` is a thin OpenAI-compatible wrapper: `apiKey` defaults to `"EMPTY"` and the `endpoint` accepts either a proxy path or a full vLLM root URL (it appends `/chat/completions` if missing).

### Bring your own

```ts
import type { LlmProvider, LlmRequest, LlmResponse } from "@generazioneai/ai-assistant";

class MyProvider implements LlmProvider {
  readonly name = "my-llm";
  async sendMessage(req: LlmRequest): Promise<LlmResponse> {
    // translate req.messages + req.tools to your API
    return { text: "...", toolCalls: [] };
  }
}
```

## Built-in tools (always on)

| Tool | What it does |
|---|---|
| `tap_element` | Click a button / link by id or visible label. |
| `set_text` | Type into a field. Uses the native value setter so React state updates. |
| `scroll` | Scroll up / down / left / right (page or specific element). |
| `navigate_to_route` | SPA navigation via your `navigate` callback. |
| `go_back` | History back. |
| `get_screen_content` | Re-read the current screen's interactive elements. |
| `get_page_text` | Read the body text of the page (headings, paragraphs, lists). |
| `scroll_to_text` | Scroll to a phrase + paint an animated AI-aura on the source block. |
| `increase_value` / `decrease_value` | Step a quantity / slider control. |
| `ask_user` | Ask a clarifying question (use sparingly). |
| `hand_off_to_user` | Stop and let the user perform a destructive action themselves. |

### Custom tools

```ts
customTools: [
  {
    name: "check_inventory",
    description: "Check if a product is in stock and get its price.",
    parameters: { productName: { type: "string", description: "Product name" } },
    required: ["productName"],
    handler: async (args) => {
      const r = await inventory.check(args.productName);
      return { ok: true, data: { inStock: r.inStock, price: r.price } };
    },
  },
],
```

## Configuration reference (`AiAssistantConfig`)

| Field | Type | Default | Description |
|---|---|---|---|
| `provider` | `LlmProvider` | — | **Required.** Claude / OpenAI / Gemini / vLLM / custom. |
| `locale` | `string` | — | BCP-47 tag. Picks built-in widget strings and tells the LLM which language to reply in. Falls back to English. |
| `widgetTexts` | `Partial<WidgetTexts>` | — | Per-field overrides for the UI strings. |
| `assistantName` | `string` | `"AI Assistant"` | Header label. |
| `workingText` | `string` | `"Working..."` | Pending bubble text while the agent runs. |
| `showFloatingButton` | `boolean` | `true` | Render the built-in FAB + chat. |
| `showActionSteps` | `boolean` | `true` | Show the per-tool action list ("Tapping #el-3", "Reading screen") under the pending bubble. |
| `initialSuggestions` | `{label,message}[]` | `[]` | Quick-start chips shown when the chat is empty. |
| `knownRoutes` | `string[]` | `[]` | Named routes the agent can navigate to. |
| `routeDescriptions` | `Record<string,string>` | `{}` | Description per route. |
| `appPurpose` | `string` | — | What the app does + intent vocabulary. |
| `domainInstructions` | `string` | — | App-specific behavioural rules. |
| `fewShotExamples` | `string[]` | `[]` | Example User→Actions→Response flows. |
| `globalContextProvider` | `() => object` | — | Live app state injected each turn. |
| `confirmDestructiveActions` | `boolean` | `true` | Hand off purchases / deletes to the user. |
| `maxAgentIterations` | `number` | `30` | Cap on reason-act-observe cycles. |
| `navigate` | `(route) => void` | router/`location` | SPA navigation callback. |
| `goBack` | `() => void` | `history.back()` | Back navigation. |
| `systemPromptOverride` | `string` | — | Replace the built-in system prompt entirely. |
| `customTools` | `AiTool[]` | `[]` | Business-logic tools. |
| `onEvent` | `(AiEvent) => void` | — | Analytics for every agent action. |
| `enableLogging` | `boolean` | `false` | Verbose console logs. |

## i18n

Built-in widget strings for `en, it, fr, es, de, pt`. The widget picks the pack from `config.locale` (BCP-47 base lookup, English fallback).

```tsx
<NextAssistantWidget locale="fr-CA" vllm={{...}} />
// → French widget chrome, French replies from the model
```

Override any individual string:

```ts
widgetTexts: {
  openButtonLabel: "Aide IA",
  sendButton: "Envoie",
}
```

Add a new language permanently (e.g. for a fork):

```ts
import { BUILT_IN_WIDGET_TEXTS } from "@generazioneai/ai-assistant";
BUILT_IN_WIDGET_TEXTS.nl = { /* ...10 fields... */ };
```

The model's reply language is driven by the same `locale` via a system-prompt instruction with English fallback when the locale tag is unknown.

## Hiding sensitive UI

```tsx
<div data-ai-ignore>
  <CreditCardForm />
</div>
```

The walker, the inline `<mark>` highlight, and the AI aura all respect this attribute.

## Headless usage (no built-in UI)

```tsx
const { controller, messages, isProcessing } = useAiAssistant();
controller.sendMessage("open my profile");
// render `messages` with your own components; set showFloatingButton: false
```

## Events

```ts
onEvent: (e) => analytics.track(`ai_${e.type}`, e)
// conversationStarted, agentIteration, llmRequest/Response, toolStarted/Completed,
// askUser, handoff, completed, error, maxIterationsReached, routeChanged
```

## Safety

- **Destructive handoff** — purchases / deletes are handed to the user for the final tap.
- **Iteration cap** — `maxAgentIterations` prevents runaway loops.
- **Verification** — every tool result re-reads the screen, so the model observes real outcomes.
- **Server proxies** — keep API keys out of the client bundle in production.
- **Sandbox** — `[data-ai-ignore]` hides any subtree from both reads and writes.

## License

MIT
