import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function publishWorker({env=process.env,run=spawnSync}={}) {
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/main'||!env.GITHUB_REPOSITORY_OWNER||env.GITHUB_ACTOR!==env.GITHUB_REPOSITORY_OWNER)return {status:'blocked',reason:'OWNER_MAIN_REQUIRED'};
 if(!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)return {status:'blocked',reason:'MISSING_ACTIONS_BINDINGS'};
 // Wrangler may print configured vars. Capture and discard both streams; emit no raw output.
 const result=run(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--config','wrangler.jsonc'],{env,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 return result.status===0?{status:'deployed'}:{status:'failed',reason:'DEPLOY_COMMAND_FAILED',exitCode:Number.isInteger(result.status)?result.status:null};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const report={observedAt:new Date().toISOString(),...publishWorker()};
 await mkdir('artifacts/worker-publication',{recursive:true});await writeFile('artifacts/worker-publication/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('WORKER_PUBLICATION '+JSON.stringify(report));if(report.status==='failed')process.exitCode=1;
}
