import { applyEvent } from "/state.js";

// ---------------------------------------------------------------------------
// Floor plan. Everything is drawn at 320x180 and scaled up with crisp pixels.
// ---------------------------------------------------------------------------
const W = 320;
const H = 180;
const TOP_Y = 14; // top row interior starts
const TOP_H = 58;
const HALL_Y = 86; // walking line through the hallway
const BOT_Y = 100;
const BOT_H = 76;
const DOOR = { x: 20, y: HALL_Y }; // revolving door at the entrance
const SPEED = 55; // pixels per second

const ROOMS = {
  sauna: { col: 0, row: 0, name: "Sauna", means: "thinking", pose: "sit" },
  library: { col: 1, row: 0, name: "Library", means: "reading", pose: "read" },
  salon: { col: 2, row: 0, name: "Nail salon", means: "editing", pose: "sit" },
  gym: { col: 3, row: 0, name: "Gym", means: "running commands", pose: "run" },
  garden: { col: 4, row: 0, name: "Garden", means: "browsing the web", pose: "stand" },
  reception: { col: 0, row: 1, name: "Reception", means: "checking in", pose: "stand" },
  pool: { col: 1, row: 1, name: "Pool", means: "running tests", pose: "swim" },
  hottub: { col: 2, row: 1, name: "Hot tub", means: "needs your OK", pose: "soak" },
  massage: { col: 3, row: 1, name: "Massage", means: "compacting context", pose: "lie" },
  lounge: { col: 4, row: 1, name: "Lounge", means: "done, waiting", pose: "lounge" },
};

// Where guests settle in each room, relative to the room's top-left corner.
const SLOTS = {
  sauna: [[12, 26], [28, 26], [44, 26], [10, 46], [26, 46]],
  library: [[12, 38], [30, 44], [46, 36], [20, 54], [42, 54]],
  salon: [[10, 30], [30, 30], [50, 30], [20, 50], [40, 50]],
  gym: [[10, 33], [30, 33], [50, 33], [18, 52], [38, 52]],
  garden: [[14, 36], [32, 46], [46, 30], [22, 55], [46, 55]],
  reception: [[14, 40], [30, 46], [46, 40], [20, 62], [42, 62]],
  pool: [[16, 30], [40, 38], [18, 50], [42, 60], [28, 68]],
  hottub: [[20, 34], [40, 34], [22, 47], [38, 47], [30, 25]],
  massage: [[16, 26], [44, 26], [16, 50], [44, 50], [30, 68]],
  lounge: [[16, 26], [44, 26], [16, 50], [44, 50], [30, 68]],
};

const rect = (room) => {
  const r = ROOMS[room];
  return { x: r.col * 64 + 2, y: r.row ? BOT_Y : TOP_Y, w: 60, h: r.row ? BOT_H : TOP_H };
};
const doorPoint = (room) => {
  const r = ROOMS[room];
  return { x: r.col * 64 + 32, y: r.row ? BOT_Y - 1 : TOP_Y + TOP_H + 1 };
};
const entryPoint = (room) => {
  const r = ROOMS[room];
  return { x: r.col * 64 + 32, y: r.row ? BOT_Y + 6 : TOP_Y + TOP_H - 6 };
};

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------
function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SKIN = ["#f1c7a5", "#e0a98a", "#c68863", "#8d5a3b", "#5e3a26", "#f5d6c0"];
const HAIR = ["#2b1d16", "#5a3825", "#a0522d", "#d9b36c", "#e8e3da", "#b83b3b", "#3b4a8c", "#1f1f1f"];
const BELT = ["#e0685b", "#e3a23b", "#5cb85c", "#4aa3df", "#9b6bd6", "#e56fa6", "#3fbfae", "#f0d04b"];

function palette(g) {
  const h = hash(g.id);
  const belt = BELT[hash(g.project) % BELT.length];
  return {
    skin: SKIN[h % SKIN.length],
    hair: HAIR[(h >>> 4) % HAIR.length],
    belt,
    robe: g.parent ? "#bfe6dc" : "#f7f4ee",
    shade: g.parent ? "#9ccfc2" : "#d6cfc3",
  };
}

const canvas = document.getElementById("spa");
const ctx = canvas.getContext("2d");
let px = ctx; // the context p() draws to; swapped while painting the background
const p = (x, y, w, h, c) => {
  px.fillStyle = c;
  px.fillRect(Math.round(x), Math.round(y), w, h);
};

