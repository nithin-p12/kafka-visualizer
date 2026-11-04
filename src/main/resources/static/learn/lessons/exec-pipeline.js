// Level 3: our pipeline, simulated message by message, on a big zoomable map with partitions inside the brokers.
//   laptops (Nithin, Punith) produce without a key (sticky partitioner) to
//   topic status (3 partitions) and topic results (9 partitions), RF 2, on brokers B1–B3
//   results-service: 3 pods (same code), each with two listeners = two groups:
//     status listener  · group execution-status-group · concurrency 2 → 6 consumers for 3 partitions (3 idle)
//     results listener · group execution-result-group · concurrency 3 → 9 consumers for 9 partitions (1 each)
//   the last result finalizes the execution → topic exec-completed (2 partitions, same cluster)
//   reports-service and notification-service: 2 pods × 1 consumer each, two groups, both read every message.
// The rule on show: inside a group each partition is tied to exactly one consumer (thread); other groups get their own.
// Layout trick: broker n and pod n share a band, and pod n's consumers own broker n's leaders, so every mapping line is
// a straight horizontal line.
import { el, place, Cancelled } from '../scene.js';

const W = 4060, H = 2240;
const INK = '#1f2933', SUB = '#52606d', MONO = 'Consolas, monospace';
const SEC = {                                          // section background, border, title
  users: ['#f4ece4', '#9a6b42', '#5c3b1e'], kafka: ['#e8f0fb', '#4f7fcf', '#1e467f'], rs: ['#e7f5ea', '#3f9a5a', '#1d5e30'],
  rep: ['#fdf0e0', '#d4802b', '#8a4708'], not: ['#fce8f0', '#c95083', '#86224f'],
};
const TOPIC = { status: '#7a46c9', results: '#0f7f8c', done: '#4338ca' };
const USER = { Nithin: '#c05621', Punith: '#15803d' };
const STATE = { pending: ['#eef1f4', '#52606d', '#cfd6dd'], running: ['#fdf3dc', '#8a5a00', '#e8c36d'], passed: ['#e3f4e7', '#1d6b34', '#93cfa3'], failed: ['#fde4e4', '#a61b1b', '#eea3a3'] };
const AMBER = '#b7791f', GREEN = '#1d6b34', RED = '#b42318', GREY = '#9aa5b1';

// ---- layout ----
const TOP = [90, 790, 1490];                          // band of broker n and pod n
const ROW = { s: [105, 175], r: [270, 340, 410, 480, 550, 620] };
const BK = { x: 920, w: 680 }, LANE = { x: 920, w: 600 }, laneL = LANE.x - LANE.w / 2, laneR = LANE.x + LANE.w / 2;
const GUT = 550;                                       // copy gutter inside the cluster, left of the brokers
const LAP = { x: 255, w: 370, Nithin: 560, Punith: 1500 }, TRUNK = { Nithin: 494, Punith: 508 };
const POD = { x: 1720, w: 600 }, TH = { x: 1720, w: 540 }, thL = TH.x - TH.w / 2, thR = TH.x + TH.w / 2;
const DB = { x: 2340, y: 365, w: 520, h: 550 }, DB_IN = 2040;
const EX = { x: 3010, lane: 460, B: [['B1', 965, 130], ['B2', 1160, 200], ['B3', 1355, 130]] };
const EX_LANES = { 'e0@B1': 980, 'e0@B2': 1130, 'e1@B2': 1200, 'e1@B3': 1370 };
const EX_GUT = 3285, OUT_X = [2660, 2672, 2684];
const SVC = { x: 3730, w: 560, th: 500 };
const SVC_TH = { rp1: 350, rp2: 500, nt1: 1650, nt2: 1800 };

// partitions: key → topic, leader, follower
const PARTS = {};
for (let n = 0; n < 3; n++) PARTS[`s${n}`] = { topic: 'status', leader: n, follower: (n + 1) % 3 };
for (let i = 0; i < 9; i++) PARTS[`r${i}`] = { topic: 'results', leader: Math.floor(i / 3), follower: (Math.floor(i / 3) + 1) % 3 };
PARTS.e0 = { topic: 'done', leader: 0, follower: 1 };
PARTS.e1 = { topic: 'done', leader: 1, follower: 2 };
const B = n => `B${n + 1}`;
const pname = pk => `${{ s: 'status', r: 'results', e: 'exec-completed' }[pk[0]]}-${pk.slice(1)}`;
const pcolor = pk => TOPIC[PARTS[pk].topic];
// lanes of broker n, top to bottom: its status leader, a status copy, its 3 results leaders, 3 results copies
function lanesOf(n) {
  const m = (n + 2) % 3;
  return [[`s${n}`, TOP[n] + ROW.s[0]], [`s${m}`, TOP[n] + ROW.s[1]],
    ...[0, 1, 2].map(k => [`r${3 * n + k}`, TOP[n] + ROW.r[k]]), ...[0, 1, 2].map(k => [`r${3 * m + k}`, TOP[n] + ROW.r[3 + k]])];
}
// consumer groups and who owns which partition (one possible assignment; Kafka's assignor decides the real one)
const GROUPS = {
  st: { name: 'execution-status-group', label: 'status listener', topic: 'status', own: { s0: 'p0s1', s1: 'p1s1', s2: 'p2s1' } },
  re: { name: 'execution-result-group', label: 'results listener', topic: 'results', own: Object.fromEntries([...Array(9).keys()].map(i => [`r${i}`, `p${Math.floor(i / 3)}r${i % 3 + 1}`])) },
  rp: { name: 'reports-group', topic: 'done', own: { e0: 'rp1', e1: 'rp2' } },
  nt: { name: 'notification-group', topic: 'done', own: { e0: 'nt1', e1: 'nt2' } },
};
const thY = k => k[0] === 'p' ? TOP[+k[1]] + (k[2] === 's' ? ROW.s[+k[3] - 1] : ROW.r[+k[3] - 1]) : SVC_TH[k];

// the tree each laptop runs (parallel = every laptop runs all of it): 1 module, 3 scripts, SCR2 fails
const SCRIPTS = ['SCR1', 'SCR2', 'SCR3'], FAILS = new Set(['SCR2']);
const EVENTS = [['st', 'M1'], ['st', 'SCR1'], ['res', 'SCR1'], ['st', 'SCR2'], ['res', 'SCR2'], ['st', 'SCR3'], ['res', 'SCR3']];
const CAM = {
  left: [0, 40, 1460, 1000], band0: [0, 40, 2640, 800], rs: [1330, 20, 1600, 1300], pods: [1320, 40, 1060, 2160],
  db: [1330, 20, 1600, 1000], exec: [1960, 300, 1440, 1300], right: [2600, 150, 1460, 1980], fanout: [2700, 200, 1360, 1700],
};

