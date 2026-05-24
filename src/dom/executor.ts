import type { ToolResult } from "../types";
import type { DomWalker } from "./walker";

/** Resolve an element by id, falling back to label lookup. */
function resolve(walker: DomWalker, idOrLabel: string, context?: string): HTMLElement | null {
  return walker.find(idOrLabel) ?? walker.findByLabel(idOrLabel, context);
}

/** Set the value of a React-controlled input so onChange fires correctly. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export class ActionExecutor {
  constructor(private walker: DomWalker) {}

  /** Wait until the DOM stops mutating (re-render settled) or timeout. */
  waitForStable(timeout = 700, quietMs = 250): Promise<void> {
    if (typeof MutationObserver === "undefined") {
      return new Promise((r) => setTimeout(r, 300));
    }
    return new Promise((resolve) => {
      let quietTimer: ReturnType<typeof setTimeout>;
      const obs = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      const done = () => {
        clearTimeout(hard);
        obs.disconnect();
        resolve();
      };
      const hard = setTimeout(done, timeout);
      quietTimer = setTimeout(done, quietMs);
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });
  }

  async click(idOrLabel: string, context?: string): Promise<ToolResult> {
    const el = resolve(this.walker, idOrLabel, context);
    if (!el) return { ok: false, error: `Element not found: ${idOrLabel}` };
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    el.focus?.();
    el.click();
    await this.waitForStable();
    return { ok: true, message: `Clicked "${idOrLabel}"`, screen: this.walker.describe() };
  }

  async fill(idOrLabel: string, value: string, context?: string): Promise<ToolResult> {
    const el = resolve(this.walker, idOrLabel, context);
    if (!el) return { ok: false, error: `Field not found: ${idOrLabel}` };

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      el.focus();
      setNativeValue(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      return { ok: false, error: `Element ${idOrLabel} is not a text field` };
    }
    await this.waitForStable();
    return { ok: true, message: `Typed "${value}" into "${idOrLabel}"`, screen: this.walker.describe() };
  }

  async scroll(direction: "up" | "down" | "left" | "right", idOrLabel?: string): Promise<ToolResult> {
    const target: HTMLElement | Window = idOrLabel
      ? resolve(this.walker, idOrLabel) ?? window
      : window;
    const dist = 0.8 * (direction === "up" || direction === "down" ? window.innerHeight : window.innerWidth);
    const dx = direction === "left" ? -dist : direction === "right" ? dist : 0;
    const dy = direction === "up" ? -dist : direction === "down" ? dist : 0;
    if (target === window) window.scrollBy({ top: dy, left: dx, behavior: "smooth" });
    else (target as HTMLElement).scrollBy({ top: dy, left: dx, behavior: "smooth" });
    await this.waitForStable(500);
    return { ok: true, message: `Scrolled ${direction}`, screen: this.walker.describe() };
  }

  /**
   * Find a snippet of body text on the page, scroll it into view, and (by default)
   * paint an animated "AI aura" on the surrounding block + a gradient highlight on
   * the matched phrase. Returns ok=false if no match is found.
   */
  async scrollToText(
    query: string,
    opts?: { highlight?: boolean; durationMs?: number }
  ): Promise<ToolResult> {
    if (typeof document === "undefined") return { ok: false, error: "No DOM" };
    const needle = (query ?? "").trim();
    if (!needle) return { ok: false, error: "Empty query" };

    const root = document.querySelector<HTMLElement>("main") ?? document.body;
    const lc = needle.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-ai-ignore]")) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
          return NodeFilter.FILTER_REJECT;
        const text = (node.textContent ?? "").toLowerCase();
        return text.includes(lc) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const node = walker.nextNode() as Text | null;
    if (!node) return { ok: false, error: `Text not found: "${needle}"` };

    const text = node.textContent ?? "";
    const idx = text.toLowerCase().indexOf(lc);
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + needle.length);

    const wantsHighlight = opts?.highlight !== false;
    const block = wantsHighlight ? pickBlockAncestor(node.parentElement) : null;

    if (wantsHighlight) injectAuraStyles();
    if (wantsHighlight) clearExistingAuras();

    const rect = range.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2;
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });

    let mark: HTMLElement | null = null;
    if (wantsHighlight) {
      mark = document.createElement("mark");
      mark.setAttribute("data-ai-ignore", "");
      mark.setAttribute("data-ai-highlight", "");
      try {
        range.surroundContents(mark);
      } catch {
        mark = null;
      }

      if (block) {
        const prevPos = block.style.position;
        if (!prevPos) block.style.position = "relative";
        block.setAttribute("data-ai-aura", "");
        (block as HTMLElement & { __aiAuraPrevPos?: string }).__aiAuraPrevPos = prevPos;
      }

      const fadeAfter = opts?.durationMs ?? 3200;
      setTimeout(() => {
        if (block) block.classList.add("ai-aura-fade");
        if (mark) mark.classList.add("ai-aura-fade");
        setTimeout(() => cleanupAura(block, mark), 700);
      }, fadeAfter);
    }

    await this.waitForStable(500);
    return { ok: true, message: `Scrolled to "${needle}"` };
  }
}

