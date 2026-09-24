// The lobby server: replays recent events, tails the events file for new ones,
// and streams them to browsers over server-sent events.
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { applyEvent, prune, STALE_MS } from "../web/state.js";
import { startDemo } from "./demo.mjs";
import { eventsFile, readEvents } from "./state.mjs";

const WEB = new URL("../web/", import.meta.url);
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/lobby.js": ["lobby.js", "text/javascript; charset=utf-8"],
  "/state.js": ["state.js", "text/javascript; charset=utf-8"],
};

function fileSize(file) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

// Only answer requests addressed to this machine by name, so a web page on
// another origin cannot reach the lobby through DNS rebinding.
function localHost(hostHeader = "", port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(hostHeader.toLowerCase());
}

/**
 * idleExitMs: when set, the process exits after this long with no events and
 * no open browser tabs. The plugin starts the lobby this way so it tidies up
 * after itself.
 */
export function startLobby({ port = 4545, host = "127.0.0.1", demo = false, file = eventsFile(), idleExitMs = 0 } = {}) {
  const guests = new Map();
  const clients = new Set();
  let lastActivity = Date.now();

  const publish = (e) => {
    lastActivity = Date.now();
    applyEvent(guests, e);
    const line = `data: ${JSON.stringify(e)}\n\n`;
    for (const res of clients) res.write(line);
  };

  let stopFeed;
  if (demo) {
    stopFeed = startDemo(publish);
  } else {
    const cutoff = Date.now() - STALE_MS;
    for (const e of readEvents(file)) if (e.ts > cutoff) applyEvent(guests, e);
    prune(guests);

    let offset = fileSize(file);
    let partial = "";
    const poll = setInterval(() => {
      const size = fileSize(file);
      if (size < offset) offset = 0; // rotated or reset
      if (size === offset) return;
      const fd = openSync(file, "r");
      const buf = Buffer.alloc(size - offset);
      readSync(fd, buf, 0, buf.length, offset);
      closeSync(fd);
      offset = size;
      const lines = (partial + buf.toString("utf8")).split("\n");
      partial = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        try {
          publish(JSON.parse(line));
        } catch {
          // Not ours; ignore.
        }
      }
    }, 250);
    stopFeed = () => clearInterval(poll);
  }

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(": still here\n\n");
    if (idleExitMs && !clients.size && Date.now() - lastActivity > idleExitMs) process.exit(0);
  }, 15000);

  const server = createServer((req, res) => {
    if (!localHost(req.headers.host, port)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ app: "agentspa", version: VERSION, demo }));
      return;
    }
    if (path === "/events") {
      lastActivity = Date.now();
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      prune(guests);
      res.write(`event: snapshot\ndata: ${JSON.stringify([...guests.values()])}\n\n`);
      clients.add(res);
      req.on("close", () => {
        clients.delete(res);
        lastActivity = Date.now();
      });
      return;
    }
    const entry = STATIC[path];
    if (!entry || req.method !== "GET") {
      if (req.method === "GET" && /text\/html/.test(req.headers.accept ?? "")) {
        res.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(readFileSync(fileURLToPath(new URL("404.html", WEB))));
      } else {
        res.writeHead(404).end("not found");
      }
      return;
    }
    res.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" });
    res.end(readFileSync(fileURLToPath(new URL(entry[0], WEB))));
  });

  server.listen(port, host);
  return {
    server,
    guests,
    close() {
      stopFeed();
      clearInterval(heartbeat);
      for (const res of clients) res.end();
      server.close();
    },
  };
}
