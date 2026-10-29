import test from 'node:test';
import assert from 'node:assert/strict';
import {publishWorker} from './publish-worker-ci.mjs';
const env={GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY_OWNER:'synthetic',GITHUB_ACTOR:'synthetic',CLOUDFLARE_API_TOKEN:'synthetic',CLOUDFLARE_ACCOUNT_ID:'synthetic'};
test('blocks missing bindings and untrusted contexts without running a publisher',()=>{
 let calls=0;const run=()=>{calls++;};assert.equal(publishWorker({env:{...env,CLOUDFLARE_API_TOKEN:''},run}).status,'blocked');assert.equal(publishWorker({env:{...env,GITHUB_ACTOR:'other'},run}).status,'blocked');assert.equal(calls,0);
});
test('publishes only the fixed static-site config and suppresses raw command output',()=>{
 let args;const report=publishWorker({env,run:(_command,argv)=>{args=argv;return {status:0,stdout:'synthetic-private-config',stderr:'synthetic-private-token'};}});assert.equal(report.status,'deployed');assert.ok(args.includes('wrangler.jsonc'));assert.ok(!JSON.stringify(report).includes('private'));
});
test('reports failure without exposing captured stderr',()=>{const report=publishWorker({env,run:()=>({status:1,stderr:'never-print-this'})});assert.equal(report.status,'failed');assert.ok(!JSON.stringify(report).includes('never-print'));});
