let _counter = 0;

/** Compact, collision-resistant id without external deps. */
export function uid(prefix = "id"): string {
  _counter = (_counter + 1) % 1_000_000;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}-${rand}`;
}

export function makeLogger(enabled: boolean | undefined) {
  return (...args: unknown[]) => {
    if (enabled) console.log("[ai-assistant]", ...args);
  };
}
