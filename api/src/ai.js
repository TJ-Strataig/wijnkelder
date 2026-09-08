// AI-functies: etiket herkennen vanaf een foto, prijsindicatie en spijs-wijn advies uit de eigen kelder.
// Werkt met Anthropic (Claude) én met elke OpenAI-compatibele API; de beheerder kiest aanbieder, sleutel en model in de app.
import { HttpError, json, readJson, str, oneOf, rateLimit, WINE_TYPES, logActivity, nowIso, getSetting, setSetting, encryptSecret, decryptSecret, safeHttpsUrl } from './util.js';

const WINE_SCHEMA_HINT = `{
  "name": "naam van de wijn zoals op het etiket (zonder producent als die apart staat)",
  "producer": "producent / domein / château",
  "country": "land in het Nederlands, bijv. Frankrijk",
  "region": "streek, bijv. Bourgogne",
  "appellation": "appellatie/classificatie, bijv. Gevrey-Chambertin AOC of Rioja DOCa Reserva",
  "type": "één van: ${WINE_TYPES.join(' | ')}",
  "vintage": 2018,
  "grapes": ["druivenrassen"],
  "alcohol": 13.5,
  "volume_ml": 750,
  "sweetness": "droog | halfdroog | halfzoet | zoet",
  "body": "licht | medium | vol",
  "tannin": "laag | medium | hoog | n.v.t.",
  "acidity": "laag | medium | hoog",
  "aging_wine": true,
  "drink_from": 2024,
  "drink_until": 2035,
  "peak_from": 2027,
  "peak_until": 2032,
  "development": "korte uitleg hoe deze wijn zich naar verwachting ontwikkelt (jong: ..., op hoogtepunt: ..., ouder: ...)",
  "serving_temp": "16-18 °C",
  "decant_minutes": 60,
  "food_pairings": ["gerechten en categorieën die goed passen, bijv. Lamsrack, Gerijpte kazen, Paddenstoelenrisotto"],
  "description": "2-4 zinnen over stijl, smaakprofiel en karakter",
  "tasting_profile": { "aromas": ["kers", "leer"], "flavors": ["..."], "finish": "lang" },
  "estimated_price_eur": 24.5,
  "estimated_price_min_eur": 20,
  "estimated_price_max_eur": 30,
  "confidence": 0.0
}`;

// ---- AI-provider: Anthropic (Claude) of OpenAI-compatibel, instelbaar door de beheerder ----------

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 — aanbevolen (slim, snel, goed met foto\'s)' },
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1 — hoogste kwaliteit, duurder' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — snelst en goedkoopst' },
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
    ],
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini — goedkoop en snel' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
  },
};

const DEFAULT_MODEL = { anthropic: 'claude-sonnet-4-5', openai: 'gpt-4o-mini' };

// Leest de actieve AI-configuratie: instellingen uit de app gaan vóór de omgevingsvariabelen van de Worker.
async function aiConfig(env) {
  const saved = await getSetting(env, 'ai');
  if (saved?.provider && saved?.key_enc) {
    let apiKey;
    try { apiKey = await decryptSecret(env, saved.key_enc); } catch { throw new HttpError(500, 'De opgeslagen AI-sleutel kan niet worden ontsleuteld. Sla de sleutel opnieuw op in Instellingen.'); }
    return { provider: saved.provider, apiKey, model: saved.model || DEFAULT_MODEL[saved.provider], baseUrl: saved.base_url || PROVIDERS[saved.provider].baseUrl, source: 'settings' };
  }
  if (env.AI_API_KEY) {
    const provider = env.AI_PROVIDER === 'anthropic' || /^sk-ant-/.test(env.AI_API_KEY) ? 'anthropic' : 'openai';
    return { provider, apiKey: env.AI_API_KEY, model: env.AI_MODEL || DEFAULT_MODEL[provider], baseUrl: env.AI_BASE_URL || PROVIDERS[provider].baseUrl, source: 'env' };
  }
  throw new HttpError(503, 'AI is nog niet ingesteld. Een beheerder kan onder Instellingen → AI-sommelier een API-sleutel invoeren.');
}

// Zet de interne (OpenAI-achtige) berichten om naar de Anthropic Messages API.
function toAnthropic(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : m.content.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image_url') {
        const m2 = part.image_url.url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        return { type: 'image', source: { type: 'base64', media_type: m2[1], data: m2[2] } };
      }
      return { type: 'text', text: '' };
    }),
  }));
  return { system, messages: rest };
}

