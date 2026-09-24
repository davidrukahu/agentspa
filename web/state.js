// Lobby state, shared by the server (for snapshots) and the browser (for live
// updates). Plain ES module with no Node or DOM dependencies.

export const STALE_MS = 3 * 60 * 60 * 1000;
export const SLIP_MS = 2500;

export function guestId(e) {
  return e.aid ? `${e.sid}:${e.aid}` : e.sid;
}

function markLeaving(g, ts) {
  g.leaving = true;
  g.lastTs = Math.max(g.lastTs, ts);
}

// Applies one event to the guests map (mutated). Returns the guest it touched.
export function applyEvent(guests, e) {
  const id = guestId(e);
  let g = guests.get(id);

  if (e.kind === "SessionEnd" || e.kind === "SubagentStop") {
    if (!g) return null;
    markLeaving(g, e.ts);
    g.label = e.label ?? g.label;
    // A session leaving takes its helpers with it.
    if (!e.aid) for (const f of guests.values()) if (f.parent === g.id) markLeaving(f, e.ts);
    return g;
  }

  if (!g) {
    const parent = e.aid ? guests.get(e.sid) : null;
    g = {
      id,
      sid: e.sid,
      parent: e.aid ? e.sid : null,
      project: e.project ?? "?",
      agentType: e.agentType ?? null,
      room: parent?.room ?? "reception",
      label: "checking in",
      lastTs: 0,
      fx: null,
      fxUntil: 0,
      leaving: false,
    };
    guests.set(id, g);
  }

  // Async hooks can land slightly out of order; an older event must not drag
  // the guest back to a room it already left.
  const fresh = e.ts >= g.lastTs;
  if (fresh && e.room) g.room = e.room;
  if (fresh && e.label) g.label = e.label;
  if (e.fx) {
    g.fx = e.fx;
    g.fxUntil = e.ts + SLIP_MS;
  }
  if (e.agentType) g.agentType = e.agentType;
  if (fresh) g.leaving = false;
  g.lastTs = Math.max(g.lastTs, e.ts);
  return g;
}

// Drops guests who left or have been silent for hours.
export function prune(guests, now = Date.now()) {
  for (const [id, g] of guests) if (g.leaving || now - g.lastTs > STALE_MS) guests.delete(id);
  return guests;
}
