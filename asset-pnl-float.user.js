// ==UserScript==
// @name         银河奶牛放置 - 盈亏浮窗
// @namespace    Thulium/mwi-asset-pnl-float
// @author       Thulium
// @version      0.1.19
// @license      MIT
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2216%22%20fill%3D%22%23424d8e%22%2F%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%223%22%3E%3Crect%20x%3D%2212%22%20y%3D%2212%22%20width%3D%2240%22%20height%3D%2240%22%20rx%3D%225%22%2F%3E%3Cpath%20d%3D%22M12%2023h40M22%2044V34m10%2010V29m10%2015V37%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E
// @description  将 MWITools 盈亏面板显示为可拖动、缩放的浮窗，支持六格、单项和完整模式；需先安装 MWITools。
// @homepageURL  https://github.com/HustThulium/mwi-asset-pnl-float
// @supportURL   https://github.com/HustThulium/mwi-asset-pnl-float/issues
// @updateURL    https://raw.githubusercontent.com/HustThulium/mwi-asset-pnl-float/main/asset-pnl-float.user.js
// @downloadURL  https://raw.githubusercontent.com/HustThulium/mwi-asset-pnl-float/main/asset-pnl-float.user.js
// @match        https://www.milkywayidle.com/game*
// @match        https://milkywayidle.com/game*
// @match        https://test.milkywayidle.com/game*
// @match        https://www.milkywayidlecn.com/game*
// @match        https://milkywayidlecn.com/game*
// @match        https://test.milkywayidlecn.com/game*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  const defaults = { x: 30, y: 130, mode: 'all', index: 0, opacity: 1, cycle: [0, 1, 2, 3, 4, 5], clickSwitch: true,
    all: { w: 430, h: 280 }, single: { w: 190, h: 120 }, full: { w: 560, h: 700 } };
  const saved = GM_getValue('layout', {});
  const state = { ...defaults, ...saved, all: { ...defaults.all, ...saved.all },
    single: { ...defaults.single, ...saved.single }, full: { ...defaults.full, ...saved.full } };
  state.mode = ['all', 'single', 'full'].includes(state.mode) ? state.mode : 'all';
  state.index = Number.isInteger(state.index) ? ((state.index % 6) + 6) % 6 : 0;
  state.opacity = Number.isFinite(Number(state.opacity)) ? Math.max(.2, Math.min(1, Number(state.opacity))) : 1;
  state.cycle = [...new Set(Array.isArray(state.cycle) ? state.cycle.filter(n => Number.isInteger(n) && n >= 0 && n < 6) : defaults.cycle)].sort((a, b) => a - b);
  if (!state.cycle.length) state.cycle = [...defaults.cycle];
  if (!state.cycle.includes(state.index)) state.index = state.cycle[0];
  state.clickSwitch = state.clickSwitch !== false;
  const save = () => GM_setValue('layout', state);
  let restorePending = GM_getValue('floatOpen', false) === true;
  let enabled = false, host, shell, restored = [], activating = false, yieldingTo = null, syncTimer = null;
  const box = document.createElement('div');
  box.id = 'thulium-pnl-float';
  box.hidden = true;
  box.innerHTML = '<header><span>盈亏浮窗</span><button data-mode>单项</button><button data-close title="关闭浮窗，恢复原盈亏页">关闭</button></header><main></main><footer><label data-opacity-control title="卡片背景透明度：向右更实，向左更透，文字保持清晰"><span data-opacity-icon></span><input aria-label="卡片背景不透明度" type="range" min="20" max="100" value="100"></label><span data-status>等待 MWITools</span></footer><i title="拖动调整大小"></i>';
  document.body.append(box);
  const gear = document.createElement('button');
  gear.type = 'button'; gear.setAttribute('data-settings', ''); gear.title = '单项切换设置'; gear.setAttribute('aria-label', gear.title);
  box.querySelector('header').insertBefore(gear, box.querySelector('[data-mode]'));
  const paging = document.createElement('span'); paging.setAttribute('data-paging', '');
  paging.innerHTML = '<button type="button" data-prev title="上一项" aria-label="上一项"></button><span data-progress></span><button type="button" data-next title="下一项" aria-label="下一项"></button>';
  box.querySelector('footer').insertBefore(paging, box.querySelector('[data-status]'));
  const settings = document.createElement('dialog'); settings.id = 'thulium-pnl-settings';
  const labels = ['当前总资产', '总盈亏', '流动资产盈亏', '非流动资产盈亏', '盈亏比例', '近 7 日平均'];
  settings.innerHTML = '<strong>单项切换设置</strong><p>选择参与循环的项目，至少保留一项。</p>' + labels.map((label, index) => `<label><input type="checkbox" data-cycle="${index}"> ${label}</label>`).join('') + '<hr><label><input type="checkbox" data-click-switch> 单击卡片切换</label><button type="button" data-done>完成</button>';
  document.body.append(settings);
  const style = document.createElement('style');
  style.textContent = `
    #thulium-pnl-float input{width:60px;vertical-align:middle}
    #thulium-pnl-float [data-paging]{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
    #thulium-pnl-float [data-paging] button{display:inline-flex;padding:2px}
    #thulium-pnl-float:not([data-mode=single]) [data-paging],#thulium-pnl-float:not([data-mode=single]) [data-settings]{display:none}
    #thulium-pnl-float header span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    #thulium-pnl-settings{width:270px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:16px;border:1px solid #58627a;border-radius:8px;background:#182131;color:#dbe3ef;font:13px sans-serif}
    #thulium-pnl-settings::backdrop{background:#0006}
    #thulium-pnl-settings label{display:flex;align-items:center;gap:6px;margin:9px 0}
    #thulium-pnl-settings p{font-size:12px;color:#afbdd0}
    #thulium-pnl-settings button{display:block;margin:14px 0 0 auto;background:#35405b;color:#ddd;border:0;border-radius:4px;padding:6px 14px;cursor:pointer}
    #thulium-pnl-float [data-opacity-control]{display:inline-flex;align-items:center;gap:6px;color:#aebbd0}
    #thulium-pnl-float [data-opacity-icon]{display:inline-flex}
    #thulium-pnl-float[data-mode=full] [data-opacity-control]{display:none}
    #thulium-pnl-float:not([data-mode=full]){background:transparent!important}
    #mwitools-asset-history-tab[data-thulium-pnl-open]{display:none!important}
    #thulium-pnl-float[hidden]{display:none!important}
    #thulium-pnl-float{position:fixed;z-index:10000;box-sizing:border-box;color:#ddd;border:1px solid #58627a;border-radius:7px;overflow:hidden;font:12px sans-serif;display:flex;flex-direction:column}
    #thulium-pnl-float header{display:flex;align-items:center;gap:6px;padding:5px;cursor:move;touch-action:none;background:#20283b}
    #thulium-pnl-float header span{flex:1} #thulium-pnl-float button{color:#ddd;background:#35405b;border:0;border-radius:3px;cursor:pointer}
    #thulium-pnl-float main{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:7px;overflow:auto}
    #thulium-pnl-float[data-mode=single] main{grid-template-columns:1fr;cursor:pointer}
    #thulium-pnl-float .mwi-asset-card{display:flex;flex-direction:column;justify-content:center;text-align:center;border:1px solid #ffffff22;border-radius:6px;padding:7px;min-width:0}
    #thulium-pnl-float .mwi-asset-card-label{color:#afc6db;font-size:11px}
    #thulium-pnl-float .mwi-asset-card-value{font-size:18px;font-weight:bold;margin:6px 0}
    #thulium-pnl-float .mwi-asset-card-meta{font-size:10px;color:#aab4c6}
    #thulium-pnl-float .is-positive{color:#50da94} #thulium-pnl-float .is-negative{color:#ff5757}
    #thulium-pnl-float footer{display:flex;gap:8px;align-items:center;padding:4px 12px 4px 6px;font-size:10px}
    #thulium-pnl-float[data-mode=single] footer{position:relative;display:flex;align-items:flex-end;min-height:43px;box-sizing:border-box;padding:4px 12px 4px 6px}
    #thulium-pnl-float[data-mode=single] [data-paging]{position:absolute;left:50%;top:3px;transform:translateX(-50%)}
    #mwitools-asset-history-panel[data-thulium-pnl-full]{box-sizing:border-box!important}
    #thulium-pnl-float [data-status]:empty{display:none}
    #thulium-pnl-float i{position:absolute;bottom:0;right:0;width:13px;height:13px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,#8c9ab8 51%)}
    #mwitools-asset-history-panel[data-thulium-pnl-mode]:not([data-thulium-pnl-mode=full]) > :not(.mwi-asset-summary){display:none!important}
    #mwitools-asset-history-panel[data-thulium-pnl-mode]:not([data-thulium-pnl-mode=full]){padding:7px!important;overflow:hidden!important}
    #mwitools-asset-history-panel[data-thulium-pnl-mode]:not([data-thulium-pnl-mode=full]) .mwi-asset-summary{height:100%;margin:0;grid-template-rows:repeat(3,minmax(0,1fr));gap:6px}
    #mwitools-asset-history-panel[data-thulium-pnl-mode=single] .mwi-asset-summary{grid-template-columns:1fr;grid-template-rows:1fr!important;cursor:pointer}
    #mwitools-asset-history-panel[data-thulium-pnl-mode=single] .mwi-asset-card:not([data-thulium-pnl-current]){display:none!important}
    #mwitools-asset-history-panel[data-thulium-pnl-mode]:not([data-thulium-pnl-mode=full]) .mwi-asset-card{display:flex;flex-direction:column;justify-content:center;text-align:center;padding:5px;overflow:hidden;background:rgba(29,37,49,var(--thulium-card-opacity,1))!important}
    #mwitools-asset-history-panel[data-thulium-pnl-mode]:not([data-thulium-pnl-mode=full]){background:transparent!important}
    [data-thulium-pnl-native]{display:var(--thulium-native-display)!important}
    #mwitools-asset-history-tab[data-thulium-pnl-tab]{background:var(--thulium-idle-background)!important;color:var(--thulium-idle-color)!important;border-color:var(--thulium-idle-border)!important;box-shadow:var(--thulium-idle-shadow)!important;font-weight:normal!important}
    #mwitools-asset-history-panel[data-thulium-pnl-full]{position:fixed!important;left:var(--thulium-full-x)!important;top:var(--thulium-full-y)!important;width:var(--thulium-full-w)!important;height:var(--thulium-full-h)!important;max-width:none!important;max-height:none!important;z-index:10001!important;visibility:visible!important;pointer-events:auto!important;display:block!important;background:var(--thulium-full-bg)!important}
  `;
  document.head.append(style);
  const icon = path => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  box.querySelector('[data-opacity-icon]').innerHTML = icon('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/>');
  gear.innerHTML = icon('<path d="m10 3-.7 2.4-2 .9L5 5.7 3 9l1.7 1.7v2.6L3 15l2 3.3 2.3-.6 2 .9.7 2.4h4l.7-2.4 2-.9 2.3.6 2-3.3-1.7-1.7v-2.6L21 9l-2-3.3-2.3.6-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/>');
  box.querySelector('[data-prev]').innerHTML = icon('<path d="m14 6-6 6 6 6"/>');
  box.querySelector('[data-next]').innerHTML = icon('<path d="m10 6 6 6-6 6"/>');
  function refreshSettings() {
    settings.querySelectorAll('[data-cycle]').forEach(input => { input.checked = state.cycle.includes(Number(input.dataset.cycle)); input.disabled = input.checked && state.cycle.length === 1; });
    settings.querySelector('[data-click-switch]').checked = state.clickSwitch;
  }
  gear.onclick = () => { refreshSettings(); settings.showModal(); };
  settings.querySelector('[data-done]').onclick = () => settings.close();
  settings.addEventListener('change', event => {
    if (event.target.matches('[data-cycle]')) {
      const selected = [...settings.querySelectorAll('[data-cycle]:checked')].map(input => Number(input.dataset.cycle));
      if (selected.length) state.cycle = selected;
      if (!state.cycle.includes(state.index)) state.index = state.cycle[0];
    } else if (event.target.matches('[data-click-switch]')) state.clickSwitch = event.target.checked;
    refreshSettings(); save(); syncFull();
  });
  function step(direction) {
    state.index = state.cycle[(state.cycle.indexOf(state.index) + direction + state.cycle.length) % state.cycle.length];
    save(); syncFull();
  }
  box.querySelector('[data-prev]').onclick = () => step(-1);
  box.querySelector('[data-next]').onclick = () => step(1);
  const modeIcons = {
    all: icon('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
    single: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M8 8v13"/>'),
    full: icon('<path d="M4 4h6v4H4zM14 4h6v4h-6zM4 10h6v4H4zM14 10h6v4h-6zM4 16h6v4H4zM14 16h6v4h-6z"/>')
  };
  box.querySelector('[data-close]').innerHTML = icon('<path d="m6 6 12 12M18 6 6 18"/>');
  box.querySelector('[data-close]').setAttribute('aria-label', '关闭浮窗');
  const chromeStyle = document.createElement('style');
  chromeStyle.textContent = `
    #thulium-pnl-float header button{display:inline-flex;align-items:center;justify-content:center;width:25px;height:23px;padding:0}
    #thulium-pnl-float header button:hover{background:#536482}
    #thulium-pnl-float[data-mode]:not([data-mode=full]):not([data-chrome]){background:transparent!important;border-color:transparent;box-shadow:none}
    #thulium-pnl-float[data-mode]:not([data-mode=full]):not([data-chrome]) header,
    #thulium-pnl-float[data-mode]:not([data-mode=full]):not([data-chrome]) footer,
    #thulium-pnl-float[data-mode]:not([data-mode=full]):not([data-chrome]) i{opacity:0;pointer-events:none}
    #mwitools-asset-history-panel[data-thulium-pnl-mode]:not([data-thulium-pnl-mode=full]):not([data-thulium-pnl-chrome]){background:transparent!important;border:0!important;box-shadow:none!important}
  `;
  document.head.append(chromeStyle);
  let dragging = false, pointer = null;
  function updateChrome() {
    const focused = document.activeElement;
    const rect = box.getBoundingClientRect();
    const inside = pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
    const active = dragging || inside || box.contains(focused) || (enabled && host?.contains(focused));
    box.toggleAttribute('data-chrome', !!active);
    if (host && host.hasAttribute('data-thulium-pnl-chrome') !== !!active) host.toggleAttribute('data-thulium-pnl-chrome', !!active);
  }
  for (const name of ['pointerover', 'pointerout', 'focusin', 'focusout']) document.addEventListener(name, () => { if (enabled) requestAnimationFrame(updateChrome); });
  document.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; if (enabled) updateChrome(); }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; if (enabled) updateChrome(); });
  const main = box.querySelector('main'), status = box.querySelector('[data-status]');
  function layout() {
    const size = state[state.mode];
    size.w = Math.min(innerWidth, Math.max(150, Number(size.w) || 190));
    size.h = Math.min(innerHeight, Math.max(100, Number(size.h) || 120));
    state.x = Math.max(0, Math.min(innerWidth - size.w, Number(state.x) || 0));
    state.y = Math.max(0, Math.min(innerHeight - size.h, Number(state.y) || 0));
    Object.assign(box.style, { left: `${state.x}px`, top: `${state.y}px`, width: `${size.w}px`, height: `${size.h}px`, background: '#0f1724' });
    box.dataset.mode = state.mode;
    const modeButton = box.querySelector('[data-mode]');
    modeButton.innerHTML = modeIcons[state.mode];
    modeButton.title = `切换到${{ all: '单项', single: '完整页面', full: '六项' }[state.mode]}`;
    modeButton.setAttribute('aria-label', modeButton.title);
    box.querySelector('input').value = String(Math.round(state.opacity * 100));
    syncFull();
    updateChrome();
  }
  function syncFull() {
    box.querySelector('[data-progress]').textContent = `${state.cycle.indexOf(state.index) + 1}/${state.cycle.length}`;
    if (!host) return;
    const visible = enabled && !yieldingTo;
    if (host.hasAttribute('data-thulium-pnl-full') !== visible) host.toggleAttribute('data-thulium-pnl-full', visible);
    if (visible) {
      host.style.setProperty('--thulium-card-opacity', String(state.opacity));
      if (host.dataset.thuliumPnlMode !== state.mode) host.dataset.thuliumPnlMode = state.mode;
      host.querySelectorAll('.mwi-asset-summary > .mwi-asset-card').forEach((card, index) => {
        const selected = index === state.index;
        if (card.hasAttribute('data-thulium-pnl-current') !== selected) card.toggleAttribute('data-thulium-pnl-current', selected);
      });
      const rect = main.getBoundingClientRect();
      for (const [key, value] of Object.entries({ x: `${rect.left}px`, y: `${rect.top}px`, w: `${rect.width}px`, h: `${rect.height}px`, bg: '#0f1724' })) host.style.setProperty(`--thulium-full-${key}`, value);
    }
  }
  function clearPanel(node) {
    if (!node) return;
    node.removeAttribute('data-thulium-pnl-full');
    node.removeAttribute('data-thulium-pnl-mode');
    node.removeAttribute('data-thulium-pnl-chrome');
    node.style.removeProperty('--thulium-card-opacity');
    node.querySelectorAll('[data-thulium-pnl-current]').forEach(card => card.removeAttribute('data-thulium-pnl-current'));
    for (const key of ['x', 'y', 'w', 'h', 'bg']) node.style.removeProperty(`--thulium-full-${key}`);
  }
  function clearNative() {
    restored.forEach(node => { node.removeAttribute('data-thulium-pnl-native'); node.style.removeProperty('--thulium-native-display'); });
    restored = [];
    document.querySelectorAll('[data-thulium-native-selected]').forEach(n => n.removeAttribute('data-thulium-native-selected'));
  }
  function release() {
    const tab = document.getElementById('mwitools-asset-history-tab');
    if (tab?.getAttribute('aria-selected') === 'true') {
      activating = true;
      try { tab.click(); } finally { activating = false; }
    }
    clearNative();
    clearPanel(host);
    tab?.removeAttribute('data-thulium-pnl-tab');
    for (const key of ['background', 'color', 'border', 'shadow']) tab?.style.removeProperty(`--thulium-idle-${key}`);
    for (const key of ['x', 'y', 'w', 'h', 'bg']) host?.style.removeProperty(`--thulium-full-${key}`);
  }
  function ensureOpenButton() {
    const tab = document.getElementById('mwitools-asset-history-tab');
    if (tab && tab.hasAttribute('data-thulium-pnl-open') !== enabled) tab.toggleAttribute('data-thulium-pnl-open', enabled);
    const panel = document.getElementById('mwitools-asset-history-panel');
    if (!panel) return;
    let button = panel.querySelector('[data-thulium-open-float]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.className = 'mwi-asset-action';
      button.setAttribute('data-thulium-open-float', ''); button.textContent = '弹出浮窗';
      button.addEventListener('click', openFloat);
      const actions = panel.querySelector('.mwi-asset-share');
      if (actions) actions.append(button); else panel.prepend(button);
    }
    // Assigning hidden repeatedly emits attribute mutations even when its
    // value is unchanged, waking MWITools' navigation observers.
    if (button.hidden !== enabled) button.hidden = enabled;
    if (restorePending && !enabled && document.getElementById('mwitools-asset-history-tab')?.isConnected && panel.querySelectorAll('.mwi-asset-summary > .mwi-asset-card').length === 6) {
      restorePending = false;
      openFloat();
    }
  }
  function openFloat() {
    if (enabled) return;
    restorePending = false;
    GM_setValue('floatOpen', true);
    // Restore the native content before capturing its visible state in tick().
    release(); yieldingTo = null; enabled = true; box.hidden = false;
    document.addEventListener('pointerdown', handOff, true);
    document.addEventListener('click', handOff, true);
    document.addEventListener('click', interceptAssetTab, true);
    syncTimer = setInterval(tick, 500);
    ensureOpenButton(); layout(); tick();
  }
  function closeFloat() {
    restorePending = false;
    GM_setValue('floatOpen', false);
    if (!enabled) return;
    const returnToAssets = !yieldingTo;
    enabled = false;
    if (settings.open) settings.close();
    clearInterval(syncTimer); syncTimer = null;
    document.removeEventListener('pointerdown', handOff, true);
    document.removeEventListener('click', handOff, true);
    document.removeEventListener('click', interceptAssetTab, true);
    release(); yieldingTo = null; box.hidden = true;
    main.replaceChildren();
    if (returnToAssets) {
      const tab = document.getElementById('mwitools-asset-history-tab');
      if (tab?.getAttribute('aria-selected') !== 'true') tab?.click();
    }
    ensureOpenButton();
  }
  function tick() {
    if (!enabled || activating) return;
    ensureOpenButton();
    const tab = document.getElementById('mwitools-asset-history-tab');
    const nextHost = document.getElementById('mwitools-asset-history-panel');
    if (!tab || !nextHost) { status.textContent = '等待 MWITools 盈亏功能'; return; }
    if (nextHost !== host) { clearNative(); clearPanel(host); host = nextHost; }
    shell = host.parentElement;
    const currentNavigation = [...shell.children].find(n => n.contains(tab));
    const selectedCustom = [...currentNavigation?.querySelectorAll('button') ?? []].find(n => isCustomTab(n) && (n.getAttribute('aria-selected') === 'true' || n.dataset.active === 'true' || n.classList.contains('Mui-selected')));
    if (selectedCustom) yieldingTo = selectedCustom;
    else if (yieldingTo && (!yieldingTo.isConnected || (yieldingTo.getAttribute('aria-selected') !== 'true' && yieldingTo.dataset.active !== 'true' && !yieldingTo.classList.contains('Mui-selected')))) yieldingTo = null;
    if (yieldingTo) {
      clearNative();
      clearPanel(host);
      tab.removeAttribute('data-thulium-pnl-tab');
      main.textContent = `正在查看${yieldingTo.textContent.trim()}，盈亏更新暂时停止。返回库存、装备等页签后自动恢复。`;
      status.textContent = '其他页签使用中 · 数值暂不更新';
      return;
    }
    if (tab.getAttribute('aria-selected') !== 'true') {
      clearNative();
      const navigation = [...shell.children].find(n => n.contains(tab));
      const idle = navigation?.querySelector('button:not(#mwitools-asset-history-tab):not([aria-selected=true]):not(.Mui-selected)');
      if (idle) {
        const computed = getComputedStyle(idle);
        for (const [key, value] of Object.entries({ background: computed.background, color: computed.color, border: computed.borderColor, shadow: computed.boxShadow })) tab.style.setProperty(`--thulium-idle-${key}`, value);
      }
      restored = [...shell.children].filter(n => n !== host && n !== navigation && n.tagName !== 'STYLE' && !n.hidden && getComputedStyle(n).display !== 'none');
      restored.forEach(n => { n.style.setProperty('--thulium-native-display', getComputedStyle(n).display); n.setAttribute('data-thulium-pnl-native', ''); });
      navigation?.querySelectorAll('button[aria-selected=true],button.Mui-selected').forEach(n => n.setAttribute('data-thulium-native-selected', ''));
      activating = true;
      try { tab.click(); } finally { activating = false; }
    }
    // This attribute only drives MWITools' native-tab style override.
    // Its internal active flag and the panel's visibility are left intact.
    const navigation = [...shell.children].find(n => n.contains(tab));
    navigation?.removeAttribute('data-mwitools-asset-active');
    tab.setAttribute('data-thulium-pnl-tab', '');
    syncFull();
    updateChrome();
    const cards = [...host.querySelectorAll('.mwi-asset-summary > .mwi-asset-card')];
    if (cards.length !== 6) { status.textContent = '原面板结构不兼容'; return; }
    if (main.textContent) main.replaceChildren();
    status.textContent = tab.getAttribute('aria-selected') === 'true' ? '' : '激活失败';
  }
  function setMode(mode) {
    const right = box.getBoundingClientRect().right;
    state.mode = mode;
    const width = Math.min(innerWidth, Math.max(150, Number(state[mode].w) || 190));
    state.x = right - width;
    layout(); save(); tick();
  }
  function isCustomTab(button) {
    if (button.id === 'mwitools-asset-history-tab') return false;
    return button.dataset.mwitoolsCharacterTab === 'true' || button.id === 'mwitools-planning-tab' || /^(公会|规划|收益|guild|planning|income)$/i.test(button.textContent.trim());
  }
  // Let exclusive MWITools panels take over before their own click handlers.
  // Closing our source first also removes stale display overrides before
  // the other panel captures the native visibility state.
  function handOff(event) {
    if (!enabled || activating) return;
    const button = event.target.closest?.('button');
    const tab = document.getElementById('mwitools-asset-history-tab');
    if (!button || !tab || button.parentElement !== tab.parentElement) return;
    if (isCustomTab(button)) { release(); yieldingTo = button; syncFull(); }
    else yieldingTo = null;
  }
  box.querySelector('[data-mode]').onclick = () => setMode({ all: 'single', single: 'full', full: 'all' }[state.mode]);
  // Intercept only human clicks on the source tab. Programmatic activation
  // still reaches the original MWITools listener.
  function interceptAssetTab(event) {
    if (!enabled || activating || !event.target.closest?.('#mwitools-asset-history-tab')) return;
    event.preventDefault(); event.stopImmediatePropagation(); setMode('full');
  }
  document.addEventListener('click', event => {
    if (enabled && !yieldingTo && state.clickSwitch && state.mode === 'single' && host?.contains(event.target) && event.target.closest('.mwi-asset-summary')) {
      step(1);
    }
  });
  box.querySelector('[data-close]').onclick = closeFloat;
  box.querySelector('input').oninput = event => { state.opacity = Number(event.target.value) / 100; save(); syncFull(); };
  GM_registerMenuCommand('关闭盈亏浮窗', closeFloat);
  GM_registerMenuCommand('重置浮窗位置和尺寸', () => { Object.assign(state, { x: 30, y: 130, all: { ...defaults.all }, single: { ...defaults.single }, full: { ...defaults.full } }); layout(); save(); });
  function gesture(target, resize) {
    target.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button,input')) return;
      e.preventDefault(); target.setPointerCapture(e.pointerId);
      dragging = true; updateChrome();
      const initial = { x: e.clientX, y: e.clientY, left: state.x, top: state.y, ...state[state.mode] };
      const move = event => { const dx = event.clientX - initial.x, dy = event.clientY - initial.y;
        if (resize) { state[state.mode].w = initial.w + dx; state[state.mode].h = initial.h + dy; }
        else { state.x = initial.left + dx; state.y = initial.top + dy; } layout(); };
      const end = () => { dragging = false; target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); save(); updateChrome(); };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
    });
  }
  gesture(box.querySelector('header'), false); gesture(box.querySelector('i'), true);
  window.addEventListener('resize', () => { layout(); save(); });
  // Discover rebuilt source panels without observing or writing navigation
  // attributes. Once the button exists this callback performs no mutations.
  const buttonObserver = new MutationObserver(() => ensureOpenButton());
  buttonObserver.observe(document.body, { childList: true, subtree: true });
  layout(); ensureOpenButton();
})();
