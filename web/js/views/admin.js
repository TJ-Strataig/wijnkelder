// Beheer (alleen admin): huishoudleden uitnodigen, rollen, uitschakelen.
import { el, clear, field, input, select, modal, confirmDialog, toast, fmtDate, fmtDateTime } from '../util.js';
import { api, session } from '../api.js';

export async function render(main) {
  main.append(el('h1', { text: 'Beheer van het huishouden' }), el('p', { class: 'muted', text: 'Alleen beheerders kunnen leden toevoegen. Een nieuw lid krijgt een uitnodigingslink (48 uur geldig, eenmalig te gebruiken) en maakt daarmee een eigen passkey aan.' }));
  const root = el('div', { class: 'stack' });
  main.append(root);

  async function load() {
    clear(root);
    const { users, invites } = await api.get('/api/admin/users');
    const uCard = el('div', { class: 'card' });
    uCard.append(el('div', { class: 'row between' }, el('h2', { style: { margin: 0 }, text: 'Leden' }), el('button', { class: 'btn gold sm', type: 'button', text: '＋ Lid uitnodigen', onClick: () => inviteDialog(load) })));
    const tbl = el('table', { class: 'table' });
    tbl.append(el('thead', {}, el('tr', {}, ['Naam', 'Rol', 'Passkeys', 'Laatst ingelogd', 'Status', ''].map((h) => el('th', { text: h })))));
    const tb = el('tbody');
    for (const u of users) {
      const me = u.id === session.user?.id;
      tb.append(el('tr', {},
        el('td', {}, el('strong', { text: u.name }), me ? el('span', { class: 'muted small', text: ' (jij)' }) : null),
        el('td', { text: u.role === 'admin' ? 'Beheerder' : 'Lid' }),
        el('td', { text: String(u.passkeys) }),
        el('td', { class: 'small muted', text: u.last_login ? fmtDateTime(u.last_login) : '—' }),
        el('td', {}, el('span', { class: `badge ${u.disabled ? 'bad' : 'ok'}`, text: u.disabled ? 'Uitgeschakeld' : 'Actief' })),
        el('td', {}, me ? null : el('div', { class: 'row' },
          el('button', { class: 'btn ghost sm', type: 'button', text: '✎', title: 'Bewerken', onClick: () => editUserDialog(u, load) }),
          el('button', { class: 'btn ghost sm', type: 'button', text: '✕', title: 'Verwijderen', onClick: async () => {
            if (!(await confirmDialog('Lid verwijderen', `${u.name} verwijderen? De passkeys worden gewist en het account uitgeschakeld; de historie (wie wat toevoegde) blijft bewaard.`, { okLabel: 'Verwijderen', danger: true }))) return;
            try { await api.del(`/api/admin/users/${u.id}`); toast('Lid verwijderd'); load(); } catch (e) { toast(e.message, 'error'); }
          } })))));
    }
    tbl.append(tb);
    uCard.append(el('div', { class: 'table-wrap' }, tbl));
    root.append(uCard);

    const iCard = el('div', { class: 'card' });
    iCard.append(el('h2', { style: { marginTop: 0 }, text: 'Open uitnodigingen' }));
    if (!invites.length) iCard.append(el('p', { class: 'muted small', text: 'Geen openstaande uitnodigingen.' }));
    for (const inv of invites) {
      iCard.append(el('div', { class: 'row between', style: { padding: '0.4rem 0', borderBottom: '1px solid var(--line)' } },
        el('div', {}, el('strong', { text: inv.name }), el('span', { class: 'muted small', text: ` · ${inv.role === 'admin' ? 'beheerder' : 'lid'} · verloopt ${fmtDateTime(inv.expires_at)}` })),
        el('button', { class: 'btn ghost sm', type: 'button', text: 'Intrekken', onClick: async () => { await api.del(`/api/admin/invites/${inv.id}`); load(); } })));
    }
    root.append(iCard);
  }
  load();
}

function inviteDialog(reload) {
  const name = input({ placeholder: 'Bijv. Angela', maxlength: 60 });
  const role = select([['member', 'Lid (kan alles in de kelder aanpassen)'], ['admin', 'Beheerder (kan ook leden toevoegen)']]);
  modal({
    title: 'Lid uitnodigen',
    body: el('div', {}, field('Naam', name), field('Rol', role), el('p', { class: 'small muted', text: 'Je krijgt een link die je persoonlijk doorgeeft (bijv. via een berichtje). De link is 48 uur geldig en werkt één keer.' })),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Uitnodiging maken', class: 'gold', onClick: async () => {
      if (!name.value.trim()) { toast('Vul een naam in', 'error'); return true; }
      const inv = await api.post('/api/admin/invites', { name: name.value, role: role.value });
      const link = `${location.origin}${location.pathname}#/registreren?invite=${encodeURIComponent(inv.token)}`;
      showLink(inv.name, link, reload);
    } }],
  });
}

function showLink(name, link, reload) {
  const ta = el('textarea', { readonly: true, style: { minHeight: '90px', fontSize: '0.8rem' } });
  ta.value = link;
  modal({
    title: `Uitnodiging voor ${name}`,
    body: el('div', {}, el('p', { text: 'Deel deze link alleen met de genodigde. Hij wordt maar één keer getoond.' }), ta),
    onClose: reload,
    actions: [
      { label: 'Kopiëren', class: 'secondary', onClick: async () => { await navigator.clipboard.writeText(link); toast('Link gekopieerd', 'ok'); return true; } },
      navigator.share ? { label: 'Delen…', class: 'secondary', onClick: async () => { await navigator.share({ title: 'Uitnodiging Wijnkelder', text: `Uitnodiging voor de wijnkelder`, url: link }).catch(() => {}); return true; } } : null,
      { label: 'Sluiten' },
    ].filter(Boolean),
  });
}

function editUserDialog(u, reload) {
  const name = input({ value: u.name, maxlength: 60 });
  const role = select([['member', 'Lid'], ['admin', 'Beheerder']], { value: u.role });
  const disabled = select([['0', 'Actief'], ['1', 'Uitgeschakeld (kan niet inloggen)']], { value: String(u.disabled) });
  modal({
    title: `${u.name} bewerken`,
    body: el('div', {}, field('Naam', name), field('Rol', role), field('Status', disabled)),
    actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Opslaan', onClick: async () => { await api.patch(`/api/admin/users/${u.id}`, { name: name.value, role: role.value, disabled: disabled.value === '1' }); toast('Opgeslagen', 'ok'); reload(); } }],
  });
}