async function callProvider(cfg, messages, { maxTokens, temperature }) {
  const base = cfg.baseUrl.replace(/\/$/, '');
  if (cfg.provider === 'anthropic') {
    const { system, messages: msgs } = toAnthropic(messages);
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.model, max_tokens: maxTokens, temperature,
        system: `${system}\n\nAntwoord uitsluitend met één geldig JSON-object, zonder uitleg of markdown eromheen.`,
        messages: msgs,
      }),
    });
    if (!res.ok) throw await providerError(res);
    const data = await res.json();
    return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
  const url = base.includes('openai.azure.com') && !base.includes('/chat/completions')
    ? `${base}/chat/completions?api-version=2024-10-21`
    : `${base}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}`, 'api-key': cfg.apiKey },
    body: JSON.stringify({ model: cfg.model, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }),
  });
  if (!res.ok) throw await providerError(res);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '{}';
}

async function providerError(res) {
  const t = await res.text().catch(() => '');
  console.error('AI fout', res.status, t.slice(0, 500));
  if (res.status === 401 || res.status === 403) return new HttpError(502, 'De AI-sleutel is ongeldig of heeft geen toegang. Controleer de sleutel in Instellingen.');
  if (res.status === 404) return new HttpError(502, 'Het gekozen model bestaat niet (meer) bij deze aanbieder. Kies een ander model in Instellingen.');
  if (res.status === 429) return new HttpError(502, 'De AI-aanbieder meldt een limiet (te veel verzoeken of tegoed op).');
  return new HttpError(502, 'De AI-dienst gaf een fout terug. Probeer het later opnieuw.');
}

// Haalt het eerste JSON-object uit een tekst (Claude zet er soms nog een zin of ```json omheen).
function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* val terug op zoeken */ }
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* onleesbaar */ } }
  throw new HttpError(502, 'De AI gaf een onleesbaar antwoord.');
}

export async function chatJson(env, messages, opts) { return chat(env, messages, opts); }
export async function getAiConfig(env) { return aiConfig(env); }