const safe = p => p.catch(e => { if (!(e instanceof Cancelled)) console.error(e); });
function rpath(pts, r = 12) {
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
const curve = ([x1, y1], [x2, y2]) => { const m = (x2 - x1) * .6; return `M${x1},${y1} C${x1 + m},${y1} ${x2 - m},${y2} ${x2},${y2}`; };

// ---- drawing ----
function frame(s, v, key, x, y, w, h, title, { sec, fill, stroke, color, right, size = 22 } = {}) {
  const [bg, border, ink] = sec ? SEC[sec] : [fill ?? '#fff', stroke ?? '#cbd2d9', color ?? INK];
  const g = s.box(x, y, w, h, '', { fill: bg, stroke: border, rx: 16 });
  g.rect.setAttribute('stroke-width', sec ? 2.2 : 1.5);
  g.classList.add('gn');
  g.title = s.text(g, -w / 2 + 18, -h / 2 + 28, title, { 'text-anchor': 'start', 'font-size': size, 'font-weight': 700, fill: ink });
  if (right != null) g.right = s.text(g, w / 2 - 18, -h / 2 + 28, right, { 'text-anchor': 'end', 'font-size': 16, 'font-weight': 600, fill: SUB });
  if (key) v.n[key] = g;
  return g;
}
const txt = (s, g, x, y, str, size = 16, fill = INK, attrs = {}) => s.text(g, x, y, str, { 'text-anchor': 'start', 'font-size': size, fill, ...attrs });
function chip(s, parent, x, y, w, label, h = 26) {
  const g = s.g(x, y, parent);
  g.rect = el('rect', { x: 0, y: -h / 2, width: w, height: h, rx: 6 }, g);
  g.t = s.text(g, w / 2, 0, label, { 'font-size': 14, 'font-weight': 700 });
  paintChip(g, 'pending');
  return g;
}
function paintChip(c, state, label) {
  const [fill, ink, stroke] = STATE[state];
  c.rect.setAttribute('fill', fill); c.rect.setAttribute('stroke', stroke); c.t.setAttribute('fill', ink);
  if (label != null) c.t.textContent = label;
}
function lane(s, v, pk, b, x, y, w = LANE.w) {
  const p = PARTS[pk], lead = p.leader === b, color = pcolor(pk);
  const g = s.g(x, y);
  g.classList.add('gn');
  g.dataset.part = pk;
  el('rect', { x: -w / 2, y: -29, width: w, height: 58, rx: 9, fill: lead ? '#fff' : '#f7f9fb', stroke: color, 'stroke-width': lead ? 2.8 : 1.4, 'stroke-dasharray': lead ? null : '6 4' }, g);
  s.text(g, -w / 2 + 14, -12, pname(pk), { 'text-anchor': 'start', 'font-size': 17, 'font-weight': 700, 'font-family': MONO, fill: color });
  s.text(g, -w / 2 + 14, 13, lead ? '★ leader · takes writes' : `copy · follows ${B(p.leader)}`, { 'text-anchor': 'start', 'font-size': 14, 'font-weight': 600, fill: lead ? AMBER : SUB });
  const L = v.lanes[`${pk}@${b}`] = { g, pk, b, x, y, w, blocks: [], layer: s.g(-x, -y, g) };
  g.style.cursor = 'pointer';
  g.addEventListener('click', () => focusPart(v, v.pfocus === pk ? null : pk));
  v.n[`${pk}@${b}`] = g;
  return L;
}
// One consumer thread (a KafkaConsumer inside a listener container).
function thread(s, v, key, x, y, w, name, pk) {
  const g = s.box(x, y, w, 54, '', { rx: 9, fill: '#fff', stroke: pk ? '#9fb3c8' : '#c4ccd4', dash: pk ? null : '6 4' });
  g.classList.add('gn');
  g.dataset.part = pk ?? '';
  s.text(g, -w / 2 + 14, -11, name, { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 700, fill: INK });
  if (pk) {
    const cw = pname(pk).length * 8.4 + 14;
    el('rect', { x: w / 2 - 12 - cw, y: -24, width: cw, height: 24, rx: 6, fill: pcolor(pk) }, g);
    s.text(g, w / 2 - 12 - cw / 2, -12, pname(pk), { 'font-size': 14, 'font-weight': 700, 'font-family': MONO, fill: '#fff' });
  } else s.text(g, w / 2 - 14, -11, 'idle: no partition left', { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700, fill: SUB });
  g.doing = s.text(g, -w / 2 + 14, 14, pk ? 'waiting for records' : 'polls, gets nothing', { 'text-anchor': 'start', 'font-size': 14.5, fill: SUB });
  v.n[key] = g;
  return g;
}

function scene(s, { interactive = false } = {}) {
  const v = { n: {}, lanes: {}, chains: {}, execs: [], cards: [], busy: {}, sticky: {}, next: 1001, focus: null, pfocus: null, interactive, auto: interactive, unsafe: false, outputs: { rp: [], nt: [] } };
  s.root.classList.add('glowmap');
  v.rails = s.g(0, 0);
  v.maps = s.g(0, 0);
  const rail = (d, color = '#d3dae1', w = 2) => el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, v.rails);

  // ---- users' laptops (producers) ----
  frame(s, v, 'users', LAP.x, 1120, 450, 2120, 'Users\' laptops', { sec: 'users', right: 'producers' });
  for (const u of ['Nithin', 'Punith']) {
    const c = USER[u], y = LAP[u], f = frame(s, v, u, LAP.x, y, LAP.w, 330, `💻 ${u}'s laptop`, { fill: '#fff', stroke: c, color: c, size: 20 });
    f.rect.setAttribute('stroke-width', 2.4);
    const X = -LAP.w / 2 + 18;
    f.exec = txt(s, f, X, -110, 'idle', 17, SUB, { 'font-weight': 600 });
    f.now = txt(s, f, X, -82, '', 16);
    txt(s, f, X, -46, 'its own copy of the tree:', 14.5, SUB);
    f.chips = {};
    let cx = X;
    for (const e of ['M1', ...SCRIPTS]) { f.chips[e] = chip(s, f, cx, -16, e === 'M1' ? 70 : 76, e); cx += (e === 'M1' ? 70 : 76) + 6; }
    txt(s, f, X, 26, 'no key → sticky partitioner, now:', 14.5, SUB);
    f.stS = txt(s, f, X, 52, 'status  → –', 16, TOPIC.status, { 'font-weight': 700, 'font-family': MONO });
    f.stR = txt(s, f, X, 78, 'results → –', 16, TOPIC.results, { 'font-weight': 700, 'font-family': MONO });
    const btn = f.btn = s.g(0, 128, f);
    el('rect', { x: -150, y: -18, width: 300, height: 36, rx: 18, fill: c }, btn);
    btn.t = s.text(btn, 0, 0, '▶ run an execution', { 'font-size': 16, 'font-weight': 700, fill: '#fff' });
    if (interactive) { btn.style.cursor = 'pointer'; btn.addEventListener('click', () => safe(runExec(s, v, [u]))); }
    else btn.setAttribute('opacity', .5);
    rail(rpath([[LAP.x + LAP.w / 2, y], [TRUNK[u], y]]), c, 2.5);
    rail(`M${TRUNK[u]},${TOP[0] + 60} L${TRUNK[u]},${TOP[2] + 640}`, c + '55', 2.5);
  }

  // ---- the Kafka cluster: three brokers, partitions inside them ----
  frame(s, v, 'cluster', 905, 1120, 790, 2120, 'Kafka cluster', { sec: 'kafka', right: '3 brokers · RF 2' });
  rail(`M${GUT},${TOP[0] + 60} L${GUT},${TOP[2] + 640}`);
  for (let n = 0; n < 3; n++) {
    const f = frame(s, v, B(n), BK.x, TOP[n] + 335, BK.w, 670, `Broker ${B(n)}`, { fill: '#fff', stroke: '#8fb0e0', color: SEC.kafka[2], size: 21 });
    txt(s, f, -BK.w / 2 + 18, ROW.s[0] - 335 - 45, 'topic status · 3 partitions', 16, TOPIC.status, { 'font-weight': 700 });
    txt(s, f, -BK.w / 2 + 18, ROW.r[0] - 335 - 45, 'topic results · 9 partitions', 16, TOPIC.results, { 'font-weight': 700 });
    for (const [pk, y] of lanesOf(n)) lane(s, v, pk, n, LANE.x, y);
  }

  // ---- results-service: 3 pods of the same code, each with 2 listeners ----
  frame(s, v, 'rs', 2000, 1120, 1240, 2120, 'results-service', { sec: 'rs', right: '3 pods (same image) · 2 listener groups' });
  for (let n = 0; n < 3; n++) {
    const t = TOP[n], pod = frame(s, v, `pod${n}`, POD.x, t + 335, POD.w, 670, `pod ${n + 1} · results-service-${n + 1}`, { fill: '#fbfefc', stroke: '#7cc191', color: SEC.rs[2], size: 19 });
    const lst = (y0, y1, g, conc, key) => {
      const b = s.box(POD.x, t + (y0 + y1) / 2, 570, y1 - y0, '', { rx: 10, fill: '#f2faf4', stroke: '#b7dcc1' });
      b.classList.add('gn'); v.n[key] = b;
      txt(s, b, -270, -(y1 - y0) / 2 + 17, `${GROUPS[g].label} · group ${GROUPS[g].name} · concurrency ${conc}`, 14.5, SEC.rs[2], { 'font-weight': 700 });
    };
    lst(48, 210, 'st', 2, `p${n}st`);
    lst(213, 445, 're', 3, `p${n}re`);
    for (const k of [1, 2]) { const key = `p${n}s${k}`, pk = Object.keys(GROUPS.st.own).find(p => GROUPS.st.own[p] === key); thread(s, v, key, TH.x, t + ROW.s[k - 1], TH.w, `status consumer C${k}`, pk); }
    for (const k of [1, 2, 3]) { const key = `p${n}r${k}`, pk = Object.keys(GROUPS.re.own).find(p => GROUPS.re.own[p] === key); thread(s, v, key, TH.x, t + ROW.r[k - 1], TH.w, `results consumer C${k}`, pk); }
    txt(s, pod, -280, 480 - 335, 'One pod = one JVM, 2 listener containers,', 15, SUB);
    txt(s, pod, -280, 504 - 335, '2 + 3 = 5 KafkaConsumer threads.', 15, SUB);
    txt(s, pod, -280, 528 - 335, 'Kafka sees 5 group members here, not "a pod".', 15, SUB);
    const prod = s.box(POD.x, t + 600, 540, 46, '', { rx: 9, fill: '#fff', stroke: TOPIC.done });
    prod.classList.add('gn'); v.n[`p${n}prod`] = prod;
    s.text(prod, 0, 0, 'producer (KafkaTemplate) → exec-completed', { 'font-size': 15, 'font-weight': 700, fill: TOPIC.done });
    // writes to the DB
    for (const y of [t + ROW.s[0], t + ROW.s[1], t + ROW.r[0], t + ROW.r[1], t + ROW.r[2]]) rail(rpath([[thR, y], [DB_IN, y], [DB_IN, dbY(y)], [DB.x - DB.w / 2, dbY(y)]]), '#cfe6d6');
    for (const ly of [EX_LANES['e0@B1'] + 8, EX_LANES['e1@B2'] + 8]) rail(rpath([[POD.x + 270, t + 600], [OUT_X[n], t + 600], [OUT_X[n], ly], [EX.x - EX.lane / 2, ly]]), '#c9cdf0');
  }
  // group summaries
  const sum = s.g(POD.x - 300, 2165);
  txt(s, sum, 0, 0, 'execution-status-group: 6 consumers · 3 partitions → 3 busy, 3 idle   ·   execution-result-group: 9 consumers · 9 partitions → 1 each', 16, SEC.rs[2], { 'font-weight': 700 });
  const db = frame(s, v, 'db', DB.x, DB.y, DB.w, DB.h, '🗄 results DB · execution tree', { fill: '#fff', stroke: '#7cc191', color: SEC.rs[2], size: 19 });
  db.empty = s.text(db, 0, 0, 'No execution yet', { 'font-size': 17, fill: SUB });
  v.cardLayer = s.g(0, 0);

  // ---- the same cluster again: topic exec-completed ----
  frame(s, v, 'ecl', EX.x, 1140, 580, 620, 'Kafka cluster (the same one)', { sec: 'kafka', size: 19 });
  txt(s, v.n.ecl, -270, -310 + 54, 'topic exec-completed · 2 partitions · RF 2', 15.5, TOPIC.done, { 'font-weight': 700 });
  for (const [b, y, h] of EX.B) frame(s, v, `x${b}`, EX.x, y, 520, h, `Broker ${b}`, { fill: '#fff', stroke: '#8fb0e0', color: SEC.kafka[2], size: 17 });
  for (const [k, y] of Object.entries(EX_LANES)) { const [pk, b] = k.split('@'); lane(s, v, pk, +b[1] - 1, EX.x, y + 8, EX.lane); }
  rail(`M${EX_GUT},${EX_LANES['e0@B1'] + 8} L${EX_GUT},${EX_LANES['e1@B3'] + 8}`);

  // ---- reports and notification: two more groups on exec-completed ----
  for (const [g, y0, title, groupKey] of [['rep', 200, '📄 reports-service', 'rp'], ['not', 1500, '✉ notification-service', 'nt']]) {
    frame(s, v, g, SVC.x, y0 + 350, 620, 700, title, { sec: g, right: `group ${GROUPS[groupKey].name}` });
    for (const k of [1, 2]) {
      const key = `${groupKey}${k}`, y = SVC_TH[key];
      frame(s, v, `${key}pod`, SVC.x, y + 10, 580, 120, `pod ${k} · concurrency 1`, { fill: '#fff', stroke: SEC[g][1], color: SEC[g][2], size: 16 });
      thread(s, v, key, SVC.x, y + 22, 540, 'consumer C1', Object.keys(GROUPS[groupKey].own).find(p => GROUPS[groupKey].own[p] === key));
    }
    const out = frame(s, v, `${g}Out`, SVC.x, y0 + 590, 580, 170, g === 'rep' ? 'reports generated' : 'mails sent', { fill: '#fff', stroke: SEC[g][1], color: SEC[g][2], size: 17 });
    out.lines = [-20, 12, 44].map(dy => txt(s, out, -270, dy, '', 16));
    out.lines[0].textContent = 'none yet'; out.lines[0].setAttribute('fill', SUB);
  }

  // ---- mapping lines: each partition → its one consumer in each group ----
  v.map = {};
  for (const [gk, G] of Object.entries(GROUPS)) for (const [pk, k] of Object.entries(G.own)) {
    const L = laneOf(v, pk, PARTS[pk].leader);
    const d = gk === 'rp' || gk === 'nt' ? curve([L.x + L.w / 2, L.y], [SVC.x - 270, thY(k) + 22]) : `M${laneR},${L.y} L${thL},${thY(k)}`;
    const m = v.map[`${gk}:${pk}`] = el('path', { d, class: 'gw', style: `stroke:${pcolor(pk)};stroke-width:3;opacity:.55` }, v.maps);
    m.dataset.part = pk;
  }

  const lg = s.g(40, 2222);
  txt(s, lg, 0, 0, '● status message   ■ result   colour = whose laptop   solid lane = leader, dashed = copy   line = partition → its one consumer in that group   click a lane to see its consumers', 16, SUB);

  for (const pk of Object.keys(PARTS)) v.chains[pk] = {};
  v.flights = s.g(0, 0);
  v.packs = s.g(0, 0);
  return v;
}
const dbY = y => Math.max(DB.y - DB.h / 2 + 60, Math.min(DB.y + DB.h / 2 - 30, y));
const laneOf = (v, pk, b) => v.lanes[`${pk}@${b}`];

