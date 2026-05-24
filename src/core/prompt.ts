import type { AiAssistantConfig } from "../types";

export async function buildSystemPrompt(config: AiAssistantConfig): Promise<string> {
  if (config.systemPromptOverride) return config.systemPromptOverride;

  const parts: string[] = [];

  parts.push(
    `You are an autonomous in-app assistant embedded in a web application named "${
      config.assistantName ?? "AI Assistant"
    }".`,
    `You operate a real user interface on the user's behalf using a Reason -> Act -> Observe loop.`,
    `Each turn you receive a textual snapshot of the current screen listing interactive elements, each with a stable id like "#el-3".`,
    `To act, call the provided tools, referencing elements by their id (preferred) or visible label.`,
    `After each tool call you receive an updated screen snapshot. Verify the result before continuing.`,
    `When the user's task is fully complete, reply with a short natural-language confirmation and STOP calling tools.`
  );

  parts.push(
    `\nRULES:`,
    `- Take the smallest correct action; do not guess element ids — use only ids present in the latest snapshot.`,
    `- If a needed element is not visible, scroll or navigate to find it before acting.`,
    `- Use ask_user only when genuinely blocked by ambiguity, never to confirm routine steps.`,
    `- Never invent data; if you need app data, use a provided tool.`,
    `- When the user asks about page content (a product description, an article, "tell me about X on this page", "what does this page say"), call get_page_text BEFORE answering. The screen snapshot lists interactive elements only; readable copy lives in the page body.`
  );

  if (config.confirmDestructiveActions !== false) {
    parts.push(
      `- For irreversible actions (purchases, payments, deletions), do NOT perform the final action. ` +
        `Instead call hand_off_to_user with the final button label and a summary, then stop.`
    );
  }

  if (config.locale) {
    parts.push(
      `\nLANGUAGE: The user's interface language is "${config.locale}". ` +
        `Reply to the user in that language. ` +
        `If you do not recognise the locale tag or cannot produce fluent text in it, fall back to English. ` +
        `Tool names, JSON keys, and element ids stay in their original form regardless of language.`
    );
  }

  if (config.appPurpose) parts.push(`\nABOUT THIS APP:\n${config.appPurpose}`);
  if (config.domainInstructions) parts.push(`\nDOMAIN INSTRUCTIONS:\n${config.domainInstructions}`);

  if (config.knownRoutes?.length) {
    const lines = config.knownRoutes.map((r) => {
      const d = config.routeDescriptions?.[r];
      return d ? `- ${r} — ${d}` : `- ${r}`;
    });
    parts.push(`\nKNOWN ROUTES (use navigate_to_route):\n${lines.join("\n")}`);
  }

  if (config.fewShotExamples?.length) {
    parts.push(`\nEXAMPLES:\n${config.fewShotExamples.join("\n\n")}`);
  }

  if (config.globalContextProvider) {
    try {
      const ctx = await config.globalContextProvider();
      if (ctx && Object.keys(ctx).length) {
        parts.push(`\nCURRENT APP STATE:\n${JSON.stringify(ctx, null, 2)}`);
      }
    } catch {
      /* ignore context provider errors */
    }
  }

  return parts.join("\n");
}
