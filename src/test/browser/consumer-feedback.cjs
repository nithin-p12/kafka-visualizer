/* Real Edge checks for assignment color transfer, in-place completion and consumer lag alerts. */
const { chromium } = require(require('node:path').resolve('target/browser-tests/node_modules/playwright'));
const assert = require('node:assert/strict'), fs = require('node:fs');
const base = process.env.KAFKA_LAB_URL || 'http://localhost:8080';
const out = 'target/browser-tests/consumer-feedback';
fs.mkdirSync(out, {recursive: true});
(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('kafka-welcome-v1', 'done');
    localStorage.setItem('kafka-guide-enabled', 'true');
    localStorage.removeItem('kafka-view');
    window.movingStages = [];
    new MutationObserver(rs => rs.forEach(r => r.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.matches('.packet')) window.movingStages.push(n.dataset.stage);
    }))).observe(document, {subtree: true, childList: true});
  });
  const ready = (fn, arg) => page.waitForFunction(fn, arg, {timeout: 90000});
  async function api(path, data, method = 'POST') {
    const r = await page.request.fetch(base + '/api/simulation' + path, {method, data});
    assert.equal(r.status(), 200, await r.text()); return r.json();
  }
  const shot = name => page.screenshot({path: out + '/' + name + '.png'});
  try {
    await api('/scenarios/2'); await api('/commands', {type:'PAUSE'}); await api('/commands', {type:'RESET'});
    await page.goto(base + '/visualizer.html'); await ready(() => window.kafkaLab?.ownsPlayback);
    assert(await page.evaluate(() => performance.getEntriesByType('resource').filter(e => new URL(e.name).pathname.endsWith('.js')).every(e => new URL(e.name).searchParams.get('v') === '20261018-2')), 'Every frontend module uses the same fresh asset version');
    await page.locator('#animation-buttons [data-speed=".5"]').click();
    await api('/scenarios/4', {guided:true});
    await ready(() => document.querySelector('.packet[data-stage="ASSIGNMENT"][data-destination="consumer:c1"]'));
    assert.deepEqual(await page.evaluate(() => window.kafkaLab.visibleState.groups[0].consumers[0].assignments), []);
    const packetColor = await page.locator('.packet[data-stage="ASSIGNMENT"][data-destination="consumer:c1"] rect').first().getAttribute('fill');
    assert.equal(packetColor.toLowerCase(), '#5bb12f');
    await page.locator('#playback').click(); await ready(() => window.kafkaLab.state.playbackPaused);
    const clock = await page.evaluate(() => window.kafkaLab.playback.clock);
    await page.waitForTimeout(200); assert.equal(await page.evaluate(() => window.kafkaLab.playback.clock), clock);
    await page.locator('#playback').click();
    await ready(() => window.kafkaLab.visibleState.groups[0].consumers[0].assignments.length === 1);
    assert.equal((await page.locator('[id="consumer:c1"] circle.focus-ring').getAttribute('fill')).toLowerCase(), '#5bb12f');
    await shot('first-assignment-solid');
    await ready(() => window.kafkaLab.guidance.checkpoint === 'initial-assignment');
    const slices = await page.locator('[id="consumer:c1"] > path[fill]').evaluateAll(es => es.map(e => ({fill:e.getAttribute('fill'),d:e.getAttribute('d')})));
    assert.equal(slices.length, 2);
    assert.deepEqual(slices.map(s => s.fill.toLowerCase()), ['#5bb12f', '#73c5e1']);
    assert(slices.every(s => /A19 19 0 0 1/.test(s.d)), 'Two equal semicircles show 50/50 ownership');
    assert.equal(await page.evaluate(() => window.kafkaLab.state.messageCount), 0);
    await shot('second-assignment-half-and-half');
    const primaryColors = await page.locator('button.primary,button.selected').evaluateAll(es => es.map(e => getComputedStyle(e).backgroundColor));
    assert(primaryColors.every(c => c === 'rgb(22, 119, 255)'));
    assert.equal(await page.locator('#scenario-guide-continue').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(22, 119, 255)');
    assert.equal(await page.locator('#scenario-guide-label').evaluate(e => getComputedStyle(e).color), 'rgb(157, 76, 204)', 'Guide accents remain purple');

    const preset = await api('/scenarios/1'); await api('/commands', {type:'PAUSE'});
    const c = preset.configuration;
    c.producers[0].automatic = false; c.consumers[0].rate = 10; c.commitIntervalTicks = 600;
    const reset = await api('/configuration', {configuration:c, reset:true}, 'PUT');
    await ready(epoch => window.kafkaLab.state.epoch === epoch && window.kafkaLab.playback.idle, reset.epoch);
    await page.locator('#animation-buttons [data-speed=".25"]').click();
    await page.locator('.producer-node').click();
    await ready(() => document.querySelector('.consumer-node .message-tile[data-message="M1"][data-status="processing"]'));
    const tileGeometry = () => page.locator('.consumer-node .message-tile[data-message="M1"] rect').evaluate(e => ['x','y','width','height'].map(k => e.getAttribute(k)));
    const before = await tileGeometry();
    const tile = await page.locator('.consumer-node .message-tile[data-message="M1"]').elementHandle();
    const tileRect = await page.locator('.consumer-node .message-tile[data-message="M1"] rect').elementHandle();
    await page.evaluate(() => {
      window.trackedTile = document.querySelector('.consumer-node .message-tile[data-message="M1"]');
      window.tileContinuity = [];
      window.tileRemovals = 0;
      new MutationObserver(records => {
        window.tileContinuity.push(window.trackedTile.isConnected);
        for (const r of records) for (const n of r.removedNodes)
          if (n === window.trackedTile || n.contains?.(window.trackedTile)) window.tileRemovals++;
      })
        .observe(window.trackedTile.parentNode, {subtree:true,childList:true,attributes:true});
    });
    await shot('processing-in-place');
    await ready(() => document.querySelector('.consumer-node .message-tile[data-message="M1"][data-status="processed"]'));
    const after = await tileGeometry();
    assert.deepEqual(after, before, 'Completion keeps exactly the same tile coordinates');
    assert(await tile.evaluate(e => e.isConnected && e.dataset.status === 'processed'), 'The delivered tile stays mounted until completion');
    assert(await tileRect.evaluate(e => e.isConnected), 'Processing never replaces the message rectangle');
    assert(await page.evaluate(() => window.tileContinuity.length > 0 && window.tileContinuity.every(Boolean)), 'The tile is never removed during processing');
    assert.equal(await page.evaluate(() => window.tileRemovals), 0, 'Completion updates the existing tile without removing or re-inserting it');
    assert.equal(await page.locator('.consumer-node .message-tile[data-message="M1"] .processed-check').count(), 0);
    await ready(() => document.querySelector('#guide-overlay .guide-ring.success'));
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#guide-overlay .guide-ring.success').count(), 0, 'Green feedback is a brief blink');
    assert(!(await page.evaluate(() => window.movingStages)).includes('PROCESSED'));
    assert.equal(await page.locator('.consumer-node .message-tile[data-message="M1"]').count(), 1);
    await shot('processed-same-position');
    const fallback = await page.evaluate(async () => {
      const {Diagram} = await import('/diagram.js?v=20261018-2');
      const renderer = new Diagram(document.getElementById('architecture'), document.getElementById('architecture-viewport'));
      const state = window.kafkaLab.visibleState;
      state.groups[0].consumers[0].lag = undefined;
      renderer.update(state, {topic:'',group:'',followers:true,commits:false}, new Map(), null, null);
      return {text:document.querySelector('.consumer-lag').textContent, value:document.querySelector('.consumer-node').dataset.lag};
    });
    assert.deepEqual(fallback, {text:'1',value:'1'}, 'Missing lag is derived from owned partition offsets without undefined or a prefix');

    // Alerts are operational feedback, independent of optional scenario coaching.
    await page.locator('#more-toggle').click(); await page.locator('#guidance-enabled').uncheck();
    await page.locator('#more-toggle').click();
    await page.locator('#animation-buttons [data-speed="4"]').click();
    await api('/scenarios/8');
    await ready(() => document.querySelector('.consumer-node[data-lag="10"]'));
    assert.equal(await page.locator('#guide-overlay .lag-alert').count(), 0, 'No alert below the 20-record threshold');
    await ready(() => document.querySelector('#guide-overlay .lag-alert'));
    const lag = await page.locator('.consumer-node .consumer-lag').textContent();
    assert.match(lag, /^\d+$/, 'Lag shows only a valid number');
    assert(Number(lag) >= 20);
    assert.equal(await page.locator('.consumer-lag').first().evaluate(e => getComputedStyle(e).fill), 'rgb(206, 52, 52)');
    assert.equal(await page.evaluate(() => window.kafkaLab.guidance.enabled), false);
    await page.locator('#playback').click(); await ready(() => window.kafkaLab.state.playbackPaused);
    await shot('lag-threshold-red-alert');
    const redRing = await page.locator('#guide-overlay .lag-alert').elementHandle();
    await page.waitForTimeout(200);
    assert(await redRing.evaluate(e => e.isConnected), 'Pulsing updates the existing outline');
    const reduced = await browser.newPage({reducedMotion:'reduce'});
    await reduced.addInitScript(() => {localStorage.setItem('kafka-welcome-v1','done');localStorage.setItem('kafka-guide-enabled','false');});
    await reduced.goto(base + '/visualizer.html'); await reduced.waitForSelector('#guide-overlay .lag-alert');
    const opacity = await reduced.locator('#guide-overlay .lag-alert').evaluate(e => e.style.opacity);
    await reduced.waitForTimeout(250);
    assert.equal(await reduced.locator('#guide-overlay .lag-alert').evaluate(e => e.style.opacity), opacity, 'Reduced motion keeps the alert steady before its final fade');
    await reduced.close();
    await page.waitForTimeout(4500);
    assert.equal(await page.locator('#guide-overlay .lag-alert').count(), 0);
    assert.equal(await page.locator('.consumer-lag').textContent(), lag, 'Lag count stays visible after the box fades');
    await page.setViewportSize({width:1366,height:768}); await shot('lag-laptop');
    await page.setViewportSize({width:390,height:844});
    await page.locator('.consumer-node').scrollIntoViewIfNeeded(); await shot('lag-mobile');
    assert.deepEqual(errors, []);
    await api('/scenarios/2'); await api('/commands', {type:'PAUSE'}); await api('/commands', {type:'RESET'});
    fs.writeFileSync(out + '/result.json', JSON.stringify({passed:true, checks:['serial assignment color transfer','50/50 ownership','pause during assignment','blue controls and purple guide accents','in-place completion','short success blink','no completion packet','lag threshold and red count with guides off','lag alert fade','desktop/laptop/mobile'],errors},null,2));
    console.log('PASS: assignment color transfer, in-place completion, blue controls, short success blink, lag threshold/count/fade and responsive screenshots.');
  } catch(e) { await shot('failure').catch(()=>{}); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
