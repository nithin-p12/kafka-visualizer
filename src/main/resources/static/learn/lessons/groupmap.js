// Shared scene for the consumer-group links (assignment, rebalance): the group coordinator at the top, up to three
// consumers on the left, the subscribed topics' partitions on the right, and coloured lines for who owns what.
// Also the real assignors (range, round robin, sticky) so the lessons and their sandboxes compute true results.
import { el } from '../scene.js';
import { GREEN, AMBER, MUTED, RED } from './kit.js';
import { MONO, start, layers, frame, node, part, wire, swap, hit } from './flowmap.js';

export const CCOL = ['#2f6fe0', '#9e579e', '#e08a1e'];
export const CNAME = ['C1', 'C2', 'C3'];
const CX = 160, LANE_X = 783, LANE_W = 300;
export const cY = (i, n = 3) => n === 3 ? [170, 270, 370][i] : n === 2 ? [200, 330][i] : 270;

// topics: [{ name, n }]; members: how many consumers exist at the start (the rest are drawn hidden).
export function groupScene(s, { topics = [{ name: 'orders', n: 6 }], members = 2, assignor = 'range', coord = 'B2' } = {}) {
  const v = start(s, { parent: {} });
  v.topics = topics; v.assignor = assignor; v.gen = 0; v.owner = {}; v.cons = [];
  node(s, v, 'coord', 480, 62, 440, 56, `Group coordinator · broker ${coord}`, { sub: '' });
  v.n.coord.s.setAttribute('font-family', MONO);
  v.assignLayer = s.g(0, 0, v.wires);

  for (let i = 0; i < 3; i++) {
    const y = cY(i), wrap = s.g(0, 0, s.root, i < members ? {} : { opacity: 0 });
    const c = s.box(CX, y, 250, 76, '', { parent: wrap, rx: 10, stroke: CCOL[i] });
    c.classList.add('jn');
    c.title = s.text(c, -110, -20, CNAME[i], { 'text-anchor': 'start', 'font-size': 17, 'font-weight': 800, fill: CCOL[i] });
    c.badge = s.text(c, 110, -20, '', { 'text-anchor': 'end', 'font-size': 13.5, 'font-weight': 700, fill: AMBER });
    c.state = s.text(c, -110, 4, i < members ? 'not in a group yet' : '', { 'text-anchor': 'start', 'font-size': 14, fill: MUTED });
    c.parts = s.text(c, -110, 26, '', { 'text-anchor': 'start', 'font-size': 14, 'font-family': MONO, 'font-weight': 700 });
    Object.assign(c, { i, y, wrap, inGroup: false, present: i < members });
    v.n[`c${i}`] = c;
    v.cons.push(c);
    wire(v, `c${i}-co`, `M285,${y - 26} C330,${y - 26} ${318 + i * 36},126 ${328 + i * 36},90`);
    wire(v, `co-c${i}`, `M${346 + i * 36},90 C${346 + i * 36},136 330,${y - 12} 285,${y - 12}`);
    if (i >= members) for (const k of [`c${i}-co`, `co-c${i}`]) v.w[k].style.display = 'none';   // no wires to a consumer that is not there
  }

  v.lanes = [];
  const two = topics.length > 1;
  topics.forEach((t, ti) => {
    const fy = two ? [195, 365][ti] : 288, fh = two ? 150 : 316;
    frame(s, v, `t${ti}`, LANE_X, fy, 326, fh, `topic ${t.name}`, { color: MUTED });
    for (let p = 0; p < t.n; p++) {
      const y = two ? fy - 28 + p * 38 : 172 + p * 44;
      const key = `${t.name}-${p}`;
      const l = s.box(LANE_X, y, LANE_W, 32, '', { rx: 6, stroke: '#c9ced2' });
      l.classList.add('jn');
      s.text(l, -136, 0, key, { 'text-anchor': 'start', 'font-size': 15, 'font-family': MONO, 'font-weight': 700 });
      l.ownerT = s.text(l, 136, 0, 'no owner', { 'text-anchor': 'end', 'font-size': 14, fill: MUTED, 'font-weight': 650 });
      Object.assign(l, { key, y, topic: t.name, p });
      v.n[`l${v.lanes.length}`] = l;
      v.parent[`l${v.lanes.length}`] = `t${ti}`;
      v.lanes.push(l);
    }
  });
  layers(s, v);
  coordText(v);
  return v;
}

