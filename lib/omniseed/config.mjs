import {LiveTransport,FixtureTransport,DemoTransport} from './transport.mjs';
export function resolveTransport({mode='live',runtimeUrl='http://127.0.0.1:8787',fixture,fetchImpl}={}){
  if(mode==='live')return new LiveTransport({baseUrl:runtimeUrl,fetchImpl});
  if(mode==='fixture')return new FixtureTransport(fixture);
  if(mode==='demo')return new DemoTransport(fixture);
  throw new Error(`Unsupported OMNISEED_TRANSPORT_MODE: ${mode}`);
}
