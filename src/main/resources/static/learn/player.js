import { Cancelled } from './scene.js';

// Plays a track ({ build, steps }) step by step. Seeking rebuilds the scene and replays earlier
// steps instantly, so every step starts from exactly the state the previous step left behind.
export class Player {
  constructor(stage, on) { this.stage = stage; this.on = on; this.run = 0; this.userPaused = false; this.phase = 'idle'; }
  load(track) { this.track = track; this.userPaused = false; this.stage.clock.paused = false; this.seek(0); }
  stop() { this.run++; this.stage.clock.cancel(); this.phase = 'idle'; }
  get count() { return this.track?.steps.length ?? 0; }

  async seek(i) {
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
      await track.steps[i].run(stage, v);
      if (run !== this.run) return;
      this.on.settled(i, track.steps[i], v);
      if (this.userPaused) { this.phase = 'waiting'; this.on.state(); return; }
      await this.hold(track.steps[i]);
    } catch (e) { if (e instanceof Cancelled) return; throw e; }
    if (run !== this.run) return;
    this.advance();
  }
  // Reading time after each animation, scaled by caption length.
  hold(step) {
    const ms = 2200 + (step.text.length + (step.observe?.length ?? 0) * .5) * 32;
    this.phase = 'holding'; this.on.state();
    return this.stage.clock.tween(ms, t => this.on.hold(t), true).finally(() => this.on.hold(0));
  }
  advance() {
    if (this.i + 1 < this.count) return this.seek(this.i + 1);
    this.phase = 'done'; this.on.state(); this.on.done();
  }
  play() {
    this.userPaused = false; this.stage.clock.paused = false;
    if (this.phase === 'waiting') this.advance();
    else if (this.phase === 'done') this.seek(0);
    this.on.state();
  }
  pause() { this.userPaused = true; this.stage.clock.paused = true; this.on.state(); }
  toggle() { this.userPaused || this.phase === 'done' ? this.play() : this.pause(); }
  next() { if (this.i + 1 < this.count) this.seek(this.i + 1); }
  prev() { this.seek(this.i - 1); }
  setSpeed(s) { this.stage.clock.speed = s; }
}
