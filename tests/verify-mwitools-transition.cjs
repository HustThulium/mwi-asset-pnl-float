// Reduced reproduction of the published MWITools event order, without the
// floating plugin. This is not a full game integration test.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<nav><button id="assets">盈亏</button><button id="planning">规划</button></nav><article id="native">库存</article><section id="assetPanel">盈亏内容</section><section id="planningPanel" hidden>规划内容</section>');
    await page.evaluate(() => {
      const nav = document.querySelector('nav'), assetPanel = document.querySelector('#assetPanel'), planningPanel = document.querySelector('#planningPanel'), native = document.querySelector('#native');
      let active = true;
      native.hidden = true;
      // asset-history/ui: document capture pointerdown closes the source and
      // restoreNative restores the previously visible native content.
      const handleTabBranchClick = event => {
        if (!active || event.target.closest('#assets') || event.target.closest('#assetPanel')) return;
        if (nav.contains(event.target)) { active = false; assetPanel.hidden = true; native.hidden = false; }
      };
      document.addEventListener('pointerdown', handleTabBranchClick, true);
      document.addEventListener('click', handleTabBranchClick, true);
      // planning/ui: the tab's click listener activates the new panel, hiding
      // other shell children. No floating script is loaded here.
      document.querySelector('#planning').addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); planningPanel.hidden = false; native.hidden = true; assetPanel.hidden = true;
      });
    });
    await page.locator('#planning').hover();
    await page.mouse.down();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#native').isVisible(), true);
    assert.equal(await page.locator('#planningPanel').isVisible(), false);
    await page.mouse.up();
    assert.equal(await page.locator('#native').isVisible(), false);
    assert.equal(await page.locator('#planningPanel').isVisible(), true);
    console.log('PASS without floating plugin: pointerdown shows previous native content; click shows Planning. Reduced source-order reproduction only.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
