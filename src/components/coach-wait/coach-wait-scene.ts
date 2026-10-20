/**
 * The drawing of the coach wait: one athlete who moves from sport to sport,
 * ported from concept W1 (docs/product/design/coach-wait-concepts.html).
 * Building the SVG once and moving its points every frame keeps React out of
 * a sixty-times-a-second render; `CoachWait` owns the element and the loop.
 */
import {
  clamp01 as cl,
  smooth as sm,
  type WaitFrame,
} from "./coach-wait-model";

const SVG = "http://www.w3.org/2000/svg";
const NEAR = "#17332e";
const FAR = "#8a9c95";
const SHIRT = "#d95d39";
const LINE = "#aab7a7";
const PINE_SOFT = "#2f5d50";
const FERN = "#d5ddd0";
const MOSS = "#62726c";

type Pt = { x: number; y: number };
type Skeleton = {
  spA: Pt;
  spB: Pt;
  SL: Pt;
  SR: Pt;
  HL: Pt;
  HR: Pt;
  head: Pt;
  /** Near and far leg (hip, knee, ankle, toe) and arm (shoulder, elbow, hand). */
  nl: Pt[];
  fl: Pt[];
  na: Pt[];
  fa: Pt[];
  /** Facing the viewer, so both sides are drawn near. */
  front: boolean;
};
type Update = (t: number, k: Skeleton) => void;
type Scene = {
  pose: (t: number) => Skeleton;
  mount: (back: SVGGElement, front: SVGGElement) => Update;
};

const P = (x: number, y: number): Pt => ({ x, y });
/** Angle 0 is straight down; positive is forward. */
const fromDown = (p: Pt, l: number, a: number) =>
  P(p.x + l * Math.sin(a), p.y + l * Math.cos(a));
const lerpP = (a: Pt, b: Pt, f: number) =>
  P(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
const f1 = (n: number) => n.toFixed(1);

function ik(
  a: Pt,
  b: Pt,
  l1: number,
  l2: number,
  pick: (p: Pt, q: Pt) => boolean,
): [Pt, Pt] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const base = Math.atan2(dy, dx);
  const d = Math.max(
    Math.abs(l1 - l2) + 0.01,
    Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01),
  );
  const g = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const j1 = P(a.x + l1 * Math.cos(base + g), a.y + l1 * Math.sin(base + g));
  const j2 = P(a.x + l1 * Math.cos(base - g), a.y + l1 * Math.sin(base - g));
  return [
    pick(j1, j2) ? j1 : j2,
    P(a.x + d * Math.cos(base), a.y + d * Math.sin(base)),
  ];
}

const LIMBS = ["nl", "fl", "na", "fa"] as const;
const JOINTS = ["spA", "spB", "SL", "SR", "HL", "HR", "head"] as const;

function lerpSk(a: Skeleton, b: Skeleton, f: number): Skeleton {
  const o = { front: f < 0.5 ? a.front : b.front } as Skeleton;
  for (const key of JOINTS) o[key] = lerpP(a[key], b[key], f);
  for (const key of LIMBS)
    o[key] = a[key].map((q, i) => lerpP(q, b[key][i], f));
  return o;
}

const sideSk = (
  hip: Pt,
  S: Pt,
  head: Pt,
  nl: Pt[],
  fl: Pt[],
  na: Pt[],
  fa: Pt[],
): Skeleton => ({
  spA: hip,
  spB: S,
  SL: S,
  SR: S,
  HL: hip,
  HR: hip,
  head,
  nl,
  fl,
  na,
  fa,
  front: false,
});

// ---- SVG building ----

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent.appendChild(n);
  return n;
}

type Stroke = SVGPathElement & { set: (...pts: Pt[]) => void };
function stroke(
  parent: Element,
  color: string,
  w: number,
  extra: Record<string, string | number> = {},
): Stroke {
  const p = node(
    "path",
    {
      fill: "none",
      stroke: color,
      "stroke-width": w,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      ...extra,
    },
    parent,
  ) as Stroke;
  p.set = (...pts) =>
    p.setAttribute(
      "d",
      "M" + pts.map((q) => `${f1(q.x)},${f1(q.y)}`).join("L"),
    );
  return p;
}

