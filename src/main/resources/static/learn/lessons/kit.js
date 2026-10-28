// Shared drawing helpers for the multi-broker lessons (Cluster, Replica): brokers, partition lanes, record flights.
import { el } from '../scene.js';

export const RED = '#ce3434', GREEN = '#348747', AMBER = '#c47d1e', MUTED = '#7b878f';
const BLOCK = { w: 26, h: 22, size: 12 };

// Root coordinates of a node nested inside translated groups.
export function abs(s, n) {
  let x = 0, y = 0;
  for (; n && n !== s.root; n = n.parentNode) { x += n._x ?? 0; y += n._y ?? 0; }
  return [x, y];
}

export function broker(s, x, y, w, h, name, sub) {
  const b = s.box(x, y, w, h, '', { stroke: '#203347', rx: 10 });
  b.title = s.text(b, 0, -h / 2 + 22, name, { 'font-size': 17, 'font-weight': 700 });
  if (sub) b.sub = s.text(b, 0, -h / 2 + 42, sub, { 'font-size': 13, fill: MUTED });
  b.name = name;
  b.online = true;
  return b;
}
export function setOnline(b, on) {
  b.online = on;
  b.rect.setAttribute('stroke', on ? '#203347' : RED);
  b.rect.setAttribute('fill', on ? '#fff' : '#fff4f4');
  b.title.textContent = on ? b.name : `${b.name} ✕ down`;
  b.title.setAttribute('fill', on ? '#203347' : RED);
}

// One copy of a partition: name top-left, role top-right, record blocks along the bottom.
export function lane(s, parent, x, y, { name, color, w = 196, h = 56, count = 0 }) {
  const g = s.g(x, y, parent);
  Object.assign(g, { color, blocks: [], by: h / 2 - 16, pos: i => -w / 2 + 23 + i * 30 });
  g.rect = el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 6, fill: '#fff', stroke: color, 'stroke-width': 1.6 }, g);
  s.text(g, -w / 2 + 10, -h / 2 + 14, name, { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 700, 'font-family': 'Consolas, monospace', fill: color });
  g.roleT = s.text(g, w / 2 - 10, -h / 2 + 14, '', { 'text-anchor': 'end', 'font-size': 12, 'font-weight': 700 });
  for (let i = 0; i < count; i++) addBlock(s, g);
  return g;
}
export function setRole(l, role) {
  l.role = role;
  l.roleT.textContent = role === 'leader' ? '★ leader' : role === 'follower' ? 'follower' : role;
  l.roleT.setAttribute('fill', role === 'leader' ? AMBER : MUTED);
  l.rect.setAttribute('stroke-width', role === 'leader' ? 3 : 1.6);
}
export function addBlock(s, l) {
  const b = s.block(l.pos(l.blocks.length), l.by, `${l.blocks.length}`, l.color, { parent: l, ...BLOCK });
  l.blocks.push(b);
  return b;
}
// Root coordinates of block slot i in a lane (default: the next free slot).
export const slot = (s, l, i = l.blocks.length) => { const [x, y] = abs(s, l); return [x + l.pos(i), y + l.by]; };

// A record flying between two points; removed on arrival.
export async function fly(s, from, to, color, label = '', ms = 650) {
  const b = s.block(...from, label, color, BLOCK);
  await s.move(b, ...to, ms);
  b.remove();
}
// A record that tries to reach a down broker: it turns red, shakes and returns.
export async function bounce(s, from, to) {
  const b = s.block(...from, '', '#9aa3a9', BLOCK);
  await s.move(b, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 450);
  b.rect.setAttribute('fill', RED);
  await s.shake(b);
  await s.move(b, ...from, 350);
  b.remove();
}
// Copy a lane's records from `from` until `to` has caught up.
export async function catchUp(s, from, to, ms = 420) {
  while (to.blocks.length < from.blocks.length) {
    await fly(s, slot(s, from, to.blocks.length), slot(s, to), from.color, `${to.blocks.length}`, ms);
    addBlock(s, to);
  }
}
