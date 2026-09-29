/* Prefer system appearance; use local time as a fallback, with temporary manual overrides. */
(() => {
  'use strict';
  const root = document.documentElement;
  const storageKey = 'tf-theme-override';
  const lightHour = 7;
  const darkHour = 19;
  const systemDark = queryPreference('(prefers-color-scheme: dark)');
  const systemLight = queryPreference('(prefers-color-scheme: light)');
  const buttons = new WeakSet();
  let timer;
  let connected = false;
  let memoryOnly = false;

  function queryPreference(query) {
    try { return window.matchMedia?.(query); }
    catch { return null; }
  }

  function systemMode() {
    if (systemDark?.matches) return 'dark';
    if (systemLight?.matches) return 'light';
    return null;
  }

  function readOverride() {
    let stored;
    try { stored = localStorage.getItem(storageKey); }
    catch { return undefined; }
    try {
      const value = JSON.parse(stored);
      return value && ['light', 'dark'].includes(value.mode) && Number.isFinite(value.expiresAt)
        ? value : null;
    } catch { return null; }
  }
  let override = readOverride() || null;

  function saveOverride() {
    try {
      if (override) localStorage.setItem(storageKey, JSON.stringify(override));
      else localStorage.removeItem(storageKey);
      memoryOnly = false;
    } catch { memoryOnly = true; }
  }

  function nextChange(now) {
    const next = new Date(now);
    const hour = now.getHours();
    next.setHours(hour < lightHour ? lightHour : hour < darkHour ? darkHour : lightHour, 0, 0, 0);
    if (hour >= darkHour) next.setDate(next.getDate() + 1);
    return next;
  }

  function updateButtons() {
    const dark = root.getAttribute('color-scheme') === 'dark';
    const action = dark ? '浅色模式' : '深色模式';
    const until = new Date(override?.expiresAt || nextChange(new Date()));
    const time = `${String(until.getHours()).padStart(2, '0')}:00`;
    const automatic = systemMode() ? '跟随系统' : '按时间切换';
    document.querySelectorAll('.toggle-mode-btn').forEach(button => {
      let label = button.querySelector('[data-theme-label]');
      if (!label) {
        [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).forEach(node => node.remove());
        label = document.createElement('span');
        label.dataset.themeLabel = '';
        button.append(label);
      }
      label.textContent = action;
      const icon = button.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-moon', !dark);
        icon.classList.toggle('fa-sun', dark);
      }
      button.setAttribute('role', 'button');
      button.tabIndex = 0;
      button.setAttribute('aria-pressed', String(dark));
      button.title = `${override ? '当前手动设置' : `当前${automatic}`}；切换为${action}，${time}恢复${automatic}`;
      button.setAttribute('aria-label', button.title);
      if (!buttons.has(button)) {
        button.addEventListener('click', toggle);
        buttons.add(button);
      }
    });
  }

  function refresh() {
    clearTimeout(timer);
    const now = new Date();
    if (override && override.expiresAt <= now.getTime()) {
      // A restored tab must not erase a newer choice made in another tab.
      const stored = readOverride();
      override = stored && stored.expiresAt > now.getTime() ? stored : null;
      if (!override) saveOverride();
    }
    const hour = now.getHours();
    const system = systemMode();
    const mode = override?.mode || system || (hour >= lightHour && hour < darkHour ? 'light' : 'dark');
    root.setAttribute('color-scheme', mode);
    root.dataset.themeSource = override ? 'manual' : system ? 'system' : 'time';
    root.style.colorScheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#16151e' : '#f5f4f8');
    // The theme's small head bootstrap reads this cache on subsequent page loads.
    try {
      if (localStorage.getItem('color-scheme') !== mode) localStorage.setItem('color-scheme', mode);
    } catch { /* Appearance does not depend on storage access. */ }
    const dark = window.volantis?.dark;
    if (dark) {
      const changed = dark.mode !== mode;
      dark.mode = mode;
      if (connected && changed) dark.method.toggle.start();
    }
    if (connected) updateButtons();
    const deadline = Math.min(nextChange(now).getTime(), override?.expiresAt || Infinity);
    // Check clock changes periodically, while scheduling exact morning/evening boundaries.
    timer = setTimeout(refresh, Math.max(1, Math.min(deadline - now.getTime(), 60_000)));
  }

  function toggle(event) {
    event?.preventDefault();
    override = {
      mode: root.getAttribute('color-scheme') === 'dark' ? 'light' : 'dark',
      expiresAt: nextChange(new Date()).getTime()
    };
    saveOverride();
    refresh();
  }

  function connect() {
    if (connected) return;
    connected = true;
    if (window.volantis?.dark) window.volantis.dark.toggle = toggle;
    window.volantis?.pjax?.push(refresh, 'time-theme');
    refresh();
  }

  function syncAndRefresh() {
    const stored = readOverride();
    // Readable storage can still reject writes (for example, when its quota is full).
    const pendingChoice = memoryOnly && override && override.expiresAt > Date.now();
    if (!pendingChoice && stored !== undefined) override = stored;
    refresh();
  }

  for (const query of [systemDark, systemLight]) {
    if (query?.addEventListener) query.addEventListener('change', syncAndRefresh);
    else query?.addListener?.(syncAndRefresh);
  }
  window.addEventListener('focus', syncAndRefresh);
  window.addEventListener('pageshow', syncAndRefresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncAndRefresh();
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      syncAndRefresh();
    }
  });
  window.pixelTheme = { connect };
  refresh();
})();
