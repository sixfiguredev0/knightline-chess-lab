const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname,'..');
function background(fetch) {
  let handler;
  const context = vm.createContext({console,setTimeout,clearTimeout,AbortController,fetch,chrome:{runtime:{onMessage:{addListener(fn){handler=fn;}},getManifest:()=>({version:'4.8.1'})},tabs:{query:async()=>[{id:42}],sendMessage:async()=>({site:'Chess.com',mode:'Analysis',result:'e4'})}}});
  context.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file}));
  vm.runInContext(fs.readFileSync(path.join(root,'background.js'),'utf8'),context,{filename:'background.js'});
  return {analyze:(fen,elo,depth)=>vm.runInContext(`analyzeFen(${JSON.stringify(fen)},${elo},${depth})`,context),message:message=>new Promise(resolve=>handler(message,{},resolve))};
}
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
test('background preserves candidate arrays and actual depth', async()=>{
  const bg=background(async()=>({ok:true,json:async()=>[{move:'e2e4',eval:.3,depth:12},{move:'d2d4',eval:.2,depth:12}]}));
  const data=await bg.analyze(fen,1800);
  assert.equal(data.candidates.length,2); assert.equal(data.from,'e2'); assert.equal(data.depth,12); assert.equal(data.requestedDepth,14);
});
test('cache deduplicates concurrent requests while keeping shallow searches separate',async()=>{
  let calls=0;
  const bg=background(async(url,options)=>{calls++; await new Promise(resolve=>setTimeout(resolve,10));const request=JSON.parse(options.body);return {ok:true,json:async()=>({move:'e2e4',depth:request.depth})};});
  const [a,b]=await Promise.all([bg.analyze(fen,1800),bg.analyze(fen,1800)]);
  assert.equal(calls,1);assert.equal(a.move,b.move);
  assert.equal((await bg.analyze(fen,1800,2)).depth,2);assert.equal(calls,2);
  await bg.analyze(fen,1800);assert.equal(calls,2);
});
test('engine requests exclude cookies and referrers and reject redirects',async()=>{
  let request;
  const bg=background(async(url,options)=>{request={url,options};return {ok:true,json:async()=>({move:'e2e4'})};});
  await bg.analyze(fen,1800);
  assert.equal(request.url,'https://chess-api.com/v1');
  assert.equal(request.options.credentials,'omit');
  assert.equal(request.options.referrerPolicy,'no-referrer');
  assert.equal(request.options.redirect,'error');
  assert.deepEqual(Object.keys(JSON.parse(request.options.body)).sort(),['depth','fen','maxThinkingTime','variants']);
});
test('failed requests are released and can be retried',async()=>{
  let calls=0;const bg=background(async()=>{calls++;if(calls===1)throw new Error('offline');return {ok:true,json:async()=>({move:'g1f3'})};});
  await assert.rejects(bg.analyze(fen,1800),/offline/);assert.equal((await bg.analyze(fen,1800)).from,'g1');
});
test('invalid engine output and rate limits become useful errors',async()=>{
  const invalid=background(async()=>({ok:true,json:async()=>({type:'info',text:'no move'})}));
  await assert.rejects(invalid.analyze(fen,1800),/No move returned/);
  const busy=background(async()=>({ok:false,status:429}));await assert.rejects(busy.analyze(fen,1800),/Engine is busy/);
});
test('runtime status queries the active content tab and includes version',async()=>{
  const bg=background(async()=>{}), result=await bg.message({type:'GET_RUNTIME_STATUS'});
  assert.equal(result.version,'4.8.1');assert.equal(result.status.site,'Chess.com');assert.equal(result.status.mode,'Analysis');
});
test('invalid incoming FEN is rejected before any network call',async()=>{
  let calls=0;const bg=background(async()=>{calls++;});const result=await bg.message({type:'ANALYZE_FEN',fen:'no board'});
  assert.equal(result.ok,false);assert.match(result.error,/Invalid board/);assert.equal(calls,0);
});
