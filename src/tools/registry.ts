import type { AiTool, ToolContext, ToolDefinition, ToolResult } from "../types";

export class ToolRegistry {
  private tools = new Map<string, AiTool>();

  register(tool: AiTool) {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: AiTool[]) {
    for (const t of tools) this.register(t);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Schemas exposed to the LLM (handlers stripped). */
  definitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(({ handler, ...def }) => def);
  }

  async run(name: string, args: Record<string, any>, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
    try {
      return await tool.handler(args ?? {}, ctx);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
