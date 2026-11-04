// Level 3: our pipeline. Test executions run on users' laptops, which produce to Kafka; results-service consumes,
// keeps the execution tree in its DB, finalizes when the last result arrives, and produces one "execution completed"
// message that reports-service and notification-service both consume. Partitions are drawn inside the brokers.
//   laptops (Nithin, Punith) → topics status (3 partitions) and results (6), RF 2, on B1–B3, no key (sticky partitioner)
//   results-service ×3 (one group, reads both topics) → topic exec-completed (2 partitions, same cluster)
//   reports-service ×2 and notification-service ×2 (one group each, both read exec-completed)
// Every message is simulated: sticky partition → leader → follower copy → owner instance (per partition, in order).
import { el, place, Cancelled } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { INK, MONO } from './flowmap.js';

const W = 2360, H = 880;
const USER = { Nithin: '#2f6fe0', Punith: '#1f9d55' };
const T_STATUS = '#8a5cc7', T_RESULTS = '#d9822b', T_DONE = '#c2417a', CONS = '#13968a', REP = '#b7791f', NOTI = '#c2417a';
const GREY = '#9aa3a9';

// ---- layout ----
const LAPTOP = { Nithin: 250, Punith: 600 }, LX = 150;
const BX = { B1: 455, B2: 705, B3: 955 };                     // broker columns in the main cluster
const gutL = b => BX[b] - 125, gutR = b => BX[b] + 125;
const TOPBUS = 84, BOTBUS = 674, IN_X = 1110;                 // network rails inside the cluster
const RS_X = 1345, RS_W = 390, RS_Y = { rs1: 128, rs2: 196, rs3: 264 };
const EX_X = 1745, EX_GUT = 1872, OUT_X = 1590;
const SVC_X = 2150, SVC_W = 340;
const ROWS = { status: [215, 285], results: [395, 465, 535, 605] };

// partitions: [key, topic, leader, follower]
const PARTS = [
  ['s0', 'status', 'B1', 'B2'], ['s1', 'status', 'B2', 'B3'], ['s2', 'status', 'B3', 'B1'],
  ['r0', 'results', 'B1', 'B2'], ['r1', 'results', 'B2', 'B3'], ['r2', 'results', 'B3', 'B1'],
  ['r3', 'results', 'B1', 'B3'], ['r4', 'results', 'B2', 'B1'], ['r5', 'results', 'B3', 'B2'],
  ['e0', 'done', 'B1', 'B2'], ['e1', 'done', 'B2', 'B3'],
];
const TOPIC_NAME = { status: 'status', results: 'results', done: 'exec-completed' };
const TOPIC_COLOR = { status: T_STATUS, results: T_RESULTS, done: T_DONE };
const pname = pk => `${TOPIC_NAME[PARTS.find(p => p[0] === pk)[1]]}-${pk.slice(1)}`;
// where each copy sits: main cluster lanes by broker (ordered by partition), exec-completed lanes stacked on the right
const EX_LANES = { 'e0@B1': 300, 'e0@B2': 420, 'e1@B2': 482, 'e1@B3': 600 };
const EX_BROKERS = [['B1', 292, 100], ['B2', 448, 168], ['B3', 598, 100]];
// consumer groups: owner of each partition
const GROUPS = {
  rs: { name: 'results-service', members: ['rs1', 'rs2', 'rs3'], own: { s0: 'rs1', s1: 'rs2', s2: 'rs3', r0: 'rs1', r1: 'rs1', r2: 'rs2', r3: 'rs2', r4: 'rs3', r5: 'rs3' } },
  rep: { name: 'reports', members: ['rep1', 'rep2'], own: { e0: 'rep1', e1: 'rep2' } },
  not: { name: 'notification', members: ['not1', 'not2'], own: { e0: 'not1', e1: 'not2' } },
};
const INST_Y = { ...RS_Y, rep1: 108, rep2: 172, not1: 632, not2: 696 };

// the test tree each laptop runs (parallel = every laptop runs all of it)
const SCRIPTS = { SCR1: ['M1', 'RM'], SCR2: ['M1', 'RM'], SCR3: ['SM1', 'M1', 'RM'], SCR4: ['M2', 'RM'], SCR5: ['M2', 'RM'] };
const MODS = ['RM', 'M1', 'SM1', 'M2'];
const under = m => Object.keys(SCRIPTS).filter(k => SCRIPTS[k].includes(m));
const EVENTS = [['st', 'RM'], ['st', 'M1'], ['st', 'SCR1'], ['res', 'SCR1'], ['st', 'SCR2'], ['res', 'SCR2'], ['st', 'SM1'], ['st', 'SCR3'], ['res', 'SCR3'],
  ['st', 'M2'], ['st', 'SCR4'], ['res', 'SCR4'], ['st', 'SCR5'], ['res', 'SCR5']];
const CAM = {
  left: [0, 0, 1110, 880], cluster: [290, 20, 840, 720], rs: [1060, 0, 560, 880], mid: [1060, 0, 860, 880],
  right: [1560, 0, 800, 880], all: null,
};

const safe = p => p.catch(e => { if (!(e instanceof Cancelled)) console.error(e); });
function rpath(pts, r = 10) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0) || 1, l2 = Math.hypot(x2 - x1, y2 - y1) || 1;
    const a = Math.min(r, l1 / 2), b = Math.min(r, l2 / 2);
    d += ` L${x1 - (x1 - x0) / l1 * a},${y1 - (y1 - y0) / l1 * a} Q${x1},${y1} ${x1 + (x2 - x1) / l2 * b},${y1 + (y2 - y1) / l2 * b}`;
  }
  const [x, y] = pts.at(-1);
  return `${d} L${x},${y}`;
}
const curve = ([x1, y1], [x2, y2]) => { const m = (x2 - x1) * .55; return `M${x1},${y1} C${x1 + m},${y1} ${x2 - m},${y2} ${x2},${y2}`; };

