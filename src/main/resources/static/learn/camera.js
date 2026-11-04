// Zoom and pan for lessons whose scene is bigger than the 960 × 460 stage (`zoom: { w, h }` on the lesson).
// The camera moves the SVG viewBox: mouse wheel zooms around the pointer, dragging pans, and the toolbar has
// −, +, Fit and "Follow". While Follow is on, each step can glide the camera to its area (`cam: [x, y, w, h]`);
// zooming or panning by hand turns Follow off, so the camera never fights the reader.
const BASE = [0, 0, 960, 460];

export class Camera {
  constructor(svg, tools) {
    this.svg = svg; this.tools = tools; this.world = null; this.follow = true; this.box = [...BASE]; this.anim = 0; this.target = null;
    svg.addEventListener('wheel', e => {
      if (!this.world) return;
      e.preventDefault();
      this.manual();
      this.zoomAt(Math.exp(-e.deltaY * .0015), this.toWorld(e.clientX, e.clientY));
    }, { passive: false });
    let drag = null;
    svg.addEventListener('pointerdown', e => {
      if (!this.world || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, box: [...this.box], k: this.unitsPerPx(), moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      if (!drag.moved) { drag.moved = true; this.manual(); svg.classList.add('panning'); }
      this.set([drag.box[0] - dx * drag.k, drag.box[1] - dy * drag.k, drag.box[2], drag.box[3]]);
    });
    const end = () => { drag = null; svg.classList.remove('panning'); };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('dblclick', () => { if (this.world) { this.manual(); this.go(this.fitBox()); } });
    tools.querySelector('[data-zoom="in"]').addEventListener('click', () => { this.manual(); this.zoomAt(1.35); });
    tools.querySelector('[data-zoom="out"]').addEventListener('click', () => { this.manual(); this.zoomAt(1 / 1.35); });
    tools.querySelector('[data-zoom="fit"]').addEventListener('click', () => { this.manual(); this.go(this.fitBox()); });
    tools.querySelector('[data-zoom="follow"]').addEventListener('click', () => this.setFollow(!this.follow));
  }
  // world: { w, h } or null (back to the fixed stage).
  enable(world) {
    this.world = world ?? null;
    this.tools.hidden = !world;
    this.svg.classList.toggle('zoomable', !!world);
    cancelAnimationFrame(this.anim);
    this.target = null;
    this.setFollow(true);
    this.set(world ? this.fitBox() : [...BASE]);
  }
  // a margin round the world so the toolbars at the top and bottom do not sit on it
  fitBox() { return [-12, -44, this.world.w + 24, this.world.h + 92]; }
  setFollow(on) {
    this.follow = on;
    const b = this.tools.querySelector('[data-zoom="follow"]');
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', on);
    if (on && this.world) this.go(this.target ?? this.fitBox());
  }
  manual() { if (this.follow) this.setFollow(false); }
  // A step's camera: glide there while following; otherwise just remember it for when Follow is turned back on.
  step(cam) {
    if (!this.world) return;
    this.target = cam ?? this.fitBox();
    if (this.follow) this.go(this.target);
  }
  set(box) {
    const [x, y, w, h] = box;
    this.box = [x, y, w, h];
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    if (this.world) this.svg.classList.toggle('zoomed-in', w < this.world.w * .72);
  }
  go(box, ms = 900) {
    cancelAnimationFrame(this.anim);
    const from = [...this.box], t0 = performance.now();
    const frame = now => {
      const t = Math.min(1, (now - t0) / ms), e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.set(from.map((a, i) => a + (box[i] - a) * e));
      if (t < 1) this.anim = requestAnimationFrame(frame);
    };
    this.anim = requestAnimationFrame(frame);
  }
  zoomAt(f, p) {
    cancelAnimationFrame(this.anim);
    const [x, y, w, h] = this.box;
    p ??= [x + w / 2, y + h / 2];
    const nw = Math.max(this.world.w / 5, Math.min(this.world.w * 1.15, w / f)), k = nw / w;
    this.set([p[0] - (p[0] - x) * k, p[1] - (p[1] - y) * k, w * k, h * k]);
  }
  unitsPerPx() { return 1 / (this.svg.getScreenCTM()?.a || 1); }
  toWorld(cx, cy) {
    const m = this.svg.getScreenCTM()?.inverse();
    if (!m) return null;
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
}
