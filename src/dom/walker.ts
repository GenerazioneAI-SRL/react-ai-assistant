import type { UiElement } from "../types";

const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=option]",
  "[role=spinbutton]",
  "[role=slider]",
  "[contenteditable=true]",
  "[onclick]",
].join(",");

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.closest("[data-ai-ignore]")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return true;
}

function accessibleName(el: HTMLElement): string | undefined {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();

  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const text = labelledby
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.labels && el.labels.length) {
      const t = Array.from(el.labels)
        .map((l) => l.textContent?.trim())
        .filter(Boolean)
        .join(" ");
      if (t) return t;
    }
    if (el.placeholder) return el.placeholder.trim();
    if (el.name) return el.name;
  }

  const title = el.getAttribute("title");
  if (title) return title.trim();

  const text = el.textContent?.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);

  const alt = el.querySelector("img[alt]")?.getAttribute("alt");
  if (alt) return alt.trim();

  return undefined;
}

function nearestContext(el: HTMLElement): string | undefined {
  // Walk up looking for a heading or labelled container to disambiguate
  // (e.g. an "ADD" button inside an "Onion" card).
  let node: HTMLElement | null = el.parentElement;
  let hops = 0;
  while (node && hops < 5) {
    const heading = node.querySelector("h1,h2,h3,h4,[role=heading]");
    if (heading && heading !== el && !heading.contains(el)) {
      const t = heading.textContent?.replace(/\s+/g, " ").trim();
      if (t) return t.slice(0, 60);
    }
    const ariaLabel = node.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim().slice(0, 60);
    node = node.parentElement;
    hops++;
  }
  return undefined;
}

export class DomWalker {
  private counter = 0;
  private readonly attr = "data-ai-id";

  /** Read the live UI tree into a structured list of interactive elements. */
  walk(root: ParentNode = document): UiElement[] {
    if (typeof document === "undefined") return [];
    const out: UiElement[] = [];
    const nodes = root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
    for (const el of Array.from(nodes)) {
      if (!isVisible(el)) continue;
      const label = accessibleName(el);
      if (!label && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") continue;

      let id = el.getAttribute(this.attr);
      if (!id) {
        id = `el-${this.counter++}`;
        el.setAttribute(this.attr, id);
      }

      const input = el as HTMLInputElement;
      out.push({
        id,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") ?? undefined,
        label,
        type: el.getAttribute("type") ?? undefined,
        value:
          "value" in el && typeof input.value === "string" && input.value
            ? input.value.slice(0, 80)
            : undefined,
        disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true",
        context: nearestContext(el),
      });
    }
    return out;
  }

  /** Compact text serialization of the screen for the LLM. */
  describe(root: ParentNode = document): string {
    const els = this.walk(root);
    if (!els.length) return "(no interactive elements detected on screen)";
    const title = typeof document !== "undefined" ? document.title : "";
    const path = typeof location !== "undefined" ? location.pathname : "";
    const header = `Screen: "${title}" (route: ${path})`;
    const lines = els.map((e) => {
      const bits = [
        `#${e.id}`,
        e.role ?? e.tag,
        e.label ? `"${e.label}"` : "",
        e.type ? `type=${e.type}` : "",
        e.value ? `value="${e.value}"` : "",
        e.disabled ? "(disabled)" : "",
        e.context ? `in:"${e.context}"` : "",
      ].filter(Boolean);
      return "- " + bits.join(" ");
    });
    return [header, "Interactive elements:", ...lines].join("\n");
  }

  find(id: string): HTMLElement | null {
    if (typeof document === "undefined") return null;
    const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    return document.querySelector<HTMLElement>(`[${this.attr}="${safe}"]`);
  }

  /** Find by visible label / context when the LLM passes a label instead of an id. */
  findByLabel(label: string, context?: string): HTMLElement | null {
    const els = this.walk();
    const norm = (s: string) => s.toLowerCase().trim();
    const target = norm(label);
    let match = els.find(
      (e) =>
        e.label &&
        norm(e.label) === target &&
        (!context || (e.context && norm(e.context).includes(norm(context))))
    );
    if (!match) match = els.find((e) => e.label && norm(e.label).includes(target));
    return match ? this.find(match.id) : null;
  }
}
