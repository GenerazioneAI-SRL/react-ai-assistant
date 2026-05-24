import type {
  ActionStep,
  AiAssistantConfig,
  AiEvent,
  ChatMessage,
  LlmMessage,
  ToolContext,
} from "../types";
import { DomWalker } from "../dom/walker";
import { ActionExecutor } from "../dom/executor";
import { ToolRegistry } from "../tools/registry";
import { buildBuiltinTools } from "../tools/builtin";
import { runReactLoop } from "./agent";
import { buildSystemPrompt } from "./prompt";
import { uid, makeLogger } from "../util/id";

export interface AssistantState {
  messages: ChatMessage[];
  isProcessing: boolean;
  progressText: string | null;
  actionSteps: ActionStep[];
  isHandoff: boolean;
  handoff: { buttonLabel?: string; summary?: string } | null;
  pendingQuestion: string | null;
  route: string;
}

type Listener = (state: AssistantState) => void;

export class Assistant {
  readonly config: AiAssistantConfig;
  private walker = new DomWalker();
  private executor = new ActionExecutor(this.walker);
  private registry = new ToolRegistry();
  private history: LlmMessage[] = [];
  private listeners = new Set<Listener>();
  private controller: AbortController | null = null;
  private pendingAsk: { resolve: (a: string) => void } | null = null;
  private log: (...a: unknown[]) => void;

  private state: AssistantState = {
    messages: [],
    isProcessing: false,
    progressText: null,
    actionSteps: [],
    isHandoff: false,
    handoff: null,
    pendingQuestion: null,
    route: typeof location !== "undefined" ? location.pathname : "/",
  };

  constructor(config: AiAssistantConfig) {
    this.config = config;
    this.log = makeLogger(config.enableLogging);
    const confirmDestructive = config.confirmDestructiveActions !== false;
    this.registry.registerAll(buildBuiltinTools(confirmDestructive));
    if (config.customTools?.length) this.registry.registerAll(config.customTools);
  }

  /* --------------------------- subscriptions --------------------------- */

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): AssistantState {
    return this.state;
  }

  private set(patch: Partial<AssistantState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private emit = (event: AiEvent) => {
    this.log("event", event.type, event);
    this.config.onEvent?.(event);
  };

  /* ----------------------------- routing ------------------------------- */

  setRoute(route: string) {
    if (route !== this.state.route) {
      this.set({ route });
      this.emit({ type: "routeChanged", route });
    }
  }

  /* --------------------------- public actions -------------------------- */

  async sendMessage(text: string): Promise<void> {
    if (this.state.isProcessing || !text.trim()) return;

    // If a question is pending, treat this message as the answer.
    if (this.pendingAsk) {
      this.addMessage("user", text);
      const resolve = this.pendingAsk.resolve;
      this.pendingAsk = null;
      this.set({ pendingQuestion: null });
      resolve(text);
      return;
    }

    this.addMessage("user", text);
    this.history.push({ role: "user", content: this.composeUserTurn(text) });

    this.controller = new AbortController();
    this.set({
      isProcessing: true,
      progressText: this.config.workingText ?? "Thinking...",
      actionSteps: [],
      isHandoff: false,
      handoff: null,
    });
    this.emit({ type: "conversationStarted", message: text });

    const pendingId = uid("msg");
    this.set({ messages: [...this.state.messages, { id: pendingId, role: "assistant", text: "", pending: true }] });

    try {
      const systemPrompt = await buildSystemPrompt(this.config);
      const result = await runReactLoop({
        provider: this.config.provider,
        registry: this.registry,
        toolContext: this.toolContext(),
        messages: this.history,
        systemPrompt,
        maxIterations: this.config.maxAgentIterations ?? 30,
        signal: this.controller.signal,
        emit: this.emit,
        onProgress: (t) => this.set({ progressText: t }),
        onToolStep: (label, status) => this.pushStep(label, status),
      });

      this.replaceMessage(pendingId, result.text, false);
      if (result.handoff) {
        this.set({ isHandoff: true, handoff: result.handoff });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.replaceMessage(pendingId, `Sorry, something went wrong: ${msg}`, false);
      this.emit({ type: "error", error: msg });
    } finally {
      this.set({ isProcessing: false, progressText: null });
      this.controller = null;
    }
  }

  stop() {
    this.controller?.abort();
    this.pendingAsk?.resolve("");
    this.pendingAsk = null;
    this.set({ isProcessing: false, progressText: null, pendingQuestion: null });
  }

  /** Call after the user performs a handed-off action, to clear handoff UI. */
  resolveHandoff() {
    this.set({ isHandoff: false, handoff: null });
  }

  clear() {
    this.history = [];
    this.set({ messages: [], actionSteps: [], isHandoff: false, handoff: null, pendingQuestion: null });
  }

  /* ----------------------------- internals ----------------------------- */

  private toolContext(): ToolContext {
    return {
      walk: () => this.walker.walk(),
      describeScreen: () => this.walker.describe(),
      readPageText: (budget) => this.walker.readableText(undefined, budget),
      click: (id, context) => this.executor.click(id, context),
      fill: (id, value, context) => this.executor.fill(id, value, context),
      scroll: (dir, id) => this.executor.scroll(dir, id),
      scrollToText: (query, opts) => this.executor.scrollToText(query, opts),
      navigate: async (route) => {
        if (this.config.navigate) await this.config.navigate(route);
        else if (typeof location !== "undefined") location.assign(route);
        await this.executor.waitForStable();
      },
      goBack: () => {
        if (this.config.goBack) this.config.goBack();
        else if (typeof history !== "undefined") history.back();
      },
      askUser: (question) =>
        new Promise<string>((resolve) => {
          this.pendingAsk = { resolve };
          this.set({ pendingQuestion: question, progressText: this.config.workingText ?? "Waiting for your answer..." });
          this.addMessage("assistant", question);
          this.emit({ type: "askUser", question });
        }),
      config: this.config,
    };
  }

  /** First-turn user content includes the initial screen snapshot. */
  private composeUserTurn(text: string): string {
    const screen = this.walker.describe();
    return `${text}\n\n--- Current screen ---\n${screen}`;
  }

  private addMessage(role: "user" | "assistant", text: string) {
    this.set({ messages: [...this.state.messages, { id: uid("msg"), role, text }] });
  }

  private replaceMessage(id: string, text: string, pending: boolean) {
    this.set({
      messages: this.state.messages.map((m) => (m.id === id ? { ...m, text, pending } : m)),
    });
  }

  private pushStep(label: string, status: ActionStep["status"]) {
    const steps = [...this.state.actionSteps];
    const existing = steps.findIndex((s) => s.label === label && s.status === "running");
    if (status !== "running" && existing >= 0) {
      steps[existing] = { ...steps[existing], status };
    } else if (status === "running") {
      steps.push({ id: uid("step"), label, status });
    }
    const progressText =
      this.config.showActionSteps === false ? this.config.workingText ?? "Working..." : label;
    this.set({ actionSteps: steps, progressText });
  }
}
