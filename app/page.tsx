import {navigation} from '../lib/omniseed/contracts.mjs';
export default function Home(){return <main><h1>OmniSeed OS</h1><p>Operate your organisation through capabilities, plans, and evidence.</p><nav aria-label="Primary">{navigation.map(item=><a key={item.id} href={`/${item.id}`}>{item.label}</a>)}</nav></main>}