/* ----------------------------- aura helpers ----------------------------- */

function pickBlockAncestor(start: HTMLElement | null): HTMLElement | null {
  if (!start || typeof window === "undefined") return null;
  const STOP = new Set(["MAIN", "BODY", "HTML"]);
  let node: HTMLElement | null = start;
  let best: HTMLElement | null = null;
  let hops = 0;
  while (node && hops < 8 && !STOP.has(node.tagName)) {
    const cs = getComputedStyle(node);
    if (cs.display !== "inline") {
      const rect = node.getBoundingClientRect();
      const big = rect.width > 100 && rect.height > 30;
      const semantic = /^(ARTICLE|SECTION|ASIDE|LI|BLOCKQUOTE|FIGURE)$/.test(node.tagName);
      if (semantic && big) return node;
      if (big && !best) best = node;
    }
    node = node.parentElement;
    hops++;
  }
  return best ?? start;
}

let auraStylesInjected = false;

function injectAuraStyles() {
  if (auraStylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-ai-ignore", "");
  style.setAttribute("data-ai-aura-styles", "");
  style.textContent = AURA_CSS;
  document.head.appendChild(style);
  auraStylesInjected = true;
}

function clearExistingAuras() {
  document.querySelectorAll<HTMLElement>("[data-ai-aura]").forEach((el) => cleanupAura(el, null));
  document.querySelectorAll<HTMLElement>("mark[data-ai-highlight]").forEach((m) => cleanupAura(null, m));
}

function cleanupAura(block: HTMLElement | null, mark: HTMLElement | null) {
  if (block && block.hasAttribute("data-ai-aura")) {
    block.removeAttribute("data-ai-aura");
    block.classList.remove("ai-aura-fade");
    const stash = block as HTMLElement & { __aiAuraPrevPos?: string };
    if (stash.__aiAuraPrevPos !== undefined) {
      block.style.position = stash.__aiAuraPrevPos;
      delete stash.__aiAuraPrevPos;
    }
  }
  if (mark && mark.parentNode) {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    if ("normalize" in parent) (parent as Element).normalize();
  }
}

const AURA_CSS = `
@keyframes ai-aura-in {
  0% { box-shadow: 0 0 0 0 rgba(124,58,237,0); transform: scale(0.995); }
  60% { box-shadow: 0 0 48px 10px rgba(124,58,237,0.55); transform: scale(1.005); }
  100% { box-shadow: 0 0 32px 6px rgba(124,58,237,0.4); transform: scale(1); }
}
@keyframes ai-aura-pulse {
  0%, 100% { box-shadow: 0 0 28px 4px rgba(124,58,237,0.35), 0 0 60px 16px rgba(236,72,153,0.18); }
  50%      { box-shadow: 0 0 56px 12px rgba(124,58,237,0.55), 0 0 90px 28px rgba(6,182,212,0.28); }
}
@keyframes ai-aura-border {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}
@keyframes ai-mark-in {
  0% { background-position: -100% 50%; }
  100% { background-position: 0% 50%; }
}

[data-ai-aura] {
  z-index: 1;
  border-radius: 14px;
  animation: ai-aura-in 0.55s ease-out forwards, ai-aura-pulse 2.6s 0.55s ease-in-out infinite;
  transition: box-shadow 0.6s ease, transform 0.6s ease;
}
[data-ai-aura]::before {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  padding: 2px;
  background: linear-gradient(120deg, #7c3aed, #ec4899, #06b6d4, #7c3aed);
  background-size: 300% 300%;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
  animation: ai-aura-border 4.5s ease-in-out infinite;
  opacity: 0.85;
  transition: opacity 0.6s ease;
}
[data-ai-aura].ai-aura-fade {
  animation: none !important;
  box-shadow: none !important;
}
[data-ai-aura].ai-aura-fade::before {
  opacity: 0 !important;
}

mark[data-ai-highlight] {
  background: linear-gradient(90deg, rgba(124,58,237,0.18), rgba(236,72,153,0.22), rgba(6,182,212,0.18));
  background-size: 200% 100%;
  color: inherit;
  padding: 0 3px;
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(124,58,237,0.35), 0 4px 14px rgba(124,58,237,0.18);
  animation: ai-mark-in 0.6s ease-out;
  transition: background 0.6s ease, box-shadow 0.6s ease;
}
mark[data-ai-highlight].ai-aura-fade {
  background: transparent !important;
  box-shadow: none !important;
}
`;
