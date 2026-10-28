// SVG scene helpers and a pausable, speed-aware animation clock for the Learn lessons.
export const NS = 'http://www.w3.org/2000/svg';
export const PARTITION_COLORS = ['#5bb12f', '#9e579e', '#73c5e1', '#eb65a0', '#f0a030', '#4f7bd9'];
export class Cancelled extends Error {}

export function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}
export function place(n, x, y, s = n._s ?? 1) {
  n._x = x; n._y = y; n._s = s;
  n.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
  return n;
}
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export class Clock {
  constructor() { this.speed = 1; this.paused = false; this.instant = false; this.token = 0; }
  cancel() { this.token++; }
  // Resolves after `ms` of unpaused, speed-scaled time; rejects with Cancelled when the scene resets.
  tween(ms, fn = () => {}, linear = false) {
    if (this.instant) { fn(1); return Promise.resolve(); }
    const token = this.token;
    return new Promise((resolve, reject) => {
      let elapsed = 0, last = performance.now();
      const frame = now => {
        if (token !== this.token) return reject(new Cancelled());
        if (!this.paused) elapsed += (now - last) * this.speed;
        last = now;
        const t = Math.min(1, elapsed / ms);
        fn(linear ? t : ease(t));
        t < 1 ? requestAnimationFrame(frame) : resolve();
      };
      requestAnimationFrame(frame);
    });
  }
}

export class Stage {
  constructor(svg) { this.svg = svg; this.clock = new Clock(); this.reset(); }
  reset() {
    this.clock.cancel();
    this.svg.replaceChildren();
    const defs = el('defs', {}, this.svg);
    const marker = el('marker', { id: 'learn-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0 0L10 5L0 10z', fill: '#7b878f' }, marker);
    this.root = el('g', {}, this.svg);
    this.fx = el('g', { class: 'learn-fx' }, this.svg);
  }

  // ---- shapes ----
  g(x = 0, y = 0, parent = this.root, attrs = {}) { return place(el('g', attrs, parent), x, y, 1); }
  text(parent, x, y, str, attrs = {}) {
    const t = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...attrs }, parent);
    t.textContent = str;
    return t;
  }
  // Labelled box centred on (x, y).
  box(x, y, w, h, label, { parent = this.root, fill = '#fff', stroke = '#babdbe', color = '#203347', size = 14, weight = 600, dash, rx = 6, sub, subSize = 11 } = {}) {
    const g = this.g(x, y, parent, { class: 'learn-box' });
    g.rect = el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx, fill, stroke, 'stroke-width': 1.4, 'stroke-dasharray': dash }, g);
    if (label) g.label = this.text(g, 0, sub ? -(subSize + size) * .4 : 0, label, { 'font-size': size, 'font-weight': weight, fill: color });
    if (sub) g.sub = this.text(g, 0, (subSize + size) * .45, sub, { 'font-size': subSize, fill: '#7b878f' });
    return g;
  }
  // Numbered record block, the same visual language as the Visualizer.
  block(x, y, label, color = '#9aa3a9', { parent = this.root, w = 34, h = 24, size = 11 } = {}) {
    const g = this.g(x, y, parent, { class: 'learn-block' });
    g.rect = el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 3, fill: color }, g);
    g.label = this.text(g, 0, 0, label, { 'font-size': size, 'font-weight': 700, fill: '#fff' });
    return g;
  }
  line(x1, y1, x2, y2, { parent = this.root, arrow = true, dash, stroke = '#7b878f', width = 1.5 } = {}) {
    return el('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-dasharray': dash, 'marker-end': arrow ? 'url(#learn-arrow)' : null }, parent);
  }
  note(x, y, str, attrs = {}) { return this.text(this.root, x, y, str, { 'font-size': 13, fill: '#65727a', ...attrs }); }

  // ---- animation ----
  wait(ms) { return this.clock.tween(ms); }
  move(n, x, y, ms = 700) {
    const x0 = n._x ?? 0, y0 = n._y ?? 0;
    return this.clock.tween(ms, t => place(n, x0 + (x - x0) * t, y0 + (y - y0) * t));
  }
  scale(n, s, ms = 400) { const s0 = n._s ?? 1; return this.clock.tween(ms, t => place(n, n._x ?? 0, n._y ?? 0, s0 + (s - s0) * t)); }
  fade(n, to, ms = 400) {
    const from = +(n.getAttribute('opacity') ?? 1);
    return this.clock.tween(ms, t => n.setAttribute('opacity', from + (to - from) * t));
  }
  show(n, ms = 400) { n.setAttribute('opacity', 0); return this.fade(n, 1, ms); }
  pop(n, ms = 380) { const s = n._s ?? 1; place(n, n._x ?? 0, n._y ?? 0, .01); return this.scale(n, s, ms); }
  async pulse(n, times = 1) { const s = n._s ?? 1; for (let i = 0; i < times; i++) { await this.scale(n, s * 1.18, 180); await this.scale(n, s, 180); } }
  shake(n, ms = 420) { const x = n._x ?? 0, y = n._y ?? 0; return this.clock.tween(ms, t => place(n, x + Math.sin(t * Math.PI * 6) * 6 * (1 - t), y), true); }
  // Reveal a line or path by drawing it from its start.
  draw(n, ms = 500) {
    const len = n.getTotalLength?.() || Math.hypot(n.getAttribute('x2') - n.getAttribute('x1'), n.getAttribute('y2') - n.getAttribute('y1')) || 1;
    n.setAttribute('stroke-dasharray', len);
    return this.clock.tween(ms, t => n.setAttribute('stroke-dashoffset', len * (1 - t))).then(() => { n.removeAttribute('stroke-dasharray'); n.removeAttribute('stroke-dashoffset'); });
  }
  setText(n, str) { n.textContent = str; }

  // Bounding box of any node in root coordinates (used for guide spotlights).
  bounds(n) {
    const b = n.getBBox(), m = this.root.getCTM().inverse().multiply(n.getCTM());
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  spotlight(nodes) {
    this.fx.replaceChildren();
    for (const n of nodes.filter(n => n?.isConnected)) {
      const b = this.bounds(n), pad = 8;
      el('rect', { class: 'learn-ring', x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, rx: 8 }, this.fx);
    }
  }
  clearSpotlight() { this.fx.replaceChildren(); }
}

// Kafka's default partitioner for keyed records: toPositive(murmur2(utf8(key))) % partitions.
export function murmur2(str) {
  const data = new TextEncoder().encode(str), length = data.length, m = 0x5bd1e995, r = 24;
  let h = (0x9747b28c ^ length) | 0;
  const length4 = length >> 2;
  for (let i = 0; i < length4; i++) {
    const i4 = i * 4;
    let k = (data[i4] & 0xff) + ((data[i4 + 1] & 0xff) << 8) + ((data[i4 + 2] & 0xff) << 16) + ((data[i4 + 3] & 0xff) << 24);
    k = Math.imul(k, m); k ^= k >>> r; k = Math.imul(k, m);
    h = Math.imul(h, m); h ^= k;
  }
  const rest = length & 3, base = length & ~3;
  if (rest === 3) h ^= (data[base + 2] & 0xff) << 16;
  if (rest >= 2) h ^= (data[base + 1] & 0xff) << 8;
  if (rest >= 1) { h ^= data[base] & 0xff; h = Math.imul(h, m); }
  h ^= h >>> 13; h = Math.imul(h, m); h ^= h >>> 15;
  return h | 0;
}
export const partitionFor = (key, partitions) => (murmur2(key) & 0x7fffffff) % partitions;
