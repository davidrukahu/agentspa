import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HISTORY_LIMIT = 24;
const ROTATE_BYTES = 5 * 1024 * 1024;

export function spaHome() {
  return process.env.AGENTSPA_HOME || join(homedir(), ".agentspa");
}

export function eventsFile() {
  return join(spaHome(), "events.jsonl");
}

function historyFile(key) {
  return join(spaHome(), "history", `${String(key).replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}

// One JSON line per event. Small appends to an O_APPEND file do not interleave,
// so concurrent hooks are safe. Past 5 MB the file moves aside and starts over.
export function appendEvent(event) {
  const file = eventsFile();
  mkdirSync(spaHome(), { recursive: true });
  try {
    if (statSync(file).size > ROTATE_BYTES) renameSync(file, join(spaHome(), "events.old.jsonl"));
  } catch {
    // No file yet.
  }
  appendFileSync(file, `${JSON.stringify(event)}\n`);
}

export function readEvents(file = eventsFile()) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const events = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A torn or foreign line; skip it.
    }
  }
  return events;
}

export function loadHistory(key) {
  try {
    return JSON.parse(readFileSync(historyFile(key), "utf8"));
  } catch {
    return [];
  }
}

export function saveHistory(key, history) {
  const file = historyFile(key);
  mkdirSync(join(spaHome(), "history"), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(history.slice(-HISTORY_LIMIT)));
  renameSync(tmp, file);
}

export function clearAll() {
  rmSync(spaHome(), { recursive: true, force: true });
}
