// Maakt een VAPID-sleutelpaar voor pushmeldingen. Uitvoeren: node scripts/vapid.mjs
// Zet daarna:  npx wrangler secret put VAPID_PUBLIC_KEY   en   npx wrangler secret put VAPID_PRIVATE_KEY
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await crypto.subtle.exportKey('raw', key.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', key.privateKey);
console.log('VAPID_PUBLIC_KEY =', pub);
console.log('VAPID_PRIVATE_KEY =', jwk.d);
console.log('\nZet ze als secrets:\n  npx wrangler secret put VAPID_PUBLIC_KEY\n  npx wrangler secret put VAPID_PRIVATE_KEY\n  npx wrangler secret put VAPID_SUBJECT   (bijv. mailto:tije@voorbeeld.nl)');