// ---- Tool-calling (agent) voor Anthropic en OpenAI ---------------------------------------------
// tools: [{ name, description, input_schema }]  messages: interne vorm (role user/assistant/tool)
// Antwoord: { text, toolCalls: [{ id, name, input }], stop }
export async function chatWithTools(env, { system, messages, tools, maxTokens = 1200, temperature = 0.4 }) {
  const cfg = await aiConfig(env);
  const base = cfg.baseUrl.replace(/\/$/, '');
  if (cfg.provider === 'anthropic') {
    const msgs = messages.map((m) => {
      if (m.role === 'tool') return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content).slice(0, 20000) }] };
      if (m.role === 'assistant' && m.tool_calls?.length) return { role: 'assistant', content: [...(m.content ? [{ type: 'text', text: m.content }] : []), ...m.tool_calls.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: t.input }))] };
      if (typeof m.content === 'string') return { role: m.role, content: m.content };
      return { role: m.role, content: m.content.map((part) => part.type === 'image_url' ? (() => { const mm = part.image_url.url.match(/^data:(image\/[a-z]+);base64,(.+)$/); return { type: 'image', source: { type: 'base64', media_type: mm[1], data: mm[2] } }; })() : { type: 'text', text: part.text }) };
    });
    // Anthropic vereist dat opeenvolgende berichten van dezelfde rol samengevoegd zijn
    const merged = [];
    for (const m of msgs) { const last = merged[merged.length - 1]; if (last && last.role === m.role) { last.content = [...(typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content), ...(typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content)]; } else merged.push({ ...m }); }
    const res = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, temperature, system, messages: merged, tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) }) });
    if (!res.ok) throw await providerError(res);
    const data = await res.json();
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    const toolCalls = (data.content || []).filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, input: c.input || {} }));
    return { text, toolCalls, stop: data.stop_reason };
  }
  // OpenAI-compatibel
  const msgs = [{ role: 'system', content: system }, ...messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: String(m.content).slice(0, 20000) };
    if (m.role === 'assistant' && m.tool_calls?.length) return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input) } })) };
    return { role: m.role, content: m.content };
  })];
  const url = base.includes('openai.azure.com') && !base.includes('/chat/completions') ? `${base}/chat/completions?api-version=2024-10-21` : `${base}/chat/completions`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}`, 'api-key': cfg.apiKey },
    body: JSON.stringify({ model: cfg.model, temperature, max_tokens: maxTokens, messages: msgs, tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) }) });
  if (!res.ok) throw await providerError(res);
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((t) => { let input = {}; try { input = JSON.parse(t.function.arguments || '{}'); } catch { /* leeg */ } return { id: t.id, name: t.function.name, input }; });
  return { text: (msg.content || '').trim(), toolCalls, stop: data.choices?.[0]?.finish_reason };
}

async function chat(env, messages, { maxTokens = 1500, temperature = 0.2 } = {}) {
  const cfg = await aiConfig(env);
  return extractJson(await callProvider(cfg, messages, { maxTokens, temperature }));
}

// ---- instellingen-endpoints ---------------------------------------------------------------

// GET /api/ai/settings — voor iedereen zichtbaar: welke aanbieder/model actief is (nooit de sleutel zelf).
export async function getAiSettings(req, env) {
  const saved = await getSetting(env, 'ai');
  const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, models: v.models }]));
  let active = null;
  try {
    const cfg = await aiConfig(env);
    active = { provider: cfg.provider, model: cfg.model, source: cfg.source, key_hint: saved?.key_hint || null, updated_at: saved?.updated_at || null, updated_by: saved?.updated_by_name || null };
  } catch { /* niet ingesteld */ }
  return json({ providers, active, env_fallback: !!env.AI_API_KEY });
}

// PUT /api/ai/settings — alleen beheerder. { provider, model, api_key? , base_url? }  (api_key leeg = bestaande sleutel behouden)
export async function saveAiSettings(req, env, { user }) {
  const body = await readJson(req, 10_000);
  const provider = oneOf(body.provider, Object.keys(PROVIDERS), { name: 'Aanbieder', required: true });
  const model = str(body.model, { max: 80, required: true, name: 'Model' });
  if (!/^[A-Za-z0-9._:-]+$/.test(model)) throw new HttpError(400, 'Ongeldige modelnaam.');
  const baseUrl = str(body.base_url, { max: 200 });
  if (baseUrl && !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(baseUrl)) throw new HttpError(400, 'Ongeldig API-adres (alleen https).');

  const existing = await getSetting(env, 'ai');
  const apiKey = str(body.api_key, { max: 300 });
  let keyEnc = existing?.key_enc, keyHint = existing?.key_hint;
  if (apiKey) {
    if (!PROVIDERS[provider].keyPattern.test(apiKey)) throw new HttpError(400, `Dit ziet er niet uit als een geldige ${PROVIDERS[provider].label}-sleutel.`);
    keyEnc = await encryptSecret(env, apiKey);
    keyHint = `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`;
  } else if (!keyEnc || existing?.provider !== provider) {
    throw new HttpError(400, 'Vul een API-sleutel in voor deze aanbieder.');
  }
  await setSetting(env, 'ai', { provider, model, base_url: baseUrl, key_enc: keyEnc, key_hint: keyHint, updated_at: nowIso(), updated_by_name: user.name }, user.id);
  await logActivity(env, user.id, 'ai.settings', 'settings', 'ai', { provider, model, key_changed: !!apiKey });
  return getAiSettings(req, env);
}

// DELETE /api/ai/settings — sleutel verwijderen (val terug op eventuele server-configuratie).
export async function deleteAiSettings(req, env, { user }) {
  await env.DB.prepare("DELETE FROM settings WHERE key = 'ai'").run();
  await logActivity(env, user.id, 'ai.settings', 'settings', 'ai', { removed: true });
  return getAiSettings(req, env);
}

// POST /api/ai/test — beheerder: korte proefaanroep met de actieve instellingen.
export async function testAi(req, env, { user }) {
  await rateLimit(env, `aitest:${user.id}`, 10, 600);
  const cfg = await aiConfig(env);
  const started = Date.now();
  const result = await chat(env, [
    { role: 'system', content: 'Antwoord uitsluitend met JSON: {"ok": true, "wijn": "<naam van één beroemde wijnstreek>"}.' },
    { role: 'user', content: 'Test.' },
  ], { maxTokens: 60 });
  return json({ ok: !!result, provider: cfg.provider, model: cfg.model, ms: Date.now() - started, sample: str(result.wijn, { max: 80 }) });
}

function sanitizeRecognition(r) {
  const out = {
    name: str(r.name, { max: 200 }),
    producer: str(r.producer, { max: 200 }),
    country: str(r.country, { max: 100 }),
    region: str(r.region, { max: 150 }),
    appellation: str(r.appellation, { max: 150 }),
    type: WINE_TYPES.includes(r.type) ? r.type : guessType(r),
    vintage: safeNum(r.vintage, 1800, 2100, true),
    grapes: Array.isArray(r.grapes) ? r.grapes.map((g) => String(g).slice(0, 60)).slice(0, 12) : [],
    alcohol: safeNum(r.alcohol, 0, 30),
    volume_ml: safeNum(r.volume_ml, 50, 30000, true) ?? 750,
    sweetness: str(r.sweetness, { max: 40 }),
    body: str(r.body, { max: 40 }),
    tannin: str(r.tannin, { max: 40 }),
    acidity: str(r.acidity, { max: 40 }),
    aging_wine: !!r.aging_wine,
    drink_from: safeNum(r.drink_from, 1800, 2200, true),
    drink_until: safeNum(r.drink_until, 1800, 2200, true),
    peak_from: safeNum(r.peak_from, 1800, 2200, true),
    peak_until: safeNum(r.peak_until, 1800, 2200, true),
    development: str(r.development, { max: 2000 }),
    serving_temp: str(r.serving_temp, { max: 40 }),
    decant_minutes: safeNum(r.decant_minutes, 0, 600, true),
    food_pairings: Array.isArray(r.food_pairings) ? r.food_pairings.map((g) => String(g).slice(0, 80)).slice(0, 20) : [],
    description: str(r.description, { max: 4000 }),
    tasting_profile: r.tasting_profile && typeof r.tasting_profile === 'object' ? r.tasting_profile : null,
    estimated_price: safeNum(r.estimated_price_eur, 0, 1e6),
    estimated_price_min: safeNum(r.estimated_price_min_eur, 0, 1e6),
    estimated_price_max: safeNum(r.estimated_price_max_eur, 0, 1e6),
    confidence: safeNum(r.confidence, 0, 1),
  };
  return out;
}

function guessType(r) {
  const s = `${r.type || ''} ${r.name || ''} ${r.description || ''}`.toLowerCase();
  if (/port|porto/.test(s)) return 'port';
  if (/champagne|cava|prosecco|cr[ée]mant|sekt|mousserend|sparkling|spumante/.test(s)) return 'mousserend';
  if (/ros[ée]/.test(s)) return 'rose';
  if (/sauternes|dessert|late harvest|ice ?wine|eiswein|tokaji|moscatel/.test(s)) return 'dessert';
  if (/sherry|madeira|marsala|vermouth|versterkt/.test(s)) return 'versterkt';
  if (/orange|oranje/.test(s)) return 'oranje';
  if (/wit|white|blanc|bianco|blanco|weiss|riesling|chardonnay|sauvignon|chenin|pinot gris|grüner/.test(s)) return 'wit';
  if (/rood|red|rouge|rosso|tinto|rot/.test(s)) return 'rood';
  return 'rood';
}

function safeNum(v, min, max, int = false) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return int ? Math.round(n) : n;
}

// POST /api/ai/recognize  { image: "data:image/jpeg;base64,..." , hint?: "..." }
export async function recognize(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 12_000_000);
  const image = body.image;
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    throw new HttpError(400, 'Stuur de foto als data-URL (JPEG, PNG of WebP).');
  }
  if (image.length > 11_000_000) throw new HttpError(413, 'Foto is te groot.');
  const hint = str(body.hint, { max: 300 });
  const year = new Date().getFullYear();

  const result = await chat(env, [
    {
      role: 'system',
      content:
        `Je bent een ervaren sommelier en wijnkenner. Je herkent wijnen op basis van een foto van het etiket en vult alle relevante gegevens aan uit je kennis. ` +
        `Antwoord uitsluitend met geldige JSON volgens dit schema (Nederlandse teksten; gebruik null voor onbekende waarden, verzin geen jaargang als die niet leesbaar is):\n${WINE_SCHEMA_HINT}\n` +
        `Het is nu ${year}. Drinkvensters zijn jaartallen. "aging_wine" is true als de wijn baat heeft bij enkele jaren rijping. ` +
        `Geef bij "estimated_price_eur" de gangbare Nederlandse/Europese winkelprijs per fles in euro's. "confidence" is 0-1 hoe zeker je bent van de herkenning.`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: hint ? `Herken deze wijn. Extra aanwijzing: ${hint}` : 'Herken deze wijn en vul alle velden zo volledig mogelijk in.' },
        { type: 'image_url', image_url: { url: image, detail: 'high' } },
      ],
    },
  ], { maxTokens: 1800 });

  await logActivity(env, user.id, 'ai.recognize', 'wine', null, { name: result.name });
  return json({ wine: sanitizeRecognition(result) });
}

