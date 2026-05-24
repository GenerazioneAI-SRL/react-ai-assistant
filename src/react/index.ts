export {
  AiAssistantProvider,
  AiAssistantWidget,
  useAiAssistant,
} from "./AiAssistant";
export type { AiAssistantProviderProps } from "./AiAssistant";

// Re-export commonly needed core symbols for convenience.
export { ClaudeProvider } from "../llm/providers/claude";
export { OpenAiProvider } from "../llm/providers/openai";
export { GeminiProvider } from "../llm/providers/gemini";
export { Assistant } from "../core/assistant";
export type { AssistantState } from "../core/assistant";
export type {
  AiAssistantConfig,
  AiTool,
  AiEvent,
  ToolResult,
  ToolContext,
  ChatMessage,
} from "../types";
