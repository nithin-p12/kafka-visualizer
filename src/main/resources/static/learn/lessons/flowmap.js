// Flow-map scenes: every node and wire is drawn from the start; each event lights its own nodes and wire, a packet
// glides along the wire and the rest blurs back (CSS: .jn/.jw with on, ctx, dim, live, trail, hit in learn.css).
// A scene object v holds v.n (nodes by key), v.w (wires by key), v.wires and v.packs (layers), v.parent (node → frame
// key, so a frame stays readable while one of its nodes is lit) and v.track (for enter()).
import { el, place } from '../scene.js';
import { AMBER, MUTED } from './kit.js';

export const INK = '#203347', MONO = 'Consolas, monospace', BLUE = '#2f6fe0';

// Start a scene: the wires layer goes first so nodes sit on top of it; call layers(s, v) at the end for packets.
export function start(s, extra = {}) { const v = { n: {}, w: {}, ...extra }; v.wires = s.g(0, 0); return v; }
export function layers(s, v) { v.packs = s.g(0, 0); return v; }

export function frame(s, v, key, x, y, w, h, title, { color = INK, fill = '#fff', stroke = '#c9ced2', right } = {}) {
  const g = s.box(x, y, w, h, '', { fill, stroke, rx: 12 });
  g.classList.add('jn');
  s.text(g, -w / 2 + 14, -h / 2 + 18, title, { 'text-anchor': 'start', 'font-size': 16, 'font-weight': 700, fill: color });
  if (right) g.right = s.text(g, w / 2 - 14, -h / 2 + 18, right, { 'text-anchor': 'end', 'font-size': 15, 'font-weight': 700, fill: AMBER });
  v.n[key] = g;
  return g;
}
export function node(s, v, key, x, y, w, h, title, { sub, mono, size = 15, color = INK } = {}) {
  const g = s.box(x, y, w, h, '', { rx: 8 });
  g.classList.add('jn');
  g.t = s.text(g, 0, sub != null ? -9 : 0, title, { 'font-size': size, 'font-weight': 650, fill: color, 'font-family': mono ? MONO : null });
  if (sub != null) g.s = s.text(g, 0, 11, sub, { 'font-size': 14, fill: MUTED, 'font-family': mono ? MONO : null });
  v.n[key] = g;
  return g;
}
// A group that only takes part in focus (no box of its own), e.g. a file row or a text line.
export function part(s, v, key) { const g = s.g(0, 0); g.classList.add('jn'); v.n[key] = g; return g; }
export function wire(v, key, d, { hidden = false, arrow = true } = {}) {
  const p = el('path', { d, class: `jw${hidden ? ' hidden-wire' : ''}`, 'marker-end': arrow && !hidden ? 'url(#learn-arrow)' : null }, v.wires);
  v.w[key] = p;
  return p;
}
export function entry(s, parent, x, y, t, w) {
  const e = s.box(x, y, w, 28, t, { parent, size: 14, fill: '#f6f7fb', stroke: '#d5d9dc', rx: 5, weight: 600 });
  e.label.setAttribute('font-family', MONO);
  return e;
}

// ---- motion helpers ----
// Glide a node along a wire (eased), or along a straight line when there is no wire.
export function along(s, v, n, key, ms = 1000) {
  const p = v.w[key], L = p.getTotalLength();
  return s.clock.tween(ms, t => { const q = p.getPointAtLength(L * t); place(n, q.x, q.y); });
}
// A message on a wire: a coloured dot with its label riding just above it.
export async function packet(s, v, key, label, color = BLUE, { ms = 1100, keep = false } = {}) {
  const g = s.g(0, 0, v.packs);
  const w = label.length * 7.6 + 18;
  el('rect', { x: -w / 2, y: -34, width: w, height: 24, rx: 12, fill: '#fff', stroke: color, 'stroke-width': 1.4 }, g);
  s.text(g, 0, -22, label, { 'font-size': 13.5, 'font-weight': 700, fill: color });
  el('circle', { r: 7, fill: color, stroke: '#fff', 'stroke-width': 2 }, g);
  v.w[key].style.setProperty('--wc', color);
  await along(s, v, g, key, ms);
  if (keep) return g;
  await s.fade(g, 0, 180);
  g.remove();
}
// Move to the wire's start first (when the node is elsewhere), then glide along it. ms 0: only the first move.
export async function ride(s, v, n, key, ms = 900, lead = 300) {
  const q = v.w[key].getPointAtLength(0);
  if (Math.hypot((n._x ?? 0) - q.x, (n._y ?? 0) - q.y) > 2) await s.move(n, q.x, q.y, lead);
  if (ms) await along(s, v, n, key, ms);
}
export function unfocus(v) {
  for (const n of Object.values(v.n)) n.classList.remove('on', 'ctx', 'dim');
  for (const p of Object.values(v.w)) p.classList.remove('live', 'trail');
}
export function hit(v, key) {
  const n = v.n[key];
  if (!n || !n.isConnected) return;
  n.classList.remove('hit'); void n.getBBox(); n.classList.add('hit');
}
// Change a text smoothly: fade out, swap, fade in.
export async function swap(s, t, str, color) {
  await s.fade(t, 0, 160);
  t.textContent = str;
  if (color) t.setAttribute('fill', color);
  await s.fade(t, 1, 220);
}
export const shape = (b, w, h) => { b.rect.setAttribute('width', w); b.rect.setAttribute('x', -w / 2); b.rect.setAttribute('height', h); b.rect.setAttribute('y', -h / 2); };

// Focus: the event's nodes stay sharp, frames holding them stay readable, everything else blurs back.
export function focus(v, on = [], wires = [], trail = []) {
  const set = new Set(on), parent = v.parent ?? {}, ctx = new Set();
  // Every frame around a lit node (and around that frame) stays readable.
  for (const k of on) for (let p = parent[k]; p; p = parent[p]) ctx.add(p);
  // …and so does everything inside a lit frame (its rows and nodes), so lighting a frame never blurs its content.
  for (const k of Object.keys(v.n)) for (let p = parent[k]; p; p = parent[p]) if (set.has(p)) { ctx.add(k); break; }
  for (const [k, n] of Object.entries(v.n)) {
    const lit = set.has(k);
    n.classList.toggle('on', lit);
    n.classList.toggle('ctx', !lit && ctx.has(k));
    n.classList.toggle('dim', !lit && !ctx.has(k));
  }
  const live = new Set(wires), past = new Set(trail);
  for (const [k, p] of Object.entries(v.w)) {
    p.classList.toggle('live', live.has(k));
    p.classList.toggle('trail', !live.has(k) && past.has(k));
  }
  v.packs.classList.remove('dim');
}
export const wiresOf = st => [st.wire, ...(st.wires ?? [])].filter(Boolean);
// The track's enter(): light this event, and keep every wire travelled so far as a trail.
export const enter = (s, v, i) => {
  const steps = v.track.steps;
  focus(v, steps[i].on, wiresOf(steps[i]), steps.slice(0, i).flatMap(wiresOf));
};
