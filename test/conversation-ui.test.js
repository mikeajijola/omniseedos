import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as conversations from '../public/conversations.js';

async function harness() {
  const elements = new Map(), pending = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', value: '', classList: { add() {}, remove() {}, toggle() {} }, focus() {}, addEventListener(name, handler) { this[name] = handler; } });
    return elements.get(id);
  };
  const context = vm.createContext({ ...conversations, renderPlans() {}, document: { querySelector: element, querySelectorAll: () => [] }, fetch: url => new Promise(resolve => pending.push({url, resolve: data => resolve({ok:true,json:async()=>data})})), setTimeout: () => 1, clearTimeout() {}, crypto: {randomUUID:()=> 'test-request'} });
  const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
  vm.runInContext(source, context);
  return { context, element, pending, run: source => vm.runInContext(source, context) };
}
const work = {id:'old-work',conversationId:'old-conversation',status:'waiting_for_input',session:{id:'session'},events:[]};
const company = {company:{name:'Test'},instance:{environment:'test'},observations:[],capabilities:[],workRuns:[work]};
const flush = () => new Promise(resolve=>setImmediate(resolve));

test('new conversation selection survives an in-flight company refresh', async () => {
  const h = await harness();
  h.element('#new-conversation').click();
  h.pending[0].resolve(company); await flush();
  assert.equal(h.run('currentWork'), null);
});

test('a stale poll cannot restore a conversation after New conversation', async () => {
  const h = await harness();h.pending[0].resolve(company);await flush();
  const polling=h.run('pollWork()');
  h.element('#new-conversation').click();
  h.pending[1].resolve(work);await flush();
  assert.equal(h.run('currentWork'),null);
  assert.equal(h.pending.length,2);
});

test('an input prompt replaces historical answers in the response area', async()=>{
  const h=await harness();
  h.run(`renderWork(${JSON.stringify({...work,events:[{type:'assistant_message',summary:'Old answer'},{type:'operator_input_requested',summary:'Choose Approve or Stop.'}]})})`);
  assert.equal(h.element('#steward-response').textContent,'Choose Approve or Stop.');
});
