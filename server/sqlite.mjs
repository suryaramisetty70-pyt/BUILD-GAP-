import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
export class SQLiteStore {
 constructor(filename){if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});this.db=new DatabaseSync(filename);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS public_records (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)');}
 async read(key){const r=this.db.prepare('SELECT value, revision FROM public_records WHERE key=?').get(key);return r?{value:JSON.parse(r.value),revision:r.revision}:null;}
 async create(key,value){return this.db.prepare('INSERT OR IGNORE INTO public_records(key,value,revision) VALUES(?,?,0)').run(key,JSON.stringify(value)).changes===1;}
 async write(key,value,revision){return this.db.prepare('UPDATE public_records SET value=?, revision=revision+1 WHERE key=? AND revision=?').run(JSON.stringify(value),key,revision).changes===1;}
 close(){this.db.close();}
}