// ---- motion ----
function hit(v, key) { const n = v.n[key]; if (!n?.isConnected) return; n.classList.remove('hit'); void n.getBBox(); n.classList.add('hit'); }
function tag(v, n, exec) { n.dataset.exec = exec; n.classList.toggle('ep-faded', !!v.focus && v.focus !== exec); }
// A message riding a path: the path lights up in the message's colour while it moves, then fades.
async function fly(s, v, d, color, { label, square = false, exec, ms, small = false } = {}) {
  const path = el('path', { d, class: 'gw live', style: `--tc:${color}` }, v.flights);
  if (small) path.style.cssText = 'stroke:#aab4be;stroke-width:2;stroke-dasharray:5 5;fill:none';
  const g = s.g(0, 0, v.packs);
  if (square) el('rect', { x: -10, y: -10, width: 20, height: 20, rx: 4, fill: color, stroke: '#fff', 'stroke-width': 2.5 }, g);
  else el('circle', { r: small ? 6 : 9, fill: small ? GREY : color, stroke: '#fff', 'stroke-width': 2.5 }, g);
  if (label) s.text(g, 0, -24, label, { 'font-size': 17, 'font-weight': 700, fill: color, stroke: '#fff', 'stroke-width': 5, 'paint-order': 'stroke' });
  if (exec) { tag(v, path, exec); tag(v, g, exec); }
  const L = path.getTotalLength();
  ms ??= Math.max(650, Math.min(1800, L * .9));
  try { await s.clock.tween(ms, t => { const q = path.getPointAtLength(L * t); place(g, q.x, q.y); }, true); }
  finally { g.remove(); }
  path.classList.replace('live', 'trail');
  safe(s.wait(900).then(() => path.remove()));
}
// The newest records of a lane, sliding left as new ones arrive.
function addBlock(s, v, L, label, color, exec) {
  const b = s.block(0, 0, label, color, { parent: L.layer, w: 74, h: 32, size: 14 });
  b.removeAttribute('transform');
  const slot = k => L.x + L.w / 2 - 50 - k * 82, show = L.w > 500 ? 4 : 3;
  b.style.transform = `translate(${slot(0)}px, ${L.y}px)`;
  b.style.opacity = 0;
  if (exec) tag(v, b, exec);
  L.blocks.unshift(b);
  void b.getBBox();
  for (const n of L.blocks) n.style.transition = 'transform .4s ease, opacity .4s ease';
  const lay = () => L.blocks.forEach((n, k) => { n.style.transform = `translate(${slot(k)}px, ${L.y}px)`; n.style.opacity = k < show ? 1 : 0; });
  s.clock.instant ? lay() : requestAnimationFrame(lay);
  while (L.blocks.length > show + 1) L.blocks.pop().remove();
  hit(v, `${L.pk}@${L.b}`);
}
const prodPath = (u, L) => rpath([[LAP.x + LAP.w / 2, LAP[u]], [TRUNK[u], LAP[u]], [TRUNK[u], L.y], [laneL, L.y]]);
const copyPath = (A, Bl) => A.pk[0] === 'e'
  ? rpath([[A.x + A.w / 2, A.y], [EX_GUT, A.y], [EX_GUT, Bl.y], [Bl.x + Bl.w / 2, Bl.y]])
  : rpath([[laneL, A.y], [GUT, A.y], [GUT, Bl.y], [laneL, Bl.y]]);
