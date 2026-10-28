import { Cancelled } from './scene.js';

// Plays a track ({ build, steps }) step by step. Seeking rebuilds the scene and replays earlier
// steps instantly, so every step starts from exactly the state the previous step left behind.
// Each step first gives the reader time to read the guide ("reading"), then animates ("running"),
// then holds briefly ("holding") before moving on. Paused, it waits for Play before animating.
export class Player {
  constructor(stage, on) { this.stage = stage; this.on = on; this.run = 0; this.userPaused = false; this.phase = 'idle'; }
  load(track) { this.track = track; this.userPaused = false; this.stage.clock.paused = false; this.seek(0); }
  stop() { this.run++; this.stage.clock.cancel(); this.skip = null; this.phase = 'idle'; }
  get count() { return this.track?.steps.length ?? 0; }

  // read: false skips the reading pause (used by "Replay step").
  async seek(i, { read = true } = {}) {
    const run = ++this.run, { stage, track } = this;
    i = Math.max(0, Math.min(i, this.count - 1));
    stage.reset();
    stage.clock.paused = false;
    this.i = i; this.phase = 'running';
    this.on.step(i, track.steps[i]);
    const v = track.build(stage);
    stage.clock.instant = true;
    for (let k = 0; k < i; k++) await track.steps[k].run(stage, v);
    stage.clock.instant = false;
    if (run !== this.run) return;
    this.v = v;
    this.on.started?.(i, track.steps[i], v);
    try {
      if (read) { await this.read(track.steps[i], run); if (run !== this.run) return; }
      this.phase = 'running'; this.on.state();
      await track.steps[i].run(stage, v);
      if (run !== this.run) return;
      this.on.settled(i, track.steps[i], v);
      if (this.userPaused) { this.phase = 'waiting'; this.on.state(); return; }
      await this.hold(track.steps[i]);
    } catch (e) { if (e instanceof Cancelled) return; throw e; }
    if (run !== this.run) return;
    this.advance();
  }
  // Time to read the step before it animates, from its word count (2.5–9 s at 1×). While paused there is no
  // countdown: the step waits for Play or "Start now".
  read(step, run) {
    const words = `${step.title} ${step.text}`.split(/\s+/).length;
    const ms = Math.min(9000, Math.max(2500, 1200 + words * 200));
    this.phase = 'reading'; this.on.state();
    return new Promise((resolve, reject) => {
      this.skip = resolve;
      if (this.userPaused) return;
      this.stage.clock.tween(ms, t => { if (this.run === run && this.phase === 'reading') this.on.read?.(t); }, true).then(resolve, reject);
    }).finally(() => { if (this.run === run) { this.skip = null; this.on.read?.(0); } });
  }
  // Skip the rest of the reading pause and animate now (stays in manual mode if paused).
  startNow() {
    if (this.phase !== 'reading') return;
    this.stage.clock.paused = false;
    this.skip?.();
  }
  // A short pause after the animation, so the "watch for" hint can be checked against the result.
  hold(step) {
    const ms = 1800 + (step.observe?.length ?? 0) * 35;
    this.phase = 'holding'; this.on.state();
    return this.stage.clock.tween(ms, t => this.on.hold(t), true).finally(() => this.on.hold(0));
  }
  advance() {
    if (this.i + 1 < this.count) return this.seek(this.i + 1);
    this.phase = 'done'; this.on.state(); this.on.done();
  }
  play() {
    this.userPaused = false; this.stage.clock.paused = false;
    if (this.phase === 'reading') this.startNow();
    else if (this.phase === 'waiting') this.advance();
    else if (this.phase === 'done') this.seek(0);
    this.on.state();
  }
  pause() { this.userPaused = true; this.stage.clock.paused = true; this.on.state(); }
  toggle() { this.userPaused || this.phase === 'done' ? this.play() : this.pause(); }
  replay() { this.seek(this.i, { read: false }); }
  next() { if (this.i + 1 < this.count) this.seek(this.i + 1); }
  prev() { this.seek(this.i - 1); }
  setSpeed(s) { this.stage.clock.speed = s; }
}
