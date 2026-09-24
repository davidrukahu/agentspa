import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "agentspa-launch-"));
const port = 47000 + Math.floor(Math.random() * 1000);
process.env.AGENTSPA_HOME = home;
process.env.AGENTSPA_PORT = String(port);

const { ensureLobby, probe } = await import("../src/launcher.mjs");

async function stopLobby() {
  const res = await fetch(`http://127.0.0.1:${port}/health`).catch(() => null);
  if (!res) return;
  // The detached lobby is ours to clean up; find it by port and stop it.
  spawnSync("sh", ["-c", `lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill 2>/dev/null`]);
}
after(async () => {
  await stopLobby();
  rmSync(home, { recursive: true, force: true });
});

function get(path, host) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
}

test("ensureLobby starts the lobby once, then finds it running", async () => {
  assert.equal(await probe(port), null);
  assert.equal(await ensureLobby(port), "agentspa");
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.app, "agentspa");
  assert.equal(health.demo, false);
  assert.equal(await ensureLobby(port), "agentspa");
});

test("the lobby only answers requests addressed to this machine", async () => {
  assert.equal(await get("/health", `127.0.0.1:${port}`), 200);
  assert.equal(await get("/health", `localhost:${port}`), 200);
  assert.equal(await get("/health", `evil.example:${port}`), 403);
  assert.equal(await get("/", "evil.example"), 403);
});

test("the SessionStart hook script exits cleanly when the lobby is up", () => {
  const r = spawnSync("node", [new URL("../hooks/ensure-lobby.mjs", import.meta.url).pathname], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
});