const dbPath = k => { const y = thY(k); return rpath([[thR, y], [DB_IN, y], [DB_IN, dbY(y)], [DB.x - DB.w / 2, dbY(y)]]); };
const outPath = (n, L) => rpath([[POD.x + 270, TOP[n] + 600], [OUT_X[n], TOP[n] + 600], [OUT_X[n], L.y], [L.x - L.w / 2, L.y]]);

// Sticky partitioner (no key): stay on one partition for a batch, then move to another.
function sticky(v, who, topic) {
  const st = v.sticky[who] ??= {}, cur = st[topic] ??= { p: null, left: 0 }, n = { status: 3, results: 9, done: 2 }[topic];
  if (cur.left <= 0) {
    v.rnd = (v.rnd ?? 11) * 48271 % 2147483647;
    let p = v.rnd % n;
    if (p === cur.p) p = (p + 1) % n;
    cur.p = p; cur.left = topic === 'done' ? 1 : 2;
  }
  cur.left--;
  const f = v.n[who];
  if (f?.stS) {
    f.stS.textContent = `status  → ${st.status?.p != null ? `status-${st.status.p}` : '–'}`;
    f.stR.textContent = `results → ${st.results?.p != null ? `results-${st.results.p}` : '–'}`;
  }
  return `${{ status: 's', results: 'r', done: 'e' }[topic]}${cur.p}`;
}

