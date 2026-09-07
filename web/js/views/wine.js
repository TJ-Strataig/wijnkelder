// Detailpagina van een wijn: gegevens, drinkvenster, flessen, proefnotities, spijs-wijn en prijsindicatie.
import { el, clear, field, input, select, checkbox, modal, confirmDialog, toast, typeLabel, TYPE_ICONS, stars, drinkStatus, money, fmtDate, wineTitle, REMOVE_REASONS } from '../util.js';
import { api, photoUrl } from '../api.js';
import { invalidateWines } from '../data.js';
import { dishesForWine } from '../pairings.js';
import { producerPanel } from './producers.js';

const year = new Date().getFullYear();

export async function render(main, { params, navigate }) {
  const id = params[0];
  let data = await api.get(`/api/wines/${id}`);
  const root = el('div');
  main.append(root);

  async function reload() {
    data = await api.get(`/api/wines/${id}`);
    invalidateWines();
    draw();
  }

  function draw() {
    clear(root);
    const { wine: w, bottles, tastings } = data;
    const inCellar = bottles.filter((b) => b.status === 'in_cellar');
    const status = drinkStatus(w, year);

    root.append(el('div', { class: 'row between' },
      el('a', { href: '#/kelder', class: 'muted small', text: '← Terug naar de kelder' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost sm', type: 'button', text: w.favorite ? '★ Favoriet' : '☆ Favoriet', onClick: async () => { await api.post(`/api/wines/${w.id}/favorite`, { favorite: !w.favorite }); reload(); } }),
        el('a', { class: 'btn secondary sm', href: `#/wijn/${w.id}/bewerken`, text: '✎ Bewerken' }))));

    // Hero
    const hero = el('div', { class: 'detail-hero', style: { marginTop: '0.8rem' } });
    const img = w.label_image_url
      ? el('img', { class: 'label-img', src: photoUrl(w.label_image_url), alt: `Etiket van ${w.name}` })
      : el('div', { class: 'label-img', style: { display: 'grid', placeItems: 'center', fontSize: '4rem' }, text: TYPE_ICONS[w.type] || '🍇' });
    const info = el('div', { class: 'stack' });
    info.append(el('h1', { text: w.name + (w.vintage ? ` ${w.vintage}` : ' (non-vintage)') }));
    if (w.producer) info.append(el('div', { class: 'muted', style: { fontSize: '1.05rem' }, text: w.producer }));
    const badges = el('div', { class: 'badges' });
    badges.append(el('span', { class: `badge`, text: `${TYPE_ICONS[w.type]} ${typeLabel(w.type)}` }));
    if (status) badges.append(el('span', { class: `badge ${status.cls}`, text: status.label }));
    if (w.aging_wine) badges.append(el('span', { class: 'badge gold', text: 'Bewaarwijn' }));
    badges.append(el('span', { class: 'badge', text: `${inCellar.length} in de kelder` }));
    if (w.avg_rating) badges.append(el('span', { class: 'badge' }, el('span', { class: 'stars', text: stars(w.avg_rating) }), ` ${Math.round(w.avg_rating)}/100`));
    info.append(badges);

    const kv = el('dl', { class: 'kv' });
    const add = (k, v) => { if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) kv.append(el('dt', { text: k }), el('dd', { text: Array.isArray(v) ? v.join(', ') : String(v) })); };
    add('Herkomst', [w.appellation, w.region, w.country].filter(Boolean).join(', '));
    add('Druiven', w.grapes);
    add('Alcohol', w.alcohol ? `${w.alcohol}%` : null);
    add('Inhoud', w.volume_ml ? `${w.volume_ml} ml` : null);
    add('Stijl', [w.sweetness, w.body && `${w.body} van body`, w.tannin && `tannine ${w.tannin}`, w.acidity && `zuren ${w.acidity}`].filter(Boolean).join(' · '));
    add('Serveren', [w.serving_temp, w.decant_minutes ? `${w.decant_minutes} min decanteren` : null].filter(Boolean).join(' · '));
    add('Locatie', w.locations);
    const priceInfo = [];
    const paid = inCellar.filter((b) => b.price !== null && !b.gifted).map((b) => b.price);
    if (paid.length) priceInfo.push(`betaald gem. ${money(paid.reduce((a, b) => a + b, 0) / paid.length)}`);
    if (w.estimated_price) priceInfo.push(`indicatie ${money(w.estimated_price)}${w.estimated_price_min && w.estimated_price_max ? ` (${money(w.estimated_price_min)} – ${money(w.estimated_price_max)})` : ''}`);
    add('Prijs', priceInfo.join(' · '));
    info.append(kv);

    // Drinkvenster
    if (w.drink_from || w.drink_until || w.peak_from || w.peak_until) {
      const from = Math.min(w.drink_from || w.peak_from || year, year) - 1;
      const until = Math.max(w.drink_until || w.peak_until || year, year) + 1;
      const n = Math.min(until - from + 1, 40);
      const tl = el('div', { class: 'timeline', style: { '--n': n } });
      for (let y = from; y < from + n; y++) {
        const cls = [];
        if ((w.drink_from ?? -Infinity) <= y && y <= (w.drink_until ?? Infinity) && (w.drink_from || w.drink_until)) cls.push('drink');
        if (w.peak_from && w.peak_until && w.peak_from <= y && y <= w.peak_until) cls.push('peak');
        if (y === year) cls.push('now');
        tl.append(el('span', { class: cls.join(' '), title: String(y) }));
      }
      info.append(el('div', {},
        el('div', { class: 'small muted', text: `Drinkvenster ${w.drink_from || '?'} – ${w.drink_until || '?'}${w.peak_from ? ` · hoogtepunt ${w.peak_from} – ${w.peak_until || '?'}` : ''}` }),
        tl,
        el('div', { class: 'row small muted' }, el('span', { text: `${from}` }), el('span', { class: 'grow' }), el('span', { text: `${from + n - 1}` }))));
    }

    hero.append(img, info);
    root.append(hero);

    // Beschrijving & ontwikkeling
    if (w.description || w.development || w.notes || w.tasting_profile) {
      const c = el('div', { class: 'card', style: { marginTop: '1rem' } });
      if (w.description) c.append(el('p', { text: w.description }));
      if (w.tasting_profile?.aromas?.length) c.append(el('p', { class: 'small' }, el('strong', { text: 'Aroma\'s: ' }), w.tasting_profile.aromas.join(', ')));
      if (w.tasting_profile?.flavors?.length) c.append(el('p', { class: 'small' }, el('strong', { text: 'Smaak: ' }), w.tasting_profile.flavors.join(', ')));
      if (w.development) c.append(el('p', {}, el('strong', { text: 'Ontwikkeling: ' }), w.development));
      if (w.notes) c.append(el('p', { class: 'note', text: w.notes }));
      root.append(c);
    }

    // Wijnhuis & herkomst
    if (w.producer) {
      const pc = producerPanel(w.producer, { compact: true });
      root.append(pc);
    }
    if (w.latitude !== null && w.latitude !== undefined) {
      root.append(el('p', { class: 'small' }, el('a', { href: '#/herkomst', text: '🗺️ Bekijk de herkomst op de kaart' }), el('span', { class: 'muted', text: w.geo_label ? ` · ${w.geo_label}` : '' })));
    }

    // Prijsindicatie (vooral voor gekregen flessen)
    const priceCard = el('div', { class: 'card' });
    priceCard.append(el('h2', { style: { marginTop: 0 }, text: 'Prijsindicatie' }));
    if (w.estimated_price) {
      priceCard.append(el('p', {}, el('span', { class: 'score', text: money(w.estimated_price) }), w.estimated_price_min ? ` (${money(w.estimated_price_min)} – ${money(w.estimated_price_max)})` : ''));
      const src = w.estimated_price_source;
      if (src) {
        priceCard.append(el('p', { class: 'small muted', text: `${src.method === 'web+ai' ? 'Op basis van webresultaten en AI' : 'AI-schatting'}${src.confidence !== null && src.confidence !== undefined ? ` · zekerheid ${Math.round(src.confidence * 100)}%` : ''} · ${fmtDate(w.estimated_price_at)}` }));
        if (src.reasoning) priceCard.append(el('p', { class: 'small', text: src.reasoning }));
        const links = (src.sources || []).filter((s) => { try { return new URL(s.url).protocol === 'https:'; } catch { return false; } });
        if (links.length) priceCard.append(el('ul', { class: 'small' }, links.map((s) => el('li', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title || s.url })))));
      }
    } else {
      priceCard.append(el('p', { class: 'muted small', text: inCellar.some((b) => b.gifted) ? 'Deze wijn is (deels) gekregen. Haal een prijsindicatie op om de waarde van de kelder compleet te maken.' : 'Nog geen prijsindicatie opgehaald.' }));
    }
    const priceBtn = el('button', { class: 'btn secondary sm', type: 'button', text: w.estimated_price ? 'Prijsindicatie vernieuwen' : 'Prijsindicatie ophalen' });
    priceBtn.addEventListener('click', async () => {
      priceBtn.disabled = true; priceBtn.textContent = 'Bezig…';
      try { await api.post('/api/ai/price', { wine_id: w.id }); toast('Prijsindicatie bijgewerkt', 'ok'); await reload(); }
      catch (e) { toast(e.message, 'error'); priceBtn.disabled = false; priceBtn.textContent = 'Prijsindicatie ophalen'; }
    });
    priceCard.append(priceBtn);
    root.append(priceCard);

    // Spijs-wijn
    const pairCard = el('div', { class: 'card' });
    pairCard.append(el('h2', { style: { marginTop: 0 }, text: 'Lekker bij' }));
    const rules = dishesForWine(w);
    const pills = el('div', { class: 'pill-list' });
    for (const p of (w.food_pairings || [])) pills.append(el('span', { class: 'badge gold', text: p }));
    for (const r of rules) if (!(w.food_pairings || []).includes(r.dish.name)) pills.append(el('span', { class: 'badge', text: r.dish.name, title: `Score ${r.score}` }));
    pairCard.append(pills.childElementCount ? pills : el('p', { class: 'muted small', text: 'Nog geen gerechten bekend.' }));
    const dishBtn = el('button', { class: 'btn secondary sm', type: 'button', style: { marginTop: '0.7rem' }, text: '🍽️ Vraag de AI-sommelier om gerechten' });
    dishBtn.addEventListener('click', async () => {
      dishBtn.disabled = true;
      try {
        const res = await api.post('/api/ai/dishes', { wine_id: w.id });
        modal({
          title: 'Gerechten bij deze wijn',
          body: el('div', {}, el('ul', {}, res.dishes.map((d) => el('li', {}, el('strong', { text: d.name }), d.why ? ` — ${d.why}` : ''))),
            res.avoid?.length ? el('p', { class: 'small muted', text: `Liever niet: ${res.avoid.join(', ')}` }) : null),
          actions: [{ label: 'Sluiten' }],
          onClose: reload,
        });
      } catch (e) { toast(e.message, 'error'); } finally { dishBtn.disabled = false; }
    });
    pairCard.append(dishBtn);
    root.append(pairCard);

    // Flessen
    const bCard = el('div', { class: 'card' });
    bCard.append(el('div', { class: 'row between' }, el('h2', { style: { margin: 0 }, text: `Flessen (${inCellar.length} in de kelder)` }),
      el('button', { class: 'btn gold sm', type: 'button', text: '＋ Flessen toevoegen', onClick: () => addBottlesDialog(w, reload) })));
    if (bottles.length) {
      const tbl = el('table', { class: 'table' });
      tbl.append(el('thead', {}, el('tr', {}, ['Status', 'Locatie', 'Prijs', 'Gekocht', 'Toegevoegd door', ''].map((h) => el('th', { text: h })))));
      const tb = el('tbody');
      for (const b of bottles) {
        const st = b.status === 'in_cellar' ? el('span', { class: 'badge ok', text: 'In kelder' }) : el('span', { class: 'badge', text: `${REMOVE_REASONS[b.status] || b.status} · ${fmtDate(b.removed_at)}` });
        const actions = el('div', { class: 'row' });
        if (b.status === 'in_cellar') {
          actions.append(
            el('button', { class: 'btn sm', type: 'button', text: '🍷 Openen', onClick: () => removeBottleDialog(w, b, reload) }),
            el('button', { class: 'btn ghost sm', type: 'button', text: '✎', title: 'Fles bewerken', onClick: () => editBottleDialog(w, b, reload) }));
        } else {
          actions.append(el('button', { class: 'btn ghost sm', type: 'button', text: 'Terugzetten', onClick: async () => { await api.post(`/api/wines/${w.id}/bottles/${b.id}/restore`); toast('Fles teruggezet in de kelder'); reload(); } }));
        }
        tb.append(el('tr', {},
          el('td', {}, st, b.removed_note ? el('div', { class: 'small muted', text: b.removed_note }) : null),
          el('td', { text: b.location || '—' }),
          el('td', {}, b.gifted ? `🎁 gekregen${b.gifted_from ? ` van ${b.gifted_from}` : ''}` : money(b.price, b.currency), b.size_ml && b.size_ml !== 750 ? el('div', { class: 'small muted', text: `${b.size_ml} ml` }) : null),
          el('td', { text: [fmtDate(b.purchase_date), b.purchase_place].filter((x) => x && x !== '—').join(' · ') || '—' }),
          el('td', { text: b.added_by_name || '—' }),
          el('td', {}, actions)));
      }
      tbl.append(tb);
      bCard.append(el('div', { class: 'table-wrap' }, tbl));
    } else {
      bCard.append(el('p', { class: 'muted small', text: 'Nog geen flessen geregistreerd.' }));
    }
    root.append(bCard);

    // Proefnotities
    const tCard = el('div', { class: 'card' });
    tCard.append(el('div', { class: 'row between' }, el('h2', { style: { margin: 0 }, text: 'Proefnotities' }),
      el('button', { class: 'btn secondary sm', type: 'button', text: '＋ Proefnotitie', onClick: () => tastingDialog(w, null, reload) })));
    if (!tastings.length) tCard.append(el('p', { class: 'muted small', text: 'Nog geen proefnotities. Voeg er een toe als je een fles opent.' }));
    for (const t of tastings) tCard.append(tastingNote(t, reload));
    root.append(tCard);

    // Verwijderen
    root.append(el('div', { class: 'row', style: { marginTop: '1rem', justifyContent: 'flex-end' } },
      el('button', { class: 'btn ghost sm', type: 'button', text: 'Wijn volledig verwijderen', onClick: async () => {
        if (!(await confirmDialog('Wijn verwijderen', `"${wineTitle(w)}" en alle flessen verwijderen? Dit kan alleen als er geen historie is.`, { okLabel: 'Verwijderen', danger: true }))) return;
        try { await api.del(`/api/wines/${w.id}`); invalidateWines(); toast('Wijn verwijderd'); navigate('/kelder'); } catch (e) { toast(e.message, 'error'); }
      } })));
  }

  draw();
}

