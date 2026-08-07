import fs from 'node:fs';
for(const file of ['README.md','docs/index.md','app/page.tsx','lib/omniseed/contracts.mjs','fixtures/startup.json'])if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
for(const file of fs.readdirSync('app',{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>`app/${x.name}/page.tsx`))if(!fs.existsSync(file)&&!file.includes('/state/')&&!file.includes('/settings/'))throw new Error(`Missing route ${file}`);
console.log('Routes, contracts, fixtures, and docs entry points verified.');