// ---- text ----
export const members = v => v.cons.filter(c => c.inGroup);
export function coordText(v, extra) {
  const m = members(v).map(c => CNAME[c.i]).join(', ');
  v.n.coord.s.textContent = extra ?? `orders-app · generation ${v.gen} · ${m ? `members ${m}` : 'no members'}`;
}
export const coord = (s, v, extra, color) => { hit(v, 'coord'); const old = v.n.coord.s.textContent; coordText(v, extra); const now = v.n.coord.s.textContent; v.n.coord.s.textContent = old; return swap(s, v.n.coord.s, now, color); };
export const state = (s, c, str, color = MUTED) => swap(s, c.state, str, color);
const short = key => key.replace('orders-', 'P').replace('payments-', 'Q');

// ---- assignment lines ----
// owner: { laneKey: consumerIndex } (missing = no owner). Lines fade between the old and the new picture.
export async function assign(s, v, owner, { ms = 500 } = {}) {
  const old = [...v.assignLayer.children];
  v.owner = { ...owner };
  const fresh = [];
  for (const l of v.lanes) {
    const i = owner[l.key];
    l.ownerT.textContent = i == null ? 'no owner' : `→ ${CNAME[i]}`;
    l.ownerT.setAttribute('fill', i == null ? MUTED : CCOL[i]);
    l.rect.setAttribute('stroke', i == null ? '#c9ced2' : CCOL[i]);
    l.rect.setAttribute('fill', i == null ? '#f6f7fb' : '#fff');
    if (i == null) continue;
    const c = v.cons[i];
    const p = el('path', { d: `M${LANE_X - LANE_W / 2},${l.y} C470,${l.y} 440,${c.y + 16} 285,${c.y + 16}`, fill: 'none', stroke: CCOL[i], 'stroke-width': 2.2, opacity: 0 }, v.assignLayer);
    fresh.push(p);
  }
  for (const c of v.cons) {
    const mine = v.lanes.filter(l => owner[l.key] === c.i).map(l => short(l.key));
    c.parts.textContent = c.inGroup ? (mine.length ? mine.join(' ') : 'nothing: idle') : '';
    c.parts.setAttribute('fill', mine.length ? CCOL[c.i] : AMBER);
  }
  await Promise.all([...old.map(p => s.fade(p, 0, ms * .6)), ...fresh.map(p => s.fade(p, .85, ms))]);
  old.forEach(p => p.remove());
}
export const wiresOn = (v, i) => { for (const k of [`c${i}-co`, `co-c${i}`]) v.w[k].style.display = ''; };
export async function showConsumer(s, v, i) { const c = v.cons[i]; c.present = true; wiresOn(v, i); await s.show(c.wrap, 400); hit(v, `c${i}`); }
export async function hideConsumer(s, v, i, color = RED) { const c = v.cons[i]; c.rect.setAttribute('stroke', color); await s.fade(c.wrap, .25, 400); }

// ---- the real assignors ----
const order = v => v.lanes.map(l => l.key);
export function range(v, ids) {
  const out = {};
  if (!ids.length) return out;
  for (const t of v.topics) {
    const per = Math.floor(t.n / ids.length), extra = t.n % ids.length;
    let p = 0;
    ids.forEach((id, k) => { for (let j = 0; j < per + (k < extra ? 1 : 0); j++) out[`${t.name}-${p++}`] = id; });
  }
  return out;
}
export function roundRobin(v, ids) {
  const out = {};
  if (!ids.length) return out;
  order(v).forEach((key, k) => { out[key] = ids[k % ids.length]; });
  return out;
}
// Sticky: as balanced as round robin, keeping as many previous owners as possible.
export function sticky(v, ids, prev = v.owner) {
  const out = {}, keys = order(v), total = keys.length;
  if (!ids.length) return out;
  const base = Math.floor(total / ids.length), extra = total % ids.length;
  const had = id => keys.filter(k => prev[k] === id);
  const ranked = [...ids].sort((a, b) => had(b).length - had(a).length || a - b);
  const quota = Object.fromEntries(ranked.map((id, k) => [id, base + (k < extra ? 1 : 0)]));
  const count = Object.fromEntries(ids.map(id => [id, 0]));
  for (const k of keys) { const id = prev[k]; if (ids.includes(id) && count[id] < quota[id]) { out[k] = id; count[id]++; } }
  for (const k of keys) if (out[k] == null) { const id = ids.filter(x => count[x] < quota[x]).sort((a, b) => count[a] - count[b] || a - b)[0]; out[k] = id; count[id]++; }
  return out;
}
export const ASSIGNORS = { range, roundrobin: roundRobin, sticky };
