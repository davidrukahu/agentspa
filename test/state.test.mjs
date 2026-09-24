import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEvent, prune, STALE_MS } from "../web/state.js";

const ev = (kind, extra = {}) => ({ sid: "s1", project: "recipe-box", kind, ts: 100, ...extra });

test("first event checks a guest in, later events move them", () => {
  const guests = new Map();
  applyEvent(guests, ev("SessionStart", { room: "reception", label: "checking in" }));
  applyEvent(guests, ev("PreToolUse", { ts: 200, room: "library", label: "Read(a.ts)" }));
  const g = guests.get("s1");
  assert.equal(g.room, "library");
  assert.equal(g.label, "Read(a.ts)");
  assert.equal(g.lastTs, 200);
});

test("a late event does not drag a guest backwards", () => {
  const guests = new Map();
  applyEvent(guests, ev("PreToolUse", { ts: 300, room: "pool" }));
  applyEvent(guests, ev("PreToolUse", { ts: 250, room: "library" }));
  assert.equal(guests.get("s1").room, "pool");
});

test("a slip is an effect, not a move", () => {
  const guests = new Map();
  applyEvent(guests, ev("PreToolUse", { ts: 100, room: "gym" }));
  applyEvent(guests, ev("PostToolUseFailure", { ts: 150, fx: "slip" }));
  const g = guests.get("s1");
  assert.equal(g.room, "gym");
  assert.equal(g.fx, "slip");
  assert.ok(g.fxUntil > 150);
});

test("helpers start beside their caller and leave with them", () => {
  const guests = new Map();
  applyEvent(guests, ev("PreToolUse", { room: "sauna" }));
  applyEvent(guests, ev("SubagentStart", { aid: "a1", agentType: "Explore", ts: 110 }));
  const f = guests.get("s1:a1");
  assert.equal(f.parent, "s1");
  assert.equal(f.room, "sauna");
  assert.equal(f.agentType, "Explore");

  applyEvent(guests, ev("PreToolUse", { aid: "a1", ts: 120, room: "library" }));
  assert.equal(guests.get("s1:a1").room, "library");
  assert.equal(guests.get("s1").room, "sauna");

  applyEvent(guests, ev("SessionEnd", { ts: 130 }));
  assert.equal(guests.get("s1").leaving, true);
  assert.equal(guests.get("s1:a1").leaving, true);
  prune(guests, 140);
  assert.equal(guests.size, 0);
});

test("an out-of-order event after checkout does not bring a guest back", () => {
  const guests = new Map();
  applyEvent(guests, ev("PreToolUse", { ts: 100, room: "gym" }));
  applyEvent(guests, ev("SessionEnd", { ts: 200 }));
  applyEvent(guests, ev("PreToolUse", { ts: 190, room: "pool" }));
  assert.equal(guests.get("s1").leaving, true);
});

test("prune drops guests silent for hours", () => {
  const guests = new Map();
  applyEvent(guests, ev("Stop", { ts: 0, room: "lounge" }));
  prune(guests, STALE_MS - 1);
  assert.equal(guests.size, 1);
  prune(guests, STALE_MS + 1);
  assert.equal(guests.size, 0);
});

test("unknown end events are ignored", () => {
  const guests = new Map();
  assert.equal(applyEvent(guests, ev("SessionEnd")), null);
  assert.equal(guests.size, 0);
});
