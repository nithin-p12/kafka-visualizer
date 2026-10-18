/* Real-browser regression for FIFO dispatch, visible stage boundaries and sustained traffic. */
const { chromium } = require(
  require("node:path").resolve("target/browser-tests/node_modules/playwright"),
);
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const base = process.env.KAFKA_LAB_URL || "http://localhost:8080",
  out = "target/browser-tests/screenshots";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('kafka-welcome-v1','done');
    localStorage.setItem('kafka-guide-enabled','false');
    localStorage.removeItem("kafka-view");
    window.travel = [];
    window.inPlaceCompleted = new Set();
    new MutationObserver((records) =>
      records.forEach((r) => {
        if (r.type === "attributes" && r.target.matches('.consumer-node .message-tile[data-status="processed"]'))
          window.inPlaceCompleted.add(r.target.dataset.message);
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n.matches('.consumer-node .message-tile[data-status="processed"]')) window.inPlaceCompleted.add(n.dataset.message);
          if (n.nodeType === 1 && n.matches(".packet"))
            window.travel.push({
              id: n.dataset.message,
              stage: n.dataset.stage,
            });
        });
      }),
    ).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-status"] });
  });
  async function api(path, data, method = "POST") {
    const r = await page.request.fetch(base + "/api/simulation" + path, {
      method,
      data,
    });
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  }
  async function ready(fn, arg) {
    await page.waitForFunction(fn, arg, { timeout: 60000 });
  }
  async function shot(name) {
    await page.screenshot({ path: out + "/" + name + ".png" });
    console.log("Verified " + name);
  }
  try {
    const preset = await api("/scenarios/1");
    await api("/commands", { type: "PAUSE" });
    const c = preset.configuration;
    c.producers[0].automatic = false;
    c.producers[0].rate = 10;
    c.consumers[0].rate = 10;
    c.retentionLimit = 500;
    c.commitIntervalTicks = 600;
    c.autoCommit = true;
    await api("/configuration", { configuration: c, reset: true }, "PUT");
    await page.goto(base);
    await ready(() => window.kafkaLab?.ownsPlayback);
    assert.match(
      await page.locator("#setup-summary").innerText(),
      /^Custom.*1 brokers.*1 topics.*1 partitions.*Manual/,
    );
    assert.equal(await page.locator(".queued-message").count(), 10);
    assert.equal(
      await page
        .locator(".queued-message")
        .first()
        .getAttribute("data-message"),
      "M1",
    );
    await page.locator('#animation-buttons [data-speed=".25"]').click();
    await page.locator(".producer-node").first().click();
    await ready(() =>
      document.querySelector(
        '.packet[data-stage="PRODUCED"][data-message="M1"]',
      ),
    );
    assert(
      await page.evaluate(
        () =>
          window.kafkaLab.state.messageCount === 1 &&
          window.kafkaLab.visibleState.brokers[0].replicas[0].messages
            .length === 0 &&
          !window.kafkaLab.visibleState.groups[0].consumers[0].processing,
      ),
    );
    assert.equal(
      await page
        .locator(".queued-message")
        .first()
        .getAttribute("data-message"),
      "M2",
    );
    await shot("fifo-departure-no-teleport");
    await ready(() =>
      document.querySelector(
        '.packet[data-stage="DELIVERED"][data-message="M1"]',
      ),
    );
    assert(
      await page.evaluate(
        () =>
          window.kafkaLab.visibleState.brokers[0].replicas[0].messages.some(
            (m) => m.id === "M1",
          ) &&
          !window.kafkaLab.visibleState.groups[0].consumers[0].processing &&
          window.kafkaLab.visibleState.groups[0].consumers[0].successes === 0,
      ),
    );
    assert(
      !(
        await page.locator(".consumer-node .record-number").allTextContents()
      ).includes("M1"),
    );
    await shot("consumer-before-arrival");
    await ready(
      () => !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle,
    );
    assert(
      await page.evaluate(
        () =>
          window.kafkaLab.visibleState.groups[0].consumers[0].successes === 1 &&
          !window.kafkaLab.state.running,
      ),
    );
    assert(
      (
        await page.locator(".consumer-node .record-number").allTextContents()
      ).includes("M1"),
    );
    assert.equal(
      await page.evaluate(
        () => window.kafkaLab.visibleState.groups[0].offsets[0].committedNext,
      ),
      null,
    );
    const next = await api("/configuration", undefined, "GET");
    next.producers[0].automatic = true;
    await api("/configuration", { configuration: next, reset: false }, "PUT");
    await ready(
      () => window.kafkaLab.state.configuration.producers[0].automatic,
    );
    await page.locator('#animation-buttons [data-speed="4"]').click();
    await page.locator("#playback").click();
    await ready(() => window.kafkaLab.state.messageCount >= 27);
    await page.locator("#playback").click();
    await ready(() => window.kafkaLab.state.playbackPaused);
    const frozen = await page.evaluate(() => ({
      tick: window.kafkaLab.state.tick,
      clock: window.kafkaLab.playback.clock,
    }));
    await page.waitForTimeout(300);
    assert.deepEqual(
      await page.evaluate(() => ({
        tick: window.kafkaLab.state.tick,
        clock: window.kafkaLab.playback.clock,
      })),
      frozen,
    );
    // A new manual request resumes/drains the paused batch and completes the requested journey.
    const manual = await api("/configuration", undefined, "GET");
    manual.producers[0].automatic = false;
    await api("/configuration", { configuration: manual, reset: false }, "PUT");
    await ready(
      () => !window.kafkaLab.state.configuration.producers[0].automatic,
    );
    await page.locator(".producer-node").first().click();
    await ready(
      () => !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle,
    );
    const observed = await page.evaluate(() => window.travel);
    for (let n = 1; n <= 28; n++)
      for (const stage of ["PRODUCED", "DELIVERED"])
        assert(
          observed.some((e) => e.id === "M" + n && e.stage === stage),
          "Every message must travel through " + stage + ": M" + n,
        );
    const completed = await page.evaluate(() => [...window.inPlaceCompleted]);
    for (let n = 1; n <= 28; n++) assert(completed.includes("M" + n), "Completion stays in place: M" + n);
    assert(!observed.some(e => e.stage === "PROCESSED"), "Completion must not create another traveling packet");
    assert(
      !(await page.locator(".packet text").allTextContents()).some((t) =>
        /[+×]\d/.test(t),
      ),
    );
    await shot("after-28-individual-journeys");
    const observer = await browser.newPage();
    await observer.goto(base);
    await observer.waitForFunction(() => window.kafkaLab?.state);
    assert.equal(
      await observer.evaluate(() => window.kafkaLab.ownsPlayback),
      false,
    );
    assert.equal(await page.evaluate(() => window.kafkaLab.ownsPlayback), true);
    await observer.close();
    await api("/commands", { type: "FAIL", targetId: "c1" });
    await page.locator(".producer-node").first().click();
    await ready(() => window.kafkaLab.state.messageCount === 29);
    await ready(
      () => !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle,
    );
    assert(
      await page.evaluate(
        () =>
          window.travel.some((e) => e.id === "M29" && e.stage === "FAILED") &&
          window.travel.some((e) => e.id === "M29" && e.stage === "RETRY"),
      ),
    );
    await api("/commands", { type: "BROKER_STOP", targetId: "b1" });
    await page.locator(".producer-node").first().click();
    await ready(
      () =>
        window.kafkaLab.state.manualFlow && !window.kafkaLab.state.canAdvance,
    );
    assert.equal(
      await page.evaluate(() => window.kafkaLab.state.messageCount),
      29,
    );
    assert.equal(
      await page
        .locator(".queued-message")
        .first()
        .getAttribute("data-message"),
      "M30",
    );
    await ready(() =>
      document.querySelector(".producer-node").textContent.includes("Waiting"),
    );
    await shot("blocked-head-retained");
    await api("/commands", { type: "BROKER_RESTART", targetId: "b1" });
    await ready(
      () => !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle,
    );
    assert.equal(
      await page.evaluate(() => window.kafkaLab.state.messageCount),
      30,
    );
    assert.equal(
      await page.evaluate(
        () => window.kafkaLab.visibleState.groups[0].consumers[0].successes,
      ),
      30,
    );
    await api("/scenarios/3");
    await ready(() => window.kafkaLab.state.scenarioId === 3);
    assert.match(
      await page.locator("#setup-summary").innerText(),
      /^Scenario 3:/,
    );
    await api("/commands", { type: "RESET" });
    await ready(() => window.kafkaLab.state.tick === 0);
    assert.match(
      await page.locator("#setup-summary").innerText(),
      /^Scenario 3:/,
    );
    const stepConfig = await api("/configuration", undefined, "GET");
    stepConfig.producers[0].automatic = false;
    stepConfig.consumers.forEach((c) => (c.rate = 10));
    await api(
      "/configuration",
      { configuration: stepConfig, reset: true },
      "PUT",
    );
    await ready(
      () =>
        window.kafkaLab.state.scenarioId === 0 &&
        window.kafkaLab.state.tick === 0,
    );
    await page.locator(".producer-node").first().click();
    await ready(() => document.querySelector('.packet[data-stage="PRODUCED"]'));
    await page.locator("#playback").click();
    await ready(() => window.kafkaLab.state.playbackPaused);
    const beforeStep = await page.evaluate(() => window.kafkaLab.state.tick);
    await page.locator("#more-toggle").click();
    assert(await page.locator("#step").isEnabled());
    await page.locator("#step").click();
    await ready(
      (t) =>
        window.kafkaLab.state.tick === t + 1 && window.kafkaLab.playback.idle,
      beforeStep,
    );
    assert.equal(
      await page.evaluate(() => window.kafkaLab.state.messageCount),
      1,
    );
    assert.equal(
      await page.evaluate(() => window.kafkaLab.state.running),
      false,
    );
    await shot("step-after-paused-packet");
    assert.deepEqual(errors, []);
    await api("/scenarios/2");
    await api("/commands", { type: "PAUSE" });
    await api("/commands", { type: "RESET" });
    console.log(
      "PASS: visible stage boundaries, FIFO queue, 30 individual journeys, manual completion, waiting/recovery, retry, ownership and active summary.",
    );
  } catch (e) {
    await page.screenshot({ path: out + "/flow-failure.png" }).catch(() => {});
    console.error(errors);
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