// POST /api/ai/enrich  { name, producer, vintage, ... }  -> aanvullen van een handmatig ingevoerde wijn
export async function enrich(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 20_000);
  const name = str(body.name, { max: 200, required: true, name: 'Naam' });
  const year = new Date().getFullYear();
  const known = JSON.stringify({ name, producer: body.producer, vintage: body.vintage, country: body.country, region: body.region, grapes: body.grapes, type: body.type }).slice(0, 2000);
  const result = await chat(env, [
    { role: 'system', content: `Je bent een ervaren sommelier. Vul de ontbrekende gegevens van een wijn aan op basis van je kennis. Antwoord uitsluitend met JSON volgens dit schema (Nederlands, null bij onbekend):\n${WINE_SCHEMA_HINT}\nHet is nu ${year}.` },
    { role: 'user', content: `Bekende gegevens: ${known}. Vul aan.` },
  ], { maxTokens: 1500 });
  return json({ wine: sanitizeRecognition({ ...result, ...stripEmpty(body) }) });
}

function stripEmpty(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
}

// POST /api/ai/price  { wine_id }  -> prijsindicatie, met webbronnen als BRAVE_API_KEY is ingesteld
export async function priceEstimate(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 10_000);
  const w = await env.DB.prepare('SELECT * FROM wines WHERE id = ?').bind(str(body.wine_id, { max: 60, required: true, name: 'wine_id' })).first();
  if (!w) throw new HttpError(404, 'Wijn niet gevonden.');

  const query = [w.producer, w.name, w.vintage, w.region].filter(Boolean).join(' ');
  let sources = [];
  if (env.BRAVE_API_KEY) {
    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + ' wijn prijs kopen')}&count=8&country=NL&search_lang=nl`, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        sources = (data.web?.results || []).slice(0, 8)
          .map((r) => ({ title: str(r.title, { max: 200 }), url: safeHttpsUrl(r.url), snippet: String(r.description || '').slice(0, 300) }))
          .filter((r) => r.url);
      }
    } catch (e) {
      console.error('Zoekfout', e);
    }
  }

  const result = await chat(env, [
    {
      role: 'system',
      content: 'Je bent een wijnprijsexpert voor de Nederlandse/Europese markt. Geef een realistische winkelprijs per fles in euro. Antwoord uitsluitend met JSON: {"price_eur": 0, "min_eur": 0, "max_eur": 0, "confidence": 0.0, "reasoning": "korte uitleg in het Nederlands", "sources_used": ["url", ...]}. ' +
        (sources.length ? 'Baseer je waar mogelijk op de meegegeven zoekresultaten en noem de gebruikte URL\'s.' : 'Er zijn geen zoekresultaten; geef een schatting op basis van kennis en zet confidence laag.'),
    },
    {
      role: 'user',
      content: `Wijn: ${query} (${w.type}${w.volume_ml && w.volume_ml !== 750 ? `, ${w.volume_ml} ml` : ''}).\nZoekresultaten:\n${sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}\n   ${s.snippet}`).join('\n') || '(geen)'}`,
    },
  ], { maxTokens: 600 });

  const price = safeNum(result.price_eur, 0, 1e6);
  const min = safeNum(result.min_eur, 0, 1e6);
  const max = safeNum(result.max_eur, 0, 1e6);
  const source = { at: nowIso(), confidence: safeNum(result.confidence, 0, 1), reasoning: str(result.reasoning, { max: 1000 }), sources: sources.filter((s) => (Array.isArray(result.sources_used) ? result.sources_used : []).includes(s.url)).map((s) => ({ title: s.title, url: s.url })).slice(0, 5), method: sources.length ? 'web+ai' : 'ai' };
  await env.DB.prepare('UPDATE wines SET estimated_price = ?, estimated_price_min = ?, estimated_price_max = ?, estimated_price_source = ?, estimated_price_at = ?, updated_at = ? WHERE id = ?')
    .bind(price, min, max, JSON.stringify(source), nowIso(), nowIso(), w.id).run();
  await logActivity(env, user.id, 'ai.price', 'wine', w.id, { name: w.name, price });
  return json({ estimated_price: price, estimated_price_min: min, estimated_price_max: max, source });
}

