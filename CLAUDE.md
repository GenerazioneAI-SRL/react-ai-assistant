# CLAUDE.md — @generazioneai/ai-assistant

Context for Claude Code. Read this before touching the codebase.

## What this is

A drop-in autonomous AI assistant for **React & Next.js** apps. It is a web/TypeScript
port of the Flutter package `flutter_ai_assistant`. It reads the live UI through the
**DOM / accessibility tree** (the web equivalent of Flutter's Semantics tree), runs a
**ReAct loop** (Reason → Act → Observe), and drives the UI like a real user
(click / type / scroll / navigate). Provider-agnostic: Claude (default), OpenAI, Gemini.

The user (Francesco) is the author. This is published — or will be — to npm under the
`@generazioneai` scope. Keep it shippable.

## Stack & build

- Language: TypeScript (strict). Target ES2020, module ESNext, `moduleResolution: Bundler`.
- Bundler: **tsup** → emits ESM + CJS + `.d.ts` for three entry points.
- Zero runtime dependencies. Providers call LLM APIs via `fetch` only (no SDKs).
- Peer deps: `react` / `react-dom` >= 18 (optional — core works without React).

Commands:

```bash
npm install
npm run build      # tsup: builds dist/ (esm + cjs + dts) for all 3 entries
npm run typecheck  # tsc --noEmit
npm run dev        # tsup --watch
npm publish        # runs build via prepublishOnly; scope is public
```

`dist/` layout must stay aligned with the `exports` map in `package.json`:
`.` → core, `./react` → React layer, `./server` → proxy handlers.

## Entry points (package exports)

- `@generazioneai/ai-assistant` — framework-agnostic core (no React import).
- `@generazioneai/ai-assistant/react` — Provider, hook, widget. Bundle carries a
  `"use client"` banner (injected by tsup) for the Next.js App Router. Do NOT remove it.
- `@generazioneai/ai-assistant/server` — `Request → Response` proxy factories so LLM
  API keys never reach the browser.

## Source map (`src/`)

```
types.ts                  All public types: AiAssistantConfig, AiTool, ToolContext,
                          ToolResult, UiElement, LlmProvider/Request/Response/Message,
                          AiEvent, ChatMessage, ActionStep.
util/id.ts                uid() + makeLogger().

dom/walker.ts             DomWalker — Semantics-walker equivalent. Serializes visible
                          interactive elements (button, a, input, [role], aria-*) into
                          UiElement[], assigns stable data-ai-id, computes accessible
                          name + nearest-context. describe() -> text snapshot for the LLM.
                          Skips anything inside [data-ai-ignore].
dom/executor.ts           ActionExecutor — click/fill/scroll. Uses the native value
                          setter + input/change dispatch so React controlled inputs
                          update. waitForStable() uses MutationObserver to wait for the
                          re-render before re-reading the DOM.

tools/builtin.ts          buildBuiltinTools() — 10 always-on tools (tap_element,
                          set_text, scroll, navigate_to_route, go_back,
                          get_screen_content, increase_value, decrease_value, ask_user)
                          + hand_off_to_user when confirmDestructiveActions is on.
tools/registry.ts         ToolRegistry — holds tools, exposes schemas to the LLM,
                          runs handlers with try/catch.

llm/provider.ts           Error types + JSON-schema conversion (openAiTools /
                          anthropicTools / geminiTools) + parseError().
llm/providers/claude.ts   ClaudeProvider — Anthropic Messages API. Default model
                          "claude-sonnet-4-5". Merges adjacent same-role turns.
llm/providers/openai.ts   OpenAiProvider — Chat Completions API.
llm/providers/gemini.ts   GeminiProvider — generateContent REST API.

core/prompt.ts            buildSystemPrompt() — assembles the ReAct system prompt from
                          config (appPurpose, domainInstructions, knownRoutes,
                          fewShotExamples, globalContextProvider, handoff rule).
core/agent.ts             runReactLoop() — the reason→act→observe cycle. Iteration cap,
                          tool execution, observation feedback, handoff short-circuit.
core/assistant.ts         Assistant — framework-agnostic controller. Observable state
                          (subscribe), conversation history, ask_user plumbing,
                          handoff state, route tracking, tool context wiring.

react/AiAssistant.tsx      AiAssistantProvider (context + lifecycle), useAiAssistant hook,
                          AiAssistantWidget (FAB + chat overlay, inline styles).
react/index.ts            React barrel.
server/index.ts           createAnthropicProxy / createOpenAiProxy / createGeminiProxy —
                          guard (auth + model allowlist) then passthrough to the upstream.
index.ts                  Core barrel.
```

## Key invariants — don't break these

1. **Core stays React-free.** `src/index.ts` and everything it imports must not import
   `react`. Only `src/react/*` may.
2. **`"use client"` banner** on the react bundle is required for Next App Router. It's set
   in `tsup.config.ts` via `banner`.
3. **React-controlled inputs**: always set values through the native prototype setter and
   dispatch bubbling `input` + `change` events (see `executor.ts` `setNativeValue`).
   A plain `el.value = x` will NOT update React state.
4. **Wait for re-render**: after any action, `waitForStable()` before re-reading the DOM.
   SPAs mutate asynchronously.
5. **`[data-ai-ignore]`** is the exclusion boundary (web equivalent of ExcludeSemantics).
   The walker and the widget's own controls both respect/use it.
6. **Destructive actions** (purchase/payment/delete) must hand off to the user via
   `hand_off_to_user`, never auto-confirm, when `confirmDestructiveActions !== false`.
7. **No API keys in the client bundle** for production. The intended path is the `/server`
   proxies + a provider pointed at `baseUrl: "/api/ai/..."`.

## Current state (v0.1.0)

Working and build-verified: DOM walker, action executor, ReAct loop, 3 providers, tool
registry + built-ins, React provider/hook/widget, server proxies, full `.d.ts`.

## Known limitations / roadmap

Not yet implemented (candidate next steps, roughly in priority order):

1. **Streaming** — the loop is request/response; no token-by-token streaming in the widget.
2. **Voice I/O** — no speech-to-text / TTS (Flutter package has it via Web Speech API).
3. **Tests** — no test suite yet. Add Vitest + jsdom for `walker` / `executor` / agent loop
   (mock provider), and a fake DOM for the walker.
4. **Demo app** — no runnable Next.js example to exercise it end-to-end.
5. **App manifest / code-gen** — the Flutter package's `AiAppManifest` two-tier context is
   not ported.
6. **Rich chat content** — only plain text bubbles; no image/card/button content blocks.
7. **Retry/backoff** — provider errors are typed but there's no automatic retry on 429.

## Conventions

- TypeScript strict; prefer explicit return types on public functions.
- Keep the core dependency-free. New runtime deps need a strong reason.
- Comments explain *why*, not *what*.
- Match existing inline-style approach in the widget (it's intentionally
  framework/CSS-agnostic so consumers can restyle).
- English for code, comments, and docs (consistent with the existing codebase).

## Note on sessions

This file is the durable project memory. Web (claude.ai) conversations do NOT transfer
into Claude Code — only the files on disk do. Update this file when the architecture or
roadmap changes so future sessions stay aligned.
