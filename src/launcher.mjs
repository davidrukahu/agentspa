// Starts the lobby server in the background when it is not already running,
// so installing the plugin is the only setup step.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 4545;
const SPA_BIN = fileURLToPath(new URL("../bin/spa.mjs", import.meta.url));

export function lobbyPort() {
  return Number(process.env.AGENTSPA_PORT) || DEFAULT_PORT;
}

export function lobbyUrl(port = lobbyPort()) {
  return `http://127.0.0.1:${port}`;
}

// "agentspa" when our lobby answers, "other" when something else holds the
// port, null when nothing is listening.
export async function probe(port = lobbyPort()) {
  try {
    const res = await fetch(`${lobbyUrl(port)}/health`, { signal: AbortSignal.timeout(600) });
    const body = await res.json().catch(() => null);
    return body?.app === "agentspa" ? "agentspa" : "other";
  } catch (err) {
    return err?.cause?.code === "ECONNREFUSED" || err?.name === "TimeoutError" ? null : "other";
  }
}

export async function ensureLobby(port = lobbyPort(), { waitMs = 3000 } = {}) {
  const found = await probe(port);
  if (found) return found;

  const child = spawn(process.execPath, [SPA_BIN, "lobby", "--port", String(port), "--auto"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const now = await probe(port);
    if (now) return now;
  }
  return null;
}
