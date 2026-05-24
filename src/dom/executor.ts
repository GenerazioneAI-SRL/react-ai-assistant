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
}
