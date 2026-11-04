// Level 3: the big picture. A whole small system at once, with traffic that never stops:
//   2 producer services (order-service ×2 instances, payment-service ×1), 3 brokers,
//   topics orders (3 partitions, RF 2) and payments (2 partitions, RF 2),
//   3 consumer services, each one consumer group: results ×3 (orders), reports ×2 (orders + payments),
//   notification ×3 (payments, so one instance is idle).
// No internals (metadata, files, acks): only who sends where, who owns what, and what changes when things fail.
// The world is bigger than the stage (1300 × 650), so the lesson is zoomable (learn/camera.js) and steps move the camera.
import { el, place, partitionFor, Cancelled } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { INK, MONO } from './flowmap.js';

const W = 1200, H = 750;
const PROD = '#7a4aa3', CONS = '#13968a';
const ORDERS = '#1f5fd1', PAYMENTS = '#e0761c';
const COLORS = { o0: '#1f5fd1', o1: '#5b9cf0', o2: '#0d8fb3', p0: '#e0761c', p1: '#c99512' };

// ---- layout ----
const PX = 113, PW = 176, PH = 58;                                    // producer instance boxes
const LX0 = 318, LX1 = 738, LC = (LX0 + LX1) / 2;                     // partition lanes
const TX = 528;                                                       // topic frame centre
const BKX = [292, 518, 744], BKY = 694;                               // broker boxes
const CX = 1012, CW = 340, CH = 40;                                   // consumer instance boxes
const SLOT = k => LX1 - 30 - k * 52, BLOCKS = 7;                      // block slots in a lane, newest (k = 0) on the right

const PARTS = [
  { key: 'o0', name: 'orders-0', topic: 'orders', y: 98, reps: ['B1', 'B2'] },
  { key: 'o1', name: 'orders-1', topic: 'orders', y: 183, reps: ['B2', 'B3'] },
  { key: 'o2', name: 'orders-2', topic: 'orders', y: 268, reps: ['B3', 'B1'] },
  { key: 'p0', name: 'payments-0', topic: 'payments', y: 446, reps: ['B1', 'B3'] },
  { key: 'p1', name: 'payments-1', topic: 'payments', y: 530, reps: ['B2', 'B1'] },
];
const TOPICS = { orders: ['o0', 'o1', 'o2'], payments: ['p0', 'p1'] };
const PRODUCERS = [
  { key: 'os1', name: 'order-service-1', service: 'os', topic: 'orders', y: 145 },
  { key: 'os2', name: 'order-service-2', service: 'os', topic: 'orders', y: 225 },
  { key: 'ps1', name: 'payment-service-1', service: 'ps', topic: 'payments', y: 492 },
];
const GROUPS = [
  { key: 'results', name: 'results', topics: ['orders'], top: 16, h: 248, rows: [80, 128, 176, 224], start: 3 },
  { key: 'reports', name: 'reports', topics: ['orders', 'payments'], top: 282, h: 144, rows: [342, 390], start: 2 },
  { key: 'notif', name: 'notification', topics: ['payments'], top: 444, h: 192, rows: [504, 552, 600], start: 3 },
];
const SPOT = 'c-42';                                                   // the key followed in "the key picks the partition"
const CAM = {
  producers: [0, 0, 770, 590], brokers: [150, 400, 760, 350], results: [500, 0, 700, 360], groups: [620, 0, 580, 650],
  reports: [620, 200, 580, 300], notif: [620, 380, 580, 300], right: [480, 0, 720, 650],
};

// A smooth S-curve between two points, left to right.
const curve = ([x1, y1], [x2, y2]) => { const m = (x2 - x1) * .5; return `M${x1},${y1} C${x1 + m},${y1} ${x2 - m},${y2} ${x2},${y2}`; };
const safe = p => p.catch(e => { if (!(e instanceof Cancelled)) console.error(e); });

// ---- drawing ----
function frame(s, v, key, x, y, w, h, title, { color = INK, fill = '#fff', stroke = '#c9ced2', right, size = 18 } = {}) {
  const g = s.box(x, y, w, h, '', { fill, stroke, rx: 12 });
  g.classList.add('gn');
  g.title = s.text(g, -w / 2 + 14, -h / 2 + 19, title, { 'text-anchor': 'start', 'font-size': size, 'font-weight': 700, fill: color });
  if (right != null) g.right = s.text(g, w / 2 - 14, -h / 2 + 19, right, { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700, fill: MUTED });
  v.n[key] = g;
  return g;
}

