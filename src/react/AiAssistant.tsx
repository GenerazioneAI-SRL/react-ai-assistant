import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { Assistant, type AssistantState } from "../core/assistant";
import type { AiAssistantConfig } from "../types";

interface AiContextValue {
  assistant: Assistant;
  state: AssistantState;
}

const AiContext = createContext<AiContextValue | null>(null);

export interface AiAssistantProviderProps {
  config: AiAssistantConfig;
  /** Pass your current route (e.g. usePathname()) to keep the agent route-aware. */
  route?: string;
  /** Render the built-in floating button + chat overlay. Default true. */
  withWidget?: boolean;
  children?: ReactNode;
}

export function AiAssistantProvider({
  config,
  route,
  withWidget = true,
  children,
}: AiAssistantProviderProps) {
  const assistantRef = useRef<Assistant | null>(null);
  if (!assistantRef.current) assistantRef.current = new Assistant(config);
  const assistant = assistantRef.current;

  const [state, setState] = useState<AssistantState>(assistant.getState());

  useEffect(() => assistant.subscribe(setState), [assistant]);

  useEffect(() => {
    if (route) assistant.setRoute(route);
  }, [assistant, route]);

  const value = useMemo<AiContextValue>(() => ({ assistant, state }), [assistant, state]);

  const showWidget = withWidget && config.showFloatingButton !== false;

  return (
    <AiContext.Provider value={value}>
      {children}
      {showWidget ? <AiAssistantWidget /> : null}
    </AiContext.Provider>
  );
}

export function useAiAssistant() {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error("useAiAssistant must be used within <AiAssistantProvider>");
  return { ...ctx.state, controller: ctx.assistant };
}

/* ----------------------------- Widget UI ------------------------------- */

