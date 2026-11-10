import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {SQLiteStore} from '../server/sqlite.mjs';
import {createServer} from '../server/portable.mjs';
import {SAMPLE_CASES} from '../lib/fixtures.ts';
test('SQLite survives restart and uses compare-and-swap revisions',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'gaplab-'));const file=path.join(dir,'test.sqlite');let s=new SQLiteStore(file);assert(await s.create('k',{value:1}));assert(!await s.create('k',{value:0}));assert(await s.write('k',{value:2},0));assert(!await s.write('k',{value:3},0));s.close();s=new SQLiteStore(file);assert.deepEqual(await s.read('k'),{value:{value:2},revision:1});s.close();await rm(dir,{recursive:true});});
test('portable HTTP server serves health, assets and no-login API with independent sessions',async()=>{const store=new SQLiteStore(':memory:'),server=await createServer(store);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{assert.equal((await fetch(base+'/health')).status,200);const page=await fetch(base+'/');assert.equal(page.status,200);assert((await page.text()).includes('id="root"'));assert.equal((await fetch(base+'/app.js')).status,200);const r=await fetch(base+'/api/workspace');assert.equal(r.status,200);assert.equal((await r.json()).dataset.length,0);assert(r.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await fetch(base+'/missing-file.js')).status,404);assert.equal((await fetch(base+'/api/workspace',{method:'DELETE'})).status,405);}finally{await new Promise(r=>server.close(r));store.close();}});
test('Render HTTPS workspace can save and evaluate through the internal HTTP server', async () => {
  const origin = 'https://build-gap.onrender.com';
  const previous = process.env.RENDER_EXTERNAL_URL;
  process.env.RENDER_EXTERNAL_URL = origin;
  const store = new SQLiteStore(':memory:');
  const server = await createServer(store);
  if (previous === undefined) delete process.env.RENDER_EXTERNAL_URL;
  else process.env.RENDER_EXTERNAL_URL = previous;

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/workspace`;
  const headers = { Host: new URL(origin).host };
  // Node fetch uses the connection host, so send the proxy's Host header via HTTP.
  const request = (options = {}, body) => new Promise((resolve, reject) => {
    const req = http.request(endpoint, { ...options, headers: { ...headers, ...options.headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status: res.statusCode,
        headers: res.headers,
      })));
    });
    req.on('error', reject);
    req.end(body);
  });
  try {
    const opened = await request();
    const cookie = opened.headers.get('set-cookie');
    assert.match(cookie, /; Secure$/);
    headers.Cookie = cookie.split(';')[0];
    const { revision } = await opened.json();

    const post = (body, requestOrigin = origin) => request({
      method: 'POST',
      headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
    }, JSON.stringify(body));
    const dataset = SAMPLE_CASES.slice(0, 4);
    assert.equal((await post({ action: 'import', dataset, revision }, 'https://other.example')).status, 403);
    const saved = await post({ action: 'import', dataset, revision });
    assert.equal(saved.status, 200);
    const suggestion = await post({ action: 'suggest' });
    assert.equal(suggestion.status, 200);
    const { prompt } = await suggestion.json();
    assert.match(prompt, /Verify the final answer/);

    const version = await post({ action: 'save_prompt', prompt, revision: revision + 1 });
    assert.equal(version.status, 200);
    const { versions } = await version.json();
    const responses = Object.fromEntries(dataset.map(c => [c.id, { baseline: c.baseline, improved: c.improved }]));
    for (const mode of ['replay', 'manual']) {
      const run = await post({ action: 'run', mode, baselineId: 'v1', improvedId: versions.at(-1).id, responses });
      assert.equal(run.status, 201);
      const { report } = await run.json();
      assert.equal(report.metrics.before, 2);
      assert.equal(report.metrics.after, 4);
    }
    const reloaded = await (await request()).json();
    assert.equal(reloaded.dataset.length, 4);
    assert.equal(reloaded.versions.length, 2);
    assert.equal(reloaded.runs.length, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});