// ---------------------------------------------------------------------------
// Background, painted once
// ---------------------------------------------------------------------------
function paintBackground() {
  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  px = bg.getContext("2d");
  const r = rng(7);

  p(0, 0, W, H, "#2a201c"); // walls
  // Top wall decor: warm lamps and little plants.
  for (let x = 8; x < W; x += 32) {
    p(x, 4, 3, 3, "#ffd98a");
    p(x + 1, 7, 1, 2, "#6b4a33");
    p(x + 16, 7, 4, 3, "#8a5a3b");
    p(x + 15, 4, 2, 3, "#5f9e4f");
    p(x + 18, 3, 2, 4, "#6fb35c");
  }

  // Hallway: wood floor with a teal runner.
  p(0, 74, W, 24, "#b89b74");
  for (let x = 0; x < W; x += 12) p(x, 74, 1, 24, "#a88a63");
  p(0, 82, W, 9, "#2f6d6a");
  p(0, 82, W, 1, "#d9b36c");
  p(0, 90, W, 1, "#d9b36c");
  // Entrance mat.
  p(0, 78, 4, 17, "#6b4a33");

  for (const room of Object.keys(ROOMS)) {
    const { x, y, w, h } = rect(room);
    const d = doorPoint(room);
    ROOM_ART[room](x, y, w, h, r);
    // Door gap in the wall between room and hallway.
    p(d.x - 5, ROOMS[room].row ? BOT_Y - 2 : TOP_Y + TOP_H, 10, 2, "#b89b74");
  }
  px = ctx;
  return bg;
}

