#!/usr/bin/env node
//   spa open                           start the lobby if needed and open it in a browser
//   spa lobby [--port 4545] [--demo]   run the lobby in the foreground
//   spa reset                          forget every guest
import { spawn } from "node:child_process";
import { ensureLobby, lobbyPort, lobbyUrl, probe } from "../src/launcher.mjs";
import { startLobby } from "../src/server.mjs";
import { clearAll, spaHome } from "../src/state.mjs";

const IDLE_EXIT_MS = 8 * 60 * 60 * 1000;

const [cmd = "open", ...args] = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function openBrowser(url) {
  const [command, argv] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  const child = spawn(command, argv, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

if (cmd === "open") {
  const port = lobbyPort();
  const state = await ensureLobby(port);
  if (state === "agentspa") {
    openBrowser(lobbyUrl(port));
    console.log(`AgentSpa lobby is open: ${lobbyUrl(port)}`);
  } else if (state === "other") {
    console.log(`Port ${port} is already used by another app. Set AGENTSPA_PORT to a free port, for example 4546.`);
    process.exit(1);
  } else {
    console.log(`The lobby did not start on port ${port}. Run "node ${process.argv[1]} lobby" to see why.`);
    process.exit(1);
  }
} else if (cmd === "lobby") {
  const port = Number(option("--port", lobbyPort()));
  const demo = flag("--demo");
  const lobby = startLobby({ port, demo, idleExitMs: flag("--auto") ? IDLE_EXIT_MS : 0 });
  lobby.server.on("listening", () => {
    console.log(`AgentSpa lobby is open: ${lobbyUrl(port)}${demo ? "  (demo guests)" : ""}`);
    if (!demo) console.log(`Reading events from ${spaHome()}`);
  });
  lobby.server.on("error", async (err) => {
    if (err.code === "EADDRINUSE" && (await probe(port)) === "agentspa") {
      console.log(`The lobby is already running: ${lobbyUrl(port)}`);
      process.exit(0);
    }
    console.error(err.code === "EADDRINUSE" ? `Port ${port} is taken. Try --port 4546.` : err.message);
    process.exit(1);
  });
} else if (cmd === "reset") {
  clearAll();
  console.log("Fresh towels for everyone. All guests forgotten.");
} else {
  console.log("usage: spa [open | lobby [--port N] [--demo] | reset]");
  process.exit(1);
}