// One message through Kafka: to the leader, copied to the follower, then read by the one consumer that owns the
// partition in each group (in order: a consumer handles its partition's records one at a time).
async function deliver(s, v, { fromPath, pk, label, block, color, square, exec, onRead, landed, gate }) {
  const p = PARTS[pk], A = laneOf(v, pk, p.leader), F = laneOf(v, pk, p.follower);
  await fly(s, v, fromPath(A), color, { label, square, exec });
  addBlock(s, v, A, block, color, exec);
  hit(v, pk[0] === 'e' ? `x${B(p.leader)}` : B(p.leader));
  await fly(s, v, copyPath(A, F), color, { small: true, exec, ms: 650 });
  addBlock(s, v, F, block, color, exec);
  landed?.();
  if (gate) await gate;
  const groups = Object.keys(GROUPS).filter(g => GROUPS[g].topic === p.topic);
  await Promise.all(groups.map(gk => {
    const k = GROUPS[gk].own[pk];
    const run = async () => {
      await fly(s, v, v.map[`${gk}:${pk}`].getAttribute('d'), color, { label, square, exec, ms: gk === 'rp' || gk === 'nt' ? 1300 : 700 });
      hit(v, k);
      await onRead(gk, k);
    };
    const chain = (v.chains[pk][gk] ?? Promise.resolve()).then(run, run);
    v.chains[pk][gk] = chain.catch(() => {});
    return chain;
  }));
}

// ---- the results DB: one card per execution, the tree per laptop ----
function newExec(s, v, users) {
  const id = `Exec${v.next++}`, mode = users.length > 1 ? 'parallel' : 'sequential';
  const ex = { id, mode, users, st: {}, done: 0, pass: 0, fail: 0, total: users.length * SCRIPTS.length, finals: 0, sent: [] };
  for (const u of users) { ex.st[u] = {}; for (const e of ['M1', ...SCRIPTS]) ex.st[u][e] = 'pending'; }
  v.execs.unshift(ex);
  for (const u of users) { const f = v.n[u]; for (const e of ['M1', ...SCRIPTS]) paintChip(f.chips[e], 'pending', e); }
  drawCard(s, v, ex);
  return ex;
}
function drawCard(s, v, ex) {
  v.n.db.empty.textContent = '';
  const h = 50 + ex.users.length * 44, c = s.g(0, 0, v.cardLayer);
  c.classList.add('ep-card');
  el('rect', { x: 0, y: 0, width: 480, height: h, rx: 10, fill: '#f8fcf9', stroke: '#b7dcc1', 'stroke-width': 1.5 }, c);
  txt(s, c, 14, 22, `${ex.id} · ${ex.mode}`, 17, INK, { 'font-weight': 700 });
  c.count = s.text(c, 466, 22, '', { 'text-anchor': 'end', 'font-size': 16, 'font-weight': 700, fill: SUB });
  c.chips = {};
  ex.users.forEach((u, i) => {
    const y = 60 + i * 44;
    txt(s, c, 14, y, u, 16, USER[u], { 'font-weight': 700 });
    let x = 92;
    for (const e of ['M1', ...SCRIPTS]) { const w = e === 'M1' ? 84 : 88; c.chips[`${u}:${e}`] = chip(s, c, x, y, w, e, 30); x += w + 6; }
  });
  c.h = h;
  c.style.cursor = 'pointer';
  c.addEventListener('click', () => focusExec(v, v.focus === ex.id ? null : ex.id));
  ex.card = c;
  v.cards.unshift(c);
  while (v.cards.length > 4) v.cards.pop().remove();
  let y = DB.y - DB.h / 2 + 52;
  for (const k of v.cards) { place(k, DB.x - 240, y); y += k.h + 12; }
  paintCard(v, ex);
}
function paintCard(v, ex) {
  const c = ex.card;
  if (!c?.isConnected) return;
  for (const u of ex.users) {
    const st = ex.st[u];
    for (const e of SCRIPTS) paintChip(c.chips[`${u}:${e}`], st[e], e + (st[e] === 'passed' ? ' ✓' : st[e] === 'failed' ? ' ✕' : ''));
    const done = SCRIPTS.filter(e => ['passed', 'failed'].includes(st[e])).length;
    const m = done === 3 ? (SCRIPTS.some(e => st[e] === 'failed') ? 'failed' : 'passed') : st.M1 === 'pending' ? 'pending' : 'running';
    paintChip(c.chips[`${u}:M1`], m, `M1 ${done}/3`);
  }
  c.count.textContent = ex.finals > 1 ? `⚠ finalized ×${ex.finals}` : ex.finals ? `✔ finalized · ✓${ex.pass} ✕${ex.fail}` : `${ex.done}/${ex.total} results`;
  c.count.setAttribute('fill', ex.finals > 1 ? RED : ex.finals ? GREEN : SUB);
}
function focusExec(v, id) {
  v.focus = id;
  for (const n of document.querySelectorAll('#stage [data-exec]')) n.classList.toggle('ep-faded', !!id && n.dataset.exec !== id);
  for (const ex of v.execs) ex.card?.classList.toggle('ep-picked', ex.id === id);
}
// Click a lane: show the one consumer per group tied to that partition, fade the other partitions.
function focusPart(v, pk) {
  v.pfocus = pk;
  for (const n of document.querySelectorAll('#stage [data-part]')) n.classList.toggle('ep-faded', !!pk && n.dataset.part !== pk);
  for (const [k, n] of Object.entries(v.n)) if (n.dataset?.part === pk && pk) n.classList.add('on'); else if (n.dataset?.part != null) n.classList.remove('on');
}