const ROOM_ART = {
  sauna(x, y, w, h) {
    p(x, y, w, h, "#8a5a33");
    for (let yy = y + 3; yy < y + h; yy += 4) p(x, yy, w, 1, "#7a4d2a");
    // Benches.
    p(x + 3, y + 22, 50, 2, "#d49a5e");
    p(x + 3, y + 24, 50, 4, "#a8703f");
    p(x + 3, y + 42, 36, 2, "#d49a5e");
    p(x + 3, y + 44, 36, 4, "#a8703f");
    // Heater with stones.
    p(x + 44, y + 38, 12, 16, "#4a4a4f");
    p(x + 45, y + 36, 10, 3, "#6b6b73");
    p(x + 46, y + 35, 2, 2, "#e0685b");
    p(x + 50, y + 35, 2, 2, "#f0a35b");
    p(x + 53, y + 36, 2, 1, "#e0685b");
    // Bucket and ladle.
    p(x + 40, y + 50, 3, 3, "#c48a52");
    p(x + 42, y + 47, 1, 3, "#c48a52");
  },
  library(x, y, w, h, r) {
    p(x, y, w, h, "#5b3f5c");
    p(x + 8, y + 28, 44, 24, "#8c3b3b");
    p(x + 10, y + 30, 40, 20, "#a54a44");
    for (let i = 0; i < 40; i += 4) p(x + 10 + i, y + 30, 2, 20, "#9a433e");
    // Bookshelves.
    p(x, y, w, 18, "#4a2f1f");
    for (const sy of [y + 2, y + 10]) {
      let bx = x + 2;
      while (bx < x + w - 3) {
        const bw = 1 + Math.floor(r() * 2);
        const bh = 5 + Math.floor(r() * 3);
        p(bx, sy + 7 - bh, bw, bh, BELT[Math.floor(r() * BELT.length)]);
        bx += bw + (r() < 0.2 ? 2 : 0);
      }
      p(x, sy + 7, w, 1, "#6b4a33");
    }
    // Armchair.
    p(x + 2, y + 44, 8, 8, "#2f6d6a");
    p(x + 2, y + 42, 8, 3, "#3f8a86");
  },
  salon(x, y, w, h) {
    for (let yy = 0; yy < h; yy += 6) for (let xx = 0; xx < w; xx += 6) p(x + xx, y + yy, 6, 6, (xx + yy) % 12 ? "#f2c6d0" : "#e8b0bf");
    for (const cx of [10, 30, 50]) {
      p(x + cx - 6, y + 1, 12, 9, "#bfe3ef");
      p(x + cx - 4, y + 2, 2, 5, "#ffffff");
      p(x + cx - 7, y + 10, 14, 5, "#efe6d8");
      p(x + cx - 3, y + 11, 1, 2, "#e0685b");
      p(x + cx, y + 11, 1, 2, "#9b6bd6");
      p(x + cx + 3, y + 11, 1, 2, "#f0d04b");
      p(x + cx - 4, y + 24, 8, 7, "#d65a8a");
    }
    p(x + 44, y + 44, 12, 10, "#9c7ab8");
  },
  gym(x, y, w, h) {
    p(x, y, w, h, "#555b66");
    for (let xx = 0; xx < w; xx += 10) p(x + xx, y, 1, h, "#4c515b");
    for (const cx of [10, 30, 50]) {
      p(x + cx - 5, y + 20, 10, 15, "#2d3036");
      p(x + cx - 4, y + 21, 8, 13, "#3d4148");
      p(x + cx - 5, y + 18, 10, 2, "#8a8f99");
    }
    // Dumbbell rack.
    p(x + 44, y + 46, 14, 2, "#8a8f99");
    for (let i = 0; i < 4; i++) p(x + 45 + i * 3, y + 43, 2, 3, "#1f2226");
    // Water cooler.
    p(x + 2, y + 44, 5, 10, "#dfe7ee");
    p(x + 2, y + 40, 5, 4, "#7fc6e8");
  },
  garden(x, y, w, h, r) {
    p(x, y, w, h, "#5f9e4f");
    for (let i = 0; i < 120; i++) p(x + r() * w, y + r() * h, 1, 1, r() < 0.5 ? "#6fb35c" : "#548c45");
    for (let i = 0; i < 18; i++) p(x + 2 + r() * (w - 4), y + 2 + r() * (h - 4), 1, 1, ["#f0d04b", "#e56fa6", "#ffffff", "#9b6bd6"][i % 4]);
    // Tree.
    p(x + 48, y + 12, 3, 12, "#6b4a33");
    p(x + 42, y + 2, 15, 12, "#3f7a3a");
    p(x + 44, y + 1, 11, 2, "#4f8f45");
    // Stepping stones.
    for (let i = 0; i < 4; i++) p(x + 27 + (i % 2) * 4, y + 48 + i * 3, 5, 2, "#c9c2b3");
    // Bench.
    p(x + 4, y + 20, 14, 2, "#a8703f");
  },
  reception(x, y, w, h) {
    for (let yy = 0; yy < h; yy += 8) for (let xx = 0; xx < w; xx += 8) p(x + xx, y + yy, 8, 8, (xx + yy) % 16 ? "#ece4d6" : "#ddd3c2");
    // Desk.
    p(x + 10, y + 10, 40, 10, "#6b4a33");
    p(x + 10, y + 9, 40, 2, "#a8703f");
    p(x + 28, y + 6, 3, 3, "#f0d04b");
    // Towel stack and plants.
    p(x + 14, y + 5, 6, 4, "#ffffff");
    p(x + 14, y + 7, 6, 1, "#6fd3c7");
    p(x + 2, y + 62, 6, 8, "#8a5a3b");
    p(x + 1, y + 55, 8, 8, "#5f9e4f");
    p(x + 52, y + 62, 6, 8, "#8a5a3b");
    p(x + 51, y + 55, 8, 8, "#5f9e4f");
  },
  pool(x, y, w, h) {
    p(x, y, w, h, "#d7eef2");
    for (let yy = 0; yy < h; yy += 6) for (let xx = 0; xx < w; xx += 6) p(x + xx, y + yy, 1, 1, "#b9dbe2");
    p(x + 4, y + 8, 52, 62, "#2f8fc4");
    p(x + 4, y + 8, 52, 2, "#256f99");
    for (const ly of [26, 48]) for (let xx = 6; xx < 54; xx += 4) p(x + xx, y + ly, 2, 1, (xx / 4) % 2 ? "#e0685b" : "#ffffff");
    // Ladder.
    p(x + 48, y + 5, 1, 7, "#c0c7cc");
    p(x + 52, y + 5, 1, 7, "#c0c7cc");
    p(x + 48, y + 7, 5, 1, "#c0c7cc");
    p(x + 48, y + 10, 5, 1, "#c0c7cc");
  },
  hottub(x, y, w, h) {
    p(x, y, w, h, "#cfc6b8");
    for (let yy = 0; yy < h; yy += 10) p(x, y + yy, w, 1, "#c2b8a8");
    const cx = x + 30;
    const cy = y + 38;
    for (let dy = -25; dy <= 25; dy++) {
      const half = Math.round(Math.sqrt(25 * 25 - dy * dy));
      p(cx - half, cy + dy, half * 2, 1, "#8b5a2b");
      const inner = Math.round(Math.sqrt(Math.max(0, 22 * 22 - dy * dy)));
      if (Math.abs(dy) < 22) p(cx - inner, cy + dy, inner * 2, 1, "#6cc6d9");
    }
    // Towel hooks.
    p(x + 4, y + 66, 8, 4, "#ffffff");
    p(x + 48, y + 66, 8, 4, "#f0d04b");
  },
  massage(x, y, w, h) {
    p(x, y, w, h, "#d9c3a5");
    for (let yy = 0; yy < h; yy += 3) p(x, y + yy, w, 1, "#cfb792");
    for (const [sx, sy] of SLOTS.massage.slice(0, 4)) {
      p(x + sx - 11, y + sy - 1, 22, 4, "#ffffff");
      p(x + sx - 11, y + sy + 3, 22, 1, "#d6cfc3");
      p(x + sx - 10, y + sy + 4, 1, 3, "#6b4a33");
      p(x + sx + 9, y + sy + 4, 1, 3, "#6b4a33");
    }
    p(x + 48, y + 62, 10, 8, "#ffffff");
    p(x + 48, y + 64, 10, 1, "#e56fa6");
  },
  lounge(x, y, w, h) {
    p(x, y, w, h, "#c9a36b");
    for (let yy = 0; yy < h; yy += 4) p(x, y + yy, w, 1, "#b8925c");
    for (const [sx, sy] of SLOTS.lounge.slice(0, 4)) {
      for (let i = 0; i < 22; i += 2) p(x + sx - 11 + i, y + sy - 2, 2, 5, (i / 2) % 2 ? "#3fbfae" : "#ffffff");
      p(x + sx - 12, y + sy - 3, 2, 7, "#8a5a3b");
    }
    // Palm and a drinks table.
    p(x + 54, y + 44, 2, 20, "#8a5a3b");
    p(x + 48, y + 42, 12, 3, "#4f8f45");
    p(x + 50, y + 40, 8, 2, "#6fb35c");
    p(x + 26, y + 36, 6, 4, "#efe6d8");
    p(x + 27, y + 34, 1, 2, "#f0d04b");
    p(x + 30, y + 34, 1, 2, "#e56fa6");
  },
};

