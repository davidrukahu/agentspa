#!/usr/bin/env node
// Records docs/lobby.gif: a scripted scene played through the real hook
// pipeline, captured from headless Chrome and encoded with ffmpeg. The same
// run writes docs/social-preview.png, the 1280x640 card GitHub shows when the
// repo link is shared.
//
//   node scripts/record-gif.mjs [--out docs/lobby.gif] [--seconds 16]
//
// Needs Google Chrome (or CHROME_PATH) and ffmpeg on PATH.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = resolve(option("--out", "docs/lobby.gif"));
const CARD = resolve(dirname(OUT), "social-preview.png");
const STILL_AT = 8.9; // seconds into the scene: hot tub, revolving door and helper all in view
const SECONDS = Number(option("--seconds", 16));
const FPS = 12;
const PORT = 4590;
const CDP_PORT = 9333;
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const work = mkdtempSync(join(tmpdir(), "agentspa-gif-"));
process.env.AGENTSPA_HOME = join(work, "home");
const { appendEvent } = await import("../src/state.mjs");
const { trackCall, translate } = await import("../src/translate.mjs");
const { startLobby } = await import("../src/server.mjs");

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------
const histories = new Map();
function send(project, hook_event_name, extra = {}) {
  const p = { session_id: `gif-${project}`, cwd: `/work/${project}`, hook_event_name, ...extra };
  let loop = false;
  if (hook_event_name === "PreToolUse") {
    const key = p.agent_id ? `${p.session_id}-${p.agent_id}` : p.session_id;
    if (!histories.has(key)) histories.set(key, []);
    loop = trackCall(histories.get(key), p.tool_name, p.tool_input);
  }
  const e = translate(p, { loop });
  if (e) appendEvent(e);
}
const tool = (project, tool_name, tool_input, extra = {}) => send(project, "PreToolUse", { tool_name, tool_input, ...extra });
const helper = { agent_id: "explore1", agent_type: "Explore" };

// Already in the lobby when the page opens.
tool("moonbase", "Bash", { command: "go test ./..." });
tool("recipe-box", "Read", { file_path: "src/server.ts" });
send("blog", "Stop");
tool("infra", "Bash", { command: "terraform plan" });

// What happens while recording, in seconds.
const SCRIPT = [
  [0.3, () => send("dotfiles", "SessionStart", { source: "startup" })],
  [1.2, () => tool("recipe-box", "Edit", { file_path: "src/server.ts", old_string: "a", new_string: "b" })],
  [2.0, () => send("infra", "PostToolUseFailure", { tool_name: "Bash", tool_input: { command: "terraform plan" }, error: "exit 1" })],
  [2.5, () => send("blog", "UserPromptSubmit")],
  [3.6, () => send("dotfiles", "Notification", { notification_type: "permission_prompt" })],
  [4.5, () => send("moonbase", "SubagentStart", helper)],
  [5.2, () => tool("moonbase", "Grep", { pattern: "TODO" }, helper)],
  [6.0, () => send("AgentSpa", "SessionStart", { source: "startup" })],
  [7.0, () => tool("AgentSpa", "Bash", { command: "curl -f https://api.internal/health" })],
  [7.4, () => tool("AgentSpa", "Bash", { command: "curl -f https://api.internal/health" })],
  [7.8, () => tool("AgentSpa", "Bash", { command: "curl -f https://api.internal/health" })],
  [8.5, () => send("recipe-box", "PreCompact", { trigger: "auto" })],
  [9.5, () => tool("infra", "WebSearch", { query: "terraform state lock" })],
  [11.0, () => send("moonbase", "SubagentStop", helper)],
  [12.0, () => tool("dotfiles", "Bash", { command: "npm test" })],
  [13.0, () => send("blog", "Stop")],
];

