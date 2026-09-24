import assert from "node:assert/strict";
import { test } from "node:test";
import { findLoop, fingerprint } from "../src/detect.mjs";
import { roomForTool, trackCall, translate } from "../src/translate.mjs";

const base = { session_id: "s1", cwd: "/Users/someone/moonbase" };

test("tools map to rooms", () => {
  assert.equal(roomForTool("Bash", { command: "npm test" }), "pool");
  assert.equal(roomForTool("Bash", { command: "go test ./..." }), "pool");
  assert.equal(roomForTool("Bash", { command: "npx vitest run" }), "pool");
  assert.equal(roomForTool("Bash", { command: "git status" }), "gym");
  assert.equal(roomForTool("Read", {}), "library");
  assert.equal(roomForTool("Grep", {}), "library");
  assert.equal(roomForTool("Edit", {}), "salon");
  assert.equal(roomForTool("Write", {}), "salon");
  assert.equal(roomForTool("WebFetch", {}), "garden");
  assert.equal(roomForTool("mcp__Claude_Browser__navigate", {}), "garden");
  assert.equal(roomForTool("TodoWrite", {}), "sauna");
});

test("hook events map to rooms and labels", () => {
  const t = (p) => translate({ ...base, ...p }, { now: 1000 });
  assert.deepEqual(t({ hook_event_name: "SessionStart", source: "startup" }), {
    ts: 1000, sid: "s1", project: "moonbase", kind: "SessionStart", room: "reception", label: "checking in",
  });
  assert.equal(t({ hook_event_name: "SessionStart", source: "compact" }).room, "sauna");
  assert.equal(t({ hook_event_name: "UserPromptSubmit" }).room, "sauna");
  assert.equal(t({ hook_event_name: "Notification", notification_type: "permission_prompt" }).room, "hottub");
  assert.equal(t({ hook_event_name: "Notification", notification_type: "idle_prompt" }).room, "lounge");
  assert.equal(t({ hook_event_name: "Notification", notification_type: "auth_success" }), null);
  assert.equal(t({ hook_event_name: "PreCompact" }).room, "massage");
  assert.equal(t({ hook_event_name: "Stop" }).room, "lounge");
  assert.equal(t({ hook_event_name: "PostToolUse" }), null);

  const pre = t({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } });
  assert.equal(pre.room, "pool");
  assert.equal(pre.label, "Bash(npm test)");

  const fail = t({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "make" } });
  assert.equal(fail.fx, "slip");
  assert.equal(fail.room, undefined);
});

test("a looping call sends the guest to the revolving door", () => {
  const e = translate({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "curl x" } }, { loop: true });
  assert.equal(e.room, "door");
  assert.match(e.label, /round in circles/);
});

test("subagent events carry the agent id and type", () => {
  const e = translate({ ...base, hook_event_name: "SubagentStart", agent_id: "a1", agent_type: "Explore" });
  assert.equal(e.aid, "a1");
  assert.equal(e.agentType, "Explore");
  assert.equal(e.room, undefined);
});

test("trackCall flags straight repeats and short cycles only", () => {
  const h = [];
  assert.equal(trackCall(h, "Bash", { command: "x" }), false);
  assert.equal(trackCall(h, "Bash", { command: "x" }), false);
  assert.equal(trackCall(h, "Bash", { command: "x" }), true);

  const edits = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(trackCall(edits, "Edit", { file_path: "a", new_string: String(i) }), false);
    assert.equal(trackCall(edits, "Bash", { command: "npm test" }), false);
  }
});

test("findLoop and fingerprint basics", () => {
  assert.equal(fingerprint("A", { x: 1, y: 2 }), fingerprint("A", { y: 2, x: 1 }));
  assert.deepEqual(findLoop(["a", "b", "a", "b", "a", "b"]), { period: 2, cycle: ["a", "b"] });
  assert.equal(findLoop(["a", "b", "a", "b", "a"]), null);
});