export function AiAssistantWidget() {
  const ctx = useContext(AiContext);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  if (!ctx) return null;
  const { assistant, state } = ctx;
  const name = assistant.config.assistantName ?? "AI Assistant";

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    void assistant.sendMessage(text);
  };

  return (
    <>
      <style>{AI_STYLES}</style>
      <button
        aria-label="Open AI assistant"
        data-ai-ignore=""
        onClick={() => setOpen((v) => !v)}
        style={styles.fab}
      >
        {state.isProcessing ? <Spinner /> : "✦"}
      </button>

      {open ? (
        <div data-ai-ignore="" style={styles.panel} role="dialog" aria-label={name}>
          <div style={styles.header}>
            <span style={{ fontWeight: 600 }}>{name}</span>
            <div>
              <button onClick={() => assistant.clear()} style={styles.headerBtn} title="Clear">
                ⟲
              </button>
              <button onClick={() => setOpen(false)} style={styles.headerBtn} title="Close">
                ✕
              </button>
            </div>
          </div>

          <div style={styles.messages}>
            {state.messages.length === 0 ? (
              <div style={styles.empty}>
                {(assistant.config.initialSuggestions ?? []).map((s) => (
                  <button
                    key={s.label}
                    style={styles.chip}
                    onClick={() => void assistant.sendMessage(s.message)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}

            {state.messages.map((m) => {
              const fallback = m.pending && !m.text;
              const text = fallback ? state.progressText ?? "Working..." : m.text;
              const useMarkdown = m.role === "assistant" && !fallback;
              return (
                <div
                  key={m.id}
                  style={{
                    ...styles.bubble,
                    ...(m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant),
                    ...(useMarkdown ? { whiteSpace: "normal" } : null),
                  }}
                >
                  {useMarkdown ? (
                    <div
                      className="ai-md"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
                    />
                  ) : (
                    text
                  )}
                </div>
              );
            })}

            {state.isProcessing &&
            state.actionSteps.length > 0 &&
            assistant.config.showActionSteps !== false ? (
              <div style={styles.steps}>
                {state.actionSteps.map((s) => (
                  <div key={s.id} style={styles.step}>
                    <span>{s.status === "done" ? "✓" : s.status === "error" ? "✕" : "•"}</span> {s.label}
                  </div>
                ))}
              </div>
            ) : null}

            {state.isHandoff && state.handoff ? (
              <div style={styles.handoff}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Your turn</div>
                <div style={{ fontSize: 13 }}>{state.handoff.summary}</div>
                {state.handoff.buttonLabel ? (
                  <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
                    Tap “{state.handoff.buttonLabel}” to confirm.
                  </div>
                ) : null}
                <button style={styles.handoffBtn} onClick={() => assistant.resolveHandoff()}>
                  Done
                </button>
              </div>
            ) : null}
          </div>

          <div style={styles.composer}>
            <input
              data-ai-ignore=""
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder={state.pendingQuestion ? "Type your answer..." : "Ask me to do something..."}
              style={styles.input}
            />
            {state.isProcessing ? (
              <button style={styles.sendBtn} onClick={() => assistant.stop()}>
                Stop
              </button>
            ) : (
              <button style={styles.sendBtn} onClick={submit}>
                Send
              </button>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

const AI_STYLES = `
@keyframes ai-spin{to{transform:rotate(360deg)}}
.ai-md{font-size:14px;line-height:1.45}
.ai-md p{margin:0 0 6px 0}
.ai-md p:last-child{margin-bottom:0}
.ai-md h1,.ai-md h2,.ai-md h3{margin:6px 0;line-height:1.3}
.ai-md h1{font-size:16px;font-weight:700}
.ai-md h2{font-size:15px;font-weight:700}
.ai-md h3{font-size:14px;font-weight:600}
.ai-md ul,.ai-md ol{margin:4px 0;padding-left:18px}
.ai-md li{margin:2px 0}
.ai-md code{background:rgba(0,0,0,0.08);padding:1px 5px;border-radius:4px;font-size:0.9em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.ai-md pre{background:#0f172a;color:#e5e7eb;padding:8px 10px;border-radius:8px;overflow:auto;margin:6px 0;font-size:12px}
.ai-md pre code{background:transparent;padding:0;color:inherit;font-size:12px}
.ai-md a{color:#2563eb;text-decoration:underline;word-break:break-word}
.ai-md strong{font-weight:600}
.ai-md em{font-style:italic}
.ai-md blockquote{border-left:3px solid #d1d5db;padding-left:8px;margin:6px 0;color:#4b5563}
`;

const MD_PLACEHOLDER = "\u200B__MDCB__\u200B";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(src: string): string {
  if (!src) return "";

  const codeBlocks: string[] = [];
  let s = src.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    const i = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `${MD_PLACEHOLDER}${i}${MD_PLACEHOLDER}`;
  });

  s = escapeHtml(s);

  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  s = s.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  s = s.replace(/(?:^[-*]\s+.+(?:\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((l) => `<li>${l.replace(/^[-*]\s+/, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });
  s = s.replace(/(?:^\d+\.\s+.+(?:\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map((l) => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });
  s = s.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");

  s = s
    .split(/\n{2,}/)
    .map((block) => {
      if (/^\s*<(h\d|ul|ol|pre|blockquote)/i.test(block)) return block;
      if (block.includes(MD_PLACEHOLDER)) return block;
      return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");

  s = s.replace(new RegExp(`${MD_PLACEHOLDER}(\\d+)${MD_PLACEHOLDER}`, "g"), (_m, i) => codeBlocks[+i]);

  return s;
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        border: "2px solid rgba(255,255,255,0.4)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "ai-spin 0.8s linear infinite",
      }}
    />
  );
}

const styles: Record<string, CSSProperties> = {
  fab: {
    position: "fixed",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    background: "#111827",
    color: "#fff",
    fontSize: 22,
    lineHeight: 1,
    padding: 0,
    cursor: "pointer",
    boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
    zIndex: 2147483000,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    position: "fixed",
    right: 20,
    bottom: 88,
    width: 360,
    maxWidth: "calc(100vw - 40px)",
    height: 520,
    maxHeight: "calc(100vh - 120px)",
    background: "#fff",
    color: "#111827",
    borderRadius: 16,
    boxShadow: "0 12px 48px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    zIndex: 2147483000,
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderBottom: "1px solid #eee",
  },
  headerBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 15, marginLeft: 8, color: "#6b7280" },
  messages: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  empty: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
  },
  bubble: { padding: "8px 12px", borderRadius: 12, fontSize: 14, maxWidth: "85%", whiteSpace: "pre-wrap" },
  bubbleUser: { alignSelf: "flex-end", background: "#111827", color: "#fff" },
  bubbleAssistant: { alignSelf: "flex-start", background: "#f3f4f6" },
  steps: { fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 2 },
  step: {},
  handoff: { border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 12, padding: 12 },
  handoffBtn: {
    marginTop: 8,
    width: "100%",
    border: "none",
    background: "#111827",
    color: "#fff",
    borderRadius: 8,
    padding: "8px 0",
    cursor: "pointer",
  },
  composer: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eee" },
  input: { flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", fontSize: 14, outline: "none" },
  sendBtn: { border: "none", background: "#111827", color: "#fff", borderRadius: 8, padding: "0 14px", cursor: "pointer" },
};