export function tastingNote(t, reload) {
  const n = el('div', { class: 'note' });
  n.append(el('div', { class: 'row between' },
    el('div', {}, el('strong', { text: t.user_name }), el('span', { class: 'muted small', text: ` · ${fmtDate(t.tasted_at)}${t.occasion ? ` · ${t.occasion}` : ''}` })),
    t.rating ? el('span', {}, el('span', { class: 'stars', text: stars(t.rating) }), el('span', { class: 'small muted', text: ` ${t.rating}/100` })) : null));
  const parts = [['Kleur', t.appearance], ['Neus', t.nose], ['Smaak', t.palate], ['Afdronk', t.finish], ['Gegeten met', t.paired_with]].filter(([, v]) => v);
  for (const [k, v] of parts) n.append(el('div', { class: 'small' }, el('strong', { text: `${k}: ` }), v));
  if (t.notes) n.append(el('p', { style: { margin: '0.3rem 0 0' }, text: t.notes }));
  if (t.would_buy_again !== null && t.would_buy_again !== undefined) n.append(el('div', { class: 'small muted', text: t.would_buy_again ? '👍 Opnieuw kopen' : '👎 Niet opnieuw kopen' }));
  if (reload) n.append(el('button', { class: 'btn ghost sm', type: 'button', style: { marginTop: '0.4rem' }, text: 'Verwijderen', onClick: async () => {
    if (!(await confirmDialog('Proefnotitie verwijderen', 'Weet je het zeker?', { okLabel: 'Verwijderen', danger: true }))) return;
    try { await api.del(`/api/wines/${t.wine_id}/tastings/${t.id}`); reload(); } catch (e) { toast(e.message, 'error'); }
  } }));
  return n;
}