// ---- drawing ----
function frame(s, v, key, x, y, w, h, title, { color = INK, fill = '#fff', stroke = '#c9ced2', right, size = 19, parent } = {}) {
  const g = s.box(x, y, w, h, '', { fill, stroke, rx: 14, parent });
  g.classList.add('gn');
  g.title = s.text(g, -w / 2 + 16, -h / 2 + 22, title, { 'text-anchor': 'start', 'font-size': size, 'font-weight': 700, fill: color });
  if (right != null) g.right = s.text(g, w / 2 - 16, -h / 2 + 22, right, { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 600, fill: MUTED });
  if (key) v.n[key] = g;
  return g;
}
function lane(s, v, pk, b, x, y, w = 200) {
  const [, topic, leader] = PARTS.find(p => p[0] === pk), color = TOPIC_COLOR[topic], lead = leader === b;
  const g = s.g(x, y);
  g.classList.add('gn');
  el('rect', { x: -w / 2, y: -30, width: w, height: 60, rx: 8, fill: lead ? '#fff' : '#fbfbfc', stroke: color, 'stroke-width': lead ? 2.6 : 1.3, 'stroke-dasharray': lead ? null : '5 3' }, g);
  s.text(g, -w / 2 + 10, -15, pname(pk), { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, 'font-family': MONO, fill: color });
  s.text(g, w / 2 - 10, -15, lead ? '★ leader' : 'copy', { 'text-anchor': 'end', 'font-size': 13.5, 'font-weight': 700, fill: lead ? AMBER : MUTED });
  const L = v.lanes[`${pk}@${b}`] = { g, pk, b, x, y, w, blocks: [], layer: s.g(-x, -y, g) };
  v.n[`${pk}@${b}`] = g;
  return L;
}
function chip(s, parent, x, y, w, label) {
  const g = s.g(x, y, parent);
  g.rect = el('rect', { x: 0, y: -11, width: w, height: 22, rx: 5, fill: '#eef0f2', stroke: '#dde1e4' }, g);
  g.t = s.text(g, w / 2, 0, label, { 'font-size': 12.5, 'font-weight': 700, fill: MUTED });
  return g;
}
const STATE = { pending: ['#eef0f2', MUTED, '#dde1e4'], running: ['#fdf0d8', AMBER, '#f0d29a'], passed: ['#e3f3e6', GREEN, '#a9d8b3'], failed: ['#fbe3e3', RED, '#efb0b0'] };
function paintChip(c, state, label) {
  const [fill, ink, stroke] = STATE[state];
  c.rect.setAttribute('fill', fill); c.rect.setAttribute('stroke', stroke);
  c.t.setAttribute('fill', ink);
  if (label != null) c.t.textContent = label;
}

