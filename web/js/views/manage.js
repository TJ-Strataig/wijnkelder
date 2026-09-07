// Voorraaddoelen (aankooplijst met budget), inventarisatie en cadeau-register.
import { el, clear, field, input, select, modal, confirmDialog, toast, typeLabel, TYPE_LABELS, TYPE_ICONS, money, fmtDate, fmtDateTime, wineTitle, stars } from '../util.js';
import { api, photoUrl } from '../api.js';
import { invalidateWines } from '../data.js';
import { scanBarcode } from '../barcode.js';

export async function render(main, { query }) {
  main.append(el('h1', { text: 'Voorraad & beheer' }));
  const tabs = el('div', { class: 'tabs' }); const body = el('div');
  main.append(tabs, body);
  let mode = ['targets', 'inventory', 'gifts'].includes(query.get('tab')) ? query.get('tab') : 'targets';
  for (const [key, label] of [['targets', '🛒 Aankooplijst'], ['inventory', '📋 Inventarisatie'], ['gifts', '🎁 Cadeaus']]) {
    const b = el('button', { type: 'button', class: key === mode ? 'active' : '', text: label });
    b.addEventListener('click', () => { mode = key; tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); show(); });
    tabs.append(b);
  }
  async function show() { clear(body); await ({ targets: targetsView, inventory: inventoryView, gifts: giftsView })[mode](body); }
  show();
}