type Dot = SVGCircleElement & { at: (q: Pt) => void };
function dot(
  parent: Element,
  r: number,
  fill: string,
  extra: Record<string, string | number> = {},
): Dot {
  const c = node("circle", { r, fill, ...extra }, parent) as Dot;
  c.at = (q) => {
    c.setAttribute("cx", f1(q.x));
    c.setAttribute("cy", f1(q.y));
  };
  return c;
}

function dashes(
  parent: Element,
  n: number,
  y: number,
  len: number,
  gap: number,
) {
  const ls = Array.from({ length: n }, () => stroke(parent, LINE, 2));
  const span = n * gap;
  return (shift: number) =>
    ls.forEach((l, i) => {
      const x = ((((i * gap + shift) % span) + span) % span) - len;
      l.set(P(x, y), P(x + len, y));
    });
}

function figure(parent: Element) {
  const g = node("g", {}, parent);
  const fl = stroke(g, FAR, 6);
  const fa = stroke(g, FAR, 5);
  const torso = node(
    "path",
    {
      fill: "none",
      stroke: SHIRT,
      "stroke-width": 10,
      "stroke-linecap": "round",
    },
    g,
  );
  const head = dot(g, 8, NEAR);
  const nl = stroke(g, NEAR, 6);
  const na = stroke(g, NEAR, 5);
  return {
    g,
    set(k: Skeleton) {
      fl.set(...k.fl);
      fa.set(...k.fa);
      nl.set(...k.nl);
      na.set(...k.na);
      fl.setAttribute("stroke", k.front ? NEAR : FAR);
      fa.setAttribute("stroke", k.front ? NEAR : FAR);
      const q = (p: Pt) => `${f1(p.x)},${f1(p.y)}`;
      torso.setAttribute(
        "d",
        `M${q(k.spA)}L${q(k.spB)}M${q(k.SL)}L${q(k.SR)}M${q(k.HL)}L${q(k.HR)}`,
      );
      head.at(k.head);
    },
  };
}

// ---- poses ----

function runPose(t: number) {
  const ph = ((2 * Math.PI) / 0.72) * t;
  const hip = P(118, 99 + 1.5 * (Math.cos(2 * ph) + 1));
  const leg = (p: number) => {
    const th = 0.55 * Math.sin(p);
    const k = 0.2 + 1.3 * Math.pow(Math.max(0, Math.cos(p)), 1.5);
    const K = fromDown(hip, 30, th);
    const F = fromDown(K, 30, th - k);
    return [hip, K, F, fromDown(F, 7, th - k + 1.5)];
  };
  const lean = 0.18;
  const S = fromDown(hip, 34, Math.PI - lean);
  const arm = (p: number) => {
    const a = -0.7 * Math.sin(p);
    const E = fromDown(S, 19, a);
    return [S, E, fromDown(E, 17, a + 1.7)];
  };
  return sideSk(
    hip,
    S,
    fromDown(S, 13, Math.PI - lean * 1.3),
    leg(ph),
    leg(ph + Math.PI),
    arm(ph),
    arm(ph + Math.PI),
  );
}

const CB = P(112, 140);
const pedalAt = (ang: number) =>
  P(CB.x + 14 * Math.cos(ang), CB.y + 14 * Math.sin(ang));
function cyclePose(t: number) {
  const a = ((2 * Math.PI) / 0.8) * t;
  const hip = P(100, 86);
  const leg = (ang: number) => {
    const pd = pedalAt(ang);
    const [K, F] = ik(hip, pd, 36, 36, (p, q) => p.x > q.x);
    return [hip, K, F, P(pd.x + 7, pd.y)];
  };
  const S = P(138, 58);
  const H = P(165, 83);
  const [E] = ik(S, H, 20, 20, (p, q) => p.y > q.y);
  return sideSk(
    hip,
    S,
    P(150, 47),
    leg(a),
    leg(a + Math.PI),
    [S, E, H],
    [S, P(E.x - 3, E.y - 1), P(H.x - 3, H.y)],
  );
}

