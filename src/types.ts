/* ---------------------------------------------------------------------------
 * Public type definitions for @generazioneai/ai-assistant
 * ------------------------------------------------------------------------- */

/** JSON-schema-ish description of a single tool parameter. */
export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: string[];
  /** For type "array": schema of the items. */
  items?: ToolParameter;
}

/** The schema half of a tool (what the LLM sees). */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  required?: string[];
}

/** Result returned by a tool handler back to the agent loop. */
export interface ToolResult {
  ok: boolean;
  /** Arbitrary structured payload fed back to the LLM as the tool result. */
  data?: unknown;
  /** Error string when ok === false. */
  error?: string;
  /** Human-readable message (also used for handoff summaries). */
  message?: string;
  /** When true, the agent loop stops and control is handed to the user. */
  handoff?: boolean;
  /** Optional fresh screen snapshot to feed back as the next observation. */
  screen?: string;
}

/** Context every tool handler receives. */
export interface ToolContext {
  walk: () => UiElement[];
  describeScreen: () => string;
  readPageText: (budget?: number) => string;
  click: (id: string, context?: string) => Promise<ToolResult>;
  fill: (id: string, value: string, context?: string) => Promise<ToolResult>;
  scroll: (direction: "up" | "down" | "left" | "right", id?: string) => Promise<ToolResult>;
  navigate: (route: string) => Promise<void> | void;
  goBack: () => void;
  askUser: (question: string) => Promise<string>;
  config: AiAssistantConfig;
}

/** A tool the LLM can call. Combine schema + executable handler. */
export interface AiTool extends ToolDefinition {
  handler: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult> | ToolResult;
}

/* ----------------------------- DOM model -------------------------------- */

export interface UiElement {
  /** Stable id written to the element's data-ai-id attribute. */
  id: string;
  tag: string;
  role?: string;
  label?: string;
  value?: string;
  type?: string;
  disabled?: boolean;
  /** Best-effort hint of the nearest container label (for disambiguation). */
  context?: string;
}

/* ----------------------------- LLM layer -------------------------------- */

export type LlmRole = "user" | "assistant" | "tool" | "system";

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LlmMessage {
  role: LlmRole;
  content?: string;
  /** Present on assistant messages that requested tool calls. */
  toolCalls?: LlmToolCall[];
  /** Present on "tool" role messages. */
  toolCallId?: string;
  toolName?: string;
}

export interface LlmResponse {
  text?: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmRequest {
  messages: LlmMessage[];
  tools: ToolDefinition[];
  systemPrompt?: string;
  signal?: AbortSignal;
}

/** Implement this to support any LLM backend. */
export interface LlmProvider {
  readonly name: string;
  sendMessage(req: LlmRequest): Promise<LlmResponse>;
}

/* ------------------------------- Events --------------------------------- */

export type AiEventType =
  | "conversationStarted"
  | "agentIteration"
  | "llmRequest"
  | "llmResponse"
  | "llmError"
  | "toolStarted"
  | "toolCompleted"
  | "askUser"
  | "handoff"
  | "completed"
  | "error"
  | "maxIterationsReached"
  | "routeChanged";

export interface AiEvent {
  type: AiEventType;
  [key: string]: unknown;
}

/* ------------------------------- Config --------------------------------- */

export interface AiSuggestion {
  label: string;
  message: string;
}

export interface AiAssistantConfig {
  /** The LLM provider (Claude / OpenAI / Gemini / custom). */
  provider: LlmProvider;

  /* App knowledge ------------------------------------------------------- */
  knownRoutes?: string[];
  routeDescriptions?: Record<string, string>;
  /** What the app does — domain vocabulary and intent mapping. */
  appPurpose?: string;
  /** App-specific behavioural rules injected into the system prompt. */
  domainInstructions?: string;
  /** Example "User -> Actions -> Response" flows for few-shot learning. */
  fewShotExamples?: string[];
  /** Returns live app-level state (user, cart, ...) injected each turn. */
  globalContextProvider?: () => Promise<Record<string, any>> | Record<string, any>;

  /* Behaviour ----------------------------------------------------------- */
  /** Hand off irreversible actions (purchases, deletions) to the user. */
  confirmDestructiveActions?: boolean; // default true
  /** Max reason-act-observe cycles per user message. */
  maxAgentIterations?: number; // default 30
  /** Custom navigation callback. Required for SPA route changes. */
  navigate?: (route: string) => Promise<void> | void;
  /** Custom back navigation. Defaults to history.back(). */
  goBack?: () => void;
  /** Replace the entire built-in system prompt. */
  systemPromptOverride?: string;
  /** Extra business-logic tools the LLM can call. */
  customTools?: AiTool[];

  /* Observability ------------------------------------------------------- */
  onEvent?: (event: AiEvent) => void;
  enableLogging?: boolean;

  /* UI (consumed by the React layer) ----------------------------------- */
  assistantName?: string; // default "AI Assistant"
  showFloatingButton?: boolean; // default true
  /** Show the per-tool action list ("Tapping #el-3", "Reading screen") in the widget. Default true. */
  showActionSteps?: boolean;
  /** Text shown in the pending bubble while the agent works. Default "Working...". */
  workingText?: string;
  initialSuggestions?: AiSuggestion[];

  /* i18n -------------------------------------------------------------- */
  /**
   * BCP-47 locale or language tag passed in by the host app (e.g. "it",
   * "en-US"). Injected into the system prompt so the LLM replies in the
   * user's language. The library does not detect this on its own — pass
   * whatever the host site already knows (next-intl, i18next, ...).
   */
  locale?: string;
  /** Override the built-in English widget strings. Any field left out keeps the default. */
  widgetTexts?: Partial<WidgetTexts>;
}

/** UI strings rendered by AiAssistantWidget. Override via config.widgetTexts. */
export interface WidgetTexts {
  openButtonLabel: string;
  clearTitle: string;
  closeTitle: string;
  composerPlaceholder: string;
  composerAnswerPlaceholder: string;
  sendButton: string;
  stopButton: string;
  handoffTitle: string;
  handoffDoneButton: string;
  /** Receives the button label. Default: `Tap "${label}" to confirm.` */
  handoffConfirmHint: (buttonLabel: string) => string;
}

/* ------------------------------ Chat UI --------------------------------- */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}

export interface ActionStep {
  id: string;
  label: string;
  status: "running" | "done" | "error";
}
