// Inloggen met passkey, registreren via uitnodiging, eenmalige eerste beheerder.
import { el, field, input, toast } from '../util.js';
import { api } from '../api.js';
import { passkeysSupported, loginWithPasskey, registerPasskey } from '../auth.js';
import { APP_NAME } from '../../config.js';

export async function render(main, { query, mode, navigate }) {
  const card = el('div', { class: 'card' });
  main.append(el('div', { class: 'hero' }, card));
  card.append(el('img', { src: 'icons/icon.svg', alt: '', width: 72, height: 72, style: { borderRadius: '18px' } }));
  card.append(el('h1', { class: 'hero-title', text: 'Wijnkelder' }));
  card.append(el('p', { class: 'muted', text: APP_NAME }));

  if (!passkeysSupported()) {
    card.append(el('p', { class: 'badge bad', text: 'Deze browser ondersteunt geen passkeys.' }));
    return;
  }

  const invite = query.get('invite');
  if (mode === 'register' && invite) {
    card.append(el('p', { text: 'Je bent uitgenodigd voor de wijnkelder. Maak een passkey aan op dit apparaat om in te loggen (Face ID, Touch ID, Windows Hello of pincode).' }));
    const btn = el('button', { class: 'btn gold block', type: 'button', text: 'Passkey aanmaken & registreren' });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const user = await registerPasskey({ invite });
        toast(`Welkom, ${user.name}!`, 'ok');
        navigate('/kelder');
      } catch (e) {
        toast(e.message, 'error');
      } finally { btn.disabled = false; }
    });
    card.append(btn);
    return;
  }

  let status = { needsBootstrap: false };
  try { status = await api.get('/api/auth/status'); } catch { /* server niet bereikbaar; toon gewoon de loginknop */ }

  if (status.needsBootstrap) {
    card.append(el('h2', { text: 'Eerste keer instellen' }));
    card.append(el('p', { class: 'small muted', text: 'Er is nog geen beheerder. Vul je naam en het opstartwachtwoord (BOOTSTRAP_SECRET van de server) in om de eerste beheerder aan te maken.' }));
    const name = input({ placeholder: 'Bijv. Tije', autocomplete: 'name', maxlength: 60 });
    const secret = input({ type: 'password', placeholder: 'Opstartwachtwoord', autocomplete: 'off' });
    card.append(field('Naam', name), field('Opstartwachtwoord', secret));
    const btn = el('button', { class: 'btn gold block', type: 'button', text: 'Beheerder aanmaken met passkey' });
    btn.addEventListener('click', async () => {
      if (!name.value.trim() || !secret.value) return toast('Vul naam en opstartwachtwoord in', 'error');
      btn.disabled = true;
      try {
        const user = await registerPasskey({ bootstrap: secret.value, name: name.value.trim() });
        toast(`Welkom, ${user.name}! Je bent beheerder.`, 'ok');
        navigate('/kelder');
      } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
    });
    card.append(btn);
    return;
  }

  card.append(el('p', { class: 'muted small', text: 'Log in met de passkey van dit apparaat. Nieuw lid van het huishouden? Vraag de beheerder om een uitnodigingslink.' }));
  const btn = el('button', { class: 'btn gold block', type: 'button' }, el('span', { text: '🔑 Inloggen met passkey' }));
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const user = await loginWithPasskey();
      toast(`Welkom terug, ${user.name}`, 'ok');
      navigate('/kelder');
    } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
  });
  card.append(btn);
}
