import fs from 'node:fs';
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist',{recursive:true});
const fixture=JSON.parse(fs.readFileSync('fixtures/startup.json'));
const list=Object.values(fixture.capabilities).map(c=>`<li><strong>${c.name}</strong>: <span>${c.state}</span></li>`).join('');
fs.writeFileSync('dist/index.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OmniSeed OS</title><body><header><h1>OmniSeed OS</h1><nav aria-label="Primary"><a href="#found">Found</a> <a href="#company">Company</a> <a href="#capabilities">Capabilities</a> <a href="#plan">Plan</a> <a href="#observe">Observe</a> <a href="#activity">Activity</a></nav></header><main><h2>${fixture.company.name}</h2><p>${fixture.company.purpose}</p><h2>Capabilities</h2><ul>${list}</ul><h2>Plan</h2><p>${fixture.plan.changes.length} proposed change; approval required.</p><button type="button">Review plan</button></main></body></html>`);
console.log('Built accessible fixture-backed reference page into dist/.');