// ---------------------------------------------------------------------------
// Chrome over the DevTools protocol
// ---------------------------------------------------------------------------
async function cdpConnect() {
  for (let i = 0; i < 50; i++) {
    try {
      const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
      let id = 0;
      const pending = new Map();
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve: ok, reject: fail } = pending.get(msg.id);
          pending.delete(msg.id);
          msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
        }
      };
      return {
        send: (method, params = {}) =>
          new Promise((ok, fail) => {
            pending.set(++id, { resolve: ok, reject: fail });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        close: () => ws.close(),
      };
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("Chrome did not start");
}

const CARD_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Silkscreen&family=Space+Grotesk:wght@400;500&display=block">
<style>
  html, body { margin: 0; width: 1280px; height: 640px; background: #17110e; color: #f3e9dc; font-family: "Space Grotesk", sans-serif; }
  body { display: flex; align-items: center; gap: 36px; padding: 0 48px; box-sizing: border-box; }
  .text { width: 380px; flex: none; }
  h1 { font-family: "Silkscreen", monospace; font-weight: 400; font-size: 58px; margin: 0 0 18px; line-height: 1; }
  h1 span { color: #6fd3c7; }
  p { font-size: 30px; line-height: 1.3; margin: 0 0 28px; }
  small { font-size: 20px; color: #b7a593; }
  img { width: 768px; border-radius: 12px; border: 2px solid #3a2b24; display: block; }
</style></head>
<body>
  <div class="text">
    <h1>Agent<span>Spa</span></h1>
    <p>A pixel-art spa lobby for your Claude Code agents</p>
    <small>github.com/davidrukahu/agentspa</small>
  </div>
  <img src="still.png" alt="">
</body></html>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lobby = startLobby({ port: PORT });
await new Promise((r) => lobby.server.once("listening", r));

const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${join(work, "chrome")}`, "--hide-scrollbars", "--no-first-run", "--mute-audio"],
  { stdio: "ignore" },
);

const frames = join(work, "frames");
mkdirSync(frames);
try {
  const cdp = await cdpConnect();
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 760, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2500); // fonts, snapshot, first paint

  const { result } = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const a = document.querySelector("header").getBoundingClientRect();
      const b = document.getElementById("stage").getBoundingClientRect();
      return { x: Math.floor(b.left) - 12, y: Math.floor(a.top) - 12, width: Math.ceil(b.width) + 24, height: Math.ceil(b.bottom - a.top) + 24 };
    })()`,
  });
  const clip = { ...result.value, scale: 1 };
  const stage = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => { const r = document.getElementById("stage").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`,
  });
  const still = join(work, "still.png");
  let stillTaken = false;

  const start = Date.now();
  for (const [at, fn] of SCRIPT) setTimeout(fn, at * 1000);

  const list = [];
  let n = 0;
  while (Date.now() - start < SECONDS * 1000) {
    const t = Date.now();
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip });
    const file = join(frames, `f${String(n++).padStart(4, "0")}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    list.push({ file, t: t - start });
    if (!stillTaken && t - start >= STILL_AT * 1000) {
      const s = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...stage.result.value, scale: 2 } });
      writeFileSync(still, Buffer.from(s.data, "base64"));
      stillTaken = true;
    }
    const wait = t + 1000 / FPS - Date.now();
    if (wait > 0) await sleep(wait);
  }
  // The social preview card: name and pitch on the left, the lobby on the right.
  writeFileSync(join(work, "card.html"), CARD_HTML);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 640, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: `file://${join(work, "card.html")}` });
  await sleep(500);
  await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => document.images[0].decode())", awaitPromise: true });
  const card = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1280, height: 640, scale: 1 } });
  writeFileSync(join(work, "card.png"), Buffer.from(card.data, "base64"));
  cdp.close();

  // Feed ffmpeg each frame with the time it was really on screen.
  const concat = list
    .map((f, i) => `file '${f.file}'\nduration ${(((list[i + 1]?.t ?? SECONDS * 1000) - f.t) / 1000).toFixed(3)}`)
    .join("\n");
  writeFileSync(join(work, "frames.txt"), `${concat}\nfile '${list.at(-1).file}'\n`);

  mkdirSync(dirname(OUT), { recursive: true });
  const ff = spawnSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", join(work, "frames.txt"),
      "-vf", `fps=${FPS},split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
      "-loop", "0", OUT,
    ],
    { stdio: "inherit" },
  );
  if (ff.status !== 0) throw new Error("ffmpeg failed");
  console.log(`Wrote ${OUT}: ${list.length} frames, ${clip.width}x${clip.height}, ${(statSync(OUT).size / 1e6).toFixed(1)} MB`);
  copyFileSync(join(work, "card.png"), CARD);
  console.log(`Wrote ${CARD}: 1280x640, ${(statSync(CARD).size / 1e6).toFixed(2)} MB`);
} finally {
  // Chrome keeps writing to its profile for a moment after the kill signal.
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  lobby.close();
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(0);