function scene(s, { interactive = false } = {}) {
  const v = { n: {}, lanes: {}, parts: {}, execs: [], cards: [], busy: {}, sticky: {}, next: 1001, focus: null, interactive, auto: interactive, unsafe: false, outputs: { rep: [], not: [] } };
  s.root.classList.add('glowmap');
  v.rails = s.g(0, 0);

  // ---- users ----
  frame(s, v, 'users', LX, 425, 262, 790, 'Users\' machines', { size: 18, fill: '#f6f7f9', stroke: '#d9dde1', right: 'producers' });
  for (const u of ['Nithin', 'Punith']) {
    const c = USER[u], f = frame(s, v, u, LX, LAPTOP[u], 228, 196, `💻 ${u}'s laptop`, { color: c, size: 17, fill: '#fff', stroke: c });
    f.exec = s.text(f, -98, -50, 'idle', { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 600, fill: MUTED });
    f.now = s.text(f, -98, -26, '', { 'text-anchor': 'start', 'font-size': 14.5, fill: INK });
    s.text(f, -98, 2, 'no key → sticky partition:', { 'text-anchor': 'start', 'font-size': 13, fill: MUTED });
    f.stS = s.text(f, -98, 22, 'status → –', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 600, 'font-family': MONO, fill: T_STATUS });
    f.stR = s.text(f, -98, 42, 'results → –', { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 600, 'font-family': MONO, fill: T_RESULTS });
    const btn = f.btn = s.g(0, 74, f);
    btn.rect = el('rect', { x: -98, y: -14, width: 196, height: 28, rx: 14, fill: c }, btn);
    btn.t = s.text(btn, 0, 0, '▶ run an execution', { 'font-size': 14, 'font-weight': 700, fill: '#fff' });
    if (interactive) {
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => { if (!v.busy[u]) safe(runExec(s, v, [u])); });
    } else btn.setAttribute('opacity', .45);
    v.sticky[u] = { status: { p: null, left: 0 }, results: { p: null, left: 0 } };
  }

  // ---- the Kafka cluster: brokers, and the partitions inside them ----
  frame(s, v, 'cluster', 702, 370, 790, 670, 'Kafka cluster', { size: 20, fill: '#f1f5fb', stroke: '#c9d6ea', right: '3 brokers · RF 2 · topics status (3) and results (6)' });
  // rails: the network the dots travel on
  const rail = d => el('path', { d, class: 'gw', style: 'stroke:#e1e6ec' }, v.rails);
  rail(rpath([[300, LAPTOP.Nithin], [300, TOPBUS], [1080, TOPBUS]]));
  rail(rpath([[260, LAPTOP.Punith], [300, LAPTOP.Punith], [300, TOPBUS]]));
  rail(rpath([[260, LAPTOP.Nithin], [300, LAPTOP.Nithin]]));
  for (const b of ['B1', 'B2', 'B3']) { rail(`M${gutL(b)},${TOPBUS} L${gutL(b)},${BOTBUS}`); }
  rail(`M${gutR('B3')},${TOPBUS} L${gutR('B3')},${BOTBUS}`);
  rail(rpath([[gutL('B1'), BOTBUS], [IN_X, BOTBUS], [IN_X, RS_Y.rs1], [RS_X - RS_W / 2, RS_Y.rs1]]));
  for (const k of ['rs2', 'rs3']) rail(`M${IN_X},${RS_Y[k]} L${RS_X - RS_W / 2},${RS_Y[k]}`);
  for (const b of ['B1', 'B2', 'B3']) {
    const f = frame(s, v, b, BX[b], 380, 220, 550, `Broker ${b}`, { size: 18 });
    s.text(f, -100, 165 - 380, 'topic status', { 'text-anchor': 'start', 'font-size': 14.5, 'font-weight': 700, fill: T_STATUS });
    s.text(f, -100, 345 - 380, 'topic results', { 'text-anchor': 'start', 'font-size': 14.5, 'font-weight': 700, fill: T_RESULTS });
    for (const topic of ['status', 'results']) {
      const here = PARTS.filter(p => p[1] === topic && (p[2] === b || p[3] === b)).map(p => p[0]);
      here.forEach((pk, i) => lane(s, v, pk, b, BX[b], ROWS[topic][i]));
    }
  }

  // ---- results-service: one group, 3 instances, and its DB ----
  frame(s, v, 'rs', RS_X, 450, 430, 820, 'results-service', { color: CONS, size: 20, fill: '#eefaf6', stroke: '#bfe4d8', right: 'group results-service · ×3' });
  for (const k of GROUPS.rs.members) instance(s, v, 'rs', k, RS_X, RS_Y[k], RS_W);
  const db = frame(s, v, 'db', RS_X, 590, 400, 510, '🗄 results DB · execution tree', { size: 16, fill: '#fff', stroke: '#cfe3dc' });
  db.empty = s.text(db, 0, 0, 'No execution yet', { 'font-size': 15, fill: MUTED });
  v.cardLayer = s.g(0, 0);

  // ---- results-service produces exec-completed: same cluster, another topic ----
  rail(rpath([[RS_X + RS_W / 2, RS_Y.rs1], [OUT_X, RS_Y.rs1], [OUT_X, 590]]));
  for (const k of ['rs2', 'rs3']) rail(`M${RS_X + RS_W / 2},${RS_Y[k]} L${OUT_X},${RS_Y[k]}`);
  frame(s, v, 'ecl', EX_X, 440, 270, 520, 'Kafka cluster (same)', { size: 16, fill: '#f1f5fb', stroke: '#c9d6ea' });
  s.text(v.n.ecl, -119, -260 + 44, 'topic exec-completed · 2 partitions', { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700, fill: T_DONE });
  for (const [b, y, h] of EX_BROKERS) frame(s, v, `x${b}`, EX_X, y, 244, h, b, { size: 14.5, fill: '#fff' });
  for (const [k, y] of Object.entries(EX_LANES)) { const [pk, b] = k.split('@'); lane(s, v, pk, b, EX_X, y + 8, 212); }
  rail(`M${EX_GUT},${EX_LANES['e0@B1'] + 8} L${EX_GUT},${EX_LANES['e1@B3'] + 8}`);

  // ---- reports and notification: two groups reading the same message ----
  const arrow = (y2, label, color) => {
    el('path', { d: `M1885,${y2 > 440 ? 520 : 360} L1985,${y2}`, class: 'gw', style: `stroke:${color};stroke-width:3;opacity:.35`, 'marker-end': 'url(#learn-arrow)' }, v.rails);
    const ty = y2 > 440 ? 556 : 292;
    for (const [k, w] of label.split(' ').entries()) s.text(s.root, 1918, ty + k * 16, w, { 'font-size': 13.5, fill: color, 'font-weight': 600 });
  };
  arrow(250, 'same message', REP); arrow(630, 'same message', NOTI);
  frame(s, v, 'rep', SVC_X, 180, 380, 330, '📄 reports-service', { color: REP, size: 19, fill: '#fff8ea', stroke: '#efd8a8', right: 'group reports · ×2' });
  frame(s, v, 'not', SVC_X, 700, 380, 330, '✉ notification-service', { color: NOTI, size: 19, fill: '#fdf0f5', stroke: '#efc3d5', right: 'group notification · ×2' });
  v.n.rep.right.setAttribute('font-size', 13.5); v.n.not.right.setAttribute('font-size', 13.5);
  for (const k of GROUPS.rep.members) instance(s, v, 'rep', k, SVC_X, INST_Y[k], SVC_W);
  for (const k of GROUPS.not.members) instance(s, v, 'not', k, SVC_X, INST_Y[k], SVC_W);
  for (const [g, y] of [['rep', 278], ['not', 800]]) {
    const out = frame(s, v, `${g}Out`, SVC_X, y, SVC_W, 100, g === 'rep' ? 'reports generated' : 'mails sent', { size: 14, fill: '#fff' });
    out.lines = [-6, 18, 40].map(dy => s.text(out, -SVC_W / 2 + 14, dy, '', { 'text-anchor': 'start', 'font-size': 13.5, fill: INK }));
    out.lines[0].textContent = '–';
  }

  // legend
  const lg = s.g(20, 846);
  s.text(lg, 0, 0, '● status message (running)   ■ result (passed / failed)   colour = whose laptop   dashed lane = follower copy', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });

  for (const [pk, topic, leader, follower] of PARTS) v.parts[pk] = { pk, topic, leader, follower, chain: {} };
  v.flights = s.g(0, 0);
  v.packs = s.g(0, 0);
  return v;
}
function instance(s, v, gk, k, x, y, w) {
  const b = s.box(x, y, w, 60, '', { rx: 9 });
  b.classList.add('gn');
  const n = +k.replace(/\D/g, '');
  s.text(b, -w / 2 + 12, -14, `${GROUPS[gk].name}-${n}`, { 'text-anchor': 'start', 'font-size': 14.5, 'font-weight': 700, fill: INK });
  b.doing = s.text(b, -w / 2 + 12, 14, 'consumer · waiting', { 'text-anchor': 'start', 'font-size': 13.5, fill: MUTED });
  const owned = Object.keys(GROUPS[gk].own).filter(pk => GROUPS[gk].own[pk] === k);
  let cx = w / 2 - 8;
  for (const pk of owned.slice().reverse()) {
    const name = pname(pk), cw = name.length * 6.9 + 10;
    el('rect', { x: cx - cw, y: -24, width: cw, height: 20, rx: 5, fill: TOPIC_COLOR[PARTS.find(p => p[0] === pk)[1]] }, b);
    s.text(b, cx - cw / 2, -14, name, { 'font-size': 12, 'font-weight': 700, 'font-family': MONO, fill: '#fff' });
    cx -= cw + 4;
  }
  v.n[k] = b;
}

