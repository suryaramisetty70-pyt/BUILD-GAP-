import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {SQLiteStore} from '../server/sqlite.mjs';
import {createServer} from '../server/portable.mjs';
test('SQLite survives restart and uses compare-and-swap revisions',async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),'gaplab-'));const file=path.join(dir,'test.sqlite');let s=new SQLiteStore(file);assert(await s.create('k',{value:1}));assert(!await s.create('k',{value:0}));assert(await s.write('k',{value:2},0));assert(!await s.write('k',{value:3},0));s.close();s=new SQLiteStore(file);assert.deepEqual(await s.read('k'),{value:{value:2},revision:1});s.close();await rm(dir,{recursive:true});});
test('portable HTTP server serves health, assets and no-login API with independent sessions',async()=>{const store=new SQLiteStore(':memory:'),server=await createServer(store);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{assert.equal((await fetch(base+'/health')).status,200);const page=await fetch(base+'/');assert.equal(page.status,200);assert((await page.text()).includes('id="root"'));assert.equal((await fetch(base+'/app.js')).status,200);const r=await fetch(base+'/api/workspace');assert.equal(r.status,200);assert.equal((await r.json()).dataset.length,0);assert(r.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await fetch(base+'/missing-file.js')).status,404);assert.equal((await fetch(base+'/api/workspace',{method:'DELETE'})).status,405);}finally{await new Promise(r=>server.close(r));store.close();}});
