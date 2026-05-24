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

function pickMainScope(root: ParentNode): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (root instanceof HTMLElement) return root;
  const doc = "ownerDocument" in root && root.ownerDocument ? root.ownerDocument : document;
  return (
    doc.querySelector<HTMLElement>("main") ??
    doc.querySelector<HTMLElement>("[role=main]") ??
    doc.querySelector<HTMLElement>("article") ??
    doc.body
  );
}

function collapseText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-ai-ignore],script,style,noscript").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

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
  describe(root: ParentNode = document, opts?: { textBudget?: number }): string {
    const els = this.walk(root);
    const title = typeof document !== "undefined" ? document.title : "";
    const path = typeof location !== "undefined" ? location.pathname : "";
    const header = `Screen: "${title}" (route: ${path})`;

    const interactiveLines = els.length
      ? els.map((e) => {
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
        })
      : ["(no interactive elements detected on screen)"];

    const excerpt = this.readableText(root, opts?.textBudget ?? 1200);
    const sections = [header, "Interactive elements:", ...interactiveLines];
    if (excerpt) {
      sections.push("", "Page content (excerpt — call get_page_text for the full body):", excerpt);
    }
    return sections.join("\n");
  }

  /**
   * Extract human-readable text from the current screen — headings, paragraphs,
   * list items, table cells. Skips chrome (nav/header/footer/aside), hidden
   * nodes, and anything inside [data-ai-ignore]. Truncates at `budget` chars
   * so it can be embedded in tool observations without blowing the context.
   */
  readableText(root: ParentNode = document, budget = 6000): string {
    if (typeof document === "undefined") return "";
    const scope = pickMainScope(root);
    if (!scope) return "";

    const blocks: string[] = [];
    const SKIP = new Set([
      "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG",
      "NAV", "HEADER", "FOOTER", "ASIDE", "FORM",
    ]);
    const TEXT_TAGS = new Set([
      "H1", "H2", "H3", "H4", "H5", "H6",
      "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DT", "DD", "SUMMARY",
    ]);

    const visit = (node: Element): void => {
      if (!(node instanceof HTMLElement)) return;
      if (SKIP.has(node.tagName)) return;
      if (node.closest("[data-ai-ignore]")) return;
      if (!isVisible(node)) return;

      if (TEXT_TAGS.has(node.tagName)) {
        const text = collapseText(node);
        if (text) {
          const prefix = node.tagName.startsWith("H") ? `${"#".repeat(parseInt(node.tagName[1]!, 10))} ` : "";
          blocks.push(prefix + text);
        }
        return;
      }
      for (const child of Array.from(node.children)) visit(child);
    };

    for (const child of Array.from(scope.children)) visit(child);

    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const b of blocks) {
      if (seen.has(b)) continue;
      seen.add(b);
      deduped.push(b);
    }

    let out = deduped.join("\n");
    if (out.length > budget) out = out.slice(0, budget).replace(/\s+\S*$/, "") + "…";
    return out;
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
