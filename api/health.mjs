import {handleHostedRuntimeRequest} from 'omniseed/packages/runtime/src/hosted.mjs';
export default async function handler(request,response){const result=await handleHostedRuntimeRequest(new Request(`https://${request.headers.host}/api/health`));response.statusCode=result.status;response.setHeader('content-type','application/json');response.end(await result.text())}