// ---- dialogen ---------------------------------------------------------------

export function bottleForm(defaults = {}) {
  const qty = el('input', { type: 'number', min: 1, max: 500, value: defaults.quantity ?? 1 });
  const price = el('input', { type: 'number', min: 0, step: '0.01', placeholder: '0,00', value: defaults.price ?? '' });
  const gifted = checkbox('Gekregen fles (cadeau)', { checked: !!defaults.gifted });
  const giftedFrom = input({ placeholder: 'Van wie?', value: defaults.gifted_from || '', maxlength: 120 });
  const date = el('input', { type: 'date', value: defaults.purchase_date || new Date().toISOString().slice(0, 10) });
  const place = input({ placeholder: 'Winkel / wijnhandel', value: defaults.purchase_place || '', maxlength: 150 });
  const location = input({ placeholder: 'Bijv. Rek A, plank 2', value: defaults.location || '', maxlength: 120, list: 'locaties' });
  const size = select([[750, '750 ml (standaard)'], [375, '375 ml (halve fles)'], [500, '500 ml'], [1500, '1,5 l (magnum)'], [3000, '3 l (dubbele magnum)'], [187, '187 ml (piccolo)']], { value: defaults.size_ml ?? 750 });
  const giftWrap = field('Gekregen van', giftedFrom);
  giftWrap.hidden = !gifted.input.checked;
  const priceField = field(gifted.input.checked ? 'Prijs (optioneel, voor waarde kelder)' : 'Prijs per fles (€)', price);
  gifted.input.addEventListener('change', () => { giftWrap.hidden = !gifted.input.checked; priceField.firstChild.textContent = gifted.input.checked ? 'Prijs (optioneel)' : 'Prijs per fles (€)'; });
  const node = el('div', { class: 'form-grid' },
    defaults.hideQty ? null : field('Aantal flessen', qty), field('Inhoud', size), priceField,
    el('div', { class: 'field' }, gifted.wrap), giftWrap,
    field('Aankoop-/ontvangstdatum', date), field('Gekocht bij', place), field('Locatie in de kelder', location));
  return {
    node,
    values: () => ({
      quantity: Number(qty.value) || 1, size_ml: Number(size.value), price: price.value === '' ? null : Number(price.value), gifted: gifted.input.checked,
      gifted_from: giftedFrom.value.trim() || null, purchase_date: date.value || null, purchase_place: place.value.trim() || null, location: location.value.trim() || null,
    }),
  };
}