// ---------------------------------------------------------------------------
// Animated room bits
// ---------------------------------------------------------------------------
function paintAmbience(t) {
  // Sauna steam.
  const s = rect("sauna");
  for (let i = 0; i < 6; i++) {
    const k = (t * 8 + i * 9) % 30;
    p(s.x + 46 + ((i * 3) % 8) + Math.sin(t * 2 + i) * 1.5, s.y + 34 - k, 1, 1, `rgba(255,255,255,${0.5 - k / 60})`);
  }
  // Pool ripples.
  const pl = rect("pool");
  for (let i = 0; i < 9; i++) {
    const rx = pl.x + 6 + ((i * 17 + Math.floor(t * 4)) % 46);
    const ry = pl.y + 12 + ((i * 23) % 56);
    p(rx, ry, 3, 1, "#5fb3e0");
  }
  // Hot tub bubbles.
  const ht = rect("hottub");
  for (let i = 0; i < 10; i++) {
    const k = (t * 5 + i * 3.3) % 6;
    p(ht.x + 14 + ((i * 7) % 32), ht.y + 28 + ((i * 11) % 22) - k, 1, 1, k < 3 ? "#e6fbff" : "#a9e6f0");
  }
  // Massage candles.
  const m = rect("massage");
  for (const cx of [3, 55]) {
    p(m.x + cx, m.y + 4, 2, 3, "#fff3dc");
    p(m.x + cx, m.y + 2 + (Math.sin(t * 9 + cx) > 0 ? 0 : 1), 2, 2, "#f0a35b");
  }
  // Revolving door.
  const a = t * 1.3;
  for (let i = 0; i < 4; i++) {
    const ang = a + (i * Math.PI) / 2;
    for (let k = 1; k <= 7; k++) p(DOOR.x + Math.cos(ang) * k, DOOR.y + Math.sin(ang) * k * 0.55, 1, 1, "rgba(200,235,240,.9)");
  }
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    p(DOOR.x + Math.cos(ang) * 9, DOOR.y + Math.sin(ang) * 5, 1, 1, "#d9b36c");
  }
}

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------
const K = "#2a1a14";

