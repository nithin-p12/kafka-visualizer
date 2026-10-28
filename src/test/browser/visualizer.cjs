/* Start Spring Boot first. Development-only Edge/Playwright checks. */
const { chromium } = require(
  require("node:path").resolve("target/browser-tests/node_modules/playwright"),
);
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const out = "target/browser-tests/screenshots",
  base = process.env.KAFKA_LAB_URL || "http://localhost:8080";
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("409"))
      errors.push(m.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('kafka-welcome-v1','done');
    localStorage.setItem('kafka-guide-enabled','false');
    localStorage.removeItem("kafka-view");
    window.observedStages = new Set();
    window.completedInPlace = false;
    document.addEventListener("DOMContentLoaded", () =>
      new MutationObserver((records) =>
        records.forEach((r) => {
          if (r.type === "attributes" && r.target.matches('.consumer-node .message-tile[data-status="processed"]'))
            window.completedInPlace = true;
          r.addedNodes.forEach((n) => {
            if (n.nodeType === 1 && n.matches('.consumer-node .message-tile[data-status="processed"]')) window.completedInPlace = true;
            if (n.nodeType === 1 && n.matches(".packet"))
              window.observedStages.add(n.dataset.stage);
          });
        }),
      ).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-status"] }),
    );
  });
  async function req(path, data, method = "POST") {
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
  async function screenshot(name) {
    await page.screenshot({ path: out + "/" + name + ".png", fullPage: true });
  }
  async function labelsClear() {
    const conflicts = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("#diagram-nodes text")]
        .map((e) => ({ text: e.textContent, r: e.getBoundingClientRect() }))
        .filter((e) => e.r.width && e.r.height);
      const conflicts = [];
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i],
            b = labels[j];
          if (
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 2 &&
            Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 2
          )
            conflicts.push([a.text, b.text]);
        }
      return conflicts;
    });
    assert.deepEqual(conflicts, [], "Component labels overlap");
  }
  async function nodeAction(selector, type) {
    await page
      .locator(selector === ".broker" ? ".broker .power-button" : selector)
      .first()
      .click();
    await page
      .locator('#component-actions [data-command="' + type + '"]')
      .click();
  }
  async function openConfig() {
    if (!(await page.locator("#sidebar").isVisible()))
      await page.locator("#toggle-sidebar").click();
    await page.locator("#custom-tab").click();
  }
  async function activateField(selector) {
    await page
      .locator(selector)
      .first()
      .evaluate((el) => {
        el.closest("details").open = true;
      });
    return page.locator(selector).first();
  }
  try {
    await req("/scenarios/2");
    await req("/commands", { type: "PAUSE" });
    await req("/commands", { type: "RESET" });
    await page.goto(base + '/visualizer.html');
    // A previous suite/tab may own the ten-second lease until it expires.
    // Start interactions only after this browser can actually advance ticks.
    await ready(() => window.kafkaLab?.state && window.kafkaLab.ownsPlayback);
    assert.equal(
      await page.locator("#toggle-descriptions, #descriptions").count(),
      0,
    );
    assert.equal(await page.locator("#sidebar").isVisible(), false);
    assert.equal(await page.locator("#bottom-panel").isVisible(), false);
    assert.equal(
      await page.locator("#custom-tab").getAttribute("aria-selected"),
      "true",
    );
    assert.equal(
      await page.locator(".connection").count(),
      0,
      "Idle diagram has no permanent wire mesh",
    );
    assert(
      await page.evaluate(
        () =>
          document
            .querySelector("#architecture-viewport")
            .getBoundingClientRect().height >=
          innerHeight * 0.9,
      ),
    );
    await labelsClear();
    await screenshot("horizontal-default");
    const beforeWidth = await page
      .locator("#architecture-viewport")
      .evaluate((e) => e.clientWidth);
    await openConfig();
    assert(
      (await page
        .locator("#architecture-viewport")
        .evaluate((e) => e.clientWidth)) < beforeWidth,
    );
    await page.locator("#scenarios-tab").click();
    assert.equal(await page.locator("#scenario-select").isVisible(), true);
    await page.locator("#custom-tab").click();
    assert.equal(await page.locator("#scenario-select").isVisible(), false);
    await screenshot("configuration-custom");
    await page.locator("#close-sidebar").click();
    const config = await (
      await page.request.get(base + "/api/simulation/configuration")
    ).json();
    config.groups = ["results-group", "reports-group", "audit-group"];
    config.consumers = Array.from({ length: 6 }, (_, i) => ({
      id: "c" + (i + 1),
      name:
        ["Results", "Reports", "Audit"][Math.floor(i / 2)] +
        "Service-" +
        ((i % 2) + 1),
      groupId: config.groups[Math.floor(i / 2)],
      topicIds: ["t1"],
      rate: 2,
    }));
    config.producers[0].rate = 2;
    const configured = await req(
      "/configuration",
      { configuration: config, reset: true },
      "PUT",
    );
    await ready(
      (rev) => window.kafkaLab.state.configRevision === rev,
      configured.configRevision,
    );
    await page.locator("#more-toggle").click();
    await page.locator("#step").click();
    await ready(() => window.kafkaLab.state.tick === 1);
    await ready(() => window.kafkaLab.playback.idle);
    assert.equal(await page.locator(".broker").count(), 3);
    assert.equal(await page.locator(".replica").count(), 6);
    assert.equal(await page.locator(".group-box").count(), 3);
    assert.equal(await page.locator(".consumer-node").count(), 6);
    assert(
      await page.evaluate(
        () =>
          window.kafkaLab.layout.height <=
          document.querySelector("#architecture-viewport").clientHeight + 1,
      ),
    );
    await labelsClear();
    await screenshot("horizontal-three-groups");
    await openConfig();
    await page.locator("#show-commits").check();
    await page.locator("#close-sidebar").click();
    await page.locator('#animation-buttons [data-speed="2"]').click();
    await page.locator("#playback").click();
    await ready(() => window.kafkaLab.state.running);
    await ready(() =>
      window.completedInPlace && ["PRODUCED", "REPLICATED", "DELIVERED", "COMMITTED"].every(
        (s) => window.observedStages.has(s),
      ),
    );
    await labelsClear();
    await screenshot("horizontal-flow");
    const packetCheck = await page.evaluate(() =>
      [...document.querySelectorAll(".packet")]
        .filter((e) => getComputedStyle(e).visibility !== "hidden")
        .every(
          (e) =>
            Number(e.querySelector("rect").getAttribute("width")) >= 60 &&
            Number.parseFloat(
              getComputedStyle(e.querySelector("text")).fontSize,
            ) >= 13,
        ),
    );
    assert(packetCheck, "Packets must be large, with readable labels");
    await page.locator("#playback").click();
    await ready(() => !window.kafkaLab.state.running);
    const paused = await page.evaluate(() => ({
      tick: window.kafkaLab.state.tick,
      clock: window.kafkaLab.playback.clock,
      transforms: [...document.querySelectorAll(".packet")].map((n) =>
        n.getAttribute("transform"),
      ),
    }));
    await page.waitForTimeout(400);
    assert.deepEqual(
      await page.evaluate(() => ({
        tick: window.kafkaLab.state.tick,
        clock: window.kafkaLab.playback.clock,
        transforms: [...document.querySelectorAll(".packet")].map((n) =>
          n.getAttribute("transform"),
        ),
      })),
      paused,
    );
    await page.locator("#focus").click();
    assert.equal(await page.locator("#toolbar").isVisible(), false);
    assert.equal(await page.locator(".canvas-tools").isVisible(), false);
    assert.equal(
      await page
        .locator("#architecture-viewport")
        .evaluate((e) => e.clientHeight),
      1080,
    );
    await screenshot("focus-view");
    await page.keyboard.press("Space");
    await ready(() => window.kafkaLab.state.running);
    await page.keyboard.press("Space");
    await ready(() => !window.kafkaLab.state.running);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#toolbar").isVisible(), true);
    await page.locator(".replica.is-leader").first().click();
    await page.locator("#inspector-history table").waitFor();
    await screenshot("partition-inspection");
    await page.locator("#close-inspector").click();
    await openConfig();
    await page.locator("#manual-mode").click();
    await page.locator('#animation-buttons [data-speed="4"]').click();
    await ready(() =>
      window.kafkaLab.state.configuration.producers.every((p) => !p.automatic),
    );
    await page.locator("#message-key").fill("execution-42");
    await page.locator("#message-payload").fill("PDF completed");
    const count = await page.evaluate(() => window.kafkaLab.state.messageCount);
    await page.locator("#produce").click();
    await ready((n) => window.kafkaLab.state.messageCount === n + 1, count);
    await page.locator("#close-sidebar").click();
    const producer = await page.evaluate(
      () => window.kafkaLab.state.configuration.producers[0],
    );
    for (let i = 0; i < 3; i++) {
      await page.locator(".producer-node").first().click();
      await ready(
        (n) => window.kafkaLab.state.messageCount === n,
        count + 2 + i,
      );
      assert.equal(await page.locator("dialog[open]").count(), 0);
    }
    const templateMessages = await page.evaluate(
      (id) =>
        window.kafkaLab.state.brokers
          .flatMap((b) => b.replicas.flatMap((r) => r.messages))
          .filter((m) => m.producerId === id)
          .sort((a, b) => b.tick - a.tick || b.offset - a.offset),
      producer.id,
    );
    assert(
      templateMessages.filter(
        (m) => m.key === producer.key && m.payload === producer.payload,
      ).length >= 3,
    );
    await page.locator("#focus").click();
    await page.locator(".producer-node").first().focus();
    await page.keyboard.press("Enter");
    await ready((n) => window.kafkaLab.state.messageCount === n, count + 5);
    await page.keyboard.press("Space");
    await ready((n) => window.kafkaLab.state.messageCount === n, count + 6);
    assert.equal(
      await page.evaluate(() => window.kafkaLab.state.running),
      false,
    );
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await screenshot("manual-one-click");
    await page.keyboard.press("Escape");
    await page.locator("#quick-produce").click();
    await ready((n) => window.kafkaLab.state.messageCount === n, count + 7);
    assert(
      await page.evaluate(() =>
        window.kafkaLab.state.brokers.some((b) =>
          b.replicas.some((r) =>
            r.messages.some(
              (m) => m.key === "execution-42" && m.payload === "PDF completed",
            ),
          ),
        ),
      ),
    );
    await ready(
      () => !window.kafkaLab.state.manualFlow && window.kafkaLab.playback.idle,
    );
    await openConfig();
    await page.locator("#auto-mode").click();
    await ready(() =>
      window.kafkaLab.state.configuration.producers.every((p) => p.automatic),
    );
    const topicInput = await activateField(
      '[data-key="topics"][data-field="name"]',
    );
    await topicInput.fill("pdf-processing");
    const nameInput = await activateField(
      '[data-key="consumers"][data-field="name"]',
    );
    await nameInput.fill("ResultsService-1 <safe>");
    await page.locator("#apply").click();
    await ready(
      () =>
        window.kafkaLab.state.configuration.topics[0].name === "pdf-processing",
    );
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#save-config").click();
    const download = await downloadPromise;
    await download.saveAs("target/browser-tests/configuration.json");
    const imported = JSON.parse(
      fs.readFileSync("target/browser-tests/configuration.json", "utf8"),
    );
    assert.equal(imported.topics[0].name, "pdf-processing");
    imported.producers[0].name = "ImportedExecutionService";
    await page.locator("#config-file").setInputFiles({
      name: "configuration.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(imported)),
    });
    assert(
      await page.evaluate(
        () =>
          window.kafkaLab.state.configuration.producers[0].name ===
          "ExecutionService",
      ),
    );
    await page.locator("#apply").click();
    await ready(
      () =>
        window.kafkaLab.state.configuration.producers[0].name ===
        "ImportedExecutionService",
    );
    await page.locator("#close-sidebar").click();
    await labelsClear();
    await page.locator('#animation-buttons [data-speed="4"]').click();
    await page.locator("#playback").click();
    await nodeAction(".consumer-node", "FAIL");
    await ready(() => window.observedStages.has("RETRY"));
    await nodeAction(".broker", "BROKER_STOP");
    await ready(() => window.kafkaLab.state.brokers.some((b) => !b.online));
    assert(
      await page.evaluate(() =>
        window.kafkaLab.state.groups.every((g) =>
          g.offsets.every((o) => o.available),
        ),
      ),
    );
    await nodeAction(".broker", "BROKER_RESTART");
    await ready(() => window.kafkaLab.state.brokers.every((b) => b.online));
    await nodeAction(".consumer-node", "CONSUMER_STOP");
    await ready(() => !window.kafkaLab.state.groups[0].consumers[0].online);
    await nodeAction(".consumer-node", "CONSUMER_RESTART");
    await ready(() => window.kafkaLab.state.groups[0].consumers[0].online);
    await page.locator("#playback").click();
    await ready(() => !window.kafkaLab.state.running);
    await page.locator("#more-toggle").click();
    await page.locator("#toggle-diagnostics").click();
    assert.equal(await page.locator("#bottom-panel").isVisible(), true);
    await page.locator('[data-tab="offsets"]').click();
    assert(
      (await page.locator("#panel-content").innerText()).includes(
        "Committed next",
      ),
    );
    await page.locator("#close-diagnostics").click();
    // Long names are measured, wrapped or ellipsized without touching other labels.
    const long = structuredClone(imported);
    long.consumers[0].name = "W".repeat(80);
    long.brokers[0].name = "Long Broker " + "W".repeat(60);
    long.topics[0].name = "W".repeat(80);
    const longResult = await req(
      "/configuration",
      { configuration: long, reset: false },
      "PUT",
    );
    await ready(
      (r) => window.kafkaLab.state.configRevision === r,
      longResult.configRevision,
    );
    await labelsClear();
    await screenshot("long-labels");
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(200);
    await labelsClear();
    await screenshot("laptop");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    assert(
      await page.evaluate(() =>
        [...document.querySelectorAll(".toolbar button")]
          .filter((e) => e.getClientRects().length && !e.closest(".more-menu"))
          .every((e) => {
            const r = e.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth;
          }),
      ),
      "Every visible mobile toolbar button must fit the viewport",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert(
      await page.evaluate(
        () =>
          window.kafkaLab.layout.producers[0].cx <
            window.kafkaLab.layout.brokers[0].x &&
          window.kafkaLab.layout.brokers[0].x <
            window.kafkaLab.layout.groups[0].cx,
      ),
    );
    await page
      .locator("#architecture-viewport")
      .evaluate((e) => (e.scrollLeft = 900));
    await screenshot("mobile-horizontal");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openConfig();
    await page.locator("#scenarios-tab").click();
    await page.selectOption("#scenario-select", "6");
    await page.locator("#run-scenario").click();
    await page.locator('#learning-continue').click();
    await ready(() => window.kafkaLab.state.scenarioPhase === 3);
    assert(
      await page.evaluate(
        () => window.kafkaLab.state.groups[0].consumers[0].redeliveries > 0,
      ),
    );
    await openConfig();
    await page.locator("#scenarios-tab").click();
    await page.selectOption("#scenario-select", "10");
    await page.locator("#run-scenario").click();
    await page.locator('#learning-continue').click();
    await ready(
      () => window.kafkaLab.state.configuration.consumers.length === 3,
    );
    await page.locator("#playback").click();
    await ready(() => !window.kafkaLab.state.running);
    // Maximum topology, high production, slow animation: bounded queues and no label collisions.
    const max = await (
      await page.request.get(base + "/api/simulation/configuration")
    ).json();
    max.brokers = Array.from({ length: 5 }, (_, i) => ({
      id: "b" + (i + 1),
      name: "Broker-" + (i + 1),
    }));
    max.topics = Array.from({ length: 3 }, (_, i) => ({
      id: "t" + (i + 1),
      name: "topic-" + (i + 1),
      partitions: 10,
      replicationFactor: 5,
    }));
    max.producers = Array.from({ length: 3 }, (_, i) => ({
      id: "p" + (i + 1),
      name: "Producer-" + (i + 1),
      topicId: "t" + (i + 1),
      rate: 10,
      automatic: true,
      key: "",
      payload: "maximum topology",
    }));
    max.groups = Array.from({ length: 10 }, (_, i) => "group-" + i);
    max.consumers = Array.from({ length: 10 }, (_, i) => ({
      id: "c" + i,
      name: "Consumer-" + i,
      groupId: max.groups[i],
      topicIds: max.topics.map((t) => t.id),
      rate: 0.25,
    }));
    const maxResult = await req(
      "/configuration",
      { configuration: max, reset: true },
      "PUT",
    );
    await ready(
      (r) => window.kafkaLab.state.configRevision === r,
      maxResult.configRevision,
    );
    assert.equal(await page.locator(".replica").count(), 150);
    await openConfig();
    await page.selectOption("#topic-filter", "t2");
    await page.selectOption("#group-filter", "group-0");
    await page.locator("#close-sidebar").click();
    assert.equal(await page.locator(".replica").count(), 50);
    assert.equal(await page.locator(".group-box").count(), 1);
    await labelsClear();
    await page.locator('#animation-buttons [data-speed=".25"]').click();
    await page.locator("#playback").click();
    await ready(() => window.kafkaLab.state.tick >= 1);
    await ready(() => window.kafkaLab.playback.active > 0);
    assert(
      await page.evaluate(
        () =>
          window.kafkaLab.playback.queue <= 250 &&
          window.kafkaLab.playback.active <= 8,
      ),
    );
    const collisions = await page.evaluate(() => {
      const packets = [...document.querySelectorAll(".packet")]
        .filter((e) => getComputedStyle(e).visibility !== "hidden")
        .map((e) => e.getBoundingClientRect());
      return packets.some((a, i) =>
        packets
          .slice(i + 1)
          .some(
            (b) =>
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2,
          ),
      );
    });
    assert.equal(collisions, false, "Visible moving packet labels overlap");
    await screenshot("maximum-filtered");
    await page.locator("#playback").click();
    await ready(() => !window.kafkaLab.state.running);
    // Screenshot regression: Broker-2's lower P1 approaches its owner from below.
    const defaults = await req("/scenarios/2");
    await req("/commands", { type: "PAUSE" });
    const lowerConfig = defaults.configuration;
    lowerConfig.brokers = lowerConfig.brokers.slice(0, 2);
    lowerConfig.topics[0].replicationFactor = 1;
    lowerConfig.consumers = lowerConfig.consumers.slice(0, 2);
    lowerConfig.producers.forEach((p) => (p.automatic = false));
    await req(
      "/configuration",
      { configuration: lowerConfig, reset: true },
      "PUT",
    );
    await page.reload();
    await ready(() => window.kafkaLab?.layout?.brokers.length === 2);
    await page.locator('#animation-buttons [data-speed=".5"]').click();
    await page.locator(".producer-node").first().click();
    await ready(() => window.kafkaLab.state.messageCount === 1);
    await page.locator(".producer-node").first().click();
    await ready(() => window.kafkaLab.state.messageCount === 2);
    await ready(() => window.kafkaLab.state.messageCount === 2);
    await ready(() =>
      [
        ...document.querySelectorAll('.packet[data-stage="DELIVERED"] title'),
      ].some((e) => e.textContent.includes("M2")),
    );
    const lowerState = await req("/state?afterEventId=0", undefined, "GET");
    const delivery = lowerState.events.find(
      (e) => e.stage === "DELIVERED" && e.messageId === "M2",
    );
    assert(delivery, "Broker-2 must deliver the second round-robin message");
    const routeCheck = await page.evaluate(async (event) => {
      const { routePoints } = await import("/diagram-layout.js");
      const l = window.kafkaLab.layout;
      l.nodes = new Map(l.nodes.map((n) => [n.id, n]));
      const a = l.nodes.get(event.source),
        b = l.nodes.get(event.destination);
      const points = routePoints(l, event);
      return a.cy > b.cy && points[2][1] >= b.cy;
    }, delivery);
    assert(routeCheck, "Lower broker deliveries must use clear lower space");
    await ready(() =>
      [
        ...document.querySelectorAll('.packet[data-stage="DELIVERED"] title'),
      ].some((e) => e.textContent.includes("M2")),
    );
    await page.waitForTimeout(700);
    await screenshot("broker-two-lower-route");
    assert.deepEqual(errors, [], "Browser errors");
    await req("/scenarios/2");
    await req("/commands", { type: "PAUSE" });
    await req("/commands", { type: "RESET" });
    console.log(
      "PASS: reference palette, horizontal branches, clean canvas, drawer/tabs, Focus and keyboard, all visible event stages, pause/step, auto/manual, custom names, JSON, actions, failover/rebalance, measured long labels, laptop/mobile, scenarios and bounded maximum traffic.",
    );
    console.log("Screenshots: " + out);
  } catch (e) {
    await page
      .screenshot({ path: out + "/failure.png", fullPage: true })
      .catch(() => {});
    console.error("Browser errors:", errors);
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