// POST /api/ai/pair  { dish }  -> beste wijnen uit de eigen kelder bij een gerecht
export async function pairFromCellar(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 10_000);
  const dish = str(body.dish, { max: 300, required: true, name: 'Gerecht' });
  const wines = (await env.DB.prepare(
    `SELECT w.id, w.name, w.producer, w.country, w.region, w.type, w.vintage, w.grapes, w.body, w.sweetness, w.drink_from, w.drink_until, w.peak_from, w.peak_until, w.food_pairings,
            COUNT(b.id) AS bottles
     FROM wines w JOIN bottles b ON b.wine_id = w.id AND b.status = 'in_cellar' GROUP BY w.id LIMIT 400`
  ).all()).results;
  if (!wines.length) return json({ suggestions: [], summary: 'De kelder is leeg.' });
  const compact = wines.map((w) => `${w.id}|${w.producer || ''} ${w.name}${w.vintage ? ' ' + w.vintage : ''}|${w.type}|${w.country || ''} ${w.region || ''}|${(JSON.parse(w.grapes || '[]')).join('/')}|${w.body || ''}|${w.sweetness || ''}|drink ${w.drink_from || '?'}-${w.drink_until || '?'}|${w.bottles} fles(sen)`).join('\n');
  const result = await chat(env, [
    { role: 'system', content: `Je bent een sommelier die uitsluitend wijnen uit de kelder van het huishouden aanbeveelt. Het is ${new Date().getFullYear()}. Antwoord uitsluitend met JSON: {"summary": "1-2 zinnen", "suggestions": [{"wine_id": "id uit de lijst", "score": 0-100, "reason": "waarom dit past, Nederlands, max 2 zinnen", "serving_tip": "korte serveertip"}]}. Geef maximaal 5 suggesties, beste eerst. Houd rekening met drinkvensters (liever wijnen die nu op dreef zijn).` },
    { role: 'user', content: `Gerecht: ${dish}\n\nKelder (id|wijn|type|herkomst|druiven|body|zoetheid|drinkvenster|voorraad):\n${compact}` },
  ], { maxTokens: 900 });
  const ids = new Set(wines.map((w) => w.id));
  const suggestions = (Array.isArray(result.suggestions) ? result.suggestions : [])
    .filter((s) => ids.has(s.wine_id))
    .slice(0, 5)
    .map((s) => ({ wine_id: s.wine_id, score: safeNum(s.score, 0, 100), reason: str(s.reason, { max: 500 }), serving_tip: str(s.serving_tip, { max: 200 }) }));
  return json({ summary: str(result.summary, { max: 500 }), suggestions });
}