function scene(s) {
  const v = { n: {}, w: {}, parts: {}, prods: {}, groups: {}, inst: {}, brokers: {}, spot: null, tick: 0 };
  s.root.classList.add('glowmap');
  v.wires = s.g(0, 0);

  // producers
  frame(s, v, 'os', PX, 175, 206, 210, 'order-service', { color: PROD, fill: '#fcfaff', stroke: '#d8b7e9', right: '×2', size: 17 });
  frame(s, v, 'ps', PX, 470, 206, 136, 'payment-service', { color: PROD, fill: '#fcfaff', stroke: '#d8b7e9', right: '×1', size: 17 });
  for (const p of PRODUCERS) {
    const b = s.box(PX, p.y, PW, PH, '', { rx: 8 });
    b.classList.add('gn');
    s.text(b, 0, -10, p.name, { 'font-size': 15.5, 'font-weight': 700, fill: INK });
    b.sub = s.text(b, 0, 12, `producer → ${p.topic}`, { 'font-size': 13.5, fill: p.topic === 'orders' ? ORDERS : PAYMENTS, 'font-weight': 600 });
    v.n[p.key] = b;
    v.prods[p.key] = { ...p, waiting: [] };
  }

  // topics and their partitions
  frame(s, v, 'orders', TX, 178, 460, 312, 'topic orders', { color: ORDERS, fill: '#f8fbff', stroke: '#c4d6f3', right: '3 partitions · RF 2' });
  frame(s, v, 'payments', TX, 482, 460, 204, 'topic payments', { color: PAYMENTS, fill: '#fffaf5', stroke: '#f1d2b4', right: '2 partitions · RF 2' });
  for (const [i, p] of PARTS.entries()) {
    const color = COLORS[p.key];
    const g = s.g(LC, p.y);
    g.classList.add('gn');
    g.rect = el('rect', { x: -(LX1 - LX0) / 2, y: -30, width: LX1 - LX0, height: 60, rx: 8, fill: '#fff', stroke: color, 'stroke-width': 1.8 }, g);
    s.text(g, -(LX1 - LX0) / 2 + 12, -15, p.name, { 'text-anchor': 'start', 'font-size': 15.5, 'font-weight': 700, 'font-family': MONO, fill: color });
    g.badge = s.text(g, (LX1 - LX0) / 2 - 12, -15, '', { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, fill: AMBER });
    g.blocks = s.g(-LC, -p.y, g);                                    // blocks use world x/y inside the lane
    v.n[p.key] = g;
    v.parts[p.key] = { ...p, color, leader: p.reps[0], next: [131, 87, 112, 64, 59][i], blocks: [] };
    for (let k = BLOCKS - 2; k >= 0; k--) addBlock(s, v, v.parts[p.key], v.parts[p.key].next - 1 - k, false);
    badge(v, p.key);
  }

  // brokers
  s.text(s.root, BKX[0] - 108, 618, 'The 3 brokers hold the partitions: ★ = leader (takes the writes), the other copy follows', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });
  for (const [i, b] of ['B1', 'B2', 'B3'].entries()) {
    const f = frame(s, v, b, BKX[i], BKY, 216, 100, `Broker ${b}`, { size: 17 });
    f.lines = [-5, 15, 35].map(y => s.text(f, -94, y, '', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED }));
    v.brokers[b] = { key: b, down: false };
  }
  brokerText(v);

  // consumer services: one group each
  for (const gd of GROUPS) {
    const subs = gd.topics.join(' + ');
    frame(s, v, gd.key, CX, gd.top + gd.h / 2, 370, gd.h, `${gd.name}`, { color: CONS, fill: '#f7fcfb', stroke: '#bfe4df', right: `reads ${subs}` });
    v.n[gd.key].right.setAttribute('font-size', 13.5);
    const g = v.groups[gd.key] = { ...gd, members: [], assign: {}, pos: {}, rebalancing: false };
    for (const t of gd.topics) for (const pk of TOPICS[t]) {
      g.pos[pk] = v.parts[pk].next;
      v.w[`own:${gd.key}:${pk}`] = el('path', { class: 'gw own', style: `--tc:${COLORS[pk]}` }, v.wires);
    }
    gd.rows.forEach((y, r) => {
      const key = `${gd.key}${r + 1}`, wrap = s.g(0, 0, s.root, r < gd.start ? {} : { opacity: 0 });
      const b = s.box(CX, y, CW, CH, '', { rx: 8, parent: wrap });
      b.classList.add('gn');
      s.text(b, -CW / 2 + 12, 0, `${gd.name}-${r + 1}`, { 'text-anchor': 'start', 'font-size': 15.5, 'font-weight': 700, fill: INK });
      b.chips = s.g(0, 0, b);
      v.n[key] = b;
      v.inst[key] = { key, group: gd.key, y, wrap, down: false, here: r < gd.start };
      if (r < gd.start) g.members.push(key);
    });
    assign(v, gd.key);
    drawGroup(s, v, gd.key);
  }

  // producer → partition wires (every instance of a service can write to every partition of its topic)
  for (const p of PRODUCERS) for (const pk of TOPICS[p.topic]) {
    const d = curve([PX + PW / 2, p.y], [LX0, v.parts[pk].y]);
    v.w[`${p.key}>${pk}`] = el('path', { d, class: 'gw', style: `--tc:${COLORS[pk]}` }, v.wires);
    v.wires.prepend(v.w[`${p.key}>${pk}`]);
  }

  // legend
  const lg = s.g(16, 0);
  s.text(lg, 0, 22, 'dot = one record, key above it', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });
  s.text(lg, 0, 44, 'line out of a partition = its owner', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });

  v.packs = s.g(0, 0);
  return v;
}

