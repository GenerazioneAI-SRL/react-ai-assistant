# @generazioneai/ai-assistant

Drop-in **autonomous AI assistant** for React & Next.js apps. It reads your live UI through the **DOM / accessibility tree** (the web equivalent of Flutter's Semantics tree), executes multi-step tasks via a **ReAct loop** (Reason → Act → Observe), and works with **Claude, OpenAI, or Gemini**.

One provider. Full app control. Zero hardcoded selectors.

```tsx
"use client";
import { AiAssistantProvider, ClaudeProvider } from "@generazioneai/ai-assistant/react";

<AiAssistantProvider
  config={{ provider: new ClaudeProvider({ baseUrl: "/api/ai/anthropic" }) }}
>
  <YourApp />
</AiAssistantProvider>
```

A floating button appears. Users type *"add 2 onions to the cart and go to checkout"* and the assistant searches, clicks, fills fields, increments quantities and navigates — autonomously.

---

## How it works

```
User command
   │
   ▼
DomWalker      reads the live accessibility tree → every button, link, field, with a stable #id
   │
   ▼
ReAct Agent    LLM plans, calls tools, observes the updated screen, repeats
   │
   ▼
ActionExecutor clicks / types / scrolls / navigates like a real user
```

No widget keys, no screen coordinates. The walker serializes interactive elements (`button`, `a`, `input`, `[role=…]`, `aria-label`, …) and assigns each a stable `data-ai-id`. The agent references those ids. Anything inside `[data-ai-ignore]` is invisible to it.

## Install

```bash
npm i @generazioneai/ai-assistant
```

`react` / `react-dom` (>=18) are peer deps. The core (`@generazioneai/ai-assistant`) is framework-agnostic; React UI lives in `/react`; server proxies in `/server`.

## Quick start (Next.js App Router)

**1. Proxy the LLM so your key stays server-side** — `app/api/ai/anthropic/route.ts`:

```ts
import { createAnthropicProxy } from "@generazioneai/ai-assistant/server";
export const POST = createAnthropicProxy({ apiKey: process.env.ANTHROPIC_API_KEY! });
```

**2. Wrap your app** — `app/providers.tsx`:

```tsx
"use client";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { AiAssistantProvider, ClaudeProvider } from "@generazioneai/ai-assistant/react";

export function AiProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <AiAssistantProvider
      route={pathname}
      config={{
        provider: new ClaudeProvider({ baseUrl: "/api/ai/anthropic" }),
        navigate: (path) => router.push(path),
        knownRoutes: ["/", "/store", "/cart", "/profile"],
        routeDescriptions: {
          "/store": "Browse and buy products",
          "/cart": "Shopping cart and checkout",
        },
        appPurpose:
          'ShopApp is a grocery store. "order"/"buy" = full purchase flow; "cart" = shopping cart.',
        domainInstructions:
          'QUANTITIES: tap ADD first (qty=1), then "+" to increase. "5 onions" = ADD then "+" ×4.',
        initialSuggestions: [
          { label: "Browse store", message: "Take me to the store" },
          { label: "View cart", message: "Show my cart" },
        ],
      }}
    >
      {children}
    </AiAssistantProvider>
  );
}
```

That's it. Pass `route={usePathname()}` to keep the agent route-aware and `navigate` so it can move between pages via the Next router (not full page reloads).

## Configuration reference (`AiAssistantConfig`)

| Field | Type | Default | Description |
|---|---|---|---|
| `provider` | `LlmProvider` | — | **Required.** Claude / OpenAI / Gemini / custom. |
| `knownRoutes` | `string[]` | `[]` | Named routes the agent can navigate to. |
| `routeDescriptions` | `Record<string,string>` | `{}` | Human description per route. |
| `appPurpose` | `string` | — | What the app does + intent vocabulary. |
| `domainInstructions` | `string` | — | App-specific behavioural rules. |
| `fewShotExamples` | `string[]` | `[]` | Example User→Actions→Response flows. |
| `globalContextProvider` | `() => object` | — | Live app state injected each turn. |
| `confirmDestructiveActions` | `boolean` | `true` | Hand off purchases/deletes to the user. |
| `maxAgentIterations` | `number` | `30` | Cap on reason-act-observe cycles. |
| `navigate` | `(route) => void` | router/`location` | SPA navigation callback. |
| `goBack` | `() => void` | `history.back()` | Back navigation. |
| `systemPromptOverride` | `string` | — | Replace the built-in system prompt. |
| `customTools` | `AiTool[]` | `[]` | Business-logic tools (see below). |
| `onEvent` | `(AiEvent) => void` | — | Analytics for every agent action. |
| `assistantName` | `string` | `"AI Assistant"` | Header label. |
| `showFloatingButton` | `boolean` | `true` | Render the built-in FAB + chat. |
| `initialSuggestions` | `{label,message}[]` | `[]` | Quick-start chips. |

## LLM providers

All implement the same `LlmProvider` interface; switching is one line.

```ts
new ClaudeProvider({ baseUrl: "/api/ai/anthropic", model: "claude-sonnet-4-5" });
new OpenAiProvider({ baseUrl: "/api/ai/openai", model: "gpt-4o" });
new GeminiProvider({ baseUrl: "/api/ai/gemini", model: "gemini-2.0-flash" });
```

For local dev without a proxy you can pass an `apiKey` directly (Claude also needs `dangerousBrowserAccess: true`). **Never ship a key in the client bundle in production** — use the `/server` proxies.

### Bring your own provider

```ts
import type { LlmProvider, LlmRequest, LlmResponse } from "@generazioneai/ai-assistant";

class MyProvider implements LlmProvider {
  readonly name = "my-llm";
  async sendMessage(req: LlmRequest): Promise<LlmResponse> {
    // translate req.messages + req.tools to your API, return { text?, toolCalls? }
  }
}
```

## Custom tools

Expose business logic the LLM can call alongside the built-in UI tools:

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

### Built-in tools (always on)

`tap_element`, `set_text`, `scroll`, `navigate_to_route`, `go_back`, `get_screen_content`, `increase_value`, `decrease_value`, `ask_user`, and — when `confirmDestructiveActions` is `true` — `hand_off_to_user`.

## Hiding sensitive UI

The assistant only sees the accessibility tree. Exclude any subtree:

```tsx
<div data-ai-ignore>
  <CreditCardForm />
</div>
```

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

- **Destructive handoff** — purchases/deletes are handed to the user for the final tap.
- **Iteration cap** — `maxAgentIterations` prevents runaway loops.
- **Verification** — every tool result re-reads the screen, so the model observes real outcomes.

## License

MIT
