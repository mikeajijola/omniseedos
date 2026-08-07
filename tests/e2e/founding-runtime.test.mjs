import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {LiveTransport} from '../../lib/omniseed/transport.mjs';
import {loadOperatingView,renderOperatingView} from '../../lib/ui/render.mjs';
import {renderFounding} from '../../lib/ui/founding.mjs';

const runtimeRoot=path.resolve(process.env.OMNISEED_ROOT||'../omniseed');
const port=Number(process.env.OMNISEED_FOUNDING_TEST_PORT||18788),baseUrl=`http://127.0.0.1:${port}`;

test('founder reviews, commits, restarts, and OS renders persistent honest gaps',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'omniseed-founding-'));
  let child;
  try {
    child=await start(data);
    const transport=new LiveTransport({baseUrl});
    const session=await transport.startFoundingSession('founder-test');
    const proposal=await transport.submitFounderIntent(session.id,'I want to build a SaaS company helping small construction businesses manage invoices and late payments.');
    assert.equal(proposal.capabilities.length,8);
    assert.match(renderFounding(await transport.getFoundingDraft(session.id),await transport.validateFoundingDraft(session.id)),/Customer Acquisition/);
    for(const outcome of proposal.outcomes)await transport.acceptDraftItem(session.id,'outcomes',outcome.id);
    for(const capability of proposal.capabilities)await transport.acceptDraftItem(session.id,'capabilities',capability.id);
    await transport.rejectDraftItem(session.id,'resourceSuggestions','invoice_implementation');
    const validation=await transport.validateFoundingDraft(session.id);
    assert.equal(validation.valid,true);
    assert.equal(validation.definition.company.resources.length,0);
    const committed=await transport.commitFoundingDraft(session.id,{actorId:'founder-test',permissions:['commit_company']});
    assert.equal(committed.capabilities.length,8);
    assert.equal(committed.gaps.length,8);
    assert.equal(committed.plan.unresolvedRequirements.length,8);
    assert.ok((await transport.listActivity()).some(event=>event.type==='company.created'));
    await stop(child);child=undefined;
    child=await start(data,'construction_cashflow');
    const restarted=new LiveTransport({baseUrl}),view=await loadOperatingView(restarted);
    assert.equal(view.company.id,'construction_cashflow');
    assert.equal(view.capabilities.length,8);
    assert.equal(view.gaps.length,8);
    assert.match(renderOperatingView(view),/Construction Cashflow/);
    assert.match(renderOperatingView(view),/<strong>8<\/strong> gaps/);
  } finally {
    if(child)await stop(child);
    await fs.rm(data,{recursive:true,force:true});
  }
});

async function start(data,companyId){
  const child=spawn(process.execPath,['packages/runtime/src/server.mjs'],{cwd:runtimeRoot,env:{...process.env,PORT:String(port),OMNISEED_DATA_DIR:data,...(companyId?{OMNISEED_COMPANY_ID:companyId}:{})},stdio:['ignore','pipe','pipe']});
  for(let i=0;i<50;i++){try{if((await fetch(`${baseUrl}/health`)).ok)return child}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  throw new Error('runtime did not start');
}
async function stop(child){if(child.exitCode!==null)return;child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve))}