// ---- motion ----
function hit(v, key) { const n = v.n[key]; if (!n?.isConnected) return; n.classList.remove('hit'); void n.getBBox(); n.classList.add('hit'); }
function tagExec(v, n, exec) { n.dataset.exec = exec; n.classList.toggle('ep-faded', !!v.focus && v.focus !== exec); }
// A message riding a path: the path lights up in the message's colour while it moves, then fades.
async function fly(s, v, d, color, { label, square = false, exec, ms, small = false } = {}) {
  const path = el('path', { d, class: 'gw live', style: `--tc:${color}` }, v.flights);
  const g = s.g(0, 0, v.packs);
  if (square) el('rect', { x: -8, y: -8, width: 16, height: 16, rx: 3, fill: color, stroke: '#fff', 'stroke-width': 2 }, g);
  else el('circle', { r: small ? 5 : 7.5, fill: small ? GREY : color, stroke: '#fff', 'stroke-width': 2 }, g);
  if (label) s.text(g, 0, -19, label, { 'font-size': 14, 'font-weight': 700, fill: color, stroke: '#fff', 'stroke-width': 4, 'paint-order': 'stroke' });
  if (exec) { tagExec(v, path, exec); tagExec(v, g, exec); }
  if (small) path.style.cssText = 'stroke:#c3c9ce;stroke-width:1.6;stroke-dasharray:4 4';
  const L = path.getTotalLength();
  ms ??= Math.max(650, Math.min(1700, L * 1.15));
  try {
    await s.clock.tween(ms, t => { const q = path.getPointAtLength(L * t); place(g, q.x, q.y); }, true);
  } finally { g.remove(); }
  path.classList.replace('live', 'trail');
  safe(s.wait(900).then(() => path.remove()));
}
// The newest records of a lane (3 visible), sliding left as new ones come in.
function addBlock(s, v, L, label, color, exec) {
  const b = s.block(0, 0, label, color, { parent: L.layer, w: 56, h: 28, size: 12.5 });
  b.removeAttribute('transform');
  const slot = k => L.x + L.w / 2 - 36 - k * 60;
  b.style.transform = `translate(${slot(0)}px, ${L.y + 12}px)`;
  b.style.opacity = 0;
  if (exec) tagExec(v, b, exec);
  L.blocks.unshift(b);
  void b.getBBox();
  for (const n of L.blocks) n.style.transition = 'transform .4s ease, opacity .4s ease';
  const lay = () => L.blocks.forEach((n, k) => { n.style.transform = `translate(${slot(k)}px, ${L.y + 12}px)`; n.style.opacity = k < 3 ? 1 : 0; });
  s.clock.instant ? lay() : requestAnimationFrame(lay);
  while (L.blocks.length > 4) L.blocks.pop().remove();
  hit(v, `${L.pk}@${L.b}`);
}

// paths
const laneOf = (v, pk, b) => v.lanes[`${pk}@${b}`];
const prodPath = (u, L) => rpath([[LX + 114, LAPTOP[u]], [300, LAPTOP[u]], [300, TOPBUS], [gutL(L.b), TOPBUS], [gutL(L.b), L.y], [L.x - L.w / 2, L.y]]);
const consPath = (L, k) => rpath([[L.x + L.w / 2, L.y], [gutR(L.b), L.y], [gutR(L.b), BOTBUS], [IN_X, BOTBUS], [IN_X, INST_Y[k]], [RS_X - RS_W / 2, INST_Y[k]]]);
const copyPath = (A, B) => A.pk[0] === 'e'
  ? rpath([[A.x + A.w / 2, A.y], [EX_GUT, A.y], [EX_GUT, B.y], [B.x + B.w / 2, B.y]])
  : rpath([[A.x + A.w / 2, A.y], [gutR(A.b), A.y], [gutR(A.b), TOPBUS + 10], [gutL(B.b), TOPBUS + 10], [gutL(B.b), B.y], [B.x - B.w / 2, B.y]]);
const outPath = (k, L) => rpath([[RS_X + RS_W / 2, INST_Y[k]], [OUT_X, INST_Y[k]], [OUT_X, L.y], [L.x - L.w / 2, L.y]]);
const fanPath = (L, k) => curve([L.x + L.w / 2, L.y], [SVC_X - SVC_W / 2, INST_Y[k]]);

// Sticky partitioner (no key): stay on one partition for a batch, then move to another.
function sticky(v, who, topic) {
  const st = v.sticky[who] ??= {}, cur = st[topic] ??= { p: null, left: 0 }, n = { status: 3, results: 6, done: 2 }[topic];
  if (cur.left <= 0) {
    v.rnd = (v.rnd ?? 7) * 48271 % 2147483647;
    let p = v.rnd % n;
    if (p === cur.p) p = (p + 1) % n;
    cur.p = p; cur.left = topic === 'done' ? 1 : 3;
  }
  cur.left--;
  const pk = `${topic === 'done' ? 'e' : topic[0]}${cur.p}`;
  if (v.n[who]?.stS) {
    v.n[who].stS.textContent = `status → ${st.status?.p != null ? pname(`s${st.status.p}`) : '–'}`;
    v.n[who].stR.textContent = `results → ${st.results?.p != null ? pname(`r${st.results.p}`) : '–'}`;
  }
  return pk;
}

// One message, end to end inside Kafka: to the leader, copied to the follower, then read by every group's owner,
// one at a time per partition (a consumer handles a partition's records in order).
async function deliver(s, v, { fromPath, pk, label, block, color, square, exec, onRead, landed, gate }) {
  const p = v.parts[pk], leadL = laneOf(v, pk, p.leader), folL = laneOf(v, pk, p.follower);
  await fly(s, v, fromPath(leadL), color, { label, square, exec });
  addBlock(s, v, leadL, block, color, exec);
  hit(v, p.topic === 'done' ? `x${p.leader}` : p.leader);
  await fly(s, v, copyPath(leadL, folL), color, { small: true, exec, ms: 520 });
  addBlock(s, v, folL, block, color, exec);
  landed?.();
  if (gate) await gate;
  // the high watermark has moved: consumers may read it now
  const groups = p.topic === 'done' ? ['rep', 'not'] : ['rs'];
  await Promise.all(groups.map(gk => {
    const owner = GROUPS[gk].own[pk];
    const run = async () => {
      await fly(s, v, gk === 'rs' ? consPath(leadL, owner) : fanPath(leadL, owner), color, { label, square, exec, ms: gk === 'rs' ? undefined : 900 });
      hit(v, owner);
      await onRead(gk, owner);
    };
    const chain = (p.chain[gk] ?? Promise.resolve()).then(run, run);
    p.chain[gk] = chain.catch(() => {});
    return chain;
  }));
}

