export type RecordValue={revision:number;value:unknown};
export interface RecordStore {read(key:string):Promise<RecordValue|null>;create(key:string,value:unknown):Promise<boolean>;write(key:string,value:unknown,revision:number):Promise<boolean>}
export class D1Store implements RecordStore {
 db:D1Database; constructor(db:D1Database){this.db=db;}
 async read(key:string){const r=await this.db.prepare('SELECT revision, value FROM public_records WHERE key = ?').bind(key).first<{revision:number;value:string}>();return r?{revision:r.revision,value:JSON.parse(r.value)}:null;}
 async create(key:string,value:unknown){const r=await this.db.prepare('INSERT OR IGNORE INTO public_records (key, value, revision) VALUES (?, ?, 0)').bind(key,JSON.stringify(value)).run();return r.meta.changes===1;}
 async write(key:string,value:unknown,revision:number){const r=await this.db.prepare('UPDATE public_records SET value = ?, revision = revision + 1 WHERE key = ? AND revision = ?').bind(JSON.stringify(value),key,revision).run();return r.meta.changes===1;}
}
