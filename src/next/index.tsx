"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AiAssistantProvider } from "../react/AiAssistant";
import { VllmProvider, type VllmProviderOptions } from "../llm/providers/vllm";
import type { AiAssistantConfig, LlmProvider } from "../types";

export type NextAssistantWidgetProps =
  /**
   * All config fields are accepted as top-level props for the plug-and-play case.
   * navigate/goBack are wired from next/navigation automatically; pathname is
   * tracked via usePathname() so the agent always knows the current route.
   * Pass either a fully constructed `provider` or `vllm` shorthand to build one.
   */
  Omit<AiAssistantConfig, "provider" | "navigate" | "goBack"> & {
    provider?: LlmProvider;
    /** Convenience: build a VllmProvider from { endpoint, model, apiKey?, ... }. */
    vllm?: VllmProviderOptions;
    /** Override the auto-wired router navigation (rare). */
    navigate?: (route: string) => Promise<void> | void;
    /** Override the auto-wired back navigation (rare). */
    goBack?: () => void;
    /** Optional children; usually none — the widget floats on its own. */
    children?: ReactNode;
  };

/**
 * Single-tag, plug-and-play widget for Next.js App Router apps.
 *
 * <NextAssistantWidget vllm={{ endpoint: "/api/ai/chat", model: "..." }} locale="it" />
 *
 * Pulls navigation, locale, and current route from the framework. Pass `provider`
 * directly for non-vLLM backends (Claude / OpenAI / Gemini / custom).
 */
export function NextAssistantWidget({
  provider,
  vllm,
  navigate,
  goBack,
  children,
  ...rest
}: NextAssistantWidgetProps) {
  const router = useRouter();
  const pathname = usePathname();

  const config = useMemo<AiAssistantConfig>(() => {
    const llm = provider ?? (vllm ? new VllmProvider(vllm) : null);
    if (!llm) {
      throw new Error(
        "<NextAssistantWidget> requires either a `provider` or a `vllm` option."
      );
    }
    return {
      ...rest,
      provider: llm,
      navigate: navigate ?? ((route: string) => router.push(route)),
      goBack: goBack ?? (() => router.back()),
    };
    // We intentionally re-create the config only when the LLM wiring or callbacks
    // change. The router instance is stable across renders so we omit it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, vllm?.endpoint, vllm?.model, vllm?.apiKey, navigate, goBack]);

  return (
    <AiAssistantProvider config={config} route={pathname ?? undefined}>
      {children}
    </AiAssistantProvider>
  );
}

export type { VllmProviderOptions };
export { VllmProvider };