function drawUpright(x, y, c, { frame = 0, bob = 0, walking = false, book = false, sitting = false }) {
  const top = y - (sitting ? 10 : 12) + bob;
  p(x - 3, top, 6, 2, c.hair);
  p(x - 3, top + 2, 1, 2, c.hair);
  p(x + 2, top + 2, 1, 2, c.hair);
  p(x - 2, top + 2, 4, 3, c.skin);
  p(x - 1, top + 3, 1, 1, K);
  p(x + 1, top + 3, 1, 1, K);
  p(x - 3, top + 5, 6, 5, c.robe);
  p(x + 2, top + 5, 1, 5, c.shade);
  p(x - 3, top + 7, 6, 1, c.belt);
  p(x - 4, top + 5, 1, 3, c.robe);
  p(x + 3, top + 5, 1, 3, c.robe);
  p(x - 4, top + 8, 1, 1, c.skin);
  p(x + 3, top + 8, 1, 1, c.skin);
  if (sitting) {
    p(x - 3, top + 9, 7, 1, c.shade);
  } else {
    const a = walking && frame % 2 ? 1 : 2;
    const b = walking && !(frame % 2) ? 1 : 2;
    p(x - 2, top + 10, 1, a, c.skin);
    p(x + 1, top + 10, 1, b, c.skin);
  }
  if (book) {
    p(x - 2, top + 6, 5, 3, "#b0413e");
    p(x - 2, top + 6, 5, 1, "#efe2c0");
  }
}

function drawLying(x, y, c, { cucumbers = false, towel = false }) {
  const t = y - 3;
  p(x - 9, t, 2, 3, c.hair);
  p(x - 7, t, 3, 3, c.skin);
  if (cucumbers) {
    p(x - 7, t, 2, 1, "#7cc46b");
    p(x - 7, t + 2, 2, 1, "#7cc46b");
  } else {
    p(x - 6, t + 1, 1, 1, K);
  }
  p(x - 4, t, 10, 3, towel ? "#ffffff" : c.robe);
  p(x - 4, t + 2, 10, 1, towel ? "#e8e2d8" : c.shade);
  if (!towel) p(x - 1, t, 1, 3, c.belt);
  p(x + 6, t + 1, 2, 2, c.skin);
}

function drawSwimming(x, y, c, frame) {
  p(x - 2, y - 5, 4, 2, c.hair);
  p(x - 2, y - 3, 4, 2, c.skin);
  p(x - 1, y - 3, 1, 1, K);
  p(x + 1, y - 3, 1, 1, K);
  const side = frame % 2 ? -4 : 3;
  p(x + side, y - 3, 1, 2, c.skin);
  p(x + side, y - 4, 1, 1, "#ffffff");
  p(x - 4, y - 1, 8, 1, "#bfe9f7");
}

function drawSoaking(x, y, c, frame) {
  p(x - 3, y - 8, 6, 2, c.hair);
  p(x - 2, y - 6, 4, 3, c.skin);
  p(x - 1, y - 5, 1, 1, K);
  p(x + 1, y - 5, 1, 1, K);
  p(x - 4, y - 3, 8, 2, c.skin);
  p(x - 5, y - 1, 10, 1, "#bdeef5");
  // Waving: "hey, I need you".
  const up = frame % 2;
  p(x + 4, y - 7 - up, 1, 4, c.skin);
  p(x + 4 + (up ? 1 : 0), y - 8 - up, 1, 1, c.skin);
}

function drawSlip(x, y, c, t) {
  drawLying(x, y, c, {});
  const Y = "#f4c95d";
  p(x + 10, y - 6, 1, 1, Y);
  p(x + 9, y - 5, 3, 1, Y);
  p(x + 8, y - 4, 5, 1, Y);
  p(x + 7, y - 3, 7, 1, Y);
  p(x + 10, y - 5, 1, 1, K);
  p(x + 10, y - 3, 1, 1, K);
  p(x - 6, y + 1, 12, 1, "rgba(160,220,255,.7)");
  stars(x - 6, y - 6, t);
}