function addBottlesDialog(w, reload) {
  const form = bottleForm({ location: (w.locations || '').split(',')[0] || '' });
  modal({
    title: `Flessen toevoegen — ${w.name}`,
    body: form.node,
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Toevoegen', class: 'gold', onClick: async () => { await api.post(`/api/wines/${w.id}/bottles`, form.values()); toast('Flessen toegevoegd', 'ok'); reload(); } }],
  });
}

function editBottleDialog(w, b, reload) {
  const form = bottleForm({ ...b, hideQty: true });
  modal({
    title: 'Fles bewerken',
    body: form.node,
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Opslaan', onClick: async () => { await api.put(`/api/wines/${w.id}/bottles/${b.id}`, form.values()); toast('Fles bijgewerkt', 'ok'); reload(); } }],
  });
}

export function tastingFields(defaults = {}) {
  const date = el('input', { type: 'date', value: defaults.tasted_at || new Date().toISOString().slice(0, 10) });
  const rating = el('input', { type: 'range', min: 50, max: 100, value: defaults.rating || 85, step: 1 });
  const ratingOut = el('output', { text: `${rating.value}/100 ${stars(rating.value)}` });
  rating.addEventListener('input', () => { ratingOut.textContent = `${rating.value}/100 ${stars(rating.value)}`; });
  const noRating = checkbox('Geen score geven');
  const appearance = input({ placeholder: 'Kleur, helderheid', maxlength: 500 });
  const nose = input({ placeholder: 'Aroma\'s: fruit, hout, kruiden…', maxlength: 1000 });
  const palate = input({ placeholder: 'Smaak, zuren, tannine, body', maxlength: 1000 });
  const finish = input({ placeholder: 'Lengte en indruk van de afdronk', maxlength: 500 });
  const occasion = input({ placeholder: 'Bijv. verjaardag, zondagse lunch', maxlength: 200 });
  const paired = input({ placeholder: 'Wat hebben we erbij gegeten?', maxlength: 200 });
  const notes = el('textarea', { placeholder: 'Vrije notities', maxlength: 3000 });
  const again = select([['', 'Weet ik niet'], ['1', '👍 Ja, opnieuw kopen'], ['0', '👎 Nee, liever niet']]);
  const node = el('div', { class: 'form-grid' },
    field('Datum', date),
    el('div', { class: 'field full' }, el('span', { text: 'Score' }), rating, el('div', { class: 'row between' }, ratingOut, noRating.wrap)),
    field('Kleur', appearance), field('Neus', nose), field('Smaak', palate), field('Afdronk', finish),
    field('Gelegenheid', occasion), field('Gegeten met', paired), field('Opnieuw kopen?', again),
    el('div', { class: 'full' }, field('Notities', notes)));
  return {
    node,
    values: () => ({
      tasted_at: date.value, rating: noRating.input.checked ? null : Number(rating.value), appearance: appearance.value, nose: nose.value, palate: palate.value, finish: finish.value,
      occasion: occasion.value, paired_with: paired.value, notes: notes.value, would_buy_again: again.value === '' ? null : again.value === '1',
    }),
  };
}

