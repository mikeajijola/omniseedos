import http from 'node:http';import fs from 'node:fs';import './build.mjs';
http.createServer((request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.end(fs.readFileSync('dist/index.html'))}).listen(3000,()=>console.log('OmniSeed OS fixture server: http://localhost:3000'));
