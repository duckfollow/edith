import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(readFileSync(new URL('./desktop-bridge.ts',import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function mount(bundled=true) {
 const calls=[], handlers={}, exports={}; let original=0;
 const window={fetch:async()=>{original++;return new Response('external');},dispatchEvent(){}};
 vm.runInNewContext(source,{exports,window,location:{origin:'tauri://localhost'},document:{addEventListener(name,handler){handlers[name]=handler;}},Headers,Response,URL,DOMException,Uint8Array,CustomEvent:class{},require(name){
  if(name.includes('runtime-mode'))return{isBundledDesktop:()=>bundled};
  if(name.includes('api/event'))return{listen:async()=>()=>{}};
  return{invoke:async(name,args)=>{
   calls.push([name,args]);
   if(name==='desktop_runtime_info')return{port:54321,mode:'local',setupToken:null};
   return{status:200,headers:{'content-type':'application/json'},body:[...Buffer.from('{"ready":true}') ]};
  }};
 }});
 exports.installDesktopRuntimeBridge();return{exports,window,calls,get original(){return original;}};
}
test('packaged relative API fetches use restricted IPC and preserve JSON responses',async()=>{
 const app=mount();const response=await app.window.fetch('/__edith_proxy/start',{method:'POST',headers:{'Content-Type':'application/json','X-Edith-Token':'control','Authorization':'must-not-forward'},body:'{}'});
 assert.deepEqual(await response.json(),{ready:true});
 const request=app.calls.find(([name])=>name==='desktop_runtime_request')[1].request;
 assert.equal(request.path,'/__edith_proxy/start');assert.equal(request.headers['x-edith-token'],'control');assert.equal(request.headers.authorization,undefined);
 assert.equal(app.exports.desktopServiceOrigin(),'http://127.0.0.1:54321');
 await app.window.fetch('https://example.com');assert.equal(app.original,1);
});
test('development keeps normal fetch and pre-aborted requests never issue IPC mutations',async()=>{
 const browser=mount(false);await browser.window.fetch('/__edith_proxy/status');assert.equal(browser.calls.length,0);assert.equal(browser.original,1);
 const app=mount();await assert.rejects(app.window.fetch('/__edith_proxy/start',{method:'POST',signal:AbortSignal.abort()}),{name:'AbortError'});
 assert.equal(app.calls.some(([name])=>name==='desktop_runtime_request'),false);
});
