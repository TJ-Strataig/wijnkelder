// Streepjescode scannen met de camera (BarcodeDetector API; iOS 17+/Safari, Chrome, Edge). Valt terug op handmatige invoer.
import { el, modal } from './util.js';

export function barcodeSupported() { return 'BarcodeDetector' in window; }

// Opent een dialoog met de camera en geeft de gescande EAN terug (of null bij annuleren). Zonder camera-ondersteuning: invoerveld.
export function scanBarcode() {
  return new Promise((resolve) => {
    let stream = null, timer = null, done = false;
    const video = el('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '10px', background: '#000', maxHeight: '50dvh' } });
    const manual = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'Of typ de code (EAN-13)', maxlength: 20 });
    const status = el('div', { class: 'small muted', text: barcodeSupported() ? 'Richt de camera op de streepjescode…' : 'Deze browser kan geen streepjescodes scannen; typ de code onder het etiket.' });
    const finish = (code) => { if (done) return; done = true; if (timer) clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); dlg.close(); resolve(code || null); };
    const dlg = modal({
      title: 'Streepjescode scannen',
      body: el('div', {}, barcodeSupported() ? video : null, status, el('div', { style: { marginTop: '0.6rem' } }, manual)),
      onClose: () => finish(null),
      actions: [{ label: 'Annuleren', class: 'ghost' }, { label: 'Gebruik getypte code', onClick: () => { const c = manual.value.replace(/\D/g, ''); if (c.length >= 8) finish(c); else { status.textContent = 'Een streepjescode heeft minimaal 8 cijfers.'; return true; } } }],
    });
    if (!barcodeSupported()) return;
    (async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (done) { stream.getTracks().forEach((t) => t.stop()); return; } // dialoog al gesloten tijdens de toestemmingsvraag
        video.srcObject = stream;
        timer = setInterval(async () => {
          if (video.readyState < 2) return;
          try { const codes = await detector.detect(video); if (codes.length) { const v = codes[0].rawValue.replace(/\D/g, ''); if (v.length >= 8) finish(v); } } catch { /* volgende frame */ }
        }, 250);
      } catch (e) {
        status.textContent = 'Camera niet beschikbaar (' + (e.name === 'NotAllowedError' ? 'geen toestemming' : e.message) + '). Typ de code hieronder.';
      }
    })();
  });
}
