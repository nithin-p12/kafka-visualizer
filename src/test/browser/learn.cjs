const { chromium } = require(require('node:path').resolve('target/browser-tests/node_modules/playwright'));
const assert = require('node:assert/strict'), fs = require('node:fs');
const base = process.env.KAFKA_LAB_URL || 'http://127.0.0.1:8888', out = 'target/browser-tests/learn';
fs.mkdirSync(out, { recursive: true });
const LESSONS = ['record', 'topic', 'partition', 'offset', 'broker', 'cluster', 'replica', 'producer', 'consumer', 'group', 'commit-lag', 'retention'];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const ready = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout }).catch(async e => {
    const p = await page.evaluate(() => ({ lesson: window.kafkaLearn?.lesson, mode: window.kafkaLearn?.mode, i: window.kafkaLearn?.player.i, phase: window.kafkaLearn?.player.phase }));
    throw new Error(`${e.message} at ${JSON.stringify(p)}`);
  });
  const shot = name => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const fast = () => page.evaluate(() => window.kafkaLearn.player.setSpeed(12));
  try {
    await page.goto(base + '/learn.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#map-view').waitFor();
    assert.equal(await page.locator('a.card').count(), LESSONS.length);
    assert(await page.locator('.card.is-soon').count() > 10, 'planned lessons appear as coming soon');
    assert.match(await page.locator('.card.is-next').innerText(), /Record/);
    assert(await page.locator('#map-guide').isVisible(), 'map guide visible by default');
    await shot('map');

    for (const id of LESSONS) {
      await page.locator(`a.card[data-lesson="${id}"]`).click();
      await ready(id => window.kafkaLearn.lesson === id, id);
      assert(await page.locator('#guide-btn.selected').isVisible());
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, `${id}: lesson fits one screen`);
      await page.waitForTimeout(1400);
      await shot(`${id}-watch-start`);
      // Pause freezes the animation clock.
      await page.locator('#play').click();
      assert.match(await page.locator('#play').innerText(), /^▶ (Play|Start)$/);
      await page.locator('#play').click();
      // Seek to every step so each final frame can be reviewed.
      const steps = await page.evaluate(() => window.kafkaLearn.player.count);
      await fast();
      await page.locator('#play').click();
      for (let i = 0; i < steps; i++) {
        await page.locator(`#dots .dot[data-step="${i}"]`).click();
        // Paused, a step waits on its reading pause until it is started.
        await ready(i => window.kafkaLearn.player.i === i && window.kafkaLearn.player.phase === 'reading', i);
        await page.locator('#gc-go').click();
        await ready(i => window.kafkaLearn.player.i === i && window.kafkaLearn.player.phase === 'waiting', i);
        assert.equal(await page.locator('#step-count').textContent(), `Step ${i + 1} of ${steps}`);
        assert((await page.locator('#g-observe').textContent()).length > 5, `${id} step ${i} has an observe hint`);
        assert(await page.locator('#guide-card').isVisible(), `${id} step ${i} shows the guide card`);
        await shot(`${id}-watch-${i + 1}`);
      }
      assert.equal(await page.locator('#play').innerText(), '▶ Continue');
      await page.locator('#play').click();
      await ready(() => window.kafkaLearn.player.phase === 'done');
      assert(await page.locator('#recap').isVisible(), 'recap is the last slide');
      assert(await page.locator('#recap').evaluate(r => r.scrollHeight <= r.clientHeight + 1), `${id}: recap fits without scrolling`);
      assert(await page.locator('#go-try.up-next').isVisible(), 'after Watch, the recap suggests Try it');
      await shot(`${id}-recap`);
      assert(await page.evaluate(id => window.kafkaLearn.progress.done.includes(id), id));

      await page.locator('#go-try').click();
      assert.equal(await page.evaluate(() => window.kafkaLearn.mode), 'try');
      await fast();
      const actions = page.locator('#try-controls [data-action]');
      for (let round = 0; round < 2; round++) {
        for (let k = 0; k < await actions.count(); k++) {
          if (await actions.nth(k).isDisabled()) continue;
          await actions.nth(k).click();
          await ready(() => !window.kafkaLearn.tryState.busy);
        }
        const choices = page.locator('#try-controls [data-choice]');
        if (round === 0 && await choices.count()) await choices.nth(1).click();
      }
      assert((await page.locator('#try-readout').innerText()).length > 10);
      await shot(`${id}-try`);
      await page.locator('#try-recap').click();
      assert(await page.locator('#go-deeper.up-next').isVisible(), 'after Try it, the recap suggests Go deeper');
      await page.locator('#recap-close').click();
      assert.equal(await page.evaluate(() => window.kafkaLearn.mode), 'try', 'closing the recap returns to where you were');

      await page.locator('[data-mode="recap"]').click();
      await page.locator('#go-deeper').click();
      assert(await page.locator('#deeper-note').isVisible());
      await fast();
      await page.locator('#play').click();
      const deep = await page.evaluate(() => window.kafkaLearn.player.count);
      for (let i = 0; i < deep; i++) {
        await page.locator(`#dots .dot[data-step="${i}"]`).click();
        // Paused, a step waits on its reading pause until it is started.
        await ready(i => window.kafkaLearn.player.i === i && window.kafkaLearn.player.phase === 'reading', i);
        await page.locator('#gc-go').click();
        await ready(i => window.kafkaLearn.player.i === i && window.kafkaLearn.player.phase === 'waiting', i);
        await shot(`${id}-deeper-${i + 1}`);
      }
      await page.locator('#play').click();
      await ready(() => window.kafkaLearn.player.phase === 'done');

      assert(await page.locator('#go-next.up-next').isVisible(), 'after Go deeper, the recap suggests the next topic');
      await page.locator('#quiz-options button').first().click();
      assert(await page.locator('#quiz-why').isVisible());
      assert(await page.locator('#recap').evaluate(r => r.scrollHeight <= r.clientHeight + 1), `${id}: recap with answer fits without scrolling`);
      await page.locator('a.button[href="#/"]', { hasText: 'Map' }).click();
      await page.locator('#map-view').waitFor();
    }
    assert.equal(await page.locator('.card .badge.done').count(), LESSONS.length);

    // Guide toggle hides every guide surface and persists.
    await page.locator('#guide-toggle').uncheck();
    assert(!(await page.locator('#map-guide').isVisible()));
    await page.locator('a.card[data-lesson="partition"]').click();
    await ready(() => window.kafkaLearn.lesson === 'partition');
    assert(!(await page.locator('#guide-btn.selected').count()));
    await page.reload();
    await ready(() => window.kafkaLearn?.lesson === 'partition');
    assert(!(await page.locator('#guide-toggle').isChecked()));
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('.learn-ring').count(), 0, 'no spotlights when guide is off');
    assert(!(await page.locator('#guide-card .gc-watch').isVisible()), 'no "watch for" hints when guide is off');
    await page.locator('#guide-btn').click();
    assert(await page.locator('#guide-toggle').isChecked());

    // No top bar inside a lesson; full screen (which implies the focus layout) is the only view toggle.
    assert(!(await page.locator('.learn-bar').isVisible()), 'no top bar inside a lesson');
    assert(await page.locator('#full-btn').isVisible());
    assert.equal(await page.locator('#focus-btn').count(), 0);

    // Topic arrows jump straight to the neighbouring lessons.
    await page.locator('#next-lesson').click();
    await ready(() => window.kafkaLearn.lesson === 'offset');
    await page.locator('#prev-lesson').click();
    await ready(() => window.kafkaLearn.lesson === 'partition');
    await page.keyboard.press('Shift+ArrowLeft');
    await ready(() => window.kafkaLearn.lesson === 'topic');

    // Shortcuts work whatever has focus: Space after clicking Next pauses instead of pressing Next again.
    await page.locator('[data-mode="watch"]').click();
    await page.locator('#next-step').click();
    await ready(() => window.kafkaLearn.player.i === 1);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => [window.kafkaLearn.player.i, window.kafkaLearn.player.userPaused].join()), '1,true', 'Space after Next pauses');
    await page.keyboard.press('ArrowRight');
    await ready(() => window.kafkaLearn.player.i === 2);
    await page.keyboard.press('ArrowLeft');
    await ready(() => window.kafkaLearn.player.i === 1);

    // Mobile layout: no horizontal page scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll on mobile');
    await shot('mobile-lesson');
    await page.goto(base + '/learn.html#/');
    await shot('mobile-map');
    assert.match(await page.locator('#continue').innerText(), /Continue where you left off/);

    // Home links to both apps; the map links to the Visualizer; the Visualizer links to Learn.
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(base + '/');
    assert.equal(await page.locator('#home-learn').getAttribute('href'), '/learn.html');
    assert.equal(await page.locator('#home-visualize').getAttribute('href'), '/visualizer.html');
    await page.locator('#home-learn').click();
    await page.locator('#map-view').waitFor();
    assert.equal(await page.locator('#open-visualizer').getAttribute('href'), '/visualizer.html');
    await page.goto(base + '/visualizer.html');
    assert.equal(await page.locator('#learn-link').getAttribute('href'), '/learn.html');
    assert.deepEqual(errors, []);
    console.log('learn.cjs: all checks passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