// What a consumer does with each message.
async function onRead(s, v, ex, u, kind, entity, k) {
  const b = v.n[k], st = ex.st[u];
  const res = FAILS.has(entity) ? 'failed' : 'passed';
  b.doing.textContent = kind === 'st' ? `${ex.id} · ${u} · ${entity} running → DB` : `${ex.id} · ${u} · ${entity} ${res}: processing…`;
  await s.wait(kind === 'st' ? 150 : 900);                     // status is light; results take time
  await fly(s, v, dbPath(k), kind === 'st' ? TOPIC.status : TOPIC.results, { exec: ex.id, ms: 600, small: false });
  hit(v, 'db');
  b.doing.textContent = `${ex.id} · ${entity} ${kind === 'st' ? 'running' : res} saved`;
  if (kind === 'st') { if (st[entity] === 'pending') st[entity] = 'running'; paintCard(v, ex); return; }
  st[entity] = res;
  // "was this the last result?" must be decided in one atomic step; v.unsafe shows save-then-count instead
  ex.done++;
  res === 'failed' ? ex.fail++ : ex.pass++;
  paintCard(v, ex);
  if (v.unsafe) await s.wait(500);
  if (ex.done === ex.total && (v.unsafe || !ex.finals)) await finalize(s, v, ex, k);
}
async function finalize(s, v, ex, k) {
  ex.finals++;
  paintCard(v, ex);
  hit(v, 'db');
  const n = +k[1], pk = sticky(v, `pod${n}`, 'done'), msg = { ex, pk };
  v.n[k].doing.textContent = `${ex.id} finalized → producer`;
  hit(v, `p${n}prod`);
  ex.sent.push(msg);
  const landed = new Promise(r => { msg.landed = r; });
  const gate = v.auto ? null : new Promise(r => { msg.release = r; });
  msg.done = deliver(s, v, {
    pk, label: `${ex.id} done`, block: ex.id.replace('Exec', 'E'), color: TOPIC.done, exec: ex.id,
    fromPath: L => outPath(n, L), onRead: (gk, owner) => output(s, v, gk, owner, ex), landed: msg.landed, gate,
  });
  if (v.auto) safe(msg.done); else await landed;
}
async function output(s, v, gk, k, ex) {
  v.n[k].doing.textContent = gk === 'rp' ? `building the report for ${ex.id}…` : `sending the mail for ${ex.id}…`;
  await s.wait(600);
  const line = gk === 'rp' ? `📄 ${ex.id}: ${ex.total} scripts · ✓${ex.pass} ✕${ex.fail} · ${ex.users.join(' + ')}` : `✉ ${ex.id} → To: ${ex.users.map(u => u.toLowerCase()).join(', ')}`;
  const out = v.outputs[gk];
  out.unshift(line); out.length = Math.min(out.length, 3);
  v.n[gk === 'rp' ? 'repOut' : 'notOut'].lines.forEach((t, i) => { t.textContent = out[i] ?? ''; t.setAttribute('fill', i ? SUB : INK); });
  hit(v, gk === 'rp' ? 'repOut' : 'notOut');
  v.n[k].doing.textContent = gk === 'rp' ? `${ex.id}: report done` : `${ex.id}: mail sent`;
  tryRead(v);
}

// A laptop working through its tree: a status message when something starts, the result when a script ends.
async function runUser(s, v, ex, u, from = 0, to = EVENTS.length - 1, { pace = 1 } = {}) {
  const f = v.n[u], reads = [];
  v.busy[u] = ex.id;
  f.exec.textContent = `${ex.id} · ${ex.mode}`; f.exec.setAttribute('fill', USER[u]);
  f.btn.t.textContent = `running ${ex.id}…`;
  for (let i = from; i <= to; i++) {
    const [kind, entity] = EVENTS[i];
    if (kind === 'res') { f.now.textContent = `${entity} running…`; await s.wait((1300 + (i % 3) * 250) * pace); }
    else await s.wait(300 * pace);
    const topic = kind === 'st' ? 'status' : 'results', pk = sticky(v, u, topic), res = FAILS.has(entity) ? 'failed' : 'passed';
    f.now.textContent = kind === 'st' ? `${entity} started → status` : `${entity} ${res} → results`;
    paintChip(f.chips[entity], kind === 'st' ? 'running' : res, entity + (kind === 'res' ? (res === 'passed' ? ' ✓' : ' ✕') : ''));
    if (kind === 'res' && entity === 'SCR3') paintChip(f.chips.M1, 'failed', 'M1 ✕');
    hit(v, u);
    reads.push(deliver(s, v, {
      pk, label: kind === 'st' ? `${entity} running` : `${entity} ${res === 'passed' ? '✓' : '✕'}`, block: entity, color: USER[u], square: kind === 'res', exec: ex.id,
      fromPath: L => prodPath(u, L), onRead: (gk, k) => onRead(s, v, ex, u, kind, entity, k),
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
  if (v.note?.includes(ex.id)) v.note = '';
  tryRead(v);
}
const fanOut = (v, ex) => { for (const m of ex.sent) m.release?.(); return Promise.all(ex.sent.map(m => m.done)); };

// ---- lighting ----
function light(s, v, i) {
  const st = v.track.steps[i], on = new Set(st.on ?? []);
  s.root.style.setProperty('--nc', st.color ?? SEC.rs[1]);
  for (const [k, n] of Object.entries(v.n)) n.classList.toggle('on', on.has(k));
  for (const m of Object.values(v.map)) m.classList.toggle('live', (st.maps ?? []).some(p => m.dataset.part.startsWith(p)));
  for (const m of Object.values(v.map)) if (m.classList.contains('live')) m.style.setProperty('--tc', pcolor(m.dataset.part));
}
function track(steps) {
  return { continuous: true, async build(s) { const v = scene(s); v.track = this; return v; }, enter(s, v, i) { light(s, v, i); }, steps };
}
const cur = v => v.execs[0];
const pods = (...keys) => [0, 1, 2].flatMap(n => keys.map(k => `p${n}${k}`));

// ---- flow 1: a sequential execution on one laptop ----
const seq = track([
  {
    on: ['users', 'cluster', 'rs', 'ecl', 'rep', 'not'], color: INK,
    title: 'Our pipeline on one map',
    text: 'Laptops produce → Kafka (3 brokers holding the partitions of status and results) → results-service (3 pods, 2 listener groups) → the same Kafka, topic exec-completed → reports-service and notification-service. Zoom in anywhere; each step moves the camera.',
    observe: 'The lines from each partition to the one consumer that owns it.',
    async run(s) { await s.wait(5500); },
  },
  {
    on: pods('s1', 's2', 'r1', 'r2', 'r3'), color: SEC.rs[1], cam: CAM.pods,
    title: 'concurrency = consumers; Kafka only sees consumers',
    text: 'Each pod runs the same code: a status listener with concurrency 2 and a results listener with concurrency 3, each with its own group id. So execution-status-group has 3 × 2 = 6 consumers for 3 partitions: 3 get one, 3 are idle. execution-result-group has 3 × 3 = 9 consumers for 9 partitions: one each.',
    observe: 'Dashed "idle" consumers have no line; every partition has exactly one line per group.',
    async run(s) { await s.wait(7000); },
  },
  {
    on: ['Nithin', 's0@0', 's1@1', 's2@2'], color: USER.Nithin, cam: CAM.left, maps: [],
    title: 'Exec1001 starts on Nithin\'s laptop',
    text: 'A sequential execution runs on one laptop. When M1 starts and when SCR1 starts, the laptop sends a status message (execution id + entity id). There is no key, so the sticky partitioner keeps one partition for a batch, then switches.',
    observe: 'Orange dots ride Nithin\'s line to a status leader; a grey dot copies each to the other broker.',
    async run(s, v) { const ex = newExec(s, v, ['Nithin']); await runUser(s, v, ex, 'Nithin', 0, 1); },
  },
  {
    on: ['Nithin', 'db'], color: TOPIC.results, cam: CAM.band0, maps: ['r', 's'],
    title: 'SCR1 passes: leader, copy, then its one consumer',
    text: 'The result goes to a results partition\'s leader, the follower copies it (RF 2), and only then can a consumer read it. In execution-result-group exactly one consumer owns that partition: it processes the result (slower than a status) and writes it to the DB.',
    observe: 'A square dot on a straight line into one results consumer, then into the DB.',
    async run(s, v) { await runUser(s, v, cur(v), 'Nithin', 2, 2); },
  },
  {
    on: ['Nithin', 'db'], color: TOPIC.results, cam: CAM.rs,
    title: 'SCR2 fails, SCR3 starts',
    text: 'Each message lands on whatever partition the sticky partitioner picked, so the same execution is handled by consumers in different pods. The DB, shared by all pods, holds the tree: pending → running → passed or failed.',
    observe: 'The DB card: SCR2 turns red, SCR3 amber.',
    async run(s, v) { await runUser(s, v, cur(v), 'Nithin', 3, 5); },
  },
  {
    on: ['db', 'ecl'], color: TOPIC.done, cam: CAM.exec,
    title: 'The last result finalizes the execution',
    text: 'SCR3\'s result makes it 3 of 3. The consumer that wrote it finalizes: M1 is failed (1 failure), the totals are rolled up, and its pod\'s producer sends one message with Lic1001, Pjt1001 and Exec1001 to topic exec-completed.',
    observe: '"✔ finalized" on the card; an indigo dot leaves that pod for exec-completed.',
    async run(s, v) { await runUser(s, v, cur(v), 'Nithin', 6, 6); },
  },
  {
    on: ['rp1', 'rp2', 'nt1', 'nt2', 'repOut', 'notOut'], color: TOPIC.done, cam: CAM.fanout, maps: ['e'],
    title: 'One partition, one consumer per group',
    text: 'reports-group and notification-group each own every exec-completed partition separately: the message\'s partition has one line into reports and one into notification. Both read the same record at their own position: one report, one mail.',
    observe: 'Two dots leave the same lane: one up to reports, one down to notification.',
    async run(s, v) { await fanOut(v, cur(v)); await s.wait(900); },
  },
]);

// ---- flow 2: a parallel execution on two laptops ----
const par = track([
  {
    on: ['Nithin', 'Punith'], color: INK, cam: CAM.left,
    title: 'Exec1001 runs in parallel on both laptops',
    text: 'In a parallel execution every laptop runs the whole tree, so the DB holds one subtree per laptop. Both laptops produce into the same topics at the same time, each with its own sticky partition.',
    observe: 'Orange (Nithin) and green (Punith) dots in the same brokers.',
    async run(s, v) { const ex = newExec(s, v, ['Nithin', 'Punith']); await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, ex, u, 0, 2))); },
  },
  {
    on: ['db', ...pods('r1', 'r2', 'r3')], color: TOPIC.results, cam: CAM.rs,
    title: 'One execution, many consumers',
    text: 'The two laptops\' results land in different partitions, so different consumers, often in different pods, update Exec1001 at the same moment. That is why its state lives in the DB, not in any one consumer.',
    observe: 'Both rows of the card fill in.',
    async run(s, v) { await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, cur(v), u, 3, 4))); },
  },
  {
    on: ['Nithin', 'db'], color: USER.Nithin, cam: CAM.db,
    title: 'Nithin finishes first: not final yet',
    text: 'Nithin\'s last result is saved, but Punith is still running: 5 of 6 results. A laptop\'s last result is not the execution\'s last result, so nothing is finalized.',
    observe: 'Nithin\'s M1 is done; the card still shows a count.',
    async run(s, v) { await Promise.all([runUser(s, v, cur(v), 'Nithin', 5, 6, { pace: .7 }), runUser(s, v, cur(v), 'Punith', 5, 5, { pace: 1.4 })]); },
  },
  {
    on: ['Punith', 'db', 'ecl'], color: USER.Punith, cam: CAM.exec,
    title: 'Punith\'s last result finalizes it',
    text: 'Whichever laptop\'s last result is saved last completes the count (6 of 6). That consumer rolls up both subtrees and its pod produces one Lic1001 · Pjt1001 · Exec1001 message.',
    observe: '"✔ finalized" with both laptops\' totals; one indigo dot.',
    async run(s, v) { await runUser(s, v, cur(v), 'Punith', 6, 6); },
  },
  {
    on: ['repOut', 'notOut'], color: TOPIC.done, cam: CAM.fanout, maps: ['e'],
    title: 'One report and one mail for both users',
    text: 'The message covers the whole execution, so reports builds one report with both laptops and notification sends one mail with both users in To.',
    observe: '"Nithin + Punith" in the report; "nithin, punith" in the mail.',
    async run(s, v) { await fanOut(v, cur(v)); await s.wait(900); },
  },
]);