// The newest records of a lane, as blocks sliding left (CSS transition) as new ones arrive.
function addBlock(s, v, p, off, animate = true) {
  const b = s.block(0, 0, `${off}`, p.color, { parent: v.n[p.key]?.blocks ?? null, w: 44, h: 26, size: 13 });
  if (!v.n[p.key]) return;
  b.removeAttribute('transform');
  b.style.transform = `translate(${SLOT(0)}px, ${p.y + 12}px)`;
  if (animate) b.style.opacity = 0;
  p.blocks.unshift(b);
  const lay = () => p.blocks.forEach((n, k) => {
    n.style.transform = `translate(${SLOT(k)}px, ${p.y + 12}px)`;
    n.style.opacity = k < BLOCKS ? 1 : 0;
  });
  if (animate) { b.style.transition = 'transform .4s ease, opacity .4s ease'; void b.getBBox(); requestAnimationFrame(lay); }
  else lay();
  for (const n of p.blocks) n.style.transition = 'transform .4s ease, opacity .4s ease';
  while (p.blocks.length > BLOCKS + 1) p.blocks.pop().remove();
  return b;
}
function badge(v, pk) {
  const p = v.parts[pk], n = v.n[pk], copies = p.reps.filter(b => b !== p.leader).map(b => v.brokers[b]?.down ? `${b} ✕` : b);
  n.badge.textContent = p.leader ? `★ ${p.leader} · copy ${copies.join(', ')}` : `no leader: ${p.was} is down`;
  n.badge.setAttribute('fill', p.leader ? AMBER : RED);
}
function brokerText(v) {
  for (const b of ['B1', 'B2', 'B3']) {
    const f = v.n[b], parts = Object.values(v.parts);
    const lead = parts.filter(p => p.leader === b).map(p => p.name), copy = parts.filter(p => p.reps.includes(b) && p.leader !== b).map(p => p.name);
    // leads on one or two lines (★), then the copies
    const rows = v.brokers[b].down ? [['✕ down', RED], ['its copies are offline', MUTED]]
      : [[`★ ${lead.slice(0, 2).join(' · ') || 'leads nothing'}`, AMBER], ...(lead.length > 2 ? [[`★ ${lead.slice(2).join(' · ')}`, AMBER]] : []), [`copy of ${copy.join(' · ') || '–'}`, MUTED]];
    f.lines.forEach((t, k) => { t.textContent = rows[k]?.[0] ?? ''; t.setAttribute('fill', rows[k]?.[1] ?? MUTED); t.setAttribute('font-weight', rows[k]?.[1] === MUTED ? 400 : 600); });
  }
}

// ---- groups: range assignment per topic over the live members, ownership lines and partition chips ----
function assign(v, gk) {
  const g = v.groups[gk], live = g.members.filter(k => !v.inst[k].down).sort();
  g.assign = {};
  for (const t of g.topics) {
    const ps = TOPICS[t], per = Math.floor(ps.length / Math.max(1, live.length)), extra = ps.length % Math.max(1, live.length);
    let at = 0;
    live.forEach((m, i) => { const n = per + (i < extra ? 1 : 0); for (const pk of ps.slice(at, at + n)) g.assign[pk] = m; at += n; });
  }
}
function drawGroup(s, v, gk) {
  const g = v.groups[gk];
  for (const t of g.topics) for (const pk of TOPICS[t]) {
    const w = v.w[`own:${gk}:${pk}`], owner = g.assign[pk];
    if (owner && !g.rebalancing && !v.inst[owner].down) { w.setAttribute('d', curve([LX1, v.parts[pk].y], [CX - CW / 2, v.inst[owner].y])); w.style.display = ''; }
    else w.style.display = 'none';
  }
  for (const k of g.members.concat(GROUPS.find(x => x.key === gk).rows.map((_, r) => `${gk}${r + 1}`))) {
    const inst = v.inst[k], b = v.n[k];
    if (!inst) continue;
    b.chips.replaceChildren();
    const owned = Object.keys(g.assign).filter(pk => g.assign[pk] === k);
    b.classList.toggle('down', inst.down);
    b.classList.toggle('idle', inst.here && !inst.down && !owned.length && !g.rebalancing);
    if (inst.down) { s.text(b.chips, CW / 2 - 12, 0, '✕ crashed', { 'text-anchor': 'end', 'font-size': 14.5, 'font-weight': 700, fill: RED }); continue; }
    if (g.rebalancing) { s.text(b.chips, CW / 2 - 12, 0, '⟳ waiting for its partitions', { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 600, fill: AMBER }); continue; }
    if (!owned.length) { s.text(b.chips, CW / 2 - 12, 0, 'idle · no partition left', { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 600, fill: MUTED }); continue; }
    let x = CW / 2 - 10;
    for (const pk of owned.slice().reverse()) {
      const name = v.parts[pk].name, w = name.length * 7 + 12;
      el('rect', { x: x - w, y: -11, width: w, height: 22, rx: 5, fill: COLORS[pk] }, b.chips);
      s.text(b.chips, x - w / 2, 0, name, { 'font-size': 12.5, 'font-weight': 700, 'font-family': MONO, fill: '#fff' });
      x -= w + 4;
    }
  }
  groupLabel(v, gk);
}
function groupLabel(v, gk) {
  const g = v.groups[gk], r = v.n[gk].right;
  const orphan = Object.keys(g.pos).filter(pk => !ownerOf(v, gk, pk));
  const lag = orphan.map(pk => `${v.parts[pk].name} lag ${v.parts[pk].next - g.pos[pk]}`);
  if (g.rebalancing) { r.textContent = '⟳ rebalancing…'; r.setAttribute('fill', AMBER); }
  else if (orphan.length) { r.textContent = `⏳ nobody reads ${lag.join(', ')}`; r.setAttribute('fill', RED); }
  else { r.textContent = `reads ${g.topics.join(' + ')}`; r.setAttribute('fill', MUTED); }
}
const ownerOf = (v, gk, pk) => { const g = v.groups[gk], o = g.assign[pk]; return !g.rebalancing && o && !v.inst[o].down ? o : null; };

