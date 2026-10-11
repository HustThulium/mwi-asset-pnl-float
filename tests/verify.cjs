// Local DOM compatibility fixture; does not access the game or user browser.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    async function revealControls() { const r = await page.locator("#thulium-pnl-float").boundingBox(); await page.mouse.move(r.x + 10, r.y + 10); await page.waitForFunction(() => document.querySelector("#thulium-pnl-float").hasAttribute("data-chrome"), null, {timeout:2000}).catch(async e => { console.log(await page.evaluate(() => ({box:document.querySelector("#thulium-pnl-float").outerHTML, hover:[...document.querySelectorAll(":hover")].map(n=>n.tagName+"#"+n.id)}))); throw e; }); }
    await page.setContent(`<style>
      button { background:rgb(30,30,50); color:white }
      .Mui-selected { background:rgb(70,80,160) }
      #mwitools-asset-history-tab[data-active=true] { color:cyan!important }
      [data-mwitools-asset-active=true] button:not(#mwitools-asset-history-tab) { background:rgb(30,30,50)!important }
    </style><section id="shell"><nav><button id="inventory" aria-selected="true" class="Mui-selected">库存</button><button id="equipment">装备</button><button id="mwitools-asset-history-tab" aria-selected="false">盈亏</button></nav><article id="native">原生内容</article><section id="mwitools-asset-history-panel" hidden><div class="mwi-asset-summary">${Array.from({ length: 6 }, (_, i) => `<div class="mwi-asset-card"><div class="mwi-asset-card-value" id="value${i}">${i}</div></div>`).join('')}</div><button id="original-action">原功能</button><canvas></canvas></section></section>`);
    await page.evaluate(() => {
      window.fixtureStore = {};
      window.GM_getValue = (key, fallback) => window.fixtureStore[key] ?? fallback;
      window.GM_setValue = (key, value) => { window.fixtureStore[key] = value; }; window.GM_registerMenuCommand = () => {};
      let active = false;
      const tab = document.querySelector('#mwitools-asset-history-tab'), host = document.querySelector('#mwitools-asset-history-panel'), nav = document.querySelector('nav'), native = document.querySelector('#native');
      function activate(value) { active = value; tab.setAttribute('aria-selected', String(value)); tab.dataset.active = String(value); host.hidden = !value; native.hidden = value; native.style.display = value ? 'none' : ''; if (value) nav.dataset.mwitoolsAssetActive = 'true'; else delete nav.dataset.mwitoolsAssetActive; }
      tab.addEventListener('click', e => { e.stopPropagation(); activate(!active); });
      for (const id of ['inventory', 'equipment']) document.getElementById(id).onclick = () => { activate(false); for (const button of nav.querySelectorAll('button:not(#mwitools-asset-history-tab)')) { const selected = button.id === id; button.setAttribute('aria-selected', String(selected)); button.classList.toggle('Mui-selected', selected); } };
      window.originalClicks = 0; document.querySelector('#original-action').onclick = () => window.originalClicks++;
      window.updateFixture = () => { if (active) document.querySelector('#value0').textContent = 'updated'; };
      for (const [id, label] of [['mwitools-planning-tab', '规划'], ['guild-fixture-tab', '公会']]) {
        const button = document.createElement('button'); button.id = id; button.textContent = label; button.setAttribute('aria-selected', 'false'); nav.append(button);
        const panel = document.createElement('section'); panel.id = id + '-panel'; panel.textContent = label + '内容'; panel.hidden = true; document.querySelector('#shell').append(panel);
        button.onclick = () => { const opening = button.getAttribute('aria-selected') !== 'true'; activate(false); for (const other of nav.querySelectorAll('button')) { if (other.id.endsWith('-tab') && other !== tab) { other.setAttribute('aria-selected', String(other === button && opening)); document.getElementById(other.id + '-panel').hidden = other !== button || !opening; } } native.hidden = opening; native.style.display = opening ? 'none' : ''; };
      }
      for (const button of [tab, document.querySelector('#inventory'), document.querySelector('#equipment')]) button.addEventListener('click', () => { for (const id of ['mwitools-planning-tab', 'guild-fixture-tab']) { document.getElementById(id).setAttribute('aria-selected', 'false'); document.getElementById(id + '-panel').hidden = true; } });
    });
    await page.addScriptTag({ content: fs.readFileSync(__dirname + '/../asset-pnl-float.user.js', 'utf8') });
    assert.equal(await page.locator('#native').isVisible(), true);
    assert.equal(await page.locator('#inventory').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(70, 80, 160)');
    assert.equal(await page.locator('#thulium-pnl-float').isVisible(), false);
    await page.evaluate(() => {
      window.idleAttributeWrites = 0;
      window.idleObserver = new MutationObserver(records => window.idleAttributeWrites += records.length);
      window.idleObserver.observe(document.querySelector('#shell'), { attributes: true, subtree: true });
    });
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => window.idleAttributeWrites), 0, 'closed plugin must not repeatedly write attributes');
    await page.evaluate(() => window.idleObserver.disconnect());
    assert.equal(await page.locator('#mwitools-asset-history-tab').getAttribute('aria-selected'), 'false');
    for (const id of ['mwitools-planning-tab', 'guild-fixture-tab']) {
      await page.locator('#' + id).click();
      await page.waitForTimeout(600);
      assert.equal(await page.locator('#' + id + '-panel').isVisible(), true);
      assert.equal(await page.locator('#mwitools-asset-history-tab').getAttribute('aria-selected'), 'false');
      await page.locator('#inventory').click();
    }
    await page.locator('#mwitools-asset-history-tab').click();
    assert.equal(await page.locator('#mwitools-asset-history-panel').isVisible(), true);
    assert.equal(await page.locator('#native').isVisible(), false);
    assert.equal(await page.locator('#mwitools-asset-history-panel').getAttribute('data-thulium-pnl-source'), null);
    await page.locator('[data-thulium-open-float]').click();
    assert.equal(await page.evaluate(() => window.fixtureStore.floatOpen), true);
    assert.equal(await page.locator('#mwitools-asset-history-tab').isVisible(), false);
    assert.equal(await page.locator('#thulium-pnl-float').isVisible(), true);
    assert.equal(await page.locator('#native').isVisible(), true);
    await page.locator('#equipment').click();
    await page.waitForFunction(() => document.querySelector('#mwitools-asset-history-tab').getAttribute('aria-selected') === 'true');
    assert.equal(await page.locator('#equipment').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(70, 80, 160)');
    await page.evaluate(() => document.activeElement.blur());
    await page.mouse.move(1100, 850);
    assert.equal(await page.locator('#thulium-pnl-float header').evaluate(n => getComputedStyle(n).opacity), '0');
    assert.equal(await page.locator('#mwitools-asset-history-panel').evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('button[data-mode]').textContent(), '');
    await revealControls(); await page.locator('button[data-mode]').click();
    await revealControls(); await page.locator('button[data-mode]').click();
    assert.equal(await page.locator('#thulium-pnl-float').getAttribute('data-mode'), 'full');
    assert.equal(await page.locator('#mwitools-asset-history-panel').isVisible(), true);
    await page.locator('#original-action').click(); assert.equal(await page.evaluate(() => window.originalClicks), 1);
    await page.evaluate(() => window.updateFixture());
    await revealControls(); await page.locator('button[data-mode]').click();
    assert.equal(await page.locator('#mwitools-asset-history-panel .mwi-asset-card:visible').count(), 6);
    assert.equal(await page.locator('#thulium-pnl-float .mwi-asset-card').count(), 0);
    assert.equal(await page.locator('#value0').textContent(), 'updated');
    assert.equal(await page.locator('#original-action').isVisible(), false);
    await revealControls(); await page.locator('button[data-mode]').click();
    assert.equal(await page.locator('#mwitools-asset-history-panel .mwi-asset-card:visible').count(), 1);
    await page.locator('#value0').click();
    assert.equal(await page.locator('#value1').isVisible(), true);
    assert.equal(await page.locator('#value0').isVisible(), false);
    await revealControls(); await page.locator('[data-settings]').click();
    for (const index of [0, 2, 4, 5]) await page.locator(`[data-cycle="${index}"]`).uncheck();
    await page.locator('[data-click-switch]').uncheck();
    await page.locator('[data-done]').click();
    assert.equal(await page.locator('[data-progress]').textContent(), '1/2');
    await page.locator('#value1').click();
    assert.equal(await page.locator('#value1').isVisible(), true, 'disabled card click must not advance');
    await revealControls(); await page.locator('[data-next]').click();
    assert.equal(await page.locator('#value3').isVisible(), true);
    assert.equal(await page.locator('[data-progress]').textContent(), '2/2');
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('#value1').isVisible(), true, 'next wraps in selected subset');
    await page.locator('[data-prev]').click();
    assert.equal(await page.locator('#value3').isVisible(), true, 'previous wraps in selected subset');
    await page.locator('[data-settings]').click();
    await page.locator('[data-cycle="1"]').uncheck();
    assert.equal(await page.locator('[data-cycle="3"]').isDisabled(), true);
    await page.locator('[data-done]').click();
    assert.equal(await page.locator('[data-progress]').textContent(), '1/1');
    assert.deepEqual(await page.evaluate(() => window.fixtureStore.layout.cycle), [3]);
    assert.equal(await page.evaluate(() => window.fixtureStore.layout.clickSwitch), false);
    for (const id of ['mwitools-planning-tab', 'guild-fixture-tab']) {
      await page.locator('#' + id).click();
      await page.waitForTimeout(1100); // More than two activation polling intervals.
      assert.equal(await page.locator('#' + id + '-panel').isVisible(), true);
      assert.equal(await page.locator('#native').isVisible(), false);
      assert.equal(await page.locator('#mwitools-asset-history-tab').getAttribute('aria-selected'), 'false');
      assert.match(await page.locator('[data-status]').textContent(), /数值暂不更新/);
      assert.equal(await page.locator('#mwitools-asset-history-tab').isVisible(), false);
      assert.match(await page.locator('#thulium-pnl-float main').textContent(), /更新暂时停止/);
      await page.locator('#inventory').click();
      await page.waitForFunction(() => document.querySelector('#mwitools-asset-history-tab').getAttribute('aria-selected') === 'true');
      assert.equal(await page.locator('#native').isVisible(), true);
    }
    await revealControls(); await page.locator('[data-close]').click();
    assert.equal(await page.evaluate(() => window.fixtureStore.floatOpen), false);
    assert.equal(await page.locator('#mwitools-asset-history-tab').isVisible(), true);
    assert.equal(await page.locator('#thulium-pnl-float').isVisible(), false);
    assert.equal(await page.locator('#mwitools-asset-history-panel').isVisible(), true);
    assert.equal(await page.locator('#mwitools-asset-history-panel').getAttribute('data-thulium-pnl-full'), null);
    assert.equal(await page.locator('[data-thulium-open-float]').isVisible(), true);
    assert.equal(await page.locator('#mwitools-asset-history-panel .mwi-asset-card:visible').count(), 6);
    assert.equal(await page.locator('#original-action').isVisible(), true);
    await page.locator('#inventory').click();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#mwitools-asset-history-tab').getAttribute('aria-selected'), 'false');
    assert.equal(await page.locator('#native').isVisible(), true);
    await page.locator('#mwitools-asset-history-tab').click();
    await page.locator('[data-thulium-open-float]').click();
    await page.locator('#mwitools-planning-tab').click();
    await page.waitForTimeout(600);
    await revealControls(); await page.locator('[data-close]').click();
    assert.equal(await page.locator('#mwitools-planning-tab-panel').isVisible(), true);
    assert.equal(await page.locator('#mwitools-asset-history-tab').getAttribute('aria-selected'), 'false');
    for (const remembered of [true, false]) {
      const fresh = await browser.newPage();
      await fresh.setContent('<article id="native">库存</article>');
      await fresh.evaluate(value => {
        window.GM_getValue = (key, fallback) => key === 'floatOpen' ? value : fallback;
        window.GM_setValue = () => {}; window.GM_registerMenuCommand = () => {};
      }, remembered);
      await fresh.addScriptTag({ content: fs.readFileSync(__dirname + '/../asset-pnl-float.user.js', 'utf8') });
      assert.equal(await fresh.locator('#thulium-pnl-float').isVisible(), false, 'wait for dependency mount');
      await fresh.evaluate(() => {
        const shell = document.createElement('section');
        shell.innerHTML = '<nav><button id="mwitools-asset-history-tab" aria-selected="false">盈亏</button></nav><section id="mwitools-asset-history-panel" hidden><div class="mwi-asset-summary">' + Array.from({ length: 6 }, () => '<div class="mwi-asset-card">值</div>').join('') + '</div></section>';
        document.body.append(shell);
        const tab = shell.querySelector('button'), panel = shell.querySelector('section');
        tab.onclick = () => { const active = tab.getAttribute('aria-selected') !== 'true'; tab.setAttribute('aria-selected', String(active)); panel.hidden = !active; };
      });
      await fresh.waitForFunction(() => !!document.querySelector('[data-thulium-open-float]'));
      assert.equal(await fresh.locator('#thulium-pnl-float').isVisible(), remembered);
      await fresh.close();
    }
    console.log('PASS: saved open/closed state in fresh documents, delayed dependency mount, opt-in startup, navigation and original panel interaction');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