function stars(x, y, t) {
  for (let i = 0; i < 3; i++) {
    const a = t * 5 + (i * Math.PI * 2) / 3;
    p(x + Math.cos(a) * 4, y + Math.sin(a) * 1.5, 1, 1, "#f4c95d");
  }
}

// ---------------------------------------------------------------------------
// Scene state
// ---------------------------------------------------------------------------
const guests = new Map(); // id -> guest record from state.js
const sprites = new Map(); // id -> { x, y, path, room, slot, phase, tag }
const occupied = new Map(); // room -> array of guest ids by slot index

function takeSlot(room, id) {
  if (!occupied.has(room)) occupied.set(room, []);
  const list = occupied.get(room);
  let i = list.findIndex((v) => v === undefined);
  if (i < 0) i = list.length;
  list[i] = id;
  return i;
}
function freeSlot(room, i) {
  const list = occupied.get(room);
  if (list && i >= 0) list[i] = undefined;
}
function slotPoint(room, i) {
  if (room === "door") return { x: DOOR.x + 11, y: DOOR.y };
  const slots = SLOTS[room];
  const s = slots[i % slots.length];
  const r = rect(room);
  const spill = Math.floor(i / slots.length) * 4;
  return { x: r.x + s[0] + spill, y: r.y + s[1] - spill / 2 };
}

// The room a point is inside, or null for the hallway.
function roomAt(x, y) {
  for (const room of Object.keys(ROOMS)) {
    const r = rect(room);
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return room;
  }
  return null;
}

// Plans the walk from where the guest is standing right now, which may be
// halfway to somewhere else if the agent changed its mind mid-stride.
function route(sp, target, dest) {
  const here = roomAt(sp.x, sp.y);
  if (here && here === target) return [dest];
  const pts = [];
  if (here) {
    const d = doorPoint(here);
    pts.push(entryPoint(here), d, { x: d.x, y: HALL_Y });
  } else {
    pts.push({ x: sp.x, y: HALL_Y });
  }
  if (target === "exit") {
    pts.push({ x: DOOR.x, y: HALL_Y }, { x: -14, y: HALL_Y });
  } else if (target === "door") {
    pts.push(dest);
  } else {
    const d = doorPoint(target);
    pts.push({ x: d.x, y: HALL_Y }, d, entryPoint(target), dest);
  }
  return pts;
}

function makeSprite(g, placed) {
  const sp = { x: -14, y: HALL_Y, path: [], room: null, slot: -1, phase: (hash(g.id) % 628) / 100, leaving: false };
  const parent = g.parent && sprites.get(g.parent);
  if (placed) {
    sp.room = g.room;
    sp.slot = g.room === "door" ? -1 : takeSlot(g.room, g.id);
    Object.assign(sp, slotPoint(g.room, sp.slot));
  } else if (parent) {
    // Helpers appear right beside whoever called them.
    Object.assign(sp, { x: parent.x + 4, y: parent.y, room: parent.room === "door" ? null : parent.room });
  }
  sp.tag = document.createElement("div");
  sp.tag.className = "tag";
  sp.tag.innerHTML = '<span class="name"></span><span class="detail"></span>';
  overlay.appendChild(sp.tag);
  sprites.set(g.id, sp);
  return sp;
}

function removeSprite(id) {
  const sp = sprites.get(id);
  if (!sp) return;
  if (sp.room) freeSlot(sp.room, sp.slot);
  sp.tag.remove();
  sprites.delete(id);
  guests.delete(id);
}