// ---- motion ----
function glide(s, path, nodes, ms) {
  const L = path.getTotalLength();
  ms ??= Math.max(550, Math.min(1100, L * 2.6));
  return s.clock.tween(ms, t => { const q = path.getPointAtLength(L * t); for (const n of nodes) place(n, q.x, q.y); }, true);
}
function hit(v, key) { const n = v.n[key]; if (!n?.isConnected) return; n.classList.remove('hit'); void n.getBBox(); n.classList.add('hit'); }

// One record from a producer instance: the key picks the partition; it rides to that partition's lane.
async function send(s, v, pk, key) {
  const prod = v.prods[pk], parts = TOPICS[prod.topic], part = v.parts[parts[partitionFor(key, parts.length)]];
  if (!part.leader) { prod.waiting.push({ key, part: part.key }); waitText(v, pk); return; }
  const spot = key === v.spot, color = part.color;
  const g = s.g(PX + PW / 2, prod.y, v.packs);
  if (spot) el('circle', { r: 13, fill: 'none', stroke: color, 'stroke-width': 2.5 }, g);
  el('circle', { r: spot ? 8.5 : 7, fill: color, stroke: '#fff', 'stroke-width': 2 }, g);
  s.text(g, 0, -17, key, { 'font-size': spot ? 15 : 13, 'font-weight': 700, 'font-family': MONO, fill: color });
  hit(v, pk);
  await glide(s, v.w[`${pk}>${part.key}`], [g]);
  g.remove();
  append(s, v, part, spot);
}
// The leader appends it at the next offset; every group reading the topic gets a copy, at its owner instance.
function append(s, v, p, spot) {
  const off = p.next++;
  const b = addBlock(s, v, p, off);
  if (spot && b) b.rect.setAttribute('stroke', INK), b.rect.setAttribute('stroke-width', 2.5);
  hit(v, p.key);
  if (p.leader) hit(v, p.leader);
  for (const g of Object.values(v.groups)) {
    if (!(p.key in g.pos)) continue;
    const owner = ownerOf(v, g.key, p.key);
    if (owner) safe(deliver(s, v, g.key, p.key, owner, off));
    else groupLabel(v, g.key);
  }
}
async function deliver(s, v, gk, pk, owner, off, ms) {
  const p = v.parts[pk], dot = el('circle', { r: 6, fill: p.color, stroke: '#fff', 'stroke-width': 2 }, v.packs);
  place(dot, LX1, p.y);
  await s.wait(120 + Math.random() * 160);
  await glide(s, v.w[`own:${gk}:${pk}`], [dot], ms);
  dot.remove();
  const g = v.groups[gk];
  g.pos[pk] = Math.max(g.pos[pk], off + 1);
  hit(v, owner);
}
// A new owner reads what piled up while nobody did, a little faster than usual.
async function catchUp(s, v, gk) {
  const g = v.groups[gk];
  for (const pk of Object.keys(g.pos)) {
    const owner = ownerOf(v, gk, pk), lag = v.parts[pk].next - g.pos[pk];
    if (!owner || lag <= 0) continue;
    if (s.clock.instant) { g.pos[pk] = v.parts[pk].next; continue; }
    for (let k = 0; k < lag; k++) { safe(deliver(s, v, gk, pk, owner, g.pos[pk] + k, 480)); await s.wait(110); }
  }
  groupLabel(v, gk);
}
function waitText(v, pk) {
  const prod = v.prods[pk], b = v.n[pk];
  b.sub.textContent = prod.waiting.length ? `⏳ ${prod.waiting.length} waiting for a leader` : `producer → ${prod.topic}`;
  b.sub.setAttribute('fill', prod.waiting.length ? AMBER : prod.topic === 'orders' ? ORDERS : PAYMENTS);
}

// Traffic that never stops: order-service instances send twice as often as payment-service.
const ORDER_KEYS = Array.from({ length: 59 }, (_, i) => `c-${i + 1}`), PAY_KEYS = Array.from({ length: 29 }, (_, i) => `pay-${i + 1}`);
const SENDERS = ['os1', 'ps1', 'os2', 'os1', 'os2', 'ps1'];
async function traffic(s, v) {
  if (v.running || s.clock.instant) return;
  v.running = true;
  try {
    for (;;) {
      await s.wait(460);
      const pk = SENDERS[v.tick % SENDERS.length], k = v.tick++, prod = v.prods[pk];
      const key = prod.topic === 'orders'
        ? (v.spot && k % 3 !== 2 ? v.spot : ORDER_KEYS[(k * 17 + 5) % ORDER_KEYS.length])
        : PAY_KEYS[(k * 7 + 3) % PAY_KEYS.length];
      safe(send(s, v, pk, key));
    }
  } catch (e) { if (!(e instanceof Cancelled)) throw e; }
}

