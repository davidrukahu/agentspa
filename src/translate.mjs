// Turns a raw Claude Code hook payload into a small lobby event:
//   { ts, sid, aid?, agentType?, project, kind, room?, label?, fx? }
// `room` is where the guest should walk to; `fx` is a one-off effect.
import { basename } from "node:path";
import { findLoop, fingerprint, label as callLabel } from "./detect.mjs";
import { HISTORY_LIMIT } from "./state.mjs";

const TEST_RE = /\b(test|tests|jest|vitest|pytest|mocha|rspec|phpunit)\b|\bnpm t\b/;

export function roomForTool(tool, input = {}) {
  if (tool === "Bash") return TEST_RE.test(String(input.command ?? "")) ? "pool" : "gym";
  if (/^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool)) return "library";
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return "salon";
  if (/^(WebFetch|WebSearch)$/.test(tool) || /browser|navigate|chrome/i.test(tool)) return "garden";
  return "sauna";
}

// Records a tool call in `history` (mutated) and reports whether the agent is
// now going round in circles.
export function trackCall(history, tool, input) {
  history.push(fingerprint(tool, input));
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  return findLoop(history) !== null;
}

export function translate(p, { loop = false, now = Date.now() } = {}) {
  const kind = p.hook_event_name;
  const ev = {
    ts: now,
    sid: p.session_id ?? "unknown",
    project: p.cwd ? basename(p.cwd) : "?",
    kind,
  };
  if (p.agent_id) ev.aid = p.agent_id;
  if (p.agent_type) ev.agentType = p.agent_type;

  switch (kind) {
    case "SessionStart": {
      const why = p.source ?? p.reason;
      return why === "compact"
        ? { ...ev, room: "sauna", label: "fresh from a compaction" }
        : { ...ev, room: "reception", label: "checking in" };
    }
    case "UserPromptSubmit":
      return { ...ev, room: "sauna", label: "thinking about your prompt" };
    case "PreToolUse": {
      const what = callLabel(p.tool_name, p.tool_input);
      return loop
        ? { ...ev, room: "door", label: `going round in circles: ${what}` }
        : { ...ev, room: roomForTool(p.tool_name, p.tool_input), label: what };
    }
    case "PostToolUseFailure":
      return { ...ev, fx: "slip", label: `slipped: ${callLabel(p.tool_name, p.tool_input)} failed` };
    case "Notification":
      if (p.notification_type === "permission_prompt") return { ...ev, room: "hottub", label: "waiting for your permission" };
      if (p.notification_type === "idle_prompt") return { ...ev, room: "lounge", label: "waiting for your next prompt" };
      return null;
    case "PreCompact":
      return { ...ev, room: "massage", label: "getting a context massage" };
    case "PostCompact":
      return { ...ev, room: "sauna", label: "refreshed after a massage" };
    case "Stop":
      return { ...ev, room: "lounge", label: "done, relaxing" };
    case "StopFailure":
      return { ...ev, room: "lounge", fx: "slip", label: `stopped on an error: ${p.error_type ?? "unknown"}` };
    case "SubagentStart":
      return { ...ev, label: `${p.agent_type ?? "helper"} joined` };
    case "SubagentStop":
      return { ...ev, label: "heading home" };
    case "SessionEnd":
      return { ...ev, label: "checking out" };
    default:
      return null;
  }
}