function step(sp, dt) {
  let budget = SPEED * dt;
  while (budget > 0 && sp.path.length) {
    const to = sp.path[0];
    const dx = to.x - sp.x;
    const dy = to.y - sp.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= budget) {
      sp.x = to.x;
      sp.y = to.y;
      sp.path.shift();
      budget -= dist;
    } else {
      sp.x += (dx / dist) * budget;
      sp.y += (dy / dist) * budget;
      budget = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
const overlay = document.getElementById("overlay");
const background = paintBackground();
for (const [room, info] of Object.entries(ROOMS)) {
  const r = rect(room);
  const el = document.createElement("div");
  el.className = "room-label";
  el.style.left = `${(r.x / W) * 100}%`;
  el.style.top = `${(r.y / H) * 100}%`;
  el.innerHTML = `${info.name}<small>${info.means}</small>`;
  overlay.appendChild(el);
}

let last = performance.now();
function frame(nowMs) {
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  const t = nowMs / 1000;
  const now = Date.now();

  for (const [id, g] of guests) {
    let sp = sprites.get(id) ?? makeSprite(g, false);
    if (g.leaving && !sp.leaving) {
      sp.leaving = true;
      if (sp.room) freeSlot(sp.room, sp.slot);
      sp.path = route(sp, "exit");
      sp.room = null;
      sp.slot = -1;
    } else if (!g.leaving && g.room !== sp.room) {
      if (sp.room) freeSlot(sp.room, sp.slot);
      const slot = g.room === "door" ? -1 : takeSlot(g.room, id);
      sp.path = route(sp, g.room, slotPoint(g.room, slot));
      sp.room = g.room;
      sp.slot = slot;
    }
    const slipping = g.fx === "slip" && now < g.fxUntil;
    if (!slipping) step(sp, dt);
    if (sp.leaving && !sp.path.length) removeSprite(id);
  }

  ctx.drawImage(background, 0, 0);
  paintAmbience(t);

  const order = [...sprites.entries()].map(([id, sp]) => ({ id, sp, g: guests.get(id) })).filter((o) => o.g);
  for (const o of order) {
    const { sp, g } = o;
    const walking = sp.path.length > 0;
    let x = sp.x;
    let y = sp.y;
    if (!walking && sp.room === "door") {
      const a = t * 2.2 + sp.phase;
      x = DOOR.x + Math.cos(a) * 11;
      y = DOOR.y + Math.sin(a) * 5;
    } else if (!walking && sp.room === "pool") {
      x += Math.sin(t * 0.9 + sp.phase) * 7;
    }
    o.x = x;
    o.y = y;
    o.walking = walking;
  }
  order.sort((a, b) => a.y - b.y);

  let waiting = 0;
  let circles = 0;
  for (const { id, sp, g, x, y, walking } of order) {
    const c = palette(g);
    const f = Math.floor(t * 6 + sp.phase * 3);
    const slipping = g.fx === "slip" && now < g.fxUntil;
    const pose = slipping ? "slip" : walking ? "walk" : sp.room === "door" ? "spin" : ROOMS[sp.room]?.pose ?? "stand";
    let headY = y - 13;
    switch (pose) {
      case "walk": drawUpright(x, y, c, { frame: f, walking: true, bob: f % 2 ? 0 : -1 }); break;
      case "spin": drawUpright(x, y, c, { frame: f, walking: true }); stars(x, y - 14, t); headY -= 2; break;
      case "run": drawUpright(x, y, c, { frame: Math.floor(t * 10), walking: true, bob: Math.floor(t * 10) % 2 ? 0 : -1 }); break;
      case "read": drawUpright(x, y, c, { book: true }); break;
      case "sit":
        drawUpright(x, y, c, { sitting: true });
        headY = y - 11;
        if (sp.room === "sauna" && Math.floor(t * 2 + sp.phase) % 3 === 0) p(x + 3, y - 8 + ((t * 8) % 3), 1, 1, "#9fd8ff");
        break;
      case "lie": drawLying(x, y, c, { towel: true }); headY = y - 5; break;
      case "lounge": drawLying(x, y, c, { cucumbers: true }); headY = y - 5; break;
      case "swim": drawSwimming(x, y, c, f); headY = y - 6; break;
      case "soak": drawSoaking(x, y, c, Math.floor(t * 4)); headY = y - 9; break;
      case "slip": drawSlip(x, y, c, t); headY = y - 8; break;
      default: drawUpright(x, y, c, { frame: f, bob: Math.floor(t + sp.phase) % 4 === 0 ? -1 : 0 });
    }

    const isWaiting = !walking && sp.room === "hottub" && !g.leaving;
    const isStuck = sp.room === "door" && !g.leaving;
    if (isWaiting && !g.parent) waiting++;
    if (isStuck) circles++;
    const tag = sp.tag;
    // Anchor tags near the edges to their inner side so they are never clipped.
    const xPct = (x / W) * 100;
    // Helpers wear their tag below their feet so it never covers the caller's.
    const below = !!g.parent;
    const dy = below ? "0%" : "-100%";
    tag.style.left = `${xPct}%`;
    tag.style.top = `${((below ? y + 1 : headY - 2) / H) * 100}%`;
    tag.style.transform = xPct < 10 ? `translate(-3cqw, ${dy})` : xPct > 90 ? `translate(calc(-100% + 3cqw), ${dy})` : `translate(-50%, ${dy})`;
    tag.style.textAlign = xPct < 10 ? "left" : xPct > 90 ? "right" : "";
    tag.style.setProperty("--belt", c.belt);
    tag.classList.toggle("waiting", isWaiting);
    tag.classList.toggle("stuck", isStuck);
    tag.classList.toggle("friend", !!g.parent);
    const name = g.parent ? `+ ${g.agentType ?? "helper"}` : g.project;
    const detail = `${g.label} · ${ago(g.lastTs, now)}`;
    if (tag.firstChild.textContent !== name) tag.firstChild.textContent = name;
    if (tag.lastChild.textContent !== detail) tag.lastChild.textContent = detail;
  }

  updateHeader(waiting, circles);
  requestAnimationFrame(frame);
}

function ago(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Header and guest book
// ---------------------------------------------------------------------------
const statsEl = document.getElementById("stats");
const dotEl = document.getElementById("dot");
const emptyEl = document.getElementById("empty");
const bookEl = document.getElementById("book");
let connected = false;
let lastHeader = "";

function updateHeader(waiting, circles) {
  const main = [...guests.values()].filter((g) => !g.parent && !g.leaving).length;
  const helpers = [...guests.values()].filter((g) => g.parent && !g.leaving).length;
  const parts = [`<b>${main}</b> guest${main === 1 ? "" : "s"}`];
  if (helpers) parts.push(`${helpers} helper${helpers === 1 ? "" : "s"}`);
  if (waiting) parts.push(`<span class="needs">${waiting} need${waiting === 1 ? "s" : ""} you</span>`);
  if (circles) parts.push(`<span class="circles">${circles} going in circles</span>`);
  const html = connected ? parts.join(" · ") : "reconnecting...";
  if (html !== lastHeader) {
    statsEl.innerHTML = html;
    lastHeader = html;
  }
  dotEl.classList.toggle("live", connected);
  emptyEl.hidden = !connected || guests.size > 0;
}

function renderBook() {
  const now = Date.now();
  const list = [...guests.values()].filter((g) => !g.leaving);
  // Group helpers under the session that called them.
  const mains = list.filter((g) => !g.parent).sort((a, b) => b.lastTs - a.lastTs);
  const rows = [];
  for (const m of mains) {
    rows.push(m);
    for (const f of list) if (f.parent === m.id) rows.push(f);
  }
  bookEl.replaceChildren(
    ...rows.map((g) => {
      const li = document.createElement("li");
      const where = g.room === "door" ? "Revolving door" : ROOMS[g.room]?.name ?? g.room;
      if (g.room === "hottub") li.className = "waiting";
      if (g.room === "door") li.className = "stuck";
      const cells = [
        ["belt", ""],
        [`who${g.parent ? " friend" : ""}`, g.parent ? `+ ${g.agentType ?? "helper"}` : g.project],
        ["where", where],
        ["what", g.label],
        ["when", ago(g.lastTs, now)],
      ];
      for (const [cls, text] of cells) {
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = text;
        if (cls === "belt") span.style.background = BELT[hash(g.project) % BELT.length];
        li.appendChild(span);
      }
      return li;
    }),
  );
}
setInterval(renderBook, 1000);

// ---------------------------------------------------------------------------
// Live feed
// ---------------------------------------------------------------------------
function connect() {
  const es = new EventSource("/events");
  es.addEventListener("snapshot", (msg) => {
    connected = true;
    const snap = JSON.parse(msg.data);
    const ids = new Set(snap.map((g) => g.id));
    for (const id of [...sprites.keys()]) if (!ids.has(id)) removeSprite(id);
    for (const g of snap) {
      const known = guests.has(g.id);
      guests.set(g.id, g);
      if (!known && !sprites.has(g.id)) makeSprite(g, true);
    }
    renderBook();
  });
  es.onmessage = (msg) => {
    applyEvent(guests, JSON.parse(msg.data));
  };
  es.onerror = () => {
    connected = false;
  };
}

connect();
requestAnimationFrame(frame);
