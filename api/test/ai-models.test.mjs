import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { chatJson, chatWithTools } from '../src/ai.js';
import { makeEnv, seedUser, call } from './harness.mjs';
import { recognitionCorrections } from '../../web/js/util.js';

test('handmatige herkenningscorrecties bevatten alleen gewijzigde, ingevulde velden', () => {
  assert.deepEqual(recognitionCorrections(
    { name: 'Chardonnay', type: 'wit', vintage: 2022, producer: '', grapes: ['Chardonnay'] },
    { name: 'Chardonnay', type: 'rood', vintage: 2022, producer: 'Domaine', grapes: ['Merlot'] },
  ), { type: 'wit', grapes: ['Chardonnay'] });
});

test('Anthropic-modelijst gebruikt actuele modellen en de nieuwe standaard', async (t) => {
  const env = makeEnv();
  const user = await seedUser(env);
  t.after(() => env.DB.raw.close());
  env.AI_API_KEY = `sk-ant-api03-${'A'.repeat(40)}`;

  const response = await call(worker, env, '/api/ai/settings', { token: user.token });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.json.providers), ['anthropic']);
  assert.deepEqual(response.json.providers.anthropic.models.map((model) => model.id), [
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-haiku-4-5',
  ]);
  assert.equal(response.json.active.model, 'claude-sonnet-5-5');
  const openAi = await call(worker, env, '/api/ai/settings', {
    method: 'PUT',
    token: user.token,
    body: { provider: 'openai', model: 'gpt-4o-mini', api_key: `sk-${'A'.repeat(40)}` },
  });
  assert.equal(openAi.status, 400);
});

test('Anthropic 5.5-verzoeken laten temperature weg voor JSON- en tool-calls', async (t) => {
  const env = makeEnv();
  const user = await seedUser(env);
  t.after(() => env.DB.raw.close());
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ content: [{ type: 'text', text: '{"ok":true}' }] });
  };

  for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5']) {
    const saved = await call(worker, env, '/api/ai/settings', {
      method: 'PUT',
      token: user.token,
      body: { provider: 'anthropic', model, api_key: `sk-ant-api03-${'A'.repeat(40)}` },
    });
    assert.equal(saved.status, 200);

    await chatJson(env, [{ role: 'user', content: 'test' }]);
    assert.equal(sent.model, model);
    assert.equal(Object.hasOwn(sent, 'temperature'), false);

    await chatWithTools(env, {
      system: 'test',
      messages: [{ role: 'user', content: 'test' }],
      tools: [{ name: 'test', description: 'test', input_schema: { type: 'object', properties: {} } }],
    });
    assert.equal(sent.model, model);
    assert.equal(Object.hasOwn(sent, 'temperature'), false);
  }
});

test('fotoherkenning gebruikt en bewaart handmatige correcties', async (t) => {
  const env = makeEnv();
  const user = await seedUser(env);
  t.after(() => env.DB.raw.close());
  t.after(() => { globalThis.fetch = realFetch; });
  const realFetch = globalThis.fetch;
  await call(worker, env, '/api/ai/settings', {
    method: 'PUT',
    token: user.token,
    body: { provider: 'anthropic', model: 'claude-sonnet-5-5', api_key: `sk-ant-api03-${'A'.repeat(40)}` },
  });

  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ content: [{ type: 'text', text: JSON.stringify({ name: 'Red wine', type: 'rood', vintage: 2022 }) }] });
  };
  const response = await call(worker, env, '/api/ai/recognize', {
    method: 'POST',
    token: user.token,
    body: {
      image: `data:image/jpeg;base64,${'A'.repeat(400)}`,
      corrections: { name: 'White wine', type: 'wit' },
    },
  });
  assert.equal(response.status, 200);
  assert.match(sent.messages[0].content[0].text, /"type":"wit"/);
  assert.equal(response.json.wine.name, 'White wine');
  assert.equal(response.json.wine.type, 'wit');
  const invalid = await call(worker, env, '/api/ai/recognize', {
    method: 'POST',
    token: user.token,
    body: { image: `data:image/jpeg;base64,${'A'.repeat(400)}`, corrections: { type: 'dessertwijn' } },
  });
  assert.equal(invalid.status, 400);
});