function swimPose(t: number) {
  const S = P(142, 99);
  const H = P(98, 103);
  const w = (2 * Math.PI) / 1.8;
  const wl = (2 * Math.PI) / 0.55;
  const arm = (b: number) => {
    const k = Math.max(0, -Math.sin(b));
    return [
      S,
      P(S.x + 21 * Math.cos(b), S.y + 21 * Math.sin(b) - 6 * k),
      P(S.x + 40 * Math.cos(b), S.y + 34 * Math.sin(b)),
    ];
  };
  const leg = (p: number) => {
    const a = Math.PI + 0.16 * Math.sin(p);
    const a2 = a - 0.1 - 0.1 * Math.sin(p);
    const K = P(H.x + 26 * Math.cos(a), H.y + 26 * Math.sin(a));
    const F = P(K.x + 26 * Math.cos(a2), K.y + 26 * Math.sin(a2));
    return [H, K, F, P(F.x - 6, F.y + 1)];
  };
  return sideSk(
    H,
    S,
    P(157, 95),
    leg(wl * t),
    leg(wl * t + Math.PI),
    arm(w * t),
    arm(w * t + Math.PI),
  );
}

function rowCalc(t: number) {
  const u = (t % 2.4) / 2.4;
  const s = u < 0.38 ? sm(u / 0.38) : 1 - sm((u - 0.38) / 0.62);
  const legs = cl(s / 0.5);
  const body = cl((s - 0.25) / 0.5);
  const arms = cl((s - 0.55) / 0.45);
  const hip = P(120 - 24 * legs, 114);
  const foot = P(150, 120);
  const [K] = ik(hip, foot, 28, 28, (p, q) => p.y < q.y);
  const a = 0.45 - 0.8 * body;
  const S = P(hip.x + 36 * Math.sin(a), hip.y - 36 * Math.cos(a));
  const hand = P(S.x + 40 - 34 * arms, S.y + 12 + 4 * arms);
  const [E] = ik(S, hand, 21, 21, (p, q) => p.y > q.y);
  const inWater = u < 0.38 ? cl(u / 0.04) * cl((0.4 - u) / 0.04) : 0;
  return { hip, foot, K, S, hand, E, a, inWater };
}
function rowPose(t: number) {
  const c = rowCalc(t);
  const sh = (q: Pt) => P(q.x + 3, q.y - 1);
  const nl = [c.hip, c.K, c.foot, P(154, 113)];
  const na = [c.S, c.E, c.hand];
  const head = P(
    c.S.x + 12 * Math.sin(c.a * 0.8) + 1,
    c.S.y - 12 * Math.cos(c.a * 0.8),
  );
  return sideSk(c.hip, c.S, head, nl, nl.map(sh), na, na.map(sh));
}

function squatPose(t: number) {
  const d = sm((1 - Math.cos((2 * Math.PI * t) / 2.8)) / 2);
  const hip = P(116 - 26 * d, 106 + 30 * d);
  const A = P(120, 164);
  const leg = (off: number) => {
    const h = P(hip.x + off, hip.y);
    const a = P(A.x + off, A.y);
    const [K, F] = ik(h, a, 30, 30, (p, q) => p.x > q.x);
    return [h, K, F, P(a.x + 15, a.y + 2)];
  };
  const lean = 0.12 + 0.55 * d;
  const S = P(hip.x + 38 * Math.sin(lean), hip.y - 38 * Math.cos(lean));
  const bar = P(S.x - 4 * Math.cos(lean), S.y - 4 * Math.sin(lean));
  const hand = P(bar.x + 4, bar.y + 1);
  const [E] = ik(S, hand, 17, 17, (p, q) => p.y > q.y);
  const head = P(
    S.x + 12 * Math.sin(lean * 0.5) + 2,
    S.y - 12 * Math.cos(lean * 0.5),
  );
  return sideSk(
    hip,
    S,
    head,
    leg(0),
    leg(4),
    [S, E, hand],
    [S, P(E.x - 2, E.y), P(hand.x - 2, hand.y)],
  );
}