// ---- flow 3: the "who is last" race ----
const race = track([
  {
    on: ['Nithin', 'Punith', 'db'], color: AMBER, cam: CAM.db,
    title: 'Both laptops are on their last script',
    text: 'A parallel execution where both laptops finish SCR3 at the same moment. The two results go to partitions owned by consumers in different pods, which handle them at the same time.',
    observe: 'The card is at 4 of 6.',
    async run(s, v) { const ex = newExec(s, v, ['Nithin', 'Punith']); await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, ex, u, 0, 5, { pace: .5 }))); },
  },
  {
    on: ['db', ...pods('r1', 'r2', 'r3')], color: RED, cam: CAM.rs,
    title: 'Save, then count: both think they are last',
    text: 'Each consumer saves its result, then counts the finished scripts to see if it was the last one. Two doing that at the same moment both count 6 of 6, and both finalize: two exec-completed messages.',
    observe: '"⚠ finalized ×2" and two indigo dots from two pods.',
    async run(s, v) {
      v.unsafe = true;
      v.sticky.Nithin.results = { p: 0, left: 1 }; v.sticky.Punith.results = { p: 8, left: 1 };   // pod 1 and pod 3 own these
      await Promise.all(['Nithin', 'Punith'].map(u => runUser(s, v, cur(v), u, 6, 6, { pace: .3 })));
      v.unsafe = false;
    },
  },
  {
    on: ['repOut', 'notOut'], color: RED, cam: CAM.fanout, maps: ['e'],
    title: 'Two reports, two mails',
    text: 'Kafka sees two valid messages, so both groups process both: two reports and two mails for one execution.',
    observe: 'Exec1001 twice in both outputs.',
    async run(s, v) { await fanOut(v, cur(v)); await s.wait(900); },
  },
  {
    on: ['db'], color: GREEN, cam: CAM.db,
    title: 'The fix: decide "last" in one atomic step',
    text: 'Let the database decide, e.g. UPDATE execution SET finalized = true WHERE id = … AND finalized = false: only one consumer\'s update changes a row, and only that one produces. Or key = execution id, which keeps an execution in one partition and one consumer.',
    observe: 'With an atomic update the parallel flow finalizes exactly once.',
    async run(s) { await s.wait(5000); },
  },
]);