// ---- changes: instances crash or join, groups rebalance, brokers fail ----
function crash(s, v, ik) {
  const inst = v.inst[ik];
  inst.down = true;
  drawGroup(s, v, inst.group);
}
async function rebalance(s, v, gk, ms = 1400) {
  const g = v.groups[gk];
  g.rebalancing = true;
  drawGroup(s, v, gk);
  await s.wait(ms);
  g.members = g.members.filter(k => !v.inst[k].down);
  assign(v, gk);
  g.rebalancing = false;
  drawGroup(s, v, gk);
  for (const k of g.members) hit(v, k);
  await catchUp(s, v, gk);
}
async function join(s, v, ik) {
  const inst = v.inst[ik], g = v.groups[inst.group];
  inst.down = false; inst.here = true;
  if (!g.members.includes(ik)) g.members.push(ik);
  if (+inst.wrap.getAttribute('opacity') < 1) await s.fade(inst.wrap, 1, 400);
  inst.wrap.removeAttribute('opacity');
  drawGroup(s, v, inst.group);
}
function brokerDown(s, v, b) {
  v.brokers[b].down = true;
  for (const p of Object.values(v.parts)) if (p.leader === b) { p.was = b; p.leader = null; }
  v.n[b].classList.add('down');
  for (const pk of Object.keys(v.parts)) badge(v, pk);
  brokerText(v);
  for (const g of Object.values(v.groups)) groupLabel(v, g.key);
}
async function elect(s, v) {
  for (const p of Object.values(v.parts)) if (!p.leader) { p.leader = p.reps.find(b => !v.brokers[b].down) ?? null; if (p.leader) hit(v, p.key); }
  for (const pk of Object.keys(v.parts)) badge(v, pk);
  brokerText(v);
  // producers resend what they held back, in order
  for (const prod of Object.values(v.prods)) {
    const held = prod.waiting.splice(0);
    waitText(v, prod.key);
    if (s.clock.instant) continue;
    for (const w of held) { safe(send(s, v, prod.key, w.key)); await s.wait(140); }
  }
}
function brokerUp(s, v, b) {
  v.brokers[b].down = false;
  v.n[b].classList.remove('down');
  for (const pk of Object.keys(v.parts)) badge(v, pk);
  brokerText(v);
}

// ---- lighting: the step's components glow, its wires flow ----
function light(s, v, i) {
  const st = v.track.steps[i], on = new Set(st.on ?? []), color = st.color ?? CONS;
  s.root.style.setProperty('--nc', color);
  for (const [k, n] of Object.entries(v.n)) n.classList.toggle('on', on.has(k));
  for (const [k, p] of Object.entries(v.w)) p.classList.toggle('live', (st.wires ?? []).some(w => k.startsWith(w)));
}
const wait = ms => async s => { await s.wait(ms); };

function track(steps, { prep } = {}) {
  return {
    continuous: true,
    async build(s) {
      const v = scene(s);
      v.track = this;
      if (prep) { const was = s.clock.instant; s.clock.instant = true; await prep(s, v); s.clock.instant = was; }
      return v;
    },
    enter(s, v, i) { light(s, v, i); safe(traffic(s, v)); },
    steps,
  };
}