const ROPE_T = 0.62;
function ropePose(t: number): Skeleton {
  const th = (2 * Math.PI * t) / ROPE_T;
  const hop = 9 * Math.pow((1 + Math.cos(th)) / 2, 2);
  const sy = 80 - hop;
  const hy = 114 - hop;
  const fy = 166 - hop;
  const bend = 3 * (1 - hop / 9);
  const HL = P(90 + 3 * Math.cos(th), sy + 32 + 3 * Math.sin(th));
  const HR = P(150 - 3 * Math.cos(th), sy + 32 + 3 * Math.sin(th));
  return {
    spA: P(120, hy),
    spB: P(120, sy),
    SL: P(107, sy),
    SR: P(133, sy),
    HL: P(115, hy),
    HR: P(125, hy),
    head: P(120, sy - 15),
    fl: [P(115, hy), P(112 - bend, hy + 26), P(114, fy), P(110, fy)],
    nl: [P(125, hy), P(128 + bend, hy + 26), P(126, fy), P(130, fy)],
    fa: [P(108, sy + 2), P(97, sy + 20), HL],
    na: [P(132, sy + 2), P(143, sy + 20), HR],
    front: true,
  };
}

const CL = {
  D: 22,
  T: 3.2,
  limbs: [
    { x: -26, o: 0, H: 40, c: SHIRT },
    { x: 26, o: 0.5, H: 40, c: PINE_SOFT },
    { x: -22, o: 0.25, H: -42, c: MOSS },
    { x: 22, o: 0.75, H: -42, c: MOSS },
  ],
};
const climbScr = (t: number, x: number, wy: number) =>
  P(120 + x, 96 - (wy - (t / CL.T) * 2 * CL.D));
function climbPose(t: number): Skeleton {
  const c = t / CL.T;
  const D = CL.D;
  const worldOf = (l: (typeof CL.limbs)[number]) => {
    const u = c + l.o;
    const n = Math.floor(u);
    const f = u - n;
    const base = n * 2 * D + l.H - l.o * 2 * D;
    return f < 0.75 ? base : base + 2 * D * sm((f - 0.75) / 0.25);
  };
  const end = (l: (typeof CL.limbs)[number]) => climbScr(t, l.x, worldOf(l));
  const sx = 2.5 * Math.sin(4 * Math.PI * c);
  const SL = P(108 + sx, 96);
  const SR = P(132 + sx, 96);
  const HL = P(112 + sx, 134);
  const HR = P(128 + sx, 134);
  const out = (sg: number) => (p: Pt, q: Pt) =>
    sg < 0 ? p.x < q.x : p.x > q.x;
  const [EL, AL] = ik(SL, end(CL.limbs[0]), 24, 24, out(-1));
  const [ER, AR] = ik(SR, end(CL.limbs[1]), 24, 24, out(1));
  const [KL, FL] = ik(HL, end(CL.limbs[2]), 24, 24, out(-1));
  const [KR, FR] = ik(HR, end(CL.limbs[3]), 24, 24, out(1));
  return {
    spA: P(120 + sx, 134),
    spB: P(120 + sx, 96),
    SL,
    SR,
    HL,
    HR,
    head: P(120 + sx, 81),
    fa: [SL, EL, AL],
    na: [SR, ER, AR],
    fl: [HL, KL, FL, FL],
    nl: [HR, KR, FR, FR],
    front: true,
  };
}

// ---- scenery ----

function water(
  front: Element,
  base: number,
  amp: number,
  k1: number,
  k2: number,
) {
  const wf = node("path", { fill: PINE_SOFT, "fill-opacity": 0.2 }, front);
  const ws = stroke(front, PINE_SOFT, 1.5, { "stroke-opacity": 0.7 });
  return (t: number) => {
    const pts: Pt[] = [];
    for (let x = 0; x <= 240; x += 8)
      pts.push(P(x, base + amp * Math.sin(x / k1 + k2 * t)));
    ws.set(...pts);
    wf.setAttribute(
      "d",
      "M0,190L" + pts.map((q) => `${q.x},${f1(q.y)}`).join("L") + "L240,190Z",
    );
  };
}

