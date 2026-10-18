import { esc, CONSUMER_LAG_THRESHOLD } from './diagram.js?v=20261018-2';

const $ = id => document.getElementById(id);
const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const tones = { guide: '#9d4ccc', danger: '#d43838', 'lag-alert': '#ce3434', retry: '#c57416', warning: '#d28a15', success: '#348747' };
const LAG_THRESHOLD = CONSUMER_LAG_THRESHOLD;
const tour = [
  ['Welcome to Kafka Visualizer', 'Follow the architecture from left to right: producers, broker-hosted partition replicas, then logical consumer groups. This is a deterministic learning simulation; it does not connect to Kafka.', '#architecture-viewport'],
  ['Build your own setup', 'Custom is the default tab. Name services, topics and groups, choose subscriptions, and Apply live edits. Run configuration & reset starts a fresh demonstration after an introduction. Scenarios contains ten guided examples.', '#sidebar'],
  ['Publish from a real FIFO queue', 'The top queued ID is the next message to publish. Auto uses the configured rate; in Manual mode one click on this producer publishes its next template. Keys select partitions; unkeyed messages use simplified round-robin.', '.producer-node'],
  ['Brokers host physical replicas', 'Each broker contains replica logs. Its power button opens stop/restart actions. A stopped broker keeps its simulated log; only eligible in-sync replicas can become leaders.', '.broker'],
  ['Partitions provide ordering', 'A filled replica is a leader; an outline is a follower. Colors identify partitions. Offsets are independent per partition, and consumption does not delete records. Click a replica to inspect offsets and retained history.', '.replica'],
  ['Groups independently consume', 'A group is logical membership, not another Kafka server. Each group receives its subscribed partitions independently. Within a group, one consumer owns a partition at a time.', '.group-box'],
  ['Consumers process, then commit', 'A consumer can own several partitions or stay idle. Processing and committing are separate. A committed offset is the next offset to consume. Crashing before committing can repeat business processing.', '.consumer-node'],
  ['Control the demonstration', 'Pause freezes packets and simulation time. Animation speed changes travel speed; producer and consumer rates use simulated seconds. Restart clears runtime state. Focus hides the controls; Escape restores them.', '.toolbar-right'],
  ['Inspect what the picture means', 'Events, Lag & offsets, and Processing expose actual simulation state. Lag is log end minus committed next. Close this panel for a clear canvas. You can reopen this tour from More → Welcome guide.', '#bottom-panel'],
];

export function setupExplanation(configuration, explanation = '') {
  const c = configuration;
  return `<p>${esc(explanation || 'Watch partition assignments first, then follow each message through its leader, replicas and subscribed consumer groups.')}</p>
    <ul class="setup-overview"><li><strong>Cluster:</strong> ${c.brokers.map(b=>esc(b.name)).join(', ')}</li><li><strong>Topics:</strong> ${c.topics.map(t => `${esc(t.name)} (${t.partitions} partitions, RF ${t.replicationFactor})`).join('; ')}</li>
    <li><strong>Producers:</strong> ${c.producers.map(p => `${esc(p.name)} → ${esc(c.topics.find(t => t.id === p.topicId)?.name)} · ${p.automatic ? 'Auto ' + p.rate + '/s' : 'Manual: click to publish'}`).join('; ')}</li>
    <li><strong>Groups:</strong> ${c.groups.map(g => `${esc(g)}: ${c.consumers.filter(x => x.groupId === g).map(x => `${esc(x.name)} → ${x.topicIds.map(id=>esc(c.topics.find(t=>t.id===id)?.name)).join('/')} (${x.rate}/s)`).join(', ') || 'no members'}`).join('; ')}</li></ul>
    <p class="guide-note">Partition-colored “Assign P…” packets show ownership, not messages. Each arriving assignment adds an equal color segment to its consumer. Message packets begin after assignments settle. Watch the same message ID through each stage; commits identify the next offset.</p>`;
}

