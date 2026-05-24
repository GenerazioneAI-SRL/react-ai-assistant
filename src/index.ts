// Types
export type {
  AiAssistantConfig,
  AiTool,
  AiEvent,
  AiEventType,
  AiSuggestion,
  ToolDefinition,
  ToolParameter,
  ToolResult,
  ToolContext,
  UiElement,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmMessage,
  LlmToolCall,
  ChatMessage,
  ActionStep,
} from "./types";

// Core
export { Assistant } from "./core/assistant";
export type { AssistantState } from "./core/assistant";
export { runReactLoop } from "./core/agent";
export { buildSystemPrompt } from "./core/prompt";

// DOM
export { DomWalker } from "./dom/walker";
export { ActionExecutor } from "./dom/executor";

// Tools
export { ToolRegistry } from "./tools/registry";
export { buildBuiltinTools } from "./tools/builtin";

// Providers
export { ClaudeProvider } from "./llm/providers/claude";
export type { ClaudeProviderOptions } from "./llm/providers/claude";
export { OpenAiProvider } from "./llm/providers/openai";
export type { OpenAiProviderOptions } from "./llm/providers/openai";
export { GeminiProvider } from "./llm/providers/gemini";
export type { GeminiProviderOptions } from "./llm/providers/gemini";
export {
  LlmError,
  AuthenticationError,
  RateLimitError,
  ContextOverflowError,
} from "./llm/provider";