const SCENES: Scene[] = [
  {
    pose: runPose,
    mount(back) {
      stroke(back, LINE, 2).set(P(0, 161), P(240, 161));
      const dash = dashes(back, 6, 171, 16, 48);
      return (t) => dash(-t * 170);
    },
  },
  {
    pose: cyclePose,
    mount(back, front) {
      stroke(back, LINE, 2).set(P(0, 171), P(240, 171));
      const dash = dashes(back, 6, 180, 16, 48);
      const fc = stroke(back, FAR, 3);
      const wheels: { wg: SVGGElement; c: Pt }[] = [];
      for (const c of [P(68, 140), P(176, 140)]) {
        node(
          "circle",
          {
            cx: c.x,
            cy: c.y,
            r: 29,
            fill: "none",
            stroke: NEAR,
            "stroke-width": 3,
          },
          back,
        );
        const wg = node("g", {}, back);
        for (let k = 0; k < 3; k++) {
          stroke(wg, LINE, 1.2, {
            transform: `rotate(${k * 60} ${c.x} ${c.y})`,
          }).set(P(c.x - 28, c.y), P(c.x + 28, c.y));
        }
        wheels.push({ wg, c });
      }
      const R = P(68, 140);
      const ST = P(98, 92);
      const HT = P(160, 88);
      const HB = P(164, 102);
      const F = P(176, 140);
      stroke(back, PINE_SOFT, 4).set(R, CB, ST, R);
      stroke(back, PINE_SOFT, 4).set(ST, HT, HB, CB);
      stroke(back, PINE_SOFT, 4).set(HB, F);
      stroke(back, NEAR, 4).set(P(89, 88), P(106, 88));
      stroke(back, NEAR, 4).set(HT, P(166, 80), P(172, 85));
      node(
        "circle",
        {
          cx: CB.x,
          cy: CB.y,
          r: 9,
          fill: "none",
          stroke: NEAR,
          "stroke-width": 2,
        },
        back,
      );
      const nc = stroke(front, NEAR, 3);
      return (t) => {
        const a = ((2 * Math.PI) / 0.8) * t;
        fc.set(CB, pedalAt(a + Math.PI));
        nc.set(CB, pedalAt(a));
        const deg = (t * 600) % 360;
        wheels.forEach((w) =>
          w.wg.setAttribute("transform", `rotate(${deg} ${w.c.x} ${w.c.y})`),
        );
        dash(-t * 170);
      };
    },
  },
  {
    pose: swimPose,
    mount(_back, front) {
      const waves = water(front, 97, 2.5, 16, 4);
      const bubbles = Array.from({ length: 8 }, (_, i) =>
        dot(front, 1.5 + (i % 3), "none", {
          stroke: PINE_SOFT,
          "stroke-opacity": 0.45,
          "stroke-width": 1.2,
        }),
      );
      return (t) => {
        waves(t);
        bubbles.forEach((b, i) =>
          b.at(
            P(
              ((((i * 34 - t * 60) % 272) + 272) % 272) - 16,
              118 + ((i * 17) % 46),
            ),
          ),
        );
      };
    },
  },
  {
    pose: rowPose,
    mount(back, front) {
      const dash = dashes(back, 6, 160, 18, 50);
      node(
        "path",
        { d: "M14,122 L226,122 Q214,138 120,138 Q30,138 14,122 Z", fill: NEAR },
        back,
      );
      stroke(back, LINE, 2).set(P(86, 121), P(124, 121));
      stroke(back, NEAR, 3).set(P(146, 124), P(154, 113));
      const seat = node(
        "rect",
        { width: 14, height: 4, rx: 2, y: 116, fill: MOSS },
        back,
      );
      const oar = stroke(front, MOSS, 3);
      const blade = node("ellipse", { rx: 9, ry: 3.5, fill: PINE_SOFT }, front);
      const waves = water(front, 132, 1.5, 20, -3);
      return (t, k) => {
        const hand = k.na[2];
        const bl = P(0.6 * hand.x + 95, 124 + 17 * rowCalc(t).inWater);
        seat.setAttribute("x", f1(k.spA.x - 7));
        oar.set(hand, bl);
        blade.setAttribute("cx", String(bl.x));
        blade.setAttribute("cy", String(bl.y));
        const deg = (Math.atan2(bl.y - hand.y, bl.x - hand.x) * 180) / Math.PI;
        blade.setAttribute("transform", `rotate(${deg} ${bl.x} ${bl.y})`);
        waves(t);
        dash(t * 90);
      };
    },
  },
  {
    pose: squatPose,
    mount(back, front) {
      node("ellipse", { cx: 122, cy: 171, rx: 30, ry: 4, fill: FERN }, back);
      stroke(back, LINE, 2).set(P(20, 168), P(220, 168));
      const plate = dot(back, 19, SHIRT);
      const hub = dot(back, 6, "#a93f25");
      const end = dot(front, 3, NEAR);
      return (_t, k) => {
        const b = P(k.na[2].x - 4, k.na[2].y - 1);
        plate.at(b);
        hub.at(b);
        end.at(b);
      };
    },
  },
  {
    pose: ropePose,
    mount(back, front) {
      node("ellipse", { cx: 120, cy: 172, ry: 3.5, rx: 16, fill: FERN }, back);
      const rb = node(
        "path",
        { fill: "none", stroke: FAR, "stroke-width": 2.2 },
        back,
      );
      const rf = node(
        "path",
        { fill: "none", stroke: PINE_SOFT, "stroke-width": 2.4 },
        front,
      );
      return (t, k) => {
        const th = (2 * Math.PI * t) / ROPE_T;
        const L = k.fa[2];
        const R = k.na[2];
        const cy = 2 * (99 + 73 * Math.cos(th)) - (L.y + R.y) / 2;
        const d = `M${f1(L.x)},${f1(L.y)} Q${f1((L.x + R.x) / 2)},${f1(cy)} ${f1(R.x)},${f1(R.y)}`;
        const inFront = Math.sin(th) < 0;
        rf.setAttribute("d", inFront ? d : "");
        rb.setAttribute("d", inFront ? "" : d);
      };
    },
  },
  {
    pose: climbPose,
    mount(back) {
      node(
        "rect",
        { x: 0, y: 0, width: 240, height: 190, fill: "#e4e9df" },
        back,
      );
      const panels = Array.from({ length: 5 }, () => stroke(back, FERN, 1.5));
      const holds: SVGEllipseElement[] = [];
      CL.limbs.forEach((l) => {
        for (let k = 0; k < 7; k++)
          holds.push(node("ellipse", { rx: 6, ry: 4.5, fill: l.c }, back));
      });
      return (t) => {
        const c = t / CL.T;
        const bodyY = c * 2 * CL.D;
        CL.limbs.forEach((l, li) => {
          const k0 = Math.floor(c + l.o);
          for (let k = 0; k < 7; k++) {
            const p = climbScr(
              t,
              l.x,
              (k0 - 3 + k) * 2 * CL.D + l.H - l.o * 2 * CL.D,
            );
            const e = holds[li * 7 + k];
            e.setAttribute("cx", String(p.x));
            e.setAttribute("cy", f1(p.y));
          }
        });
        panels.forEach((p, j) => {
          const y = climbScr(t, 0, (Math.floor(bodyY / 70) + j - 2) * 70).y;
          p.set(P(0, y), P(240, y));
        });
      };
    },
  },
];

