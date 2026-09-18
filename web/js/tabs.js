import { el, clear } from './util.js';

export async function renderTabs(main, { path, query, tabs, param = 'tab' }) {
  const selected = tabs.some((tab) => tab.key === query.get(param)) ? query.get(param) : tabs[0].key;
  const bar = el('div', { class: 'tabs' });
  const body = el('div');
  const panels = new Map();
  const buttons = new Map();
  main.append(bar, body);

  for (const tab of tabs) {
    const button = el('button', { type: 'button', onClick: async () => {
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      params.set(param, tab.key);
      window.history.replaceState(null, '', `#${path}?${params}`);
      await show(tab);
    } }, tab.label);
    buttons.set(tab.key, button);
    bar.append(button);
  }

  async function show(tab, retry = false) {
    for (const [key, button] of buttons) {
      button.classList.toggle('active', key === tab.key);
      button.setAttribute('aria-pressed', String(key === tab.key));
    }
    clear(body);
    if (!retry && panels.has(tab.key)) {
      body.append(panels.get(tab.key));
      return;
    }
    // Keep inactive forms detached: drafts survive without duplicate datalist IDs in the page.
    const panel = el('div');
    if (tab.retain !== false) panels.set(tab.key, panel);
    const loading = el('p', { class: 'muted small', text: 'Laden...' });
    const content = el('div');
    panel.append(loading, content);
    body.append(panel);
    try {
      await tab.render(content);
      loading.remove();
    } catch (e) {
      clear(panel);
      panel.append(el('p', { class: 'muted', role: 'alert', text: `Laden mislukt: ${e.message}` }),
        el('button', { class: 'btn secondary sm', type: 'button', text: 'Opnieuw proberen', onClick: () => show(tab, true) }));
    }
  }

  await show(tabs.find((tab) => tab.key === selected));
}
