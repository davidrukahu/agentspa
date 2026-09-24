import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const home = mkdtempSync(join(tmpdir(), "agentspa-"));
process.env.AGENTSPA_HOME = home;
after(() => rmSync(home, { recursive: true, force: true }));

const { startLobby } = await import("../src/server.mjs");
const { readEvents } = await import("../src/state.mjs");

function hook(payload) {
  return spawnSync("node", [join(root, "hooks/checkin.mjs")], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: { ...process.env, AGENTSPA_HOME: home },
    encoding: "utf8",
  });
}
const call = (sid, command) => ({ session_id: sid, cwd: "/w/recipe-box", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });

test("hook appends lobby events and never blocks", () => {
  assert.equal(hook({ session_id: "p1", cwd: "/w/recipe-box", hook_event_name: "SessionStart", source: "startup" }).status, 0);
  for (let i = 0; i < 3; i++) assert.equal(hook(call("p1", "curl -f x")).status, 0);
  assert.equal(hook("not json").status, 0);
  assert.equal(hook({ session_id: "p1", hook_event_name: "PostToolUse" }).status, 0);

  const events = readEvents().filter((e) => e.sid === "p1");
  assert.deepEqual(events.map((e) => e.room), ["reception", "gym", "gym", "door"]);
  assert.equal(events[0].project, "recipe-box");
});

test("lobby sends a snapshot, then streams new events", async () => {
  const port = 45000 + Math.floor(Math.random() * 1000);
  const lobby = startLobby({ port });
  await new Promise((r) => lobby.server.once("listening", r));
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /AgentSpa Lobby/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/state.js`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/../package.json`)).status, 404);

    const lost = await fetch(`http://127.0.0.1:${port}/nope`, { headers: { accept: "text/html" } });
    assert.equal(lost.status, 404);
    const lostPage = await lost.text();
    assert.match(lostPage, /Page not found/);
    assert.match(lostPage, /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/nope`)).text(), "not found");

    const res = await fetch(`http://127.0.0.1:${port}/events`);
    const reader = res.body.getReader();
    let text = "";
    const until = async (re) => {
      const deadline = Date.now() + 4000;
      while (!re.test(text) && Date.now() < deadline) {
        const { value } = await reader.read();
        text += new TextDecoder().decode(value);
      }
      return re.test(text);
    };

    assert.ok(await until(/event: snapshot/), "snapshot arrives");
    assert.match(text, /"id":"p1".*"room":"door"/);

    hook({ session_id: "p2", cwd: "/w/blog", hook_event_name: "UserPromptSubmit" });
    assert.ok(await until(/"sid":"p2".*"room":"sauna"/), "new event is streamed");
    await reader.cancel();
  } finally {
    lobby.close();
  }
});