function tastingDialog(w, bottleId, reload) {
  const form = tastingFields();
  modal({
    title: `Proefnotitie — ${w.name}`,
    body: form.node,
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Opslaan', class: 'gold', onClick: async () => { await api.post(`/api/wines/${w.id}/tastings`, { ...form.values(), bottle_id: bottleId }); toast('Proefnotitie opgeslagen', 'ok'); reload(); } }],
  });
}

function removeBottleDialog(w, b, reload) {
  const reason = select(Object.entries(REMOVE_REASONS), { value: 'consumed' });
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const note = input({ placeholder: 'Bijv. weggegeven aan Peter, kurk, etc.', maxlength: 1000 });
  const withTasting = checkbox('Direct een proefnotitie toevoegen', { checked: true });
  const tasting = tastingFields();
  const tastingWrap = el('fieldset', {}, el('legend', { text: 'Proefnotitie' }), tasting.node);
  const toggle = () => { tastingWrap.hidden = !(withTasting.input.checked && reason.value === 'consumed'); withTasting.wrap.hidden = reason.value !== 'consumed'; };
  reason.addEventListener('change', toggle); withTasting.input.addEventListener('change', toggle); toggle();
  modal({
    title: `Fles uit de kelder — ${w.name}`,
    body: el('div', {}, el('div', { class: 'form-grid' }, field('Wat is er met de fles gebeurd?', reason), field('Datum', date), el('div', { class: 'full' }, field('Opmerking', note))), withTasting.wrap, el('div', { style: { height: '0.6rem' } }), tastingWrap),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Bevestigen', class: 'gold', onClick: async () => {
      const payload = { reason: reason.value, date: date.value, note: note.value };
      if (reason.value === 'consumed' && withTasting.input.checked) payload.tasting = tasting.values();
      await api.post(`/api/wines/${w.id}/bottles/${b.id}/remove`, payload);
      toast(reason.value === 'consumed' ? 'Proost! Fles naar de historie verplaatst.' : 'Fles naar de historie verplaatst', 'ok');
      reload();
    } }],
  });
}
