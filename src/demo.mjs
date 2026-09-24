// Fake guests for `spa lobby --demo`. Emits realistic hook payloads and runs
// them through the same translate() pipeline as the real hook.
import { trackCall, translate } from "./translate.mjs";

const PROJECTS = ["moonbase", "recipe-box", "pet-hotel", "AgentSpa", "dotfiles", "blog"];
const TOOLS = [
  ["Read", { file_path: "src/server.ts" }],
  ["Grep", { pattern: "TODO" }],
  ["Glob", { pattern: "**/*.test.ts" }],
  ["Edit", { file_path: "src/server.ts", old_string: "a", new_string: "b" }],
  ["Write", { file_path: "docs/notes.md" }],
  ["Bash", { command: "npm test" }],
  ["Bash", { command: "go test ./..." }],
  ["Bash", { command: "git status" }],
  ["Bash", { command: "npm run build" }],
  ["WebSearch", { query: "claude code hooks" }],
  ["WebFetch", { url: "https://code.claude.com/docs" }],
];
const HELPERS = ["Explore", "Plan", "general-purpose"];

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const chance = (p) => Math.random() < p;

function episode(g) {
  const base = { session_id: g.sid, cwd: `/demo/${g.project}` };
  const ev = (hook_event_name, extra = {}) => ({ ...base, hook_event_name, ...extra });
  const tool = (t, extra = {}) => ev("PreToolUse", { tool_name: t[0], tool_input: t[1], ...extra });
  const steps = [ev("UserPromptSubmit")];

  const roll = Math.random();
  if (roll < 0.12) {
    // Stuck: same failing command, over and over.
    const cmd = ["Bash", { command: "curl -f https://api.internal/health" }];
    for (let i = 0; i < 4; i++) steps.push(tool(cmd), ev("PostToolUseFailure", { tool_name: cmd[0], tool_input: cmd[1], error: "exit 22" }));
  } else if (roll < 0.28) {
    const agent_id = `a${Math.random().toString(36).slice(2, 8)}`;
    const agent_type = pick(HELPERS);
    steps.push(ev("SubagentStart", { agent_id, agent_type }));
    for (let i = 0; i < 4; i++) steps.push(tool(pick(TOOLS.slice(0, 3)), { agent_id, agent_type }));
    steps.push(ev("SubagentStop", { agent_id, agent_type }));
  } else if (roll < 0.36) {
    steps.push(ev("PreCompact", { trigger: "auto" }), ev("PreCompact", { trigger: "auto" }), ev("PostCompact", { trigger: "auto" }));
  } else {
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = pick(TOOLS);
      steps.push(tool(t));
      if (chance(0.12)) steps.push(ev("PostToolUseFailure", { tool_name: t[0], tool_input: t[1], error: "boom" }));
      if (chance(0.12)) steps.push(ev("Notification", { notification_type: "permission_prompt" }), ev("Notification", { notification_type: "permission_prompt" }));
    }
  }
  steps.push(ev("Stop"));
  if (chance(0.3)) steps.push(ev("Notification", { notification_type: "idle_prompt" }));
  if (chance(0.08)) steps.push(ev("SessionEnd", { reason: "prompt_input_exit" }));
  return steps;
}

export function startDemo(onEvent, { tickMs = 700, maxGuests = 5 } = {}) {
  const guests = [];
  const histories = new Map();
  let serial = 0;

  const checkIn = () => {
    const taken = new Set(guests.map((g) => g.project));
    const project = pick(PROJECTS.filter((p) => !taken.has(p)));
    const g = { sid: `demo${(serial++).toString(16).padStart(4, "0")}${Math.random().toString(16).slice(2, 6)}`, project, queue: [], restUntil: 0 };
    g.queue.push({ session_id: g.sid, cwd: `/demo/${project}`, hook_event_name: "SessionStart", source: "startup" });
    guests.push(g);
  };

  const emit = (p) => {
    let loop = false;
    if (p.hook_event_name === "PreToolUse") {
      const key = p.agent_id ? `${p.session_id}-${p.agent_id}` : p.session_id;
      if (!histories.has(key)) histories.set(key, []);
      loop = trackCall(histories.get(key), p.tool_name, p.tool_input);
    }
    const e = translate(p, { loop });
    if (e) onEvent(e);
  };

  const tick = () => {
    const now = Date.now();
    if (guests.length < maxGuests && (guests.length < 3 || chance(0.03))) checkIn();
    const ready = guests.filter((g) => g.restUntil <= now);
    if (!ready.length) return;
    const g = pick(ready);
    if (!g.queue.length) g.queue = episode(g);
    const p = g.queue.shift();
    emit(p);
    if (p.hook_event_name === "SessionEnd") guests.splice(guests.indexOf(g), 1);
    // Linger a while after finishing, as a real agent waits for its human.
    if (p.hook_event_name === "Stop") g.restUntil = now + 4000 + Math.random() * 8000;
  };

  const timer = setInterval(tick, tickMs);
  tick();
  return () => clearInterval(timer);
}