// ---- the results DB: one card per execution, with the tree per laptop ----
function newExec(s, v, users) {
  const id = `Exec${v.next++}`, mode = users.length > 1 ? 'parallel' : 'sequential';
  const ex = { id, mode, users, st: {}, done: 0, pass: 0, fail: 0, total: users.length * 5, finals: 0, sent: [] };
  for (const u of users) { ex.st[u] = {}; for (const e of [...MODS, ...Object.keys(SCRIPTS)]) ex.st[u][e] = 'pending'; }
  ex.fails = new Set(users.map(u => `${u}:${failOf(id, u)}`));
  v.execs.unshift(ex);
  drawCard(s, v, ex);
  return ex;
}
const failOf = (id, u) => ['SCR3', 'SCR4', 'SCR2', 'SCR5'][(+id.slice(4) + (u === 'Punith' ? 1 : 0)) % 4];
function drawCard(s, v, ex) {
  v.n.db.empty.textContent = '';
  const h = 34 + ex.users.length * 54, c = s.g(RS_X - 190, 0, v.cardLayer);
  c.classList.add('ep-card');
  el('rect', { x: 0, y: 0, width: 380, height: h, rx: 9, fill: '#fafcfb', stroke: '#cfe3dc' }, c);
  c.head = s.text(c, 12, 17, `${ex.id} · ${ex.mode}`, { 'text-anchor': 'start', 'font-size': 15, 'font-weight': 700, fill: INK });
  c.count = s.text(c, 368, 17, '', { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, fill: MUTED });
  c.chips = {};
  ex.users.forEach((u, i) => {
    const y = 44 + i * 54;
    s.text(c, 12, y, u, { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 700, fill: USER[u] });
    let x = 76;
    for (const m of MODS) { c.chips[`${u}:${m}`] = chip(s, c, x, y, m === 'SM1' ? 66 : 60, m); x += (m === 'SM1' ? 66 : 60) + 4; }
    x = 76;
    for (const scr of Object.keys(SCRIPTS)) { c.chips[`${u}:${scr}`] = chip(s, c, x, y + 26, 54, scr); x += 58; }
  });
  c.h = h;
  c.addEventListener('click', () => focusExec(v, v.focus === ex.id ? null : ex.id));
  c.style.cursor = 'pointer';
  ex.card = c;
  v.cards.unshift(c);
  while (v.cards.length > 3) v.cards.pop().remove();
  let y = 382;
  for (const k of v.cards) { place(k, RS_X - 190, y); y += k.h + 12; }
  paintCard(v, ex);
}
function paintCard(v, ex) {
  const c = ex.card;
  if (!c?.isConnected) return;
  for (const u of ex.users) {
    const st = ex.st[u];
    for (const scr of Object.keys(SCRIPTS)) paintChip(c.chips[`${u}:${scr}`], st[scr], scr + (st[scr] === 'passed' ? ' ✓' : st[scr] === 'failed' ? ' ✕' : ''));
    for (const m of MODS) {
      const kids = under(m), done = kids.filter(k => ['passed', 'failed'].includes(st[k])).length;
      const state = done === kids.length ? (kids.some(k => st[k] === 'failed') ? 'failed' : 'passed') : st[m] === 'pending' ? 'pending' : 'running';
      paintChip(c.chips[`${u}:${m}`], state, `${m} ${done}/${kids.length}`);
    }
  }
  c.count.textContent = ex.finals > 1 ? `⚠ finalized ×${ex.finals}` : ex.finals ? `✔ finalized · ✓${ex.pass} ✕${ex.fail}` : `${ex.done}/${ex.total} done`;
  c.count.setAttribute('fill', ex.finals > 1 ? RED : ex.finals ? GREEN : MUTED);
}
function focusExec(v, id) {
  v.focus = id;
  for (const n of document.querySelectorAll('#stage [data-exec]')) n.classList.toggle('ep-faded', !!id && n.dataset.exec !== id);
  for (const ex of v.execs) ex.card?.classList.toggle('ep-picked', ex.id === id);
}

// What an instance does with each message.
async function onResults(s, v, ex, u, kind, entity, k) {
  const b = v.n[k];
  b.doing.textContent = `${ex.id} · ${entity} ${kind === 'st' ? 'running' : ex.fails.has(`${u}:${entity}`) ? 'failed' : 'passed'} → DB`;
  hit(v, 'db');
  const st = ex.st[u];
  if (kind === 'st') { if (st[entity] === 'pending') st[entity] = 'running'; paintCard(v, ex); return; }
  st[entity] = ex.fails.has(`${u}:${entity}`) ? 'failed' : 'passed';
  // "is this the last result?" must be one atomic step in the DB; v.unsafe shows a read-then-write race instead
  let last;
  if (v.unsafe) { ex.done++; await s.wait(450); last = ex.done === ex.total; }
  else { ex.done++; last = ex.done === ex.total; }
  st[entity] === 'failed' ? ex.fail++ : ex.pass++;
  paintCard(v, ex);
  if (last) await finalize(s, v, ex, k);
}
// Roll up the counts and send one message for reports and notification.
async function finalize(s, v, ex, k) {
  ex.finals++;
  paintCard(v, ex);
  hit(v, 'db');
  v.n[k].doing.textContent = `${ex.id} finalized → exec-completed`;
  const pk = sticky(v, `rs:${k}`, 'done'), msg = { ex, pk, from: k };
  ex.sent.push(msg);
  // in the guided flows the message waits in exec-completed until the next step lets reports and notification read it
  const landed = new Promise(r => { msg.landed = r; });
  const gate = v.auto ? null : new Promise(r => { msg.release = r; });
  msg.done = deliver(s, v, {
    pk, label: `${ex.id} done`, block: ex.id.replace('Exec', 'E'), color: CONS, exec: ex.id,
    fromPath: L => outPath(k, L),
    onRead: (gk, owner) => output(s, v, gk, owner, ex),
    landed: msg.landed, gate,
  });
  if (v.auto) safe(msg.done); else await landed;
}
async function output(s, v, gk, owner, ex) {
  const users = ex.users.join(' + ').toLowerCase();
  v.n[owner].doing.textContent = gk === 'rep' ? `building report for ${ex.id}` : `sending mail for ${ex.id}`;
  await s.wait(500);
  const line = gk === 'rep' ? `📄 ${ex.id}: ${ex.total} scripts ✓${ex.pass} ✕${ex.fail} · ${ex.users.join(' + ')}` : `✉ ${ex.id} → To: ${users.replace(' + ', ', ')}`;
  const out = v.outputs[gk];
  out.unshift(line);
  out.length = Math.min(out.length, 3);
  v.n[`${gk}Out`].lines.forEach((t, i) => { t.textContent = out[i] ?? ''; t.setAttribute('fill', i ? MUTED : INK); });
  hit(v, `${gk}Out`);
  v.n[owner].doing.textContent = gk === 'rep' ? `${ex.id} report done` : `${ex.id} mail sent`;
  tryRead(v);
}

