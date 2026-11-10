import pg from 'pg';
export class PostgresStore {
 constructor(connectionString){this.pool=new pg.Pool({connectionString,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});this.pool.on('error',()=>console.error('Database connection interrupted; requests will retry through the pool.'));}
 async init(){await this.pool.query('CREATE TABLE IF NOT EXISTS public_records (key TEXT PRIMARY KEY, value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)');}
 async read(key){const r=await this.pool.query('SELECT value, revision FROM public_records WHERE key=$1',[key]);return r.rows[0]?{value:JSON.parse(r.rows[0].value),revision:r.rows[0].revision}:null;}
 async create(key,value){const r=await this.pool.query('INSERT INTO public_records(key,value,revision) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[key,JSON.stringify(value)]);return r.rowCount===1;}
 async write(key,value,revision){const r=await this.pool.query('UPDATE public_records SET value=$1, revision=revision+1 WHERE key=$2 AND revision=$3',[JSON.stringify(value),key,revision]);return r.rowCount===1;}
 async close(){await this.pool.end();}
}
