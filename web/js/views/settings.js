// Instellingen: eigen passkeys, uitloggen, export.
import { el, clear, field, input, select, modal, confirmDialog, toast, fmtDateTime, download } from '../util.js';
import { api, session } from '../api.js';
import { addPasskey, logout, deviceLabel } from '../auth.js';

export async function render(main, { navigate }) {
  const user = session.user;
  main.append(el('h1', { text: 'Instellingen' }), el('p', { class: 'muted', text: `Ingelogd als ${user?.name} (${user?.role === 'admin' ? 'beheerder' : 'lid'})` }));

  // Passkeys
  const pk = el('div', { class: 'card' });
  main.append(pk);
  async function loadPasskeys() {
    clear(pk);
    pk.append(el('div', { class: 'row between' }, el('h2', { style: { margin: 0 }, text: 'Mijn passkeys' }),
      el('button', { class: 'btn secondary sm', type: 'button', text: '＋ Passkey voor dit apparaat', onClick: () => {
        const label = input({ value: deviceLabel(), maxlength: 60 });
        modal({ title: 'Passkey toevoegen', body: el('div', {}, el('p', { class: 'small muted', text: 'Voeg een passkey toe voor het apparaat waarop je nu werkt, zodat je hier ook kunt inloggen.' }), field('Naam van het apparaat', label)),
          actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Toevoegen', class: 'gold', onClick: async () => { await addPasskey(label.value); toast('Passkey toegevoegd', 'ok'); loadPasskeys(); } }] });
      } })));
    pk.append(el('p', { class: 'small muted', text: 'Passkeys zijn gekoppeld aan je apparaat (of gesynchroniseerd via iCloud-sleutelhanger / Google Wachtwoordmanager). Voeg op elk apparaat waarop je wilt inloggen een passkey toe, of log in via je telefoon met een QR-code.' }));
    const { passkeys } = await api.get('/api/auth/passkeys');
    for (const p of passkeys) {
      pk.append(el('div', { class: 'row between', style: { padding: '0.4rem 0', borderBottom: '1px solid var(--line)' } },
        el('div', {}, el('strong', { text: p.label || 'Passkey' }), el('div', { class: 'small muted', text: `${p.backed_up ? 'Gesynchroniseerd' : 'Alleen dit apparaat'} · aangemaakt ${fmtDateTime(p.created_at)}${p.last_used_at ? ` · laatst gebruikt ${fmtDateTime(p.last_used_at)}` : ''}` })),
        el('button', { class: 'btn ghost sm', type: 'button', text: 'Verwijderen', disabled: passkeys.length <= 1, onClick: async () => {
          if (!(await confirmDialog('Passkey verwijderen', `"${p.label}" verwijderen? Je kunt daarmee niet meer inloggen op dat apparaat.`, { okLabel: 'Verwijderen', danger: true }))) return;
          try { await api.del(`/api/auth/passkeys/${encodeURIComponent(p.id)}`); toast('Passkey verwijderd'); loadPasskeys(); } catch (e) { toast(e.message, 'error'); }
        } })));
    }
  }
  loadPasskeys();

  // AI-sommelier (aanbieder, sleutel, model)
  const ai = el('div', { class: 'card' });
  main.append(ai);
  async function loadAi() {
    clear(ai);
    ai.append(el('h2', { style: { marginTop: 0 }, text: 'AI-sommelier' }));
    let data;
    try { data = await api.get('/api/ai/settings'); } catch (e) { ai.append(el('p', { class: 'badge bad', text: e.message })); return; }
    const isAdmin = user?.role === 'admin';
    const providers = data.providers;

    if (data.active) {
      const pv = providers[data.active.provider];
      const model = pv?.models.find((m) => m.id === data.active.model);
      ai.append(el('p', {}, el('span', { class: 'badge ok', text: 'Actief' }), ` ${pv?.label || data.active.provider} · `, el('code', { text: data.active.model }), model ? el('span', { class: 'muted small', text: ` — ${model.label.split(' — ')[1] || ''}` }) : null));
      ai.append(el('p', { class: 'small muted', text: data.active.source === 'settings'
        ? `Sleutel ${data.active.key_hint || ''} · ingesteld door ${data.active.updated_by || 'beheerder'} op ${fmtDateTime(data.active.updated_at)}`
        : 'Gebruikt de sleutel die op de server is geconfigureerd. Een beheerder kan hieronder een eigen sleutel instellen; die krijgt voorrang.' }));
    } else {
      ai.append(el('p', {}, el('span', { class: 'badge warn', text: 'Niet ingesteld' }), ' Zonder AI-sleutel werken etiketherkenning, prijsindicaties en de AI-sommelier niet.'));
    }

    if (!isAdmin) { ai.append(el('p', { class: 'small muted', text: 'Alleen een beheerder kan de AI-instellingen wijzigen.' })); return; }

    const providerSel = select(Object.entries(providers).map(([k, v]) => [k, v.label]), { value: data.active?.provider || 'anthropic' });
    const modelSel = select([]);
    const customModel = input({ placeholder: 'Of typ een modelnaam, bijv. claude-sonnet-4-5-20250929', maxlength: 80 });
    const keyInput = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: data.active?.source === 'settings' && data.active.provider === providerSel.value ? 'Leeg laten = huidige sleutel behouden' : 'sk-ant-… of sk-…', maxlength: 300 });
    const showKey = el('button', { class: 'btn ghost sm', type: 'button', text: '👁', title: 'Sleutel tonen/verbergen', onClick: () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; } });
    const keyHelp = el('small', { class: 'muted' });

    function fillModels() {
      const pv = providers[providerSel.value];
      clear(modelSel);
      for (const m of pv.models) modelSel.append(el('option', { value: m.id, text: m.label }));
      modelSel.append(el('option', { value: '__custom', text: 'Anders (zelf invullen)…' }));
      const current = data.active?.provider === providerSel.value ? data.active.model : null;
      if (current && pv.models.some((m) => m.id === current)) modelSel.value = current;
      else if (current) { modelSel.value = '__custom'; customModel.value = current; }
      else modelSel.value = pv.models[0].id;
      customModel.hidden = modelSel.value !== '__custom';
      keyInput.placeholder = data.active?.source === 'settings' && data.active.provider === providerSel.value ? 'Leeg laten = huidige sleutel behouden' : (providerSel.value === 'anthropic' ? 'sk-ant-api03-…' : 'sk-…');
      keyHelp.textContent = providerSel.value === 'anthropic'
        ? 'Maak een sleutel aan op console.anthropic.com → API Keys. De sleutel wordt versleuteld op de server bewaard en is daarna niet meer uit te lezen.'
        : 'Maak een sleutel aan op platform.openai.com → API keys. De sleutel wordt versleuteld op de server bewaard.';
    }
    providerSel.addEventListener('change', fillModels);
    modelSel.addEventListener('change', () => { customModel.hidden = modelSel.value !== '__custom'; if (!customModel.hidden) customModel.focus(); });
    fillModels();

    const saveBtn = el('button', { class: 'btn gold sm', type: 'button', text: 'Opslaan' });
    const testBtn = el('button', { class: 'btn secondary sm', type: 'button', text: 'Verbinding testen', disabled: !data.active });
    const removeBtn = el('button', { class: 'btn ghost sm', type: 'button', text: 'Sleutel verwijderen', hidden: data.active?.source !== 'settings' });
    const status = el('div', { class: 'small', style: { marginTop: '0.5rem' } });

    saveBtn.addEventListener('click', async () => {
      const model = modelSel.value === '__custom' ? customModel.value.trim() : modelSel.value;
      if (!model) return toast('Kies of typ een model', 'error');
      saveBtn.disabled = true;
      try {
        await api.put('/api/ai/settings', { provider: providerSel.value, model, api_key: keyInput.value.trim() || null });
        toast('AI-instellingen opgeslagen', 'ok');
        await loadAi();
      } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
    });
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true; status.textContent = 'Testen…';
      try {
        const r = await api.post('/api/ai/test');
        status.textContent = `✅ Verbinding werkt: ${r.model} antwoordde in ${r.ms} ms${r.sample ? ` ("${r.sample}")` : ''}.`;
      } catch (e) { status.textContent = `❌ ${e.message}`; } finally { testBtn.disabled = false; }
    });
    removeBtn.addEventListener('click', async () => {
      if (!(await confirmDialog('Sleutel verwijderen', 'De opgeslagen AI-sleutel wordt gewist. AI-functies werken daarna alleen nog als er een sleutel op de server staat.', { okLabel: 'Verwijderen', danger: true }))) return;
      try { await api.del('/api/ai/settings'); toast('Sleutel verwijderd'); loadAi(); } catch (e) { toast(e.message, 'error'); }
    });

    ai.append(
      el('div', { class: 'form-grid', style: { marginTop: '0.8rem' } },
        field('Aanbieder', providerSel),
        field('Model', modelSel, { hint: 'Vision (foto-herkenning) vereist een model dat afbeeldingen begrijpt; alle bovenstaande modellen kunnen dat.' }),
        el('div', { class: 'full' }, customModel),
        el('div', { class: 'full' }, el('label', { class: 'field' }, el('span', { text: 'API-sleutel' }), el('div', { class: 'row' }, el('div', { class: 'grow' }, keyInput), showKey), keyHelp))),
      el('div', { class: 'row' }, saveBtn, testBtn, removeBtn),
      status,
      el('p', { class: 'small muted', style: { marginTop: '0.8rem' }, text: 'Tip: Claude Sonnet is een goede balans tussen kwaliteit en kosten voor etiketten. Haiku is het goedkoopst voor spijs-wijn advies; Opus geeft de meest uitgebreide beschrijvingen. Alle leden van het huishouden gebruiken dezelfde sleutel; AI-gebruik is begrensd op 60 verzoeken per uur per persoon.' }));
  }
  loadAi();

  // Export
  const ex = el('div', { class: 'card' });
  ex.append(el('h2', { style: { marginTop: 0 }, text: 'Gegevens exporteren' }), el('p', { class: 'small muted', text: 'Jullie data is van jullie. Download een volledige kopie (JSON) of een spreadsheet-vriendelijke lijst (CSV, te openen in Excel).' }));
  ex.append(el('div', { class: 'row' },
    el('button', { class: 'btn secondary sm', type: 'button', text: 'Download CSV', onClick: async () => { const r = await api.download('/api/export.csv'); download('wijnkelder.csv', await r.blob()); } }),
    el('button', { class: 'btn secondary sm', type: 'button', text: 'Download JSON (volledige back-up)', onClick: async () => { const r = await api.download('/api/export.json'); download(`wijnkelder-backup-${new Date().toISOString().slice(0, 10)}.json`, await r.blob()); } })));
  main.append(ex);

  // Sessie
  const se = el('div', { class: 'card' });
  se.append(el('h2', { style: { marginTop: 0 }, text: 'Sessie' }));
  se.append(el('div', { class: 'row' },
    el('button', { class: 'btn ghost', type: 'button', text: 'Uitloggen', onClick: async () => { await logout(); navigate('/login'); } }),
    el('button', { class: 'btn ghost', type: 'button', text: 'Uitloggen op alle apparaten', onClick: async () => { if (await confirmDialog('Overal uitloggen', 'Alle actieve sessies van jouw account worden beëindigd.', { okLabel: 'Overal uitloggen' })) { await logout(true); navigate('/login'); } } })));
  main.append(se);

  main.append(el('p', { class: 'muted small center', style: { marginTop: '2rem' }, text: 'Wijnkelder · gebouwd voor Angela & Tije 🍷' }));
}