// A laptop working through its part of the tree: status when something starts, the result when a script ends.
async function runUser(s, v, ex, u, from = 0, to = EVENTS.length - 1, { pace = 1 } = {}) {
  const f = v.n[u], reads = [];
  v.busy[u] = ex.id;
  f.exec.textContent = `${ex.id} · ${ex.mode}`; f.exec.setAttribute('fill', USER[u]);
  f.btn.t.textContent = `running ${ex.id}…`;
  for (let i = from; i <= to; i++) {
    const [kind, entity] = EVENTS[i];
    if (kind === 'res') { f.now.textContent = `${entity} running…`; await s.wait((900 + (i * 37 % 5) * 120) * pace); }
    else await s.wait(260 * pace);
    const topic = kind === 'st' ? 'status' : 'results', pk = sticky(v, u, topic);
    const result = kind === 'res' ? (ex.fails.has(`${u}:${entity}`) ? '✕' : '✓') : '';
    f.now.textContent = kind === 'st' ? `${entity} running` : `${entity} ${result === '✓' ? 'passed' : 'failed'} → sent`;
    hit(v, u);
    reads.push(deliver(s, v, {
      pk, label: `${entity}${result ? ' ' + result : ''}`, block: entity, color: USER[u], square: kind === 'res', exec: ex.id,
      fromPath: L => prodPath(u, L),
      onRead: (gk, k) => onResults(s, v, ex, u, kind, entity, k),
    }));
    tryRead(v);
  }
  if (to === EVENTS.length - 1) { f.now.textContent = 'all scripts done'; f.btn.t.textContent = '▶ run an execution'; delete v.busy[u]; }
  await Promise.all(reads);
}
async function runExec(s, v, users) {
  const busy = users.find(u => v.busy[u]);
  if (busy) { v.note = `${busy}'s laptop is still running ${v.busy[busy]}: one execution per laptop at a time.`; tryRead(v); return; }
  v.note = '';
  const ex = newExec(s, v, users);
  tryRead(v);
  await Promise.all(users.map(u => runUser(s, v, ex, u)));
  tryRead(v);
}
const fanOut = (v, ex) => { for (const m of ex.sent) m.release?.(); return Promise.all(ex.sent.map(m => m.done)); };

// ---- lighting ----
function light(s, v, i) {
  const st = v.track.steps[i], on = new Set(st.on ?? []);
  s.root.style.setProperty('--nc', st.color ?? CONS);
  for (const [k, n] of Object.entries(v.n)) n.classList.toggle('on', on.has(k));
}
function track(steps) {
  return {
    continuous: true,
    async build(s) { const v = scene(s); v.track = this; return v; },
    enter(s, v, i) { light(s, v, i); },
    steps,
  };
}
const cur = v => v.execs[0];

// ---- flow 1: a sequential execution on one laptop ----
const seq = track([
  {
    on: ['users', 'cluster', 'rs', 'ecl', 'rep', 'not'], color: INK,
    title: 'Our pipeline, end to end',
    text: 'Left to right: users\' laptops produce → Kafka (brokers hold the partitions of topics status and results) → results-service (3 instances, one group) → the same Kafka, topic exec-completed → reports-service and notification-service, which both read that message.',
    observe: 'Each section has its own colour; partitions sit inside the brokers.',
    async run(s) { await s.wait(5000); },
  },
  {
    on: ['Nithin', 's0@B1', 's1@B2', 's2@B3'], color: USER.Nithin, cam: CAM.left,
    title: 'Exec1001 starts on Nithin\'s laptop',
    text: 'A sequential execution runs on one laptop. As each level starts, the laptop sends a status message (execution id + entity id): RM running, M1 running, SCR1 running. There is no key, so the sticky partitioner keeps sending to one partition for a batch, then moves on.',
    observe: 'Round blue dots ride to the leader of a status partition; a grey dot copies each to the follower.',
    async run(s, v) { const ex = newExec(s, v, ['Nithin']); await runUser(s, v, ex, 'Nithin', 0, 2); },
  },
  {
    on: ['Nithin', 'B1', 'B2', 'B3'], color: T_RESULTS, cam: CAM.cluster,
    title: 'SCR1 finishes: its result goes to topic results',
    text: 'When the script ends, the laptop sends its result (passed or failed, stats and metadata) to topic results. The producer sends it to the partition\'s leader; the follower on another broker copies it (RF 2). Only then is it visible to consumers.',
    observe: 'A square dot lands in a solid (leader) lane, then a copy appears in the dashed lane on another broker.',
    async run(s, v) { await runUser(s, v, cur(v), 'Nithin', 3, 3); },
  },
  {
    on: ['rs', 'rs1', 'rs2', 'rs3', 'db'], color: CONS, cam: CAM.rs,
    title: 'results-service: each partition has one owner',
    text: 'The 3 instances are one group reading both topics: each owns 1 status and 2 results partitions. The owner of a status message marks the entity running in the DB; the owner of a result marks the script passed or failed and counts it up the tree (SM1 → M1 → RM).',
    observe: 'The DB card: chips turn amber (running) and green or red (done); M1 shows 1/3.',
    async run(s, v) { await runUser(s, v, cur(v), 'Nithin', 4, 6); },
  },
  {
    on: ['Nithin', 'rs1', 'rs2', 'rs3', 'db'], color: CONS, cam: CAM.all,
    title: 'The rest of the tree',
    text: 'SCR2 to SCR5 run one by one. Because there is no key, Exec1001\'s messages spread over all partitions, so all three instances update the same execution in the DB, and not always in the order they were sent.',
    observe: 'Dots go to different partitions and into different instances; the counts on the card keep rising.',
    async run(s, v) { await runUser(s, v, cur(v), 'Nithin', 7, 12, { pace: .8 }); },
  },
  {
    on: ['db', 'ecl'], color: CONS, cam: CAM.mid,
    title: 'The last result finalizes the execution',
    text: 'When SCR5\'s result is written, the count reaches 5 of 5: the instance that wrote it finalizes the execution (overall status, pass and fail counts for every module and its parents) and produces one message with Lic1001, Pjt1001 and Exec1001 to topic exec-completed.',
    observe: '"✔ finalized" on the card; a teal dot leaves for exec-completed.',
    async run(s, v) { await runUser(s, v, cur(v), 'Nithin', 13, 13); },
  },
  {
    on: ['rep', 'not', 'repOut', 'notOut'], color: T_DONE, cam: CAM.right,
    title: 'reports and notification both get it',
    text: 'reports-service and notification-service are two different groups, so each gets its own copy of the same message (from the instance that owns that partition). reports builds one report; notification sends one mail.',
    observe: 'One dot goes up to reports, one down to notification: 1 report and 1 mail.',
    async run(s, v) { await fanOut(v, cur(v)); await s.wait(800); },
  },
]);