/** Running, cycling, swimming, rowing, squat, jump rope, climbing. */
export const SCENE_COUNT = SCENES.length;

/**
 * Builds the athlete and every sport's scenery inside `svg`, and returns the
 * function that draws one frame. Each sport's scenery fades in and out with
 * the blend; the athlete jumps and turns once between two sports.
 */
export function mountCoachWaitScene(svg: SVGSVGElement) {
  const backs = SCENES.map(() => node("g", { opacity: 0 }, svg));
  const fig = figure(svg);
  const fronts = SCENES.map(() => node("g", { opacity: 0 }, svg));
  const updates = SCENES.map((scene, i) => scene.mount(backs[i], fronts[i]));

  return function draw(frame: WaitFrame) {
    const { scene: i, next: j, blend: b, poseTime: t } = frame;
    let k = SCENES[i].pose(t);
    if (b > 0) k = lerpSk(k, SCENES[j].pose(t), b);
    fig.set(k);
    if (frame.lift !== 0 || frame.turn !== 0) {
      const c = lerpP(k.spA, k.spB, 0.5);
      fig.g.setAttribute(
        "transform",
        `translate(0 ${f1(frame.lift)}) rotate(${f1(frame.turn)} ${f1(c.x)} ${f1(c.y)})`,
      );
    } else {
      fig.g.removeAttribute("transform");
    }
    SCENES.forEach((_, x) => {
      const o = x === i ? 1 - b : x === j ? b : 0;
      for (const layer of [backs[x], fronts[x]]) {
        layer.setAttribute("opacity", String(o));
        layer.style.display = o > 0 ? "" : "none";
      }
    });
    updates[i](t, k);
    if (b > 0) updates[j](t, k);
  };
}
