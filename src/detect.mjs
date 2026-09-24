import { createHash } from "node:crypto";

// Stable JSON: sorted keys, so {a,b} and {b,a} fingerprint the same.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(toolName, toolInput) {
  return createHash("sha1")
    .update(`${toolName}\u0000${stable(toolInput ?? {})}`)
    .digest("hex")
    .slice(0, 12);
}

// Short human label for the dashboard and the nudge message.
export function label(toolName, toolInput = {}) {
  const hint =
    toolInput.command ??
    toolInput.file_path ??
    toolInput.pattern ??
    toolInput.url ??
    toolInput.query ??
    toolInput.description ??
    "";
  const text = String(hint).replace(/\s+/g, " ").trim();
  const short = text.length > 60 ? `${text.slice(0, 57)}...` : text;
  return short ? `${toolName}(${short})` : toolName;
}

/**
 * Look for a repeating cycle at the tail of the history.
 *
 * A cycle of period p repeated `threshold` times means the last p*threshold
 * calls are p calls replayed over and over: A,A,A (p=1) or A,B,A,B,A,B (p=2).
 * Running the same test after *different* edits is not a cycle, because the
 * edits break the pattern.
 *
 * Returns { period, cycle } for the shortest matching period, or null.
 */
export function findLoop(history, { threshold = 3, maxPeriod = 3 } = {}) {
  for (let p = 1; p <= maxPeriod; p++) {
    const span = p * threshold;
    if (history.length < span) break;
    const tail = history.slice(-span);
    let repeats = true;
    for (let i = p; i < span; i++) {
      if (tail[i] !== tail[i - p]) {
        repeats = false;
        break;
      }
    }
    // A period-2 match on A,A,A,A,A,A is really period 1; the loop above
    // already returned for p=1 in that case, so any match here is genuine.
    if (repeats) return { period: p, cycle: tail.slice(0, p) };
  }
  return null;
}
