import type { AiTool, ToolContext, ToolResult } from "../types";

const ok = (message: string, data?: unknown, screen?: string): ToolResult => ({
  ok: true,
  message,
  data,
  screen,
});

/** The always-on tools that work on any React app. */
export function buildBuiltinTools(confirmDestructive: boolean): AiTool[] {
  const tools: AiTool[] = [
    {
      name: "tap_element",
      description:
        "Tap/click a button, link, or interactive element. Pass the element id (e.g. #el-3) " +
        "or its visible label. Use parentContext to disambiguate identical labels.",
      parameters: {
        target: { type: "string", description: "Element id or visible label." },
        parentContext: { type: "string", description: "Nearby label/heading to disambiguate." },
      },
      required: ["target"],
      handler: (a, ctx) => ctx.click(strip(a.target), a.parentContext),
    },
    {
      name: "set_text",
      description: "Type text into a text field, search box, or textarea.",
      parameters: {
        target: { type: "string", description: "Field id or label/placeholder." },
        value: { type: "string", description: "Text to enter." },
      },
      required: ["target", "value"],
      handler: (a, ctx) => ctx.fill(strip(a.target), String(a.value)),
    },
    {
      name: "scroll",
      description: "Scroll the page (or a scrollable element) to reveal off-screen content.",
      parameters: {
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction." },
        target: { type: "string", description: "Optional element id to scroll within." },
      },
      required: ["direction"],
      handler: (a, ctx) => ctx.scroll(a.direction, a.target ? strip(a.target) : undefined),
    },
    {
      name: "navigate_to_route",
      description: "Navigate to a named route in the app (e.g. /store, /cart).",
      parameters: { route: { type: "string", description: "The route path." } },
      required: ["route"],
      handler: async (a, ctx): Promise<ToolResult> => {
        await ctx.navigate(String(a.route));
        return ok(`Navigated to ${a.route}`, undefined, ctx.describeScreen());
      },
    },
    {
      name: "go_back",
      description: "Go back to the previous screen (browser/router back).",
      parameters: {},
      handler: (_a, ctx): ToolResult => {
        ctx.goBack();
        return ok("Went back", undefined, ctx.describeScreen());
      },
    },
    {
      name: "get_screen_content",
      description: "Re-read the current screen's interactive elements for fresh context.",
      parameters: {},
      handler: (_a, ctx): ToolResult => ok("Screen read", undefined, ctx.describeScreen()),
    },
    {
      name: "get_page_text",
      description:
        "Read the full readable body text of the current page (headings, paragraphs, lists). " +
        "Use this when the user asks about page content, an article, a product description, or " +
        "anything that is not an interactive control.",
      parameters: {
        maxChars: {
          type: "number",
          description: "Optional character budget. Defaults to 6000.",
        },
      },
      handler: (a, ctx): ToolResult => {
        const budget = typeof a.maxChars === "number" ? a.maxChars : undefined;
        const text = ctx.readPageText(budget);
        return ok(text ? "Page text read" : "No readable text on this page", undefined, text || undefined);
      },
    },
    {
      name: "increase_value",
      description: 'Increase a quantity stepper or slider by tapping its "+" / increment control.',
      parameters: { target: { type: "string", description: 'The "+" control id or label.' } },
      required: ["target"],
      handler: (a, ctx) => ctx.click(strip(a.target)),
    },
    {
      name: "decrease_value",
      description: 'Decrease a quantity stepper or slider by tapping its "-" / decrement control.',
      parameters: { target: { type: "string", description: 'The "-" control id or label.' } },
      required: ["target"],
      handler: (a, ctx) => ctx.click(strip(a.target)),
    },
    {
      name: "ask_user",
      description:
        "Ask the user a clarifying question ONLY when genuinely ambiguous and you cannot proceed. " +
        "Do not use for confirmations of normal actions.",
      parameters: { question: { type: "string", description: "The question to ask." } },
      required: ["question"],
      handler: async (a, ctx): Promise<ToolResult> => {
        const answer = await ctx.askUser(String(a.question));
        return ok("User answered", { answer });
      },
    },
  ];

  if (confirmDestructive) {
    tools.push({
      name: "hand_off_to_user",
      description:
        "For irreversible actions (purchase, payment, delete), STOP and hand control to the user " +
        "so they perform the final tap themselves. Provide the button label and a short summary.",
      parameters: {
        buttonLabel: { type: "string", description: "Label of the final button the user should tap." },
        summary: { type: "string", description: "What happens when they tap it." },
      },
      required: ["buttonLabel", "summary"],
      handler: (a): ToolResult => ({
        ok: true,
        handoff: true,
        message: String(a.summary),
        data: { buttonLabel: a.buttonLabel, summary: a.summary },
      }),
    });
  }

  return tools;
}

/** Accept "#el-3" or "el-3" or a label. */
function strip(target: unknown): string {
  const s = String(target ?? "");
  return s.startsWith("#") ? s.slice(1) : s;
}

export type { ToolContext };