// ---- flow 1: a normal day ----
const normal = track([
  {
    on: [], color: INK,
    title: 'The whole system at once',
    text: '2 producer services (3 running instances), 3 brokers, 2 topics with 5 partitions in all, and 3 consumer services (8 instances). Records never stop flowing. Scroll to zoom and drag to move; each step moves the camera to what it explains.',
    observe: 'Dots leave the producers, land in a partition, then copies go on to the consumer services.',
    run: wait(6000),
  },
  {
    on: ['os1', 'os2', 'ps1'], color: PROD, wires: ['os1>', 'os2>', 'ps1>'], cam: CAM.producers,
    title: 'Every instance is its own producer',
    text: 'order-service runs 2 instances. Each one is a separate Kafka producer with its own connections, and both write to all 3 partitions of orders. Producers never coordinate with each other: adding an instance just adds more writers.',
    observe: 'Both order-service instances send into all three orders lanes.',
    run: wait(6500),
  },
  {
    on: ['o0', 'os1', 'os2'], color: COLORS.o0, wires: ['os1>o0', 'os2>o0'], cam: CAM.producers,
    title: `The key picks the partition: ${SPOT} → orders-0`,
    text: `A record's key is hashed to pick the partition (hash % 3 for orders). Customer ${SPOT} always lands in orders-0, whichever instance sends it, so every reader sees that customer's orders in the order they were written.`,
    observe: `The ringed ${SPOT} dots all end in orders-0; other keys spread over all three.`,
    async run(s, v) { v.spot = SPOT; await s.wait(8000); v.spot = null; },
  },
  {
    on: ['B1', 'B2', 'B3'], color: AMBER, cam: CAM.brokers,
    title: 'Partitions live on brokers',
    text: 'Each partition has a leader broker (★) that takes its writes and one copy on another broker (RF 2). The leaders are spread out: B1 leads orders-0 and payments-0, B2 leads orders-1 and payments-1, B3 leads orders-2. Producers send each record straight to its partition\'s leader.',
    observe: 'A broker glows each time a record lands in a partition it leads.',
    run: wait(6500),
  },
  {
    on: ['results', 'results1', 'results2', 'results3'], color: CONS, wires: ['own:results:'], cam: CAM.results,
    title: 'A service is a consumer group',
    text: 'The 3 instances of results all start with group.id=results, so Kafka treats them as one group and splits orders\' 3 partitions between them: one each. Every record reaches exactly one instance of results.',
    observe: 'Each orders lane has a single line into the results group.',
    run: wait(6500),
  },
  {
    on: ['results', 'reports', 'notif'], color: CONS, wires: ['own:'], cam: CAM.groups,
    title: 'Every service gets every message',
    text: 'results and reports both read orders, and each gets its own copy of every record. Groups keep their own positions, so a slow or broken service never holds the others back.',
    observe: 'A record in orders-1 sends one dot to results and another to reports.',
    run: wait(6500),
  },
  {
    on: ['reports', 'reports1', 'reports2'], color: CONS, wires: ['own:reports:'], cam: CAM.reports,
    title: 'One group can read two topics',
    text: 'reports subscribes to orders and payments: 5 partitions for 2 instances. The default (range) assignor splits each topic on its own, so reports-1 gets 3 partitions and reports-2 gets 2. Uneven shares are normal.',
    observe: 'reports-1 has three partition chips, reports-2 has two.',
    run: wait(6500),
  },
  {
    on: ['notif', 'notif3'], color: MUTED, wires: ['own:notif:'], cam: CAM.notif,
    title: 'More instances than partitions: one sits idle',
    text: 'payments has 2 partitions, and notification runs 3 instances. A partition is never split inside a group, so notification-3 gets nothing. It is a warm spare that takes over if another one dies; it adds no speed.',
    observe: 'notification-3 is dashed: "idle · no partition left".',
    run: wait(6500),
  },
  {
    on: [], color: INK,
    title: 'The whole flow',
    text: 'Producers pick a partition by key and write to its leader. Each service is a group: inside it, each partition has one owner; across services, everyone gets everything. The number of partitions caps how many instances can work at once.',
    observe: 'Everything keeps flowing at once, with no central queue.',
    run: wait(6000),
  },
]);

// ---- flow 2: things change, traffic keeps running ----
const change = track([
  {
    on: [], color: INK,
    title: 'A normal moment',
    text: 'The same system, running normally: every partition has a leader, and every group has an owner for each of its partitions. Now we break things, one at a time, without stopping the traffic.',
    observe: 'Every lane has its lines into the groups.',
    run: wait(4500),
  },
  {
    on: ['results2', 'results', 'o1'], color: RED, cam: CAM.results,
    title: 'results-2 crashes',
    text: 'results-2 owned orders-1. Until the group notices (missed heartbeats, session.timeout.ms, sped up here), nobody in results reads orders-1 and its lag grows. reports still reads orders-1 as usual: its own group is not affected.',
    observe: 'The results title counts orders-1\'s lag going up; reports still gets orders-1 dots.',
    async run(s, v) { crash(s, v, 'results2'); await s.wait(5000); },
  },
  {
    on: ['results', 'results1', 'results3'], color: CONS, wires: ['own:results:'], cam: CAM.results,
    title: 'Rebalance: orders-1 moves to results-1',
    text: 'The group coordinator drops results-2 and hands out the partitions again: results-1 now owns orders-0 and orders-1, results-3 keeps orders-2. results-1 resumes orders-1 from the last committed offset and catches up the backlog.',
    observe: '"rebalancing…", then two chips on results-1 and a burst of catch-up dots.',
    async run(s, v) { await rebalance(s, v, 'results'); await s.wait(3500); },
  },
  {
    on: ['results', 'results2', 'results4'], color: CONS, wires: ['own:results:'], cam: CAM.results,
    title: 'Scale out: results-2 is back, results-4 is added',
    text: 'Two instances join, so the group rebalances again: 4 members for 3 partitions. Each partition still has exactly one owner, so results-4 sits idle. To spread results over more instances, orders needs more partitions.',
    observe: 'One chip each for results-1 to 3; results-4 is idle.',
    async run(s, v) { await Promise.all([join(s, v, 'results2'), join(s, v, 'results4')]); await rebalance(s, v, 'results'); await s.wait(3500); },
  },
  {
    on: ['B2', 'o1', 'p1'], color: RED,
    title: 'Broker B2 goes down',
    text: 'B2 led orders-1 and payments-1. Until new leaders are chosen, those two partitions take no writes: producers hold their records and retry. The other three partitions keep flowing as if nothing happened.',
    observe: 'Producers show records waiting for a leader; orders-1 and payments-1 go quiet.',
    async run(s, v) { brokerDown(s, v, 'B2'); await s.wait(4500); },
  },
  {
    on: ['B1', 'B3', 'o1', 'p1'], color: GREEN,
    title: 'New leaders: B3 for orders-1, B1 for payments-1',
    text: 'The controller promotes each partition\'s other copy. It was in sync, so nothing is lost (RF 2). Producers and consumers learn the new leaders from fresh metadata and carry on; the held records go out first.',
    observe: 'The badges change, the held-back records fly out, and the two lanes fill again.',
    async run(s, v) { await elect(s, v); await s.wait(4000); },
  },
  {
    on: [], color: INK,
    title: 'Everything recovered on its own',
    text: 'One instance crashed, two joined and a broker died, and no code changed: groups rebalanced and leaders moved. B1 now leads 3 partitions. When B2 comes back it rejoins as a follower and catches up.',
    observe: 'All lanes flow again; results has 4 members, one idle.',
    run: wait(5000),
  },
]);