// ---- go deeper ----
const deeper = track([
  {
    on: pods('s1', 's2'), color: TOPIC.status, cam: CAM.pods, maps: ['s'],
    title: 'Who decides which consumer gets which partition?',
    text: 'The group\'s assignor, run at every rebalance. The range assignor sorts members by id and hands out partitions in order, so the exact mapping in production may differ from this picture. The rule never changes: one consumer per partition per group, extra consumers idle.',
    observe: 'Three status lines, three idle status consumers.',
    async run(s) { await s.wait(6500); },
  },
  {
    on: pods('r1', 'r2', 'r3'), color: TOPIC.results, cam: CAM.pods, maps: ['r'],
    title: 'Why 9 results partitions',
    text: 'Results are slow to process, so they get the parallelism: 3 pods × concurrency 3 = 9 consumers, and 9 partitions keep all of them busy. A 4th pod would add 3 idle consumers until results gets more partitions.',
    observe: 'Nine straight lines, one per consumer.',
    async run(s) { await s.wait(6500); },
  },
  {
    on: ['db', 'rs'], color: AMBER, cam: CAM.db,
    title: 'Handing records to another thread',
    text: 'Our listener passes each record and its Acknowledgment to an executor. If that returns at once, the consumer thread polls the next record while the last is still running: order within the partition is lost, and acks can finish out of order. Committing offset N also commits everything before it, so a crash can skip unfinished records.',
    observe: 'Worth checking: does executeVoid wait for the task?',
    async run(s) { await s.wait(6500); },
  },
  {
    on: ['db'], color: AMBER, cam: CAM.db,
    title: 'At-least-once: the same result can come twice',
    text: 'If a consumer crashes after saving but before committing, the partition\'s next owner gets the result again. Make the save idempotent (upsert by execution + laptop + script) and count only real state changes.',
    observe: 'Duplicates must be absorbed in the DB.',
    async run(s) { await s.wait(6000); },
  },
]);
deeper.note = 'Assignors, why 9 partitions, handing records to an executor, and duplicates.';

// ---- try it ----
function tryReadout(v) {
  const rows = v.execs.slice(0, 3).map(ex => `<b>${ex.id}</b> ${ex.mode} (${ex.users.join(' + ')}): ${ex.finals ? `finalized ✓${ex.pass} ✕${ex.fail}` : `${ex.done}/${ex.total} results`}`);
  return `${rows.join('<br>') || 'No execution yet. Press a button, or ▶ on a laptop.'}${v.note ? `<br><b>${v.note}</b>` : ''}<br><small>Click an execution card to follow only its dots · click a partition lane to see its consumer in each group.</small>`;
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
    what: 'Our system on one map: laptops produce status and results; results-service (3 pods, a status group and a results group) keeps the execution tree and finalizes it; reports and notification both read the completion message. Partitions sit inside the brokers; every line ties a partition to its one consumer in a group.',
    fits: 'The rule to take away: inside a group each partition has exactly one consumer (a listener thread: concurrency = threads per pod); every other group gets its own consumer on the same partition.',
  },
  flows: [
    { id: 'seq', short: 'sequential', label: 'Sequential · one laptop', about: 'Exec1001 on Nithin\'s laptop: M1 with SCR1 ✓, SCR2 ✕, SCR3 ✓, to one report and one mail.', track: seq },
    { id: 'parallel', short: 'parallel', label: 'Parallel · two laptops', about: 'Both laptops run the whole tree; the last result of either finalizes.', track: par },
    { id: 'race', short: 'the last-result race', label: 'The last-result race', about: 'Two consumers both decide they are last: two reports and two mails.', track: race },
  ],
  watch: seq,
  tryIt: {
    intro: 'Run executions yourself, several at once (▶ on a laptop, or the buttons). Click a partition lane to see its consumer in each group; click an execution card to follow only its dots.',
    observe: 'Every message: laptop → leader → copy → the one consumer per group → DB. The last result finalizes; reports and notification each get one message.',
    controls: [
      { type: 'button', label: '▶ Nithin: sequential', run: 'seqA' },
      { type: 'button', label: '▶ Punith: sequential', run: 'seqB' },
      { type: 'button', label: '▶ Parallel: both', primary: true, run: 'par' },
      { type: 'button', label: 'Show everything', run: 'all' },
    ],
    build(s) { const v = scene(s, { interactive: true }); v.track = { steps: [{ on: [] }] }; light(s, v, 0); return v; },
    async seqA(s, v) { safe(runExec(s, v, ['Nithin'])); },
    async seqB(s, v) { safe(runExec(s, v, ['Punith'])); },
    async par(s, v) { safe(runExec(s, v, ['Nithin', 'Punith'])); },
    async all(s, v) { focusExec(v, null); focusPart(v, null); },
    readout: tryReadout,
  },
  deeper,
  takeaway: 'Inside a consumer group, each partition is tied to exactly one consumer, and a consumer is a listener thread (pods × concurrency); every other group has its own consumer on the same partition. Laptops produce without a key, so one execution spreads over many partitions and consumers; the DB holds its tree, the last result must be detected atomically, and one exec-completed message reaches reports and notification.',
  recap: {
    points: [
      'Consumers = pods × concurrency, per listener (= per group). Kafka never sees pods.',
      'Inside a group: one consumer per partition; consumers beyond the partition count are idle.',
      'Each group reads every partition on its own: exec-completed-0 is read by one reports consumer and one notification consumer.',
      'No key → sticky partitioner: one execution\'s messages spread over partitions, consumers and pods.',
      'A record is readable after the leader has it and the follower copied it.',
      'Finalizing must be one atomic DB decision, or it can happen twice.',
    ],
    interview: [
      { q: '3 instances, concurrency 3, a topic with 3 partitions. How many consumers work?', a: '**9 consumers** join the group (3 instances × 3 threads), but a partition goes to **exactly one consumer per group**, so **3 work and 6 are idle**. Use 9 partitions to keep all 9 busy.' },
      { q: 'Two services with different group ids read the same topic. Who reads partition 0?', a: '**One consumer from each group.** Groups are independent: each has its own assignment and its own committed offsets, so both services get every record. Inside each group, partition 0 has a single owner.' },
      { q: 'Our producers send without a key. What does that mean for one execution?', a: 'The **sticky partitioner** fills a batch for one partition, then switches, so an execution\'s messages land in **many partitions**, handled by **different consumers in different pods**, with **no order between them**. The shared DB must cope with that.' },
      { q: 'How do you finalize an execution exactly once?', a: 'Make "am I last?" **one atomic DB operation**, e.g. a conditional update of a finalized flag; only the consumer whose update succeeds produces. Save-then-count in code lets two consumers both finalize. Keep consumers **idempotent**: Kafka is at-least-once.' },
    ],
  },
  quiz: {
    q: 'results-service has 3 pods; the status listener has concurrency 2 and status has 3 partitions. How many status consumers are idle?',
    options: ['0', '1', '3', '6'],
    answer: 2,
    why: '3 pods × 2 = 6 consumers in the group, one partition each for 3 of them: 3 idle.',
  },
  related: ['big-picture', 'group', 'multi-group'],
};
