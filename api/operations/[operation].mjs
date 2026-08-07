import {handleHostedRuntimeRequest} from 'omniseed/packages/runtime/src/hosted.mjs';
export default async function handler(request,response){return send(response,await handleHostedRuntimeRequest(await webRequest(request)))}
async function webRequest(request){const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=Buffer.concat(chunks);return new Request(`https://${request.headers.host}${request.url}`,{method:request.method,headers:request.headers,body:body.length?body:undefined})}
async function send(response,result){response.statusCode=result.status;for(const [key,value]of result.headers)response.setHeader(key,value);response.end(Buffer.from(await result.arrayBuffer()))}