// ---- flow 2: a parallel execution on two laptops ----
const par = track([
  {
    on: ['Nithin', 'Punith'], color: INK, cam: CAM.left,
    title: 'Exec1001 runs in parallel on both laptops',
    text: 'In a parallel execution every laptop runs the whole tree. In the DB, the execution has one subtree per laptop. Both laptops produce into the same topics at the same time, each with its own sticky partition.',
    observe: 'Blue (Nithin) and green (Punith) dots interleave in the same partitions.',
    async run(s, v) { const ex = newExec(s, v, ['Nithin', 'Punith']); await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, ex, u, 0, 3))); },
  },
  {
    on: ['rs1', 'rs2', 'rs3', 'db'], color: CONS, cam: CAM.mid,
    title: 'One execution, all partitions, all instances',
    text: 'Messages of the same execution from both laptops land in whatever partitions the producers stick to, so all three instances update Exec1001 at the same time. That is why the DB, not one instance, holds the execution\'s state.',
    observe: 'Both rows of the card fill in, driven by different instances.',
    async run(s, v) { await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, cur(v), u, 4, 10, { pace: .8 }))); },
  },
  {
    on: ['Nithin', 'db'], color: USER.Nithin,
    title: 'Nithin finishes first: not final yet',
    text: 'Nithin\'s last result is written, but Punith is still running, so the count is below 10 of 10 and nothing is finalized. A user\'s last result is not the execution\'s last result.',
    observe: 'Nithin\'s RM chip is done; the card still shows a count, not "finalized".',
    async run(s, v) { await Promise.all([runUser(s, v, cur(v), 'Nithin', 11, 13, { pace: .7 }), runUser(s, v, cur(v), 'Punith', 11, 11, { pace: 1.6 })]); },
  },
  {
    on: ['Punith', 'db', 'ecl'], color: USER.Punith, cam: CAM.mid,
    title: 'Punith\'s last result finalizes it',
    text: 'Whichever laptop\'s last result arrives last completes the count. That instance rolls the pass and fail counts up both subtrees and produces a single Lic1001 · Pjt1001 · Exec1001 message.',
    observe: '"✔ finalized" with the totals of both laptops; one teal dot leaves.',
    async run(s, v) { await runUser(s, v, cur(v), 'Punith', 12, 13); },
  },
  {
    on: ['rep', 'not', 'repOut', 'notOut'], color: T_DONE, cam: CAM.right,
    title: 'One report and one mail for both users',
    text: 'The finalize message covers the whole execution, so reports-service builds one report with both laptops\' results, and notification-service sends one mail with both users in To.',
    observe: '"Nithin + Punith" in the report; "nithin, punith" in the mail.',
    async run(s, v) { await fanOut(v, cur(v)); await s.wait(800); },
  },
]);

// ---- flow 3: the "who is last" race ----
const race = track([
  {
    on: ['Nithin', 'Punith', 'db'], color: AMBER, cam: CAM.mid,
    title: 'Both laptops are on their last script',
    text: 'A parallel execution where both laptops finish their last script at the same moment. Their two results land in partitions owned by different instances, which process them at the same time.',
    observe: 'Each laptop is on SCR5; the card is at 8 of 10.',
    async run(s, v) { const ex = newExec(s, v, ['Nithin', 'Punith']); await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, ex, u, 0, 12, { pace: .5 }))); },
  },
  {
    on: ['rs1', 'rs2', 'rs3', 'db'], color: RED, cam: CAM.mid,
    title: 'Save, then count: both think they are last',
    text: 'Each instance saves its script\'s result, then counts the finished scripts to see whether it was the last one. Two instances doing that at the same moment both count 10 of 10, and both finalize: two exec-completed messages are sent.',
    observe: '"⚠ finalized ×2" on the card and two teal dots.',
    async run(s, v) {
      v.unsafe = true;
      const ex = cur(v);
      v.sticky.Nithin.results = { p: 0, left: 1 }; v.sticky.Punith.results = { p: 5, left: 1 };   // rs1 and rs3 own these
      await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, ex, u, 13, 13, { pace: .3 })));
      v.unsafe = false;
    },
  },
  {
    on: ['rep', 'not', 'repOut', 'notOut'], color: RED, cam: CAM.right,
    title: 'Two reports, two mails',
    text: 'Both messages are valid as far as Kafka is concerned, so both groups process both: the user gets two reports and two mails for one execution.',
    observe: 'The same execution appears twice in both outputs.',
    async run(s, v) { await fanOut(v, cur(v)); await s.wait(800); },
  },
  {
    on: ['db'], color: GREEN, cam: CAM.rs,
    title: 'The fix: decide "last" in one atomic step',
    text: 'Make the decision itself atomic in the database, e.g. UPDATE execution SET finalized = true WHERE id = … AND finalized = false: only one instance\'s update changes a row, and only that one produces. Another option is key = execution id, which keeps one execution\'s results in one partition and one instance, at the cost of spreading less.',
    observe: 'With an atomic update the flow you watched before finalizes exactly once.',
    async run(s) { await s.wait(5000); },
  },
]);

// ---- go deeper ----
const deeper = track([
  {
    on: ['Nithin', 'Punith', 'cluster'], color: T_RESULTS, cam: CAM.cluster,
    title: 'No key: the sticky partitioner',
    text: 'Without a key, the producer fills one batch for one partition, then picks another (Kafka 2.4+; before that it was round robin per record). Load spreads evenly, but there is no order across an execution\'s messages and no affinity to one instance.',
    observe: 'Each laptop shows the partition it is sticking to.',
    async run(s) { await s.wait(5500); },
  },
  {
    on: ['rs1', 'rs2', 'rs3'], color: CONS, cam: CAM.rs,
    title: '9 partitions, 3 instances',
    text: 'Production has 9 results partitions for 3 instances (3 each); this picture uses 6 (2 each). More partitions than instances leaves room to scale to 9 instances without touching the topic. More instances than partitions would leave some idle.',
    observe: 'Each instance shows its status and results partitions.',
    async run(s) { await s.wait(5500); },
  },
  {
    on: ['db', 'rs'], color: AMBER, cam: CAM.rs,
    title: 'At-least-once: the same result can come twice',
    text: 'If an instance crashes after updating the DB but before committing its offset, the next owner of that partition gets the result again. If the update counts blindly, done goes up twice. Make it idempotent: upsert by execution + machine + script id, and count only state changes.',
    observe: 'The DB is where duplicates must be absorbed.',
    async run(s) { await s.wait(5500); },
  },
  {
    on: ['rep', 'not'], color: T_DONE, cam: CAM.right,
    title: 'Why both services get the message',
    text: 'reports and notification use different group ids, so Kafka keeps a separate position for each: each gets every exec-completed message once (or more on retries). Inside each group, the 2 partitions are shared by its 2 instances.',
    observe: 'Two groups, the same topic.',
    async run(s) { await s.wait(5500); },
  },
]);
deeper.note = 'The sticky partitioner, partition counts, duplicates, and why two groups both get the message.';