/** Learning overlays never fabricate simulation events or advance engine time. */
export class Guidance {
  constructor(deps) {
    this.deps = deps;
    this.enabled = read('kafka-guide-enabled', 'true') !== 'false';
    this.dialogMode = null;
    this.effects = new Map();
    this.throttle = new Map();
    this.consumerLag = new Map();
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.current = null;
    this.dismissed = '';
    this.lastDraw = 0;
    this.epoch = null;
    $('guidance-enabled').checked = this.enabled;
    $('welcome-guide').onclick = () => { deps.closeMore(); this.welcome(); };
    $('learning-previous').onclick = () => { this.tourIndex--; this.renderTour(); };
    $('learning-skip').onclick = () => this.endTour();
    $('learning-cancel').onclick = () => this.closeIntro();
    $('learning-continue').onclick = async () => {
      if (this.dialogMode === 'welcome') {
        if (this.tourIndex === tour.length - 1) this.endTour();
        else { this.tourIndex++; this.renderTour(); }
        return;
      }
      const callback = this.introCallback;
      this.setEnabled($('learning-guidance').checked);
      $('learning-dialog').close(); this.dialogMode = null;
      this.starting = true;
      try { await callback?.(this.enabled); } finally { this.starting = false; }
    };
    $('learning-dialog').addEventListener('cancel', e => { e.preventDefault(); this.dialogMode === 'welcome' ? this.endTour() : this.closeIntro(); });
    $('scenario-guide-continue').onclick = async () => {
      if (!this.current) return;
      if (this.current.checkpoint) {
        this.continuing = this.current.key;
        $('scenario-guide-continue').disabled = true;
        try { await deps.command('GUIDE_CONTINUE', this.current.token); } finally { this.continuing = null; }
      } else { this.dismissed = this.current.key; this.toast = null; this.current = null; $('scenario-guide').hidden = true; }
    };
    $('scenario-guide-disable').onclick = () => this.disable();
    $('guidance-enabled').onchange = () => {
      this.setEnabled($('guidance-enabled').checked);
      deps.command(this.enabled ? 'GUIDE_ENABLE' : 'GUIDE_DISABLE');
    };
  }
  get blocked() { return !!this.dialogMode || !!this.starting; }
  setEnabled(on) { this.enabled = on; save('kafka-guide-enabled', String(on)); $('guidance-enabled').checked = on; }
  disable() {
    this.setEnabled(false); this.effects.clear(); this.current = this.toast = null;
    $('scenario-guide').hidden = true; this.deps.command('GUIDE_DISABLE');
  }
  welcomeIfNeeded() { if (read('kafka-welcome-v1', '') !== 'done') this.welcome(); }
  welcome() {
    if (this.dialogMode) return;
    const viewport = $('architecture-viewport');
    this.savedView = { sidebar: !$('sidebar').hidden, diagnostics: !$('bottom-panel').hidden, scenarioTab: $('scenarios-tab').getAttribute('aria-selected') === 'true', focus: document.body.classList.contains('focus-view'), left: viewport.scrollLeft, top: viewport.scrollTop };
    this.deps.focusView(false);
    this.dialogMode = 'welcome'; this.tourIndex = 0;
    this.renderTour(); $('learning-dialog').showModal();
  }
  renderTour() {
    this.deps.showSidebar(this.tourIndex === 1);
    if (this.tourIndex === 1) this.deps.selectTab('custom');
    this.deps.diagnostics(this.tourIndex === 8);
    const [title, text, selector] = tour[this.tourIndex];
    $('learning-dialog').classList.add('tour');
    $('learning-progress').textContent = `Welcome guide · ${this.tourIndex + 1} / ${tour.length}`;
    $('learning-title').textContent = title;
    $('learning-description').textContent = text;
    $('learning-previous').hidden = this.tourIndex === 0;
    $('learning-skip').hidden = false; $('learning-cancel').hidden = true;
    $('learning-guidance-option').hidden = true;
    $('learning-continue').textContent = this.tourIndex === tour.length - 1 ? 'Finish' : 'Next';
    this.tourSelector = selector;
    requestAnimationFrame(() => document.querySelector(selector)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }
  endTour() {
    $('learning-dialog').close(); this.dialogMode = null; this.tourSelector = null;
    save('kafka-welcome-v1', 'done');
    const v = this.savedView;
    if (v) {
      this.deps.showSidebar(v.sidebar); this.deps.selectTab(v.scenarioTab ? 'scenarios' : 'custom'); this.deps.diagnostics(v.diagnostics); this.deps.focusView(v.focus);
      requestAnimationFrame(() => $('architecture-viewport').scrollTo(v.left, v.top));
    }
    this.savedView = null;
  }
  intro(title, html, callback) {
    if (this.dialogMode) return;
    this.dialogMode = 'intro'; this.introCallback = callback;
    $('learning-dialog').classList.remove('tour');
    $('learning-progress').textContent = 'Before you begin';
    $('learning-title').textContent = title; $('learning-description').innerHTML = html;
    $('learning-previous').hidden = $('learning-skip').hidden = true;
    $('learning-cancel').hidden = false; $('learning-guidance-option').hidden = false;
    $('learning-guidance').checked = this.enabled; $('learning-continue').textContent = 'Continue';
    $('learning-dialog').showModal();
  }
  closeIntro() { $('learning-dialog').close(); this.dialogMode = null; this.introCallback = null; }
  observe(e) {
    if (!this.enabled) return;
    if (['OFFLINE', 'ELECTION', 'UNAVAILABLE', 'REBALANCE', 'ONLINE', 'RECOVERY'].includes(e.stage)) {
      const targets = [e.source, e.destination].filter(Boolean);
      if (e.stage === 'REBALANCE') targets.push('group:' + e.groupId);
      if (!targets.length && e.partitionKey) for (const b of this.deps.getState()?.brokers || []) for (const r of b.replicas) if (r.key === e.partitionKey) targets.push(r.nodeId);
      const tone = ['OFFLINE', 'UNAVAILABLE'].includes(e.stage) ? 'danger' : e.stage === 'REBALANCE' ? 'guide' : 'success';
      this.flash(targets, tone, tone === 'success' ? 280 : 4000);
      this.toast = { key: 'event-' + e.id, title: ({ OFFLINE: 'Component stopped', ELECTION: 'Leader election complete', UNAVAILABLE: 'Partition unavailable', REBALANCE: 'Partition ownership is changing', ONLINE: 'Broker restarted', RECOVERY: 'Replica caught up' })[e.stage], description: e.description, targets, tone, expires: performance.now() + 5000 };
    }
  }
  finish(e) {
    if (!this.enabled) return;
    const stage = e.stage;
    const tone = ['FAILED','COMMIT_FAILED'].includes(stage) ? 'danger' : ['RETRY','REDELIVERED'].includes(stage) ? 'retry' : ['PROCESSED','COMMITTED'].includes(stage) ? 'success' : stage === 'ASSIGNMENT' ? 'guide' : null;
    if (!tone) return;
    this.flash([stage === 'ASSIGNMENT' ? e.destination : e.source], tone, tone === 'success' ? 280 : 4000);
    if (['FAILED','COMMIT_FAILED','RETRY','REDELIVERED'].includes(stage)) this.toast = { key:'event-' + e.id, title: ({FAILED:'Processing failed',COMMIT_FAILED:'Commit failed',RETRY:'Retrying the same offset',REDELIVERED:'Uncommitted work is being redelivered'})[stage], description:e.description, targets:[e.source],tone,expires:performance.now()+5000 };
  }
  flash(targets, tone, duration) {
    const now = performance.now();
    for (const target of targets.filter(Boolean)) {
      const key = target + '|' + tone;
      if (now - (this.throttle.get(key) || -Infinity) < 1000) continue;
      this.throttle.set(key, now); this.effects.set(key, { target, tone, born: now, duration, ends: now + duration });
    }
  }
  update(state, settled, owns, visible = state) {
    if (this.epoch !== state.epoch) { this.epoch=state.epoch; this.current=this.toast=null; this.effects.clear(); this.throttle.clear(); this.consumerLag.clear(); this.dismissed=''; }
    // Operational lag alerts stay available even when the optional learning guide is hidden.
    const live = new Set();
    for (const c of visible.groups.flatMap(g => g.consumers)) {
      live.add(c.id);
      const lag = c.lag || 0, previous = this.consumerLag.get(c.id) || { mark: 0, alerted: -Infinity };
      if (lag < LAG_THRESHOLD) previous.mark = 0;
      else if (lag >= previous.mark + LAG_THRESHOLD && performance.now() - previous.alerted >= 4000) {
        this.flash(['consumer:' + c.id], 'lag-alert', 4000);
        previous.mark = lag; previous.alerted = performance.now();
      }
      this.consumerLag.set(c.id, previous);
    }
    for (const id of this.consumerLag.keys()) if (!live.has(id)) this.consumerLag.delete(id);
    const cue = settled && state.guideCue ? { ...state.guideCue, checkpoint: true } : null;
    const toast = this.toast?.expires > performance.now() && this.toast.key !== this.dismissed ? this.toast : null;
    const next = !this.dialogMode ? cue || (this.enabled ? toast : null) : null;
    if (!next) { this.current = null; this.cardSignature=null; $('scenario-guide').hidden = true; return; }
    const signature=[state.epoch,next.key,owns,this.continuing].join('|');
    if (signature===this.cardSignature) { this.current=next; return; }
    this.cardSignature=signature;
    const changed = this.current?.key !== next.key;
    this.current = next;
    if (changed) { this.lastDraw=-Infinity; this.positionSize=null; }
    const card = $('scenario-guide'); card.hidden = false; card.dataset.tone = next.tone;
    $('scenario-guide-label').textContent = next.checkpoint ? 'Scenario guide · paused for observation' : 'Live event · simulation state';
    $('scenario-guide-title').textContent = next.title; $('scenario-guide-description').textContent = next.description;
    $('scenario-guide-continue').textContent = next.checkpoint ? owns ? 'Continue' : 'Controlled in another tab' : 'Dismiss';
    $('scenario-guide-continue').disabled = !!next.checkpoint && (!owns || this.continuing === next.key);
    if (changed && next.checkpoint) {
      const first=next.targets[0], group=first?.startsWith('group:') ? state.groups.find(g=>'group:'+g.id===first) : null;
      const target = document.getElementById(group?.consumers[0] ? 'consumer:'+group.consumers[0].id : first);
      target?.scrollIntoView({block:'nearest',inline:'nearest'});
    }
  }
  bounds(target) {
    const el = target.startsWith('#') || target.startsWith('.') ? document.querySelector(target) : document.getElementById(target);
    if (!el || !el.getClientRects().length) return null;
    let r = el.getBoundingClientRect();
    if (target.startsWith('group:')) {
      const g = this.deps.getState()?.groups.find(g => 'group:' + g.id === target);
      const rects = [r, ...(g?.consumers || []).map(c => document.getElementById('consumer:' + c.id)?.getBoundingClientRect()).filter(Boolean)];
      r = { left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom)) };
    }
    const clip = el.ownerSVGElement ? $('architecture-viewport').getBoundingClientRect() : {left:0,top:0,right:innerWidth,bottom:innerHeight};
    const left=Math.max(clip.left+3,r.left-7),top=Math.max(clip.top+3,r.top-7),right=Math.min(clip.right-3,r.right+7),bottom=Math.min(clip.bottom-3,r.bottom+7);
    return right>left && bottom>top ? {left,top,right,bottom} : null;
  }
  frame(now) {
    if (now-this.lastDraw<65) return;
    this.lastDraw=now;
    const shapes=[], effects=[];
    const rect = (r,tone,opacity=1,key='') => r ? `<rect data-key="${esc(key)}" x="${r.left}" y="${r.top}" width="${r.right-r.left}" height="${r.bottom-r.top}" rx="8" class="guide-ring ${tone}" style="--ring:${tones[tone] || tones.guide};opacity:${opacity}"/>` : '';
    if (this.dialogMode === 'welcome') shapes.push(rect(this.bounds(this.tourSelector),'guide',1,'tour-' + this.tourIndex));
    if (this.current && !this.blocked) {
      const targets=this.current.targets.map(t=>this.bounds(t)).filter(Boolean);
      const cardEl=$('scenario-guide');
      const previousSize=this.positionSize;
      const positionKey=this.current.key+'|'+innerWidth+'|'+innerHeight;
      if (previousSize !== positionKey) {
        this.positionSize=positionKey;
        const w=cardEl.offsetWidth,h=cardEl.offsetHeight,top=$('toolbar').getClientRects().length?$('toolbar').getBoundingClientRect().bottom+12:16;
        const candidates=[{left:innerWidth-w-20,top:innerHeight-h-48},{left:20,top:innerHeight-h-48},{left:innerWidth-w-20,top},{left:20,top}];
        const score=p=>targets.reduce((n,r)=>n+Math.max(0,Math.min(p.left+w,r.right)-Math.max(p.left,r.left))*Math.max(0,Math.min(p.top+h,r.bottom)-Math.max(p.top,r.top)),0);
        candidates.sort((a,b)=>score(a)-score(b));
        const p=candidates[0];cardEl.style.left=Math.max(16,p.left)+'px';cardEl.style.top=Math.max(16,p.top)+'px';cardEl.style.right='auto';cardEl.style.bottom='auto';
      }
      // Keep the checkpoint pointer, but success is only a blink, never a held green box.
      targets.forEach((r,i)=>shapes.push(rect(r,this.current.tone === 'success' ? 'guide' : this.current.tone,1,'cue-' + this.current.key + '-' + i)));
      const r=targets[0], card=$('scenario-guide').getBoundingClientRect();
      if (r && card.width) {
        const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
        const startX=Math.max(card.left+12,Math.min(card.right-12,x)),startY=y<card.top?card.top:card.bottom;
        shapes.push(`<path data-key="pointer" class="guide-pointer" d="M${startX} ${startY}L${x} ${y}"/><circle data-key="pointer-tip" cx="${x}" cy="${y}" r="4" fill="#9d4ccc"/>`);
      }
    }
    for (const [key,e] of this.effects) {
      if (now>=e.ends) this.effects.delete(key);
      else if (!this.dialogMode) {
        const fade = Math.min(1, (e.ends-now) / Math.min(500, e.duration));
        const pulse = e.tone === 'lag-alert' && !this.motionPreference.matches ? .65 + .35 * Math.cos((now-e.born) / 150) : 1;
        effects.push(rect(this.bounds(e.target),e.tone,fade * pulse,'effect-' + key));
      }
    }
    $('guide-overlay').dataset.cue=this.current?.key || '';
    this.renderOverlay(effects.join('')+shapes.join(''));
  }
  renderOverlay(markup) {
    if (markup === this.overlayMarkup) return;
    this.overlayMarkup = markup;
    const overlay = $('guide-overlay');
    const parsed = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    parsed.innerHTML = markup;
    const existing = new Map([...overlay.children].map(el => [el.dataset.key, el]));
    [...parsed.children].forEach((next, index) => {
      const key = next.dataset.key;
      let el = existing.get(key);
      if (!el) el = next.cloneNode(true);
      else {
        for (const attr of [...next.attributes])
          if (el.getAttribute(attr.name) !== attr.value) el.setAttribute(attr.name, attr.value);
      }
      existing.delete(key);
      if (overlay.children[index] !== el) overlay.insertBefore(el, overlay.children[index] || null);
    });
    existing.forEach(el => el.remove());
  }
}