// ---- Aankooplijst met budget -------------------------------------------------
async function targetsView(body) {
  body.append(el('p', { class: 'muted small', text: 'Stel voorraaddoelen in, bijvoorbeeld "altijd minimaal 6 doordeweekse witte wijnen onder € 12". De app meldt tekorten en stelt wijnen voor die eerder goed scoorden. Op zaterdagochtend krijg je een melding als er iets bij moet.' }));
  const top = el('div', { class: 'row between' }); const list = el('div', { class: 'stack' });
  body.append(top, list);
  async function load() {
    clear(top); clear(list);
    const d = await api.get('/api/targets');
    const short = d.targets.filter((t) => t.shortage > 0);
    top.append(el('span', { class: 'muted small', text: short.length ? `${short.length} tekort${short.length === 1 ? '' : 'en'} · geschatte aankoop ${money(d.total_shortage_cost)}` : (d.targets.length ? 'Alle voorraaddoelen zijn op peil 👌' : '') }),
      el('button', { class: 'btn gold sm', type: 'button', text: '＋ Voorraaddoel', onClick: () => addDialog(load) }));
    if (!d.targets.length) return list.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🛒' }), el('p', { text: 'Nog geen voorraaddoelen. Maak er een aan, bijvoorbeeld "Doordeweeks rood, min. 6 flessen, max. € 12".' })));
    for (const t of d.targets) {
      const c = el('div', { class: 'card', style: t.shortage ? { borderLeft: '4px solid var(--warn)' } : { borderLeft: '4px solid var(--ok)' } });
      c.append(el('div', { class: 'row between' },
        el('div', {}, el('strong', { text: t.label }), el('div', { class: 'small muted', text: [t.type ? typeLabel(t.type) : 'alle types', t.country, t.region, t.grape, t.max_price ? `max ${money(t.max_price)}` : null, t.min_price ? `min ${money(t.min_price)}` : null].filter(Boolean).join(' · ') })),
        el('div', { class: 'row' }, el('span', { class: `badge ${t.ok ? 'ok' : 'warn'}`, text: `${t.in_stock} / ${t.min_bottles}` }), el('button', { class: 'btn ghost sm', type: 'button', text: '✕', onClick: async () => { if (await confirmDialog('Verwijderen', `Voorraaddoel "${t.label}" verwijderen?`, { okLabel: 'Verwijderen', danger: true })) { await api.del(`/api/targets/${t.id}`); load(); } } }))));
      const pct = Math.min(100, (t.in_stock / t.min_bottles) * 100);
      c.append(el('div', { class: 'bar', style: { gridTemplateColumns: '1fr 60px', marginTop: '0.4rem' } }, el('div', { class: 'track' }, el('div', { class: 'fill', style: { width: `${pct}%` } })), el('span', { class: 'small muted', text: t.shortage ? `−${t.shortage}` : 'ok' })));
      if (t.shortage) c.append(el('p', { class: 'small', style: { margin: '0.4rem 0 0' }, text: `Nog ${t.shortage} fles${t.shortage === 1 ? '' : 'sen'} nodig · geschat ${money(t.estimated_cost)}${t.budget ? ` · budget ${money(t.budget)}/mnd` : ''}` }));
      if (t.suggestions.length) c.append(el('div', { class: 'small', style: { marginTop: '0.4rem' } }, el('strong', { text: 'Eerder goed bevallen: ' }), t.suggestions.map((s, i) => el('span', {}, i ? ', ' : '', el('a', { href: `#/wijn/${s.wine_id}`, text: wineTitle(s) }), ` (${Math.round(s.avg_rating)})`))));
      list.append(c);
    }
  }
  function addDialog(reload) {
    const label = input({ placeholder: 'Bijv. Doordeweeks wit', maxlength: 120 });
    const type = select([['', 'Alle types'], ...Object.entries(TYPE_LABELS)]);
    const minB = el('input', { type: 'number', min: 1, max: 1000, value: 6 });
    const maxP = el('input', { type: 'number', min: 0, step: '0.5', placeholder: 'bijv. 12' });
    const country = input({ placeholder: 'optioneel', maxlength: 100 }); const region = input({ placeholder: 'optioneel, bijv. Rioja', maxlength: 150 }); const grape = input({ placeholder: 'optioneel, bijv. Riesling', maxlength: 80 });
    const budget = el('input', { type: 'number', min: 0, placeholder: 'optioneel' });
    modal({ title: 'Voorraaddoel', body: el('div', { class: 'form-grid' }, el('div', { class: 'full' }, field('Naam *', label)), field('Type', type), field('Minimaal aantal flessen', minB), field('Max. prijs per fles €', maxP), field('Land', country), field('Streek', region), field('Druif', grape), field('Maandbudget €', budget)),
      actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Opslaan', class: 'gold', onClick: async () => { if (!label.value.trim()) { toast('Naam is verplicht', 'error'); return true; } await api.post('/api/targets', { label: label.value, type: type.value || null, min_bottles: minB.value, max_price: maxP.value || null, country: country.value || null, region: region.value || null, grape: grape.value || null, budget: budget.value || null }); reload(); } }] });
  }
  await load();
}

// ---- Inventarisatie ----------------------------------------------------------
async function inventoryView(body) {
  body.append(el('p', { class: 'muted small', text: 'Tel de kelder: de app toont per wijn hoeveel flessen er zouden moeten liggen; jij vinkt af of past het aantal aan. Verschillen worden zichtbaar en kun je direct verwerken. Handig: scan de streepjescode om een wijn snel te vinden.' }));
  const hist = await api.get('/api/inventory');
  const start = el('button', { class: 'btn gold', type: 'button', text: '📋 Nieuwe telronde starten' });
  const area = el('div');
  body.append(el('div', { class: 'row' }, start), area);
  if (hist.sessions.length) {
    const c = el('div', { class: 'card', style: { marginTop: '1rem' } }, el('h3', { style: { marginTop: 0 }, text: 'Eerdere tellingen' }));
    for (const s of hist.sessions) c.append(el('div', { class: 'row between small', style: { padding: '0.3rem 0', borderBottom: '1px solid var(--line)' } }, el('span', { text: `${fmtDateTime(s.started_at)} · ${s.started_by_name || ''}` }), el('span', { class: 'muted', text: s.finished_at ? `${s.seen}/${s.expected} gezien${s.missing ? ` · ${s.missing} ontbrak` : ''}` : 'niet afgerond' })));
    body.append(c);
  }
  start.addEventListener('click', async () => {
    start.disabled = true;
    const d = await api.post('/api/inventory/start', {});
    clear(area);
    const counts = {}; for (const w of d.wines) counts[w.id] = w.expected;
    const status = el('div', { class: 'row between', style: { margin: '0.8rem 0' } });
    const search = el('input', { type: 'search', placeholder: 'Zoek wijn…' });
    const scanBtn = el('button', { class: 'btn secondary sm', type: 'button', text: '📷 Scan streepjescode' });
    const list = el('div', { class: 'card' });
    area.append(el('div', { class: 'toolbar' }, search, scanBtn), status, list);
    const rows = new Map();
    function updateStatus() { const total = d.wines.reduce((s, w) => s + counts[w.id], 0); const diff = total - d.expected; status.textContent = `Verwacht ${d.expected} · geteld ${total}${diff ? ` · verschil ${diff > 0 ? '+' : ''}${diff}` : ' · klopt'}`; }
    function draw() {
      clear(list); const q = search.value.toLowerCase();
      for (const w of d.wines) {
        if (q && !`${w.producer || ''} ${w.name} ${w.vintage || ''} ${w.locations || ''}`.toLowerCase().includes(q)) continue;
        const n = el('input', { type: 'number', min: 0, max: 1000, value: counts[w.id], style: { width: '4.5rem' }, 'aria-label': 'Geteld' });
        n.addEventListener('input', () => { counts[w.id] = Number(n.value) || 0; row.classList.toggle('inv-diff', counts[w.id] !== w.expected); updateStatus(); });
        const row = el('div', { class: `row between inv-row ${counts[w.id] !== w.expected ? 'inv-diff' : ''}`, style: { padding: '0.45rem 0', borderBottom: '1px solid var(--line)' } },
          el('div', {}, el('strong', { text: `${TYPE_ICONS[w.type] || ''} ${wineTitle(w)}` }), el('div', { class: 'small muted', text: `${w.locations || 'geen locatie'} · verwacht ${w.expected}` })),
          el('div', { class: 'row' }, el('button', { class: 'btn ghost sm', type: 'button', text: '−', onClick: () => { n.value = Math.max(0, Number(n.value) - 1); n.dispatchEvent(new Event('input')); } }), n, el('button', { class: 'btn ghost sm', type: 'button', text: '+', onClick: () => { n.value = Number(n.value) + 1; n.dispatchEvent(new Event('input')); } }), el('button', { class: 'btn sm', type: 'button', text: '✓', title: 'Klopt', onClick: () => { n.value = w.expected; n.dispatchEvent(new Event('input')); row.classList.add('inv-ok'); } })));
        rows.set(w.id, row); list.append(row);
      }
      updateStatus();
    }
    search.addEventListener('input', draw); draw();
    scanBtn.addEventListener('click', async () => { try { const code = await scanBarcode(); if (!code) return; const r = await api.get(`/api/barcode?code=${encodeURIComponent(code)}`); if (r.found) { search.value = r.wine.name; draw(); rows.get(r.wine.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast(`Gevonden: ${r.wine.name}`, 'ok'); } else toast('Streepjescode niet bekend in de kelder', 'error'); } catch (e) { toast(e.message, 'error'); } });
    const finish = el('button', { class: 'btn gold', type: 'button', text: 'Telling afronden' });
    area.append(el('div', { class: 'row', style: { marginTop: '1rem' } }, finish, el('button', { class: 'btn ghost', type: 'button', text: 'Annuleren', onClick: () => { clear(area); start.disabled = false; } })));
    finish.addEventListener('click', async () => {
      const missing = d.wines.reduce((s, w) => s + Math.max(0, w.expected - counts[w.id]), 0);
      const extra = d.wines.filter((w) => counts[w.id] > w.expected);
      let resolve = 'report';
      if (missing) {
        const ok = await confirmDialog('Ontbrekende flessen', `${missing} fles${missing === 1 ? '' : 'sen'} niet aangetroffen. Wil je die uit de kelder afboeken (naar de historie met reden "niet aangetroffen bij inventarisatie")? Kies Nee om alleen te registreren.`, { okLabel: 'Ja, afboeken' });
        resolve = ok ? 'remove_missing' : 'report';
      }
      const r = await api.post(`/api/inventory/${d.session_id}/finish`, { counts, resolve });
      invalidateWines();
      clear(area);
      area.append(el('div', { class: 'card' }, el('h3', { style: { marginTop: 0 }, text: 'Telling afgerond' }), el('p', { text: `Verwacht ${r.expected}, gezien ${r.seen}, ontbrekend ${r.missing}${r.resolved === 'remove_missing' && r.missing ? ' (afgeboekt naar historie)' : ''}.` }),
        extra.length ? el('p', { class: 'small' }, el('strong', { text: 'Meer geteld dan verwacht: ' }), extra.map((w) => `${wineTitle(w)} (+${counts[w.id] - w.expected})`).join(', '), ' — voeg deze flessen toe via de wijnpagina.') : null));
      start.disabled = false;
    });
  });
}

// ---- Cadeau-register ---------------------------------------------------------
async function giftsView(body) {
  const d = await api.get('/api/gifts');
  body.append(el('p', { class: 'muted small', text: 'Alle gekregen flessen, per gever. Bij het openen van een cadeau herinnert de app je eraan de gever te bedanken.' }));
  if (d.to_thank.length) {
    const c = el('div', { class: 'card', style: { borderLeft: '4px solid var(--gold)' } }, el('h3', { style: { marginTop: 0 }, text: '💌 Nog te bedanken' }));
    for (const b of d.to_thank) c.append(el('div', { class: 'row between', style: { padding: '0.3rem 0', borderBottom: '1px solid var(--line)' } }, el('div', {}, el('strong', { text: wineTitle(b) }), el('div', { class: 'small muted', text: `van ${b.gifted_from}${b.gift_occasion ? ` (${b.gift_occasion})` : ''} · gedronken ${fmtDate(b.removed_at)}${b.rating ? ` · ${stars(b.rating)}` : ''}` })), el('button', { class: 'btn sm', type: 'button', text: 'Bedankt ✓', onClick: async () => { await api.patch(`/api/gifts/${b.id}`, { gift_thanked: true }); clear(body); giftsView(body); } })));
    body.append(c);
  }
  if (!d.givers.length) return body.append(el('div', { class: 'empty' }, el('div', { class: 'big', text: '🎁' }), el('p', { text: 'Nog geen gekregen flessen geregistreerd. Vink bij het toevoegen "Gekregen fles" aan en vul in van wie.' })));
  for (const g of d.givers) {
    const c = el('details', { class: 'card' }, el('summary', { style: { cursor: 'pointer' } }, el('strong', { text: g.giver }), el('span', { class: 'muted small', text: ` · ${g.bottles} fles${g.bottles === 1 ? '' : 'sen'} · ${g.in_cellar} in kelder · ${g.consumed} gedronken${g.value ? ` · waarde ± ${money(g.value)}` : ''}` })));
    for (const b of g.items) {
      const occ = input({ value: b.gift_occasion || '', placeholder: 'Gelegenheid, bijv. verjaardag 2026', maxlength: 200, style: { maxWidth: '16rem' } });
      occ.addEventListener('change', async () => { await api.patch(`/api/gifts/${b.id}`, { gift_occasion: occ.value }); toast('Opgeslagen', 'ok'); });
      c.append(el('div', { class: 'row between', style: { padding: '0.35rem 0', borderBottom: '1px solid var(--line)' } }, el('div', {}, el('a', { href: `#/wijn/${b.wine_id}`, text: `${TYPE_ICONS[b.type] || ''} ${wineTitle(b)}` }), el('div', { class: 'small muted', text: `${b.status === 'in_cellar' ? 'in de kelder' : `${b.status === 'consumed' ? 'gedronken' : b.status} ${fmtDate(b.removed_at)}`}${b.purchase_date ? ` · ontvangen ${fmtDate(b.purchase_date)}` : ''}${b.rating ? ` · ${stars(b.rating)}` : ''}` })), occ));
    }
    body.append(c);
  }
}