// ---- try it: run executions yourself, several at once ----
function tryReadout(v) {
  const rows = v.execs.slice(0, 3).map(ex => `<b>${ex.id}</b> ${ex.mode} (${ex.users.join(' + ')}): ${ex.finals ? `finalized ✓${ex.pass} ✕${ex.fail}` : `${ex.done}/${ex.total} results`}`);
  return `${rows.join('<br>') || 'No execution yet. Press a button, or ▶ on a laptop.'}${v.note ? `<br><b>${v.note}</b>` : ''}<br><small>Click an execution card in the DB to follow only its dots.</small>`;
}
function tryRead(v) {
  if (!v.interactive) return;
  const r = document.getElementById('try-readout');
  if (r && v.n.db?.isConnected) r.innerHTML = tryReadout(v);
}

export default {
  id: 'exec-pipeline', n: 23, title: 'Our pipeline: executions', tagline: 'Laptops → Kafka → results → reports and mail',
  docked: true,
  zoom: { w: W, h: H },
  guide: {
    what: 'Our system: executions run on users\' laptops and produce status and results; results-service keeps the execution tree, finalizes it, and tells reports and notification. Partitions are shown inside the brokers.',
    fits: 'Every earlier lesson in one real flow: no-key partitioning, leaders and copies, a group with several instances, two topics, and two groups reading one message.',
  },
  flows: [
    { id: 'seq', short: 'sequential', label: 'Sequential · one laptop', about: 'Exec1001 on Nithin\'s laptop, from RM running to one report and one mail.', track: seq },
    { id: 'parallel', short: 'parallel', label: 'Parallel · two laptops', about: 'Both laptops run the whole tree; the last result of either finalizes.', track: par },
    { id: 'race', short: 'the last-result race', label: 'The last-result race', about: 'Two instances both decide they are last: two reports and two mails.', track: race },
  ],
  watch: seq,
  tryIt: {
    intro: 'Start executions yourself, several at once: ▶ on a laptop runs a sequential execution there; Parallel runs one on both. Click an execution card to follow only its dots.',
    observe: 'Every message goes laptop → leader → copy → owner instance → DB; the last result finalizes, then reports and notification each get one message.',
    controls: [
      { type: 'button', label: '▶ Nithin: sequential', run: 'seqA' },
      { type: 'button', label: '▶ Punith: sequential', run: 'seqB' },
      { type: 'button', label: '▶ Parallel: both', primary: true, run: 'par' },
      { type: 'button', label: 'Follow all', run: 'all' },
    ],
    build(s) { const v = scene(s, { interactive: true }); v.track = { steps: [{ on: [] }] }; light(s, v, 0); return v; },
    async seqA(s, v) { safe(runExec(s, v, ['Nithin'])); },
    async seqB(s, v) { safe(runExec(s, v, ['Punith'])); },
    async par(s, v) { safe(runExec(s, v, ['Nithin', 'Punith'])); },
    async all(s, v) { focusExec(v, null); },
    readout: tryReadout,
  },
  deeper,
  takeaway: 'Laptops produce status and results without a key, so the sticky partitioner spreads every execution over all partitions and all results-service instances. The DB holds the execution tree; the last result (from any laptop) must be detected atomically, and it produces one exec-completed message that reports and notification, as two groups, each receive.',
  recap: {
    points: [
      'Each laptop is a producer; a parallel execution has several producing at once.',
      'No key → sticky partitioner: one execution\'s messages spread over all partitions.',
      'Each partition has a leader and a follower copy (RF 2) on different brokers; consumers read after the copy.',
      'results-service is one group reading status and results: each partition has one owner instance.',
      'Finalizing needs the DB to decide "last" atomically, or it can happen twice.',
      'reports and notification are two groups on exec-completed: each gets the message once.',
    ],
    interview: [
      { q: 'Our producers send without a key. What does that mean for one execution\'s messages?', a: 'The **sticky partitioner** sends a batch to one partition, then switches. One execution\'s messages end up **spread over all partitions**, consumed by **different instances in parallel**, with **no ordering** between them. Shared state (the **DB**) must handle out-of-order updates. With **key = executionId** they would stay in **one partition, in order**, on one instance.' },
      { q: 'How do you make sure an execution is finalized exactly once?', a: 'Decide "last" in **one atomic DB step**: an increment that returns the new value, or a conditional update of a **finalized flag** (only one row update succeeds). Read-then-write in code lets two instances both see the last count and **finalize twice**. Consumers should also be **idempotent**, since Kafka delivers **at least once**.' },
      { q: 'Why do both reports and notification get the exec-completed message?', a: 'They use **different group ids**. Kafka tracks each group\'s **position separately**, so each group gets **every message**. Within a group, each partition is read by **one instance**.' },
      { q: 'A consumer reads a result right after it is written. When exactly can it read it?', a: 'After the **leader** appended it and the **in-sync followers** copied it, so the **high watermark** moved past it. Consumers never read beyond the high watermark.' },
    ],
  },
  quiz: {
    q: 'A parallel execution runs on 2 laptops. When should results-service send the exec-completed message?',
    options: ['When each laptop sends its last result (twice)', 'When the last result of all laptops is counted, decided atomically, once', 'When the first laptop finishes', 'Whenever any instance receives a result'],
    answer: 1,
    why: 'The execution is complete only when every laptop\'s results are in; one atomic decision makes exactly one instance send exactly one message.',
  },
  related: ['big-picture', 'multi-group', 'redelivery'],
};