// POST /api/ai/dishes  { wine_id }  -> gerechten die bij een wijn passen
export async function dishesForWine(req, env, { user }) {
  await rateLimit(env, `ai:${user.id}`, 60, 3600);
  const body = await readJson(req, 10_000);
  const w = await env.DB.prepare('SELECT * FROM wines WHERE id = ?').bind(str(body.wine_id, { max: 60, required: true, name: 'wine_id' })).first();
  if (!w) throw new HttpError(404, 'Wijn niet gevonden.');
  const result = await chat(env, [
    { role: 'system', content: 'Je bent een sommelier. Antwoord uitsluitend met JSON: {"dishes": [{"name": "gerecht", "why": "korte reden"}], "avoid": ["wat juist niet past"]}. Geef 6-8 gerechten (Nederlandse keuken en internationaal), Nederlands.' },
    { role: 'user', content: `Wijn: ${[w.producer, w.name, w.vintage].filter(Boolean).join(' ')}, ${w.type}, ${w.country || ''} ${w.region || ''}, druiven: ${JSON.parse(w.grapes || '[]').join(', ')}, body: ${w.body || '?'}, zoetheid: ${w.sweetness || '?'}.` },
  ], { maxTokens: 700 });
  const dishes = (Array.isArray(result.dishes) ? result.dishes : []).slice(0, 10).map((d) => ({ name: str(d.name, { max: 100 }), why: str(d.why, { max: 300 }) }));
  if (dishes.length) {
    const existing = JSON.parse(w.food_pairings || '[]');
    const merged = [...new Set([...existing, ...dishes.map((d) => d.name).filter(Boolean)])].slice(0, 40);
    await env.DB.prepare('UPDATE wines SET food_pairings = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(merged), nowIso(), w.id).run();
  }
  return json({ dishes, avoid: Array.isArray(result.avoid) ? result.avoid.slice(0, 5).map((a) => String(a).slice(0, 100)) : [] });
}
