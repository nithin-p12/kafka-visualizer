/* Real Edge audit: all guided scenarios, visible geometry and custom combinations. */
const { chromium } = require(require('node:path').resolve('target/browser-tests/node_modules/playwright'));
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.KAFKA_LAB_URL || 'http://localhost:8080';
const out = 'target/browser-tests/audit';
fs.mkdirSync(out, { recursive: true });
const report = { started: new Date().toISOString(), browser: 'Microsoft Edge', results: [], errors: [] };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, ...(process.env.KAFKA_AUDIT_VIDEO === '1' ? { recordVideo: { dir: out + '/video', size: { width: 1280, height: 720 } } } : {}) });
  const page = await context.newPage().catch(async e => { await browser.close(); throw e; });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => { if (r.status() >= 500) report.errors.push(r.status() + ' ' + r.url()); });
  await page.addInitScript(() => {
    localStorage.removeItem('kafka-view');
    window.audit = { packets: [], geometry: [], arrivals: [], lastEpoch: null };
    new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.matches('.packet')) {
        const s = window.kafkaLab?.state;
        window.audit.packets.push({ ...n.dataset, epoch: s?.epoch, tick: s?.tick });
      }
    }))).observe(document, { subtree: true, childList: true });
    setInterval(() => {
      const lab = window.kafkaLab;
      if (!lab?.visibleState) return;
      const s = lab.state;
      const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
      const labels = [...document.querySelectorAll('#diagram-nodes text')].map(e => ({ text: e.textContent, rect: e.getBoundingClientRect() })).filter(x => x.rect.width && x.rect.height);
      const collisions = [];
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i].rect, labels[j].rect)) collisions.push([labels[i].text, labels[j].text]);
      const packets = [...document.querySelectorAll('.packet')].filter(e => getComputedStyle(e).visibility !== 'hidden');
      const packetCollisions = [];
      for (let i = 0; i < packets.length; i++) for (let j = i + 1; j < packets.length; j++) if (overlap(packets[i].getBoundingClientRect(), packets[j].getBoundingClientRect())) packetCollisions.push([packets[i].dataset.message, packets[j].dataset.message]);
      const labelHits = [];
      for (const p of packets) for (const e of document.querySelectorAll('.group-box text, .consumer-node .actor-label, .producer-node .actor-label, .broker-label, .queued-message text')) if (overlap(p.getBoundingClientRect(), e.getBoundingClientRect())) labelHits.push([p.dataset.stage, p.dataset.message, e.textContent]);
      if ((collisions.length || packetCollisions.length || labelHits.length) && window.audit.geometry.length < 100) {
        const signature = JSON.stringify([s.epoch, innerWidth, collisions, packetCollisions, labelHits]);
        if (!window.audit.geometry.some(x => x.signature === signature)) window.audit.geometry.push({ signature, epoch: s.epoch, tick: s.tick, width: innerWidth, collisions, packetCollisions, labelHits });
      }
      for (const p of packets.filter(p => p.dataset.stage === 'DELIVERED')) {
        const consumerId = p.dataset.destination.slice(9), id = p.dataset.message;
        const c = lab.visibleState.groups.flatMap(g => g.consumers).find(c => c.id === consumerId);
        // Retries/redelivery can legitimately show earlier completed history of this ID.
        const event = s.events.find(e => e.stage === 'DELIVERED' && e.messageId === id && e.destination === p.dataset.destination);
        const prior = s.events.some(e => e.stage === 'PROCESSED' && e.messageId === id && e.source === p.dataset.destination && e.id < event?.id);
        if (c?.processing?.message.id === id && !prior && window.audit.arrivals.length < 20) window.audit.arrivals.push({ epoch: s.epoch, tick: s.tick, id, consumerId });
      }
    }, 80);
  });
  const ready = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout });
  async function api(path, data, method = 'POST') {
    const r = await page.request.fetch(base + '/api/simulation' + path, { method, data });
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  }
  async function check(result, name, fn) {
    try { await fn(); result.checks.push({ name, pass: true }); }
    catch (e) { result.checks.push({ name, pass: false, error: e.message }); }
  }
  async function shot(name) { await page.screenshot({ path: out + '/' + name + '.png', fullPage: true }); }
  async function pause() {
    if (await page.evaluate(() => window.kafkaLab.state.running || window.kafkaLab.state.manualFlow)) await page.locator('#playback').click();
    await ready(() => window.kafkaLab.state.playbackPaused || !window.kafkaLab.state.canAdvance);
  }
  async function choose(id) {
    if (!(await page.locator('#sidebar').isVisible())) await page.locator('#toggle-sidebar').click();
    await page.locator('#scenarios-tab').click();
    await page.selectOption('#scenario-select', String(id));
    await page.locator('#run-scenario').click();
    await ready(n => window.kafkaLab.state.scenarioId === n, id);
    if (await page.locator('#sidebar').isVisible()) await page.locator('#close-sidebar').click();
  }
  async function apply(config) {
    const r = await api('/configuration', { configuration: config, reset: true }, 'PUT');
    await ready(rev => window.kafkaLab.state.configRevision === rev, r.configRevision);
    return r;
  }
  async function inspect(result) {
    await check(result, 'No label or packet overlaps', async () => {
      const issues = await page.evaluate(epoch => window.audit.geometry.filter(x => x.epoch === epoch), result.epoch);
      result.geometry = issues;
      assert.deepEqual(issues, []);
    });
    await check(result, 'Consumer begins processing only after arrival', async () => {
      const issues = await page.evaluate(epoch => window.audit.arrivals.filter(x => x.epoch === epoch), result.epoch);
      assert.deepEqual(issues, []);
    });
    await check(result, 'Horizontal layout and no document overflow', async () => {
      assert(await page.evaluate(() => {
        const l = window.kafkaLab.layout;
        return l.producers.every(p => p.cx < l.brokerX) && l.brokers.every(b => b.x < l.groupX) && document.documentElement.scrollWidth <= innerWidth + 1;
      }));
    });
    await check(result, 'Zoom controls never cover the scrolling diagram', async () => {
      assert(await page.evaluate(() => {
        const tools = document.querySelector('.canvas-tools').getBoundingClientRect(), canvas = document.querySelector('#architecture-viewport').getBoundingClientRect();
        return tools.top >= canvas.bottom - 1;
      }));
    });
    await check(result, 'Reset does not claim that the browser reconnected', async () => {
      assert.doesNotMatch(await page.locator('#notice').innerText(), /^Reconnected:/);
    });
  }
  try {
    await api('/scenarios/2');
    await api('/commands', { type: 'PAUSE' });
    await api('/commands', { type: 'RESET' });
    await page.goto(base);
    await ready(() => window.kafkaLab?.ownsPlayback);
    await page.locator('#animation-buttons [data-speed="4"]').click();
    const resets = { name: 'Rapid resets between browser polls', checks: [] };
    report.results.push(resets);
    await check(resets, 'New epoch discards old event gaps without loading history or showing reconnect notice', async () => {
      const c = await api('/configuration', undefined, 'GET');
      let final;
      for (let i = 0; i < 3; i++) final = await api('/configuration', { configuration: c, reset: true }, 'PUT');
      await ready(epoch => window.kafkaLab.state.epoch === epoch, final.epoch);
      assert.doesNotMatch(await page.locator('#notice').innerText(), /^Reconnected:/);
      assert.equal(await page.evaluate(() => window.kafkaLab.visibleState.messageCount), 0);
    });
    for (let id = 1; id <= 10; id++) {
      const result = { name: 'Scenario ' + id, checks: [] };
      report.results.push(result);
      console.log('RUN ' + result.name);
      await choose(id);
      result.epoch = await page.evaluate(() => window.kafkaLab.state.epoch);
      await check(result, 'Scenario outcome reached', async () => {
        await ready(n => {
          const s = window.kafkaLab.state, cs = s.groups.flatMap(g => g.consumers);
          if (n === 6) return s.scenarioPhase === 3 && window.kafkaLab.playback.idle;
          if (n === 7) return s.scenarioPhase === 1 && s.messageCount >= 6 && cs.some(c => c.successes >= 3);
          if (n === 8) return s.messageCount >= 25;
          if (n === 10) return s.scenarioPhase === 1 && !s.groups[0].rebalancing && cs.length === 3 && cs.every(c => c.successes >= 1);
          return s.messageCount >= (n === 9 ? 8 : 6) && cs.some(c => c.successes >= 3);
        }, id);
      });
      await pause();
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => window.kafkaLab.state);
      // The live browser snapshot contains only events since its previous poll.
      s.events = (await api('/state?afterEventId=0', undefined, 'GET')).events;
      result.tick = s.tick; result.messages = s.messageCount;
      result.groups = s.groups.map(g => ({ id: g.id, lag: g.lag, consumers: g.consumers.map(c => ({ id: c.id, assignments: c.assignments, successes: c.successes, redeliveries: c.redeliveries, status: c.status })), offsets: g.offsets }));
      await shot('scenario-' + id + '-desktop');
      await check(result, 'Expected assignments and Kafka behavior', async () => {
        const cs = s.groups[0].consumers;
        if (id === 1) assert.deepEqual(cs.map(c => c.assignments.length), [1]);
        if (id === 2 || id === 9 || id === 10) assert.deepEqual(cs.map(c => c.assignments.length), [1, 1, 1]);
        if (id === 3) assert.deepEqual(cs.map(c => c.assignments.length), [1, 1, 1, 0, 0]);
        if (id === 4) assert.deepEqual(cs.map(c => c.assignments.length).sort(), [1, 2]);
        if (id === 5) {
          assert.equal(s.groups.length, 3);
          for (const g of s.groups) {
            assert.equal(g.consumers[0].assignments.length, 3);
            assert(g.consumers[0].successes >= 3);
            const delivered = new Set(s.events.filter(e => e.stage === 'DELIVERED' && e.groupId === g.id).map(e => e.messageId));
            for (const mid of ['M1', 'M2', 'M3']) assert(delivered.has(mid), g.id + ' missing ' + mid);
          }
        }
        if (id === 6) { assert(cs[0].redeliveries > 0); assert(cs[0].successes >= 2); assert.equal(s.running, false); assert.equal(s.groups[0].offsets[0].committedNext, null); }
        if (id === 7) {
          assert(s.brokers.some(b => !b.online));
          assert(s.groups.every(g => g.offsets.every(o => o.available)));
          const ack = s.events.find(e => e.stage === 'ACKNOWLEDGED');
          assert(ack);
          assert(s.brokers.filter(b => b.online).some(b => b.replicas.some(r => r.key === ack.partitionKey && r.messages.some(m => m.id === ack.messageId))));
        }
        if (id === 8) assert(s.groups[0].lag >= 20);
        if (id === 9) {
          const published = s.events.filter(e => e.stage === 'PRODUCED');
          assert.equal(new Set(published.map(e => e.partitionKey)).size, 1);
          assert.deepEqual(published.map(e => e.offset), Array.from({ length: published.length }, (_, i) => i));
        }
        for (const g of s.groups) {
          const owned = g.consumers.flatMap(c => c.assignments);
          assert.equal(new Set(owned).size, owned.length, 'Duplicate ownership in ' + g.id);
          for (const o of g.offsets) assert(o.committedNext === null || o.committedNext <= o.completedNext, 'Commit ahead of completed work');
        }
      });
      await check(result, 'Pause freezes ticks and packet positions', async () => {
        const before = await page.evaluate(() => [window.kafkaLab.state.tick, window.kafkaLab.playback.clock, [...document.querySelectorAll('.packet')].map(p => p.getAttribute('transform'))]);
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => [window.kafkaLab.state.tick, window.kafkaLab.playback.clock, [...document.querySelectorAll('.packet')].map(p => p.getAttribute('transform'))]);
        assert.deepEqual(after, before);
      });
      await check(result, 'Active scenario remains visible with hidden configuration', async () => { assert.match(await page.locator('#setup-summary').innerText(), new RegExp('^Scenario ' + id + ':')); });
      for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size); await page.waitForTimeout(180);
        await check(result, 'Controls clear the canvas at ' + size.width + 'px', async () => {
          assert(await page.evaluate(() => document.querySelector('.canvas-tools').getBoundingClientRect().top >= document.querySelector('#architecture-viewport').getBoundingClientRect().bottom - 1));
        });
        await shot('scenario-' + id + '-' + size.width);
        if (size.width === 390) {
          await page.locator('#architecture-viewport').evaluate(e => { e.scrollLeft = e.scrollWidth; });
          await shot('scenario-' + id + '-390-consumers');
          await page.locator('#architecture-viewport').evaluate(e => { e.scrollLeft = 0; });
        }
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(150);
      await inspect(result);
      result.stages = await page.evaluate(epoch => window.audit.packets.filter(p => p.epoch === epoch), result.epoch);
      console.log((result.checks.every(c => c.pass) ? 'PASS ' : 'FAIL ') + result.name + ' ' + result.messages + ' messages; ' + result.checks.filter(c => !c.pass).map(c => c.name).join(', '));
      fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2));
      if (report.errors.length) throw new Error('Browser/server blocker: ' + report.errors.join('; '));
    }
    // Mixed subscriptions, three producers, six consumers and three logical groups.
    const original = await api('/scenarios/2'); await api('/commands', { type: 'PAUSE' });
    const config = original.configuration;
    config.topics = [
      { id: 't1', name: 'execution-completed', partitions: 3, replicationFactor: 2 },
      { id: 't2', name: 'pdf-processing', partitions: 2, replicationFactor: 2 },
      { id: 't3', name: 'audit-events', partitions: 1, replicationFactor: 2 },
    ];
    config.producers = config.topics.map((t, i) => ({ id: 'p' + (i + 1), name: ['ExecutionService', 'PdfService', 'AuditService'][i], topicId: t.id, rate: 10, automatic: false, key: '', payload: t.name }));
    config.groups = ['results-group', 'reports-group', 'audit-group'];
    config.consumers = config.groups.flatMap((g, i) => [0, 1].map(j => ({ id: 'c' + (i * 2 + j + 1), name: g + '-' + (j + 1), groupId: g, topicIds: i === 2 ? ['t1', 't2', 't3'] : [j === 0 ? 't1' : 't2'], rate: 10 })));
    config.retentionLimit = 500;
    config.autoCommit = false;
    const custom = { name: 'Custom mixed subscriptions / three producers / six consumers', checks: [] };
    report.results.push(custom);
    custom.epoch = (await apply(config)).epoch;
    for (let i = 0; i < 4; i++) for (const p of config.producers) await page.locator('[data-node="producer:' + p.id + '"]').click();
    await ready(() => window.kafkaLab.state.messageCount === 12 && !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle, null, 120000);
    await check(custom, 'Every subscribed group independently receives all applicable messages', async () => {
      const s = await page.evaluate(() => window.kafkaLab.state);
      assert.equal(s.groups.find(g => g.id === 'results-group').consumers.reduce((n, c) => n + c.successes, 0), 8);
      assert.equal(s.groups.find(g => g.id === 'reports-group').consumers.reduce((n, c) => n + c.successes, 0), 8);
      assert.equal(s.groups.find(g => g.id === 'audit-group').consumers.reduce((n, c) => n + c.successes, 0), 12);
      for (const g of s.groups) for (const o of g.offsets) assert.equal(o.committedNext, null);
    });
    await shot('custom-mixed-desktop');
    await inspect(custom);
    console.log((custom.checks.every(c => c.pass) ? 'PASS ' : 'FAIL ') + custom.name);
    // A new consumer group gets its own offset namespace, even with the same instance ID.
    const lifecycle = { name: 'Live membership, independent commits and partition increase', checks: [] };
    report.results.push(lifecycle);
    await check(lifecycle, 'Manual commit affects only the selected group', async () => {
      await api('/commands', { type: 'COMMIT', targetId: 'c1' });
      const s = await api('/state?afterEventId=0', undefined, 'GET');
      assert(s.groups[0].offsets.some(o => o.committedNext > 0));
      assert(s.groups[1].offsets.every(o => o.committedNext === null));
      assert(s.groups[2].offsets.every(o => o.committedNext === null));
    });
    await check(lifecycle, 'Live rename and added partitions preserve retained messages', async () => {
      const before = await api('/state?afterEventId=0', undefined, 'GET');
      const live = structuredClone(before.configuration);
      live.topics[0].name = 'execution-renamed'; live.topics[0].partitions = 6;
      live.producers[0].name = 'RenamedExecutionService';
      const r = await api('/configuration', { configuration: live, reset: false, configRevision: before.configRevision }, 'PUT');
      await ready(rev => window.kafkaLab.state.configRevision === rev, r.configRevision);
      if (!(await page.locator('#step').isVisible())) await page.locator('#more-toggle').click();
      await page.locator('#step').click();
      await ready(() => window.kafkaLab.playback.idle && !window.kafkaLab.state.groups.some(g => g.rebalancing));
      const s = await api('/state?afterEventId=0', undefined, 'GET');
      assert.equal(s.messageCount, 12);
      assert.equal(s.groups[0].offsets.filter(o => o.key.startsWith('t1:')).length, 6);
      assert(s.brokers.flatMap(b => b.replicas).some(r => r.topicName === 'execution-renamed' && r.messages.some(m => m.id === 'M1')));
      assert((await page.locator('.producer-node').first().textContent()).includes('RenamedExecutionService'));
    });
    await check(lifecycle, 'Invalid and stale configuration cannot overwrite running state', async () => {
      const s = await api('/state?afterEventId=0', undefined, 'GET');
      const invalid = structuredClone(s.configuration); invalid.topics[0].replicationFactor = 5;
      const bad = await page.request.put(base + '/api/simulation/configuration', { data: { configuration: invalid, reset: false } });
      assert.equal(bad.status(), 400);
      const conflict = await page.request.put(base + '/api/simulation/configuration', { data: { configuration: s.configuration, reset: false, configRevision: s.configRevision - 1 } });
      assert.equal(conflict.status(), 409);
      const after = await api('/state?afterEventId=0', undefined, 'GET');
      assert.equal(after.configRevision, s.configRevision); assert.equal(after.messageCount, s.messageCount);
    });
    await shot('live-partition-increase');

    const small = (await api('/scenarios/1')).configuration;
    await api('/commands', { type: 'PAUSE' });
    small.producers[0].automatic = false; small.consumers[0].rate = 10;
    small.autoCommit = false; small.commitIntervalTicks = 600;
    const waiting = { name: 'Paused consumer, queued manual message and processing retry', checks: [] };
    report.results.push(waiting); waiting.epoch = (await apply(small)).epoch;
    await check(waiting, 'Paused consumer retains ownership; manual journey visibly waits', async () => {
      await api('/commands', { type: 'STEP' });
      await api('/commands', { type: 'CONSUMER_PAUSE', targetId: 'c1' });
      await page.locator('.producer-node').click();
      await ready(() => window.kafkaLab.state.manualFlow && !window.kafkaLab.state.canAdvance && window.kafkaLab.playback.idle);
      const s = await page.evaluate(() => window.kafkaLab.state);
      assert.equal(s.messageCount, 1); assert.equal(s.groups[0].consumers[0].successes, 0);
      assert.equal(s.groups[0].consumers[0].assignments.length, 1);
      assert.equal(s.manualStatus, 'Waiting for eligible consumer');
      await shot('waiting-for-paused-consumer');
      await api('/commands', { type: 'FAIL', targetId: 'c1' });
      await api('/commands', { type: 'CONSUMER_RESUME', targetId: 'c1' });
      await ready(() => !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle);
      const done = await api('/state?afterEventId=0', undefined, 'GET');
      assert.equal(done.groups[0].consumers[0].successes, 1);
      assert(done.events.some(e => e.stage === 'FAILED' && e.messageId === 'M1'));
      assert(done.events.some(e => e.stage === 'RETRY' && e.messageId === 'M1'));
      assert.equal(done.groups[0].offsets[0].committedNext, null);
    });
    await inspect(waiting);

    const durability = { name: 'Stale replica outage, blocked FIFO and safe recovery', checks: [] };
    report.results.push(durability);
    const rf2 = structuredClone(small); rf2.brokers.push({ id: 'b2', name: 'Broker-2' }); rf2.topics[0].replicationFactor = 2;
    durability.epoch = (await apply(rf2)).epoch;
    async function produceAndFinish(n) {
      await page.locator('.producer-node').click();
      await ready(count => window.kafkaLab.state.messageCount === count && !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle, n);
    }
    await check(durability, 'A stale follower cannot lead; acknowledged messages survive full outage', async () => {
      await produceAndFinish(1);
      await api('/commands', { type: 'BROKER_STOP', targetId: 'b2' }); await produceAndFinish(2);
      await api('/commands', { type: 'BROKER_STOP', targetId: 'b1' });
      await api('/commands', { type: 'COMMIT', targetId: 'c1' });
      let s = await api('/state?afterEventId=0', undefined, 'GET');
      assert(s.events.some(e => e.stage === 'COMMIT_FAILED')); assert.equal(s.groups[0].offsets[0].committedNext, null);
      await api('/commands', { type: 'BROKER_RESTART', targetId: 'b2' });
      await page.locator('.producer-node').click();
      await ready(() => window.kafkaLab.state.manualFlow && !window.kafkaLab.state.canAdvance && window.kafkaLab.playback.idle);
      s = await page.evaluate(() => window.kafkaLab.state);
      assert.equal(s.messageCount, 2); assert.equal(s.groups[0].offsets[0].available, false);
      assert.equal(s.producerQueues[0].messages[0].id, 'M3');
      await shot('stale-follower-unavailable');
      await api('/commands', { type: 'BROKER_RESTART', targetId: 'b1' });
      await ready(() => window.kafkaLab.state.messageCount === 3 && !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle);
      s = await page.evaluate(() => window.kafkaLab.state);
      for (const b of s.brokers) assert.deepEqual(b.replicas[0].messages.map(m => m.id), ['M1', 'M2', 'M3']);
      assert.equal(s.groups[0].consumers[0].successes, 3);
    });
    await inspect(durability);

    const retention = { name: 'Retention with slow consumer and live speed/view controls', checks: [] };
    report.results.push(retention);
    const retained = structuredClone(small); retained.producers[0].automatic = true; retained.producers[0].rate = 10; retained.consumers[0].rate = .25; retained.retentionLimit = 2;
    retention.epoch = (await apply(retained)).epoch;
    await check(retention, 'Retention bounds log length without renumbering offsets or claiming consumption', async () => {
      await page.locator('#playback').click(); await ready(() => window.kafkaLab.state.messageCount >= 8); await pause();
      const s = await api('/state?afterEventId=0', undefined, 'GET');
      const history = await api('/partitions/t1/0/history', undefined, 'GET');
      assert.equal(history.total, 2); assert.deepEqual(history.messages.map(m => m.offset), [s.messageCount - 2, s.messageCount - 1]);
      assert(s.groups[0].offsets[0].expiredBacklog >= 6); assert.equal(s.groups[0].consumers[0].successes, 0);
      assert(s.events.some(e => e.stage === 'RETENTION'));
    });
    await check(retention, 'Live rate controls and view toggles preserve engine state', async () => {
      await page.locator('#toggle-sidebar').click(); await page.locator('#custom-tab').click();
      await page.locator('#producer-speed').evaluate(e => { e.closest('details').open = true; e.value = '.25'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
      await ready(() => window.kafkaLab.state.configuration.producers[0].rate === .25);
      await page.locator('#consumer-speed').evaluate(e => { e.value = '10'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
      await ready(() => window.kafkaLab.state.configuration.consumers[0].rate === 10);
      const before = await page.evaluate(() => window.kafkaLab.state.messageCount);
      await page.locator('#show-commits').check(); await page.locator('#show-followers').uncheck(); await page.locator('#show-replication').uncheck();
      await page.locator('#close-sidebar').click();
      assert.equal(await page.evaluate(() => window.kafkaLab.state.messageCount), before);
      await page.locator('#playback').click(); await ready(() => window.kafkaLab.state.groups[0].consumers[0].successes >= 2); await pause();
      const s = await page.evaluate(() => window.kafkaLab.state); assert(s.messageCount <= before + 1);
      assert.equal(await page.locator('.replica').count(), 1);
      await shot('retention-live-speed');
    });
    await inspect(retention);
    await api('/scenarios/2'); await api('/commands', { type: 'PAUSE' }); await api('/commands', { type: 'RESET' });
  } catch (e) {
    report.errors.push(e.stack);
    await shot('blocker').catch(() => {});
    throw e;
  } finally {
    report.finished = new Date().toISOString();
    report.failedChecks = report.results.flatMap(r => r.checks.filter(c => !c.pass).map(c => ({ scenario: r.name, ...c })));
    await context.close();
    if (page.video()) report.video = 'video/' + require('node:path').basename(await page.video().path());
    await browser.close();
    fs.writeFileSync(out + '/report.json', JSON.stringify(report, null, 2));
    const checks = report.results.flatMap(r => r.checks);
    fs.writeFileSync(out + '/report.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kafka Visualizer browser audit</title>
      <style>body{font:15px system-ui;color:#19334b;background:#f6f8fa;max-width:1200px;margin:auto;padding:24px}h1{font-size:26px}summary{cursor:pointer;font-weight:600;padding:14px}details{background:white;border:1px solid #d9e0e6;border-radius:6px;margin:12px 0}ul{line-height:1.8}.pass{color:#27772d}.fail{color:#b52323}pre{white-space:pre-wrap;overflow-wrap:anywhere}figure{margin:16px}img{max-width:100%;max-height:600px;object-fit:contain;object-position:left}figcaption{font-size:13px}a{color:#0865c4}</style>
      <h1>Kafka Visualizer: functional and visual audit</h1><p>${escapeHtml(report.finished)} · Microsoft Edge · ${report.results.length} cases · ${checks.filter(c => c.pass).length}/${checks.length} checks passed · ${report.errors.length} runtime errors.</p>
      <p>Scenarios run at 4× animation speed; responsive snapshots at 1920×1080, 1366×768 and 390×844. Continuous DOM geometry and stage-boundary sampling supplement screenshot review.</p>
      <p><a href="report.json">Detailed JSON evidence</a>${report.video ? ` · <a href="${report.video}">Browser recording</a>` : ''}</p>
      ${report.results.map(r => { const n = /^Scenario (\d+)$/.exec(r.name)?.[1]; return `<details><summary class="${r.checks.every(c => c.pass) ? 'pass' : 'fail'}">${escapeHtml(r.name)} — ${r.checks.filter(c => c.pass).length}/${r.checks.length} passed${r.messages !== undefined ? ' · ' + r.messages + ' messages' : ''}</summary><ul>${r.checks.map(c => `<li class="${c.pass ? 'pass' : 'fail'}">${c.pass ? '✓' : '×'} ${escapeHtml(c.name)}${c.error ? '<pre>' + escapeHtml(c.error) + '</pre>' : ''}</li>`).join('')}</ul>${n ? ['desktop', '1366', '390', '390-consumers'].map(size => `<figure><a href="scenario-${n}-${size}.png"><img loading="lazy" src="scenario-${n}-${size}.png" alt="Scenario ${n}, ${size}"></a><figcaption>Scenario ${n} · ${size}</figcaption></figure>`).join('') : ''}</details>`; }).join('')}
      ${report.errors.length ? '<pre class="fail">' + escapeHtml(report.errors.join('\n')) + '</pre>' : ''}</html>`);
  }
  console.log('Audit: ' + report.results.length + ' cases, ' + report.failedChecks.length + ' failed checks. Evidence: ' + out);
  if (report.failedChecks.length || report.errors.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
