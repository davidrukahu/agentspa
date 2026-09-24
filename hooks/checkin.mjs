#!/usr/bin/env node
// Claude Code hook for every lobby event. Watch-only: it records what the agent
// is doing and always exits 0, so it can never block or slow down real work.
import { appendEvent, loadHistory, saveHistory } from "../src/state.mjs";
import { trackCall, translate } from "../src/translate.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

try {
  const now = Date.now();
  const payload = JSON.parse(await readStdin());

  let loop = false;
  if (payload.hook_event_name === "PreToolUse" && payload.tool_name) {
    const key = payload.agent_id ? `${payload.session_id}-${payload.agent_id}` : payload.session_id;
    const history = loadHistory(key);
    loop = trackCall(history, payload.tool_name, payload.tool_input);
    saveHistory(key, history);
  }

  const event = translate(payload, { loop, now });
  if (event) appendEvent(event);
} catch (err) {
  if (process.env.AGENTSPA_DEBUG === "1") process.stderr.write(`agentspa: ${err?.stack ?? err}\n`);
}
process.exit(0);
