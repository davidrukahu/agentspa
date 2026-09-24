#!/usr/bin/env node
// SessionStart hook: make sure the lobby server is running. Never fails the session.
import { ensureLobby } from "../src/launcher.mjs";

try {
  await ensureLobby();
} catch (err) {
  if (process.env.AGENTSPA_DEBUG === "1") process.stderr.write(`agentspa: ${err?.stack ?? err}\n`);
}
process.exit(0);
