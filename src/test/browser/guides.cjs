const { chromium } = require(require('node:path').resolve('target/browser-tests/node_modules/playwright'));
const assert = require('node:assert/strict'), fs=require('node:fs');
const base=process.env.KAFKA_LAB_URL || 'http://localhost:8080',out='target/browser-tests/guides';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],seen=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   window.assignmentStages=[];
   new MutationObserver(rs=>rs.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1&&n.matches('.packet'))window.assignmentStages.push(n.dataset.stage);}))).observe(document,{subtree:true,childList:true});
 });
 async function api(path,data,method='POST') {const r=await page.request.fetch(base+'/api/simulation'+path,{method,data});assert.equal(r.status(),200,await r.text());return r.json();}
 const ready=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:120000});
 const shot=name=>page.screenshot({path:out+'/'+name+'.png'});
 async function drawer() {if(!(await page.locator('#sidebar').isVisible()))await page.locator('#toggle-sidebar').click();}
 async function choose(id) {
   await drawer();await page.locator('#scenarios-tab').click();await page.selectOption('#scenario-select',String(id));
   const epoch=await page.evaluate(()=>window.kafkaLab.state.epoch);
   await page.locator('#run-scenario').click();await page.locator('#learning-dialog[open]').waitFor();
   assert.equal(await page.locator('#learning-continue').innerText(),'Continue');
   assert.equal(await page.evaluate(()=>window.kafkaLab.state.epoch),epoch,'Introduction must precede reset');
   await page.locator('#learning-continue').click();
   await ready(id=>window.kafkaLab.state.scenarioId===id,id);
 }
 try {
   await api('/scenarios/2');await api('/commands',{type:'PAUSE'});await api('/commands',{type:'RESET'});
   await page.goto(base + '/visualizer.html');await ready(()=>window.kafkaLab?.ownsPlayback);
   await page.locator('#learning-dialog[open]').waitFor();assert.match(await page.locator('#learning-title').innerText(),/Welcome/);
   assert.equal(await page.locator('#learning-continue').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(22, 119, 255)');
   const originalEpoch=await page.evaluate(()=>window.kafkaLab.state.epoch);
   await shot('welcome');
   await page.locator('#learning-continue').click();assert(await page.locator('#sidebar').isVisible());
   await page.locator('#learning-previous').click();assert.match(await page.locator('#learning-title').innerText(),/Welcome/);
   for(let i=0;i<8;i++)await page.locator('#learning-continue').click();
   assert(await page.locator('#bottom-panel').isVisible());await shot('welcome-diagnostics');
   await page.locator('#learning-continue').click();assert(!(await page.locator('#sidebar').isVisible()));assert(!(await page.locator('#bottom-panel').isVisible()));
   assert.equal(await page.evaluate(()=>window.kafkaLab.state.epoch),originalEpoch);
   await page.reload();await ready(()=>window.kafkaLab?.ownsPlayback);assert.equal(await page.locator('#learning-dialog[open]').count(),0);
   await page.locator('#more-toggle').click();await page.locator('#welcome-guide').click();await page.locator('#learning-skip').click();
   await page.locator('#animation-buttons [data-speed="4"]').click();
   await drawer();await page.locator('#scenarios-tab').click();await page.locator('#run-scenario').click();await page.locator('#learning-cancel').click();
   assert.equal(await page.evaluate(()=>window.kafkaLab.state.epoch),originalEpoch);
   const expected={1:['first-commit'],2:['initial-assignment'],3:['initial-assignment'],4:['initial-assignment'],5:['independent-groups'],6:['before-crash','before-restart','redelivery-done'],7:['before-failover','failover-done'],8:['lag-threshold'],9:['key-affinity'],10:['before-join','join-done']};
   for(let id=1;id<=10;id++) {
     await choose(id);
     if(id===2) {
       await ready(()=>document.querySelector('.packet[data-stage="ASSIGNMENT"]'));
       assert.equal(await page.evaluate(()=>window.assignmentStages.at(-1)),'ASSIGNMENT');
       await page.locator('#playback').click();await ready(()=>window.kafkaLab.state.playbackPaused);
       const clock=await page.evaluate(()=>window.kafkaLab.playback.clock);await page.waitForTimeout(250);
       assert.equal(await page.evaluate(()=>window.kafkaLab.playback.clock),clock);
       await page.locator('#playback').click();
       await shot('initial-assignment-moving');
     }
     for(const key of expected[id]) {
       await ready(key=>window.kafkaLab.guidance.checkpoint===key,key);
       await ready(key=>document.querySelector('#guide-overlay').dataset.cue===key,key);
       const s=await page.evaluate(()=>window.kafkaLab.state);
       if(key==='before-failover') {assert(s.brokers.every(b=>b.online));assert.equal(s.scenarioPhase,0);}
       if(key==='before-join')assert.equal(s.configuration.consumers.length,2);
       if(key==='join-done')assert.equal(s.configuration.consumers.length,3);
       if(key==='before-crash')assert(s.groups[0].consumers[0].online);
       if(key==='before-restart')assert(!s.groups[0].consumers[0].online);
       assert(await page.locator('#guide-overlay .guide-ring').count()>0);
       await shot('scenario-'+id+'-'+key);
       const tick=s.tick;await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.kafkaLab.state.tick),tick);
       assert.equal(await page.locator('#scenario-guide-continue').innerText(),'Continue');
       seen.push({id,key,tick});await page.locator('#scenario-guide-continue').click();
       await ready(key=>window.kafkaLab.state.guideCue?.key!==key,key);
     }
     await api('/commands',{type:'PAUSE'});
     console.log('PASS guided scenario '+id);
   }
   await choose(7);await ready(()=>window.kafkaLab.guidance.checkpoint==='before-failover');
   await page.locator('#scenario-guide-disable').click();await ready(()=>!window.kafkaLab.state.guideCue&&!window.kafkaLab.state.guided);
   await ready(()=>window.kafkaLab.state.scenarioPhase===1);await api('/commands',{type:'PAUSE'});
   await api('/scenarios/1');await api('/commands',{type:'PAUSE'});await api('/commands',{type:'RESET'});
   await ready(()=>window.kafkaLab.state.scenarioId===1&&window.kafkaLab.state.tick===0);
   await drawer();await page.locator('#custom-tab').click();
   for(const [selector,text] of [['[data-key="producers"][data-field="name"]','Billing <Service>'],['[data-key="consumers"][data-field="name"]','PDF Worker'],['[data-key="producers"][data-field="rate"]','10'],['[data-key="consumers"][data-field="rate"]','10']]) {
     const field=page.locator(selector).first();await field.evaluate(e=>e.closest('details').open=true);await field.fill(text);
   }
   await page.locator('#run-custom').click();assert.match(await page.locator('#learning-description').innerText(),/Billing <Service>/);assert.match(await page.locator('#learning-description').innerText(),/PDF Worker/);
   await page.locator('#learning-guidance').check();await shot('custom-introduction');await page.locator('#learning-continue').click();
   await ready(()=>window.kafkaLab.guidance.checkpoint==='initial-assignment');
   assert.equal(await page.evaluate(()=>window.kafkaLab.state.messageCount),0,'Even fast producers wait for the assignment checkpoint');
   await page.locator('#scenario-guide-continue').click();
   await api('/commands',{type:'PAUSE'});await api('/commands',{type:'BROKER_STOP',targetId:'b1'});
   await ready(()=>document.querySelector('#guide-overlay .guide-ring.danger'));await shot('failure-highlight');
   await page.waitForTimeout(5500);assert.equal(await page.locator('#guide-overlay .guide-ring.danger').count(),0);assert(await page.locator('.offline-indicator').count()>0);
   await page.setViewportSize({width:390,height:844});await drawer();await page.locator('#scenarios-tab').click();await page.selectOption('#scenario-select','8');await page.locator('#run-scenario').click();
   assert(await page.locator('#learning-continue').isVisible());await shot('mobile-introduction');await page.locator('#learning-continue').click();
   await ready(()=>window.kafkaLab.guidance.checkpoint==='lag-threshold');
   await ready(()=>document.querySelector('#guide-overlay').dataset.cue==='lag-threshold');
   assert(await page.evaluate(()=>{const r=document.querySelector('#scenario-guide').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
   assert(await page.locator('#guide-overlay .guide-ring.warning').count()>0);
   await shot('mobile-lag-guide');await page.locator('#scenario-guide-continue').click();
   assert.deepEqual(errors,[]);
   await api('/scenarios/2');await api('/commands',{type:'PAUSE'});await api('/commands',{type:'RESET'});
   const reduced=await browser.newPage({reducedMotion:'reduce'});
   await reduced.goto(base + '/visualizer.html');await reduced.waitForSelector('#guide-overlay .guide-ring');
   const stableRing = await reduced.locator('#guide-overlay .guide-ring').first().elementHandle();
   await reduced.waitForTimeout(200);
   assert(await stableRing.evaluate(e=>e.isConnected),'Guide frames must update the existing outline rather than replace it');
   assert.equal(await reduced.locator('#guide-overlay .guide-ring').first().evaluate(e=>getComputedStyle(e).animationName),'none');
   await reduced.close();
   fs.writeFileSync(out+'/results.json',JSON.stringify({passed:true,checkpoints:seen,errors},null,2));
   console.log('PASS: welcome next/previous/skip/reopen, introductions/cancel/custom names, assignment movement, all 10 guided scenarios, actual checkpoint holds, guide disable, timed failure fade and mobile dialog.');
 } catch(e) {await shot('failure').catch(()=>{});console.error(errors);throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
