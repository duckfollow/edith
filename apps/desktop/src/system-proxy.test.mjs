import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('./system-proxy.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const capabilities=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json',import.meta.url),'utf8'));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function mount(){
 let handler,restoration=async()=>{},recovery=null,readFailure=false,destroyed=0;
 const calls=[],notices=[],elements=new Map();
 const element=()=>({value:'Wi-Fi',checked:false,disabled:false,hidden:false,textContent:'',dataset:{},setAttribute(){},replaceChildren(){},add(){}});
 const panel={...element(),querySelector(key){if(!elements.has(key))elements.set(key,element());return elements.get(key);}};
 const exports={};
 const nativeWindow={
  async onCloseRequested(callback){handler=callback;return()=>{};},
  async close(){throw Error('Recursive close() must not be used inside close cleanup');},
 };
 vm.runInNewContext(compiled,{exports,
  document:{createElement:()=>panel},Option:function(){},
  localStorage:{getItem:()=>null,setItem(){}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  window:{dispatchEvent:event=>notices.push(event.detail)},
  require(name){
   if(name.includes('api/core'))return{isTauri:()=>true,async invoke(command){calls.push(command);if(command==='system_proxy_status'){if(readFailure)throw Error('status unavailable');return{supported:true,services:['Wi-Fi'],recovery};}if(command==='system_proxy_read')return{service:'Wi-Fi',http:{enabled:false},https:{enabled:false}};if(command==='system_proxy_change'){await restoration();recovery=null;return; }throw Error(command);}};
   if(name.includes('api/window'))return{getCurrentWindow:()=>nativeWindow};
   return{workspacePolicy:{manageConnections:true}};
  },
 });
 exports.mountSystemProxy({append(){}},()=>null);
 return{
  calls,notices,
  set recovery(value){recovery=value;},set restoration(value){restoration=value;},set readFailure(value){readFailure=value;},
  get destroyed(){return destroyed;},
  async close(){
   // Model @tauri-apps/api/window's onCloseRequested wrapper: await handler,
   // then call destroy() only when this event was not prevented.
   const event={prevented:false,preventDefault(){this.prevented=true;}};
   await handler(event);
   if(!event.prevented){assert.ok(capabilities.permissions.includes('core:window:allow-destroy'));destroyed++;}
   return event;
  },
 };
}
test('native Close without saved proxy settings destroys the window once',async()=>{
 const app=mount();await settle();const event=await app.close();assert.equal(event.prevented,false);assert.equal(app.destroyed,1);assert.equal(app.calls.filter(c=>c==='system_proxy_change').length,0);
});
test('Close waits for restoration and suppresses duplicate close clicks',async()=>{
 const app=mount();await settle();app.recovery={service:'Wi-Fi'};
 let finish;app.restoration=()=>new Promise(resolve=>finish=resolve);
 const first=app.close();await settle();assert.equal(app.destroyed,0);
 const second=await app.close();assert.equal(second.prevented,true);assert.equal(app.calls.filter(c=>c==='system_proxy_change').length,1);
 finish();await first;assert.equal(app.destroyed,1);
});
test('cancelled restoration keeps the window open, reports the reason, and allows a successful retry',async()=>{
 const app=mount();await settle();app.recovery={service:'Wi-Fi'};
 app.restoration=async()=>{throw Error('administrator approval cancelled');};
 assert.equal((await app.close()).prevented,true);assert.equal(app.destroyed,0);assert.match(app.notices.at(-1),/administrator approval cancelled/);
 app.restoration=async()=>{};assert.equal((await app.close()).prevented,false);assert.equal(app.destroyed,1);
});
test('status read failure prevents closing and can be retried',async()=>{
 const app=mount();await settle();app.readFailure=true;
 assert.equal((await app.close()).prevented,true);assert.equal(app.destroyed,0);
 app.readFailure=false;await app.close();assert.equal(app.destroyed,1);
});