// ---- go deeper ----
const deeper = track([
  {
    on: ['orders', 'results'], color: CONS, wires: ['own:results:'], cam: CAM.right,
    title: 'Partitions cap a group\'s parallelism',
    text: 'A group can have at most one busy instance per partition. results can use 3, notification can use 2. Choose the partition count for the most instances any group will need. Adding partitions later changes hash % N, so new records with the same key can land in a different partition.',
    observe: 'Three orders lanes, three lines into results.',
    run: wait(6500),
  },
  {
    on: ['o0', 'o1', 'o2'], color: ORDERS,
    title: 'Order is kept per partition, not per topic',
    text: 'Inside one partition, records arrive in offset order. Across partitions there is no order: results-1 and results-3 work at their own pace. Whatever must stay in order needs the same key.',
    observe: 'Dots from different lanes arrive in any order.',
    run: wait(6000),
  },
  {
    on: ['reports1'], color: AMBER, wires: ['own:reports:'], cam: CAM.reports,
    title: 'Lag is per group, per partition',
    text: 'Lag = the partition\'s end offset − the group\'s committed offset. reports-1 handles 3 partitions, so it will fall behind before reports-2. Watch lag per partition: the group total can look fine while one partition is stuck.',
    observe: 'reports-1 gets roughly half as much again as reports-2.',
    run: wait(6000),
  },
  {
    on: ['os1', 'os2', 'o0'], color: PROD, wires: ['os1>o0', 'os2>o0'], cam: CAM.producers,
    title: 'Two producer instances, one key',
    text: 'The same key from two instances lands in the same partition, but the two instances do not coordinate, so their records interleave by arrival time. When strict order per entity matters, have one instance own that entity, or put a sequence number in the record.',
    observe: `${SPOT} arrives in orders-0 from both instances.`,
    async run(s, v) { v.spot = SPOT; await s.wait(6500); v.spot = null; },
  },
]);
deeper.note = 'How many partitions to pick, ordering, lag, and several producer instances writing the same key.';

// ---- try it: break and grow the system yourself ----
const tryState = v => {
  const groups = Object.values(v.groups).map(g => {
    const own = g.members.filter(k => !v.inst[k].down).sort().map(k => {
      const ps = Object.keys(g.assign).filter(pk => g.assign[pk] === k).map(pk => v.parts[pk].name);
      return `${k.replace(g.key, g.name + '-')}: ${ps.join(', ') || 'idle'}`;
    });
    return `<b>${g.name}</b> ${own.join(' · ')}`;
  });
  return groups.join('<br>');
};
const groupKey = name => GROUPS.find(g => g.name === name).key;

