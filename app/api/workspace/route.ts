import {env} from 'cloudflare:workers';
import {handleApi} from '../../../server/api';
import {D1Store} from '../../../server/store';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleApi(request,new D1Store(env.DB!));
export const POST=(request:Request)=>handleApi(request,new D1Store(env.DB!));
