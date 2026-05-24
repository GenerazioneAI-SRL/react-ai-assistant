import type { ToolDefinition, ToolParameter } from "../types";

export class LlmError extends Error {}
export class AuthenticationError extends LlmError {}
export class RateLimitError extends LlmError {}
export class ContextOverflowError extends LlmError {}

/** Convert our ToolParameter map into a JSON Schema "object" definition. */
export function toJsonSchema(params: Record<string, ToolParameter>, required?: string[]) {
  const properties: Record<string, any> = {};
  for (const [key, p] of Object.entries(params)) {
    properties[key] = paramToSchema(p);
  }
  return {
    type: "object" as const,
    properties,
    required: required ?? [],
  };
}

function paramToSchema(p: ToolParameter): any {
  const base: any = { type: p.type };
  if (p.description) base.description = p.description;
  if (p.enum) base.enum = p.enum;
  if (p.type === "array" && p.items) base.items = paramToSchema(p.items);
  return base;
}

export function openAiTools(defs: ToolDefinition[]) {
  return defs.map((d) => ({
    type: "function" as const,
    function: {
      name: d.name,
      description: d.description,
      parameters: toJsonSchema(d.parameters, d.required),
    },
  }));
}

export function anthropicTools(defs: ToolDefinition[]) {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: toJsonSchema(d.parameters, d.required),
  }));
}

export function geminiTools(defs: ToolDefinition[]) {
  return [
    {
      functionDeclarations: defs.map((d) => ({
        name: d.name,
        description: d.description,
        parameters: toJsonSchema(d.parameters, d.required),
      })),
    },
  ];
}

export async function parseError(res: Response): Promise<never> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) throw new AuthenticationError(`Auth failed (${res.status}): ${body}`);
  if (res.status === 429) throw new RateLimitError(`Rate limited (429): ${body}`);
  if (res.status === 413) throw new ContextOverflowError(`Context too large (413): ${body}`);
  throw new LlmError(`LLM request failed (${res.status}): ${body}`);
}
