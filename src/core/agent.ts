import type {
  AiEvent,
  LlmMessage,
  LlmProvider,
  ToolContext,
} from "../types";
import type { ToolRegistry } from "../tools/registry";

export interface AgentRunOptions {
  provider: LlmProvider;
  registry: ToolRegistry;
  toolContext: ToolContext;
  messages: LlmMessage[]; // conversation history; mutated in place
  systemPrompt: string;
  maxIterations: number;
  signal?: AbortSignal;
  emit: (event: AiEvent) => void;
  onProgress?: (text: string) => void;
  onToolStep?: (label: string, status: "running" | "done" | "error") => void;
}

export interface AgentResult {
  text: string;
  handoff?: { buttonLabel?: string; summary?: string };
  stopped: boolean;
}

export async function runReactLoop(opts: AgentRunOptions): Promise<AgentResult> {
  const { provider, registry, toolContext, messages, systemPrompt, maxIterations, signal, emit } = opts;
  const tools = registry.definitions();

  for (let i = 0; i < maxIterations; i++) {
    if (signal?.aborted) return { text: "Stopped.", stopped: true };
    emit({ type: "agentIteration", iteration: i });

    emit({ type: "llmRequest", iteration: i });
    const response = await provider.sendMessage({ messages, tools, systemPrompt, signal });
    emit({ type: "llmResponse", iteration: i, hasToolCalls: !!response.toolCalls?.length });

    // No tool calls -> the agent considers the task done.
    if (!response.toolCalls?.length) {
      const text = response.text?.trim() || "Done.";
      messages.push({ role: "assistant", content: text });
      emit({ type: "completed", iteration: i });
      return { text, stopped: false };
    }

    // Record the assistant turn (text + tool calls) before executing.
    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    let handoff: AgentResult["handoff"] | undefined;

    for (const call of response.toolCalls) {
      if (signal?.aborted) return { text: "Stopped.", stopped: true };

      opts.onToolStep?.(humanize(call.name, call.arguments), "running");
      emit({ type: "toolStarted", tool: call.name, arguments: call.arguments, iteration: i });

      const result = await registry.run(call.name, call.arguments, toolContext);

      opts.onToolStep?.(humanize(call.name, call.arguments), result.ok ? "done" : "error");
      emit({ type: "toolCompleted", tool: call.name, success: result.ok, error: result.error, iteration: i });

      // Feed the tool result back to the model as the observation.
      const observation = buildObservation(result);
      messages.push({
        role: "tool",
        toolCallId: call.id,
        toolName: call.name,
        content: observation,
      });

      if (result.handoff) {
        handoff = {
          buttonLabel: (result.data as any)?.buttonLabel,
          summary: (result.data as any)?.summary ?? result.message,
        };
      }
    }

    if (handoff) {
      emit({ type: "handoff", ...handoff });
      return { text: handoff.summary ?? "Ready for your confirmation.", handoff, stopped: false };
    }
  }

  emit({ type: "maxIterationsReached" });
  return { text: "I couldn't finish this task within the step limit.", stopped: true };
}

function buildObservation(result: { ok: boolean; error?: string; message?: string; data?: unknown; screen?: string }): string {
  const head = result.ok
    ? result.message ?? "OK"
    : `ERROR: ${result.error ?? "tool failed"}`;
  const dataStr =
    result.data !== undefined ? `\nDATA: ${JSON.stringify(result.data)}` : "";
  const screenStr = result.screen ? `\n\n${result.screen}` : "";
  return head + dataStr + screenStr;
}

function humanize(name: string, args: Record<string, any>): string {
  const t = args?.target ?? args?.route ?? args?.value ?? args?.direction ?? "";
  switch (name) {
    case "tap_element":
      return `Tapping ${t}`;
    case "set_text":
      return `Typing "${args?.value}"`;
    case "scroll":
      return `Scrolling ${args?.direction}`;
    case "navigate_to_route":
      return `Opening ${args?.route}`;
    case "go_back":
      return "Going back";
    case "get_screen_content":
      return "Reading screen";
    case "increase_value":
      return `Increasing ${t}`;
    case "decrease_value":
      return `Decreasing ${t}`;
    case "ask_user":
      return "Asking you a question";
    case "hand_off_to_user":
      return "Handing off to you";
    default:
      return name;
  }
}