export default {
  id: 'big-picture', n: 22, title: 'The big picture', tagline: 'Many producers, brokers, topics and services at once',
  docked: true,
  zoom: { w: W, h: H },
  guide: {
    what: 'A whole small system: 2 producer services, 3 brokers, topics orders (3 partitions) and payments (2 partitions), and 3 consumer services with several instances each. Traffic never stops.',
    fits: 'After the journey of one message: the same pieces, now many of each, all at once. Zoom in to read offsets and badges; Fit shows everything.',
  },
  flows: [
    { id: 'normal', short: 'a normal day', label: 'A normal day', about: 'Who writes where, which instance owns which partition, and why one instance is idle.', track: normal },
    { id: 'change', short: 'things change', label: 'Things change', about: 'An instance crashes, two join, a broker dies, all with traffic running.', track: change },
  ],
  watch: normal,
  tryIt: {
    intro: 'The system is running. Pick a service and crash or add an instance, or stop broker B2. Watch the lines, the chips and the lag.',
    observe: 'After a crash the group rebalances; extra instances beyond the partition count sit idle; with B2 down its partitions move to their other copy.',
    controls: [
      { type: 'choice', name: 'service', label: 'service', options: ['results', 'reports', 'notification'] },
      { type: 'button', label: '✕ Crash an instance', run: 'crashOne' },
      { type: 'button', label: '+ Add an instance', primary: true, run: 'addOne' },
      { type: 'button', label: 'Stop broker B2', run: 'stopB2' },
      { type: 'button', label: 'Start broker B2', run: 'startB2' },
    ],
    build(s) {
      const v = scene(s);
      v.track = { steps: [{ on: [] }] };
      light(s, v, 0);
      safe(traffic(s, v));
      v.message = 'Traffic is running. Try crashing an instance of results.';
      return v;
    },
    async crashOne(s, v, input) {
      const gk = groupKey(input.service), g = v.groups[gk], live = g.members.filter(k => !v.inst[k].down);
      if (live.length <= 1) { v.message = `${input.service} has only one instance left; keep it.`; return; }
      const victim = live.find(k => Object.values(g.assign).includes(k)) ?? live[0];
      crash(s, v, victim);
      v.message = `${victim.replace(gk, input.service + '-')} crashed. Its partitions have no reader until the group rebalances…`;
      await s.wait(2600);
      await rebalance(s, v, gk);
      v.message = `Rebalanced: ${input.service} now has ${g.members.length} instance${g.members.length > 1 ? 's' : ''} for ${Object.keys(g.pos).length} partitions.`;
    },
    async addOne(s, v, input) {
      const gk = groupKey(input.service), g = v.groups[gk];
      const free = Object.values(v.inst).find(i => i.group === gk && (!i.here || i.down));
      if (!free) { v.message = `No room for another ${input.service} instance in this picture.`; return; }
      await join(s, v, free.key);
      await rebalance(s, v, gk);
      const idle = g.members.filter(k => !Object.values(g.assign).includes(k)).length;
      v.message = `${free.key.replace(gk, input.service + '-')} joined. ${g.members.length} instances for ${Object.keys(g.pos).length} partitions${idle ? `: ${idle} idle` : ''}.`;
    },
    async stopB2(s, v) {
      if (v.brokers.B2.down) { v.message = 'B2 is already down.'; return; }
      brokerDown(s, v, 'B2');
      v.message = 'B2 is down: orders-1 and payments-1 have no leader, so producers hold those records…';
      await s.wait(2600);
      await elect(s, v);
      v.message = 'New leaders: B3 for orders-1, B1 for payments-1. Nothing was lost; the held records went out.';
    },
    async startB2(s, v) {
      if (!v.brokers.B2.down) { v.message = 'B2 is already running.'; return; }
      brokerUp(s, v, 'B2');
      v.message = 'B2 is back as a follower. The leaders stay where they are until a preferred-leader election moves them back.';
    },
    readout: v => `${tryState(v)}<br>${v.message}`,
  },
  deeper,
  takeaway: 'Producers write each record to the leader of the partition its key picks. Each consumer service is one group: inside a group every partition has exactly one owner instance; every group gets every record. Partitions cap a group\'s parallelism, and crashes, new instances and broker failures are handled by rebalances and leader elections while traffic keeps flowing.',
  recap: {
    points: [
      'Every producer instance is an independent producer; any of them can write to any partition.',
      'The key picks the partition (hash % partitions), so one key keeps its order.',
      'Each partition has a leader broker and copies on others; leaders are spread over the brokers.',
      'A service = a consumer group: inside it, each partition has one owner instance.',
      'Every group gets every record and keeps its own position.',
      'More instances than partitions → idle instances. Crashes and joins trigger a rebalance; a dead broker\'s partitions get new leaders.',
    ],
    interview: [
      { q: 'You run 3 instances of a service but the topic has 2 partitions. What happens?', a: 'All 3 join the **same consumer group** (same group.id). A partition has **one owner per group**, so 2 instances get one partition each and the **3rd is idle**. It is a **warm spare**: it takes over in the next **rebalance** if one dies. To use more instances you need **more partitions**.' },
      { q: 'Two different services need the same events. How do you set that up?', a: 'Give each service its **own group.id**. Each group gets **every record** and tracks its **own committed offsets**, so the services never compete and a slow one does not hold the other back. Within one service, its instances **share** the partitions.' },
      { q: 'What happens when a consumer instance crashes?', a: 'Its heartbeats stop; after **session.timeout.ms** the coordinator removes it and **rebalances** the group. Its partitions go to the other members, which resume from the **last committed offset**, so some records may be **processed again** (at-least-once). Other groups are not affected.' },
      { q: 'What happens to producers and consumers when a broker dies?', a: 'Partitions it **led** get a new leader from their **in-sync replicas** (chosen by the controller). Clients see errors such as NOT_LEADER, **refresh metadata** and switch to the new leader; producers **retry** the records they held. With RF ≥ 2 and acks=all nothing acknowledged is lost. Partitions led elsewhere keep working throughout.' },
      { q: 'How do you choose the number of partitions?', a: 'At least the **most consumer instances** any group will run in parallel, with headroom, since **adding partitions later** changes which partition a key maps to. Too many partitions cost broker memory, file handles and longer elections, so do not overdo it.' },
    ],
  },
  quiz: {
    q: 'reports (2 instances) reads orders (3 partitions) and payments (2 partitions). How are the partitions shared?',
    options: ['Each instance reads all 5 partitions', '3 to one instance and 2 to the other', 'Only orders is shared; payments needs another group', 'Each record goes to both instances'],
    answer: 1,
    why: 'One group can subscribe to several topics. Each of the 5 partitions gets exactly one owner in the group; the range assignor splits each topic separately, giving 2+1 and 1+1, so 3 and 2.',
  },
  related: ['journey', 'group', 'multi-group'],
};
