const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname,'..');
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
(async () => {
 const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'knightline-live-')), {headless:true,executablePath:process.env.CHROMIUM_PATH,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
 const report = {provider:null,sites:[]};
 try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  report.provider = await worker.evaluate(async () => {try {const data=await analyzeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',1800);return {ok:true,move:data.move,depth:data.depth,candidates:data.candidates.length};}catch(error){return {ok:false,error:error.message};}});
  console.log('Provider:',JSON.stringify(report.provider));
  report.shallowProvider = await worker.evaluate(async () => {try {const data=await analyzeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',1800,2);return {ok:true,move:data.move,depth:data.depth,requestedDepth:data.requestedDepth};}catch(error){return {ok:false,error:error.message};}});
  console.log('Shallow provider:',JSON.stringify(report.shallowProvider));
  await worker.evaluate(()=>chrome.storage.local.set({enabled:true,showPanel:true,showArrow:true,autoplay:false,imperfectMoves:false}));
  for(const url of ['https://lichess.org/analysis','https://www.chess.com/analysis']) {
   const page=await context.newPage();
   try {
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForSelector('cg-board piece, wc-chess-board .piece, chess-board .piece',{timeout:18000});
    await page.waitForTimeout(3500);
    const result=await page.evaluate(()=>({url:location.href,board:document.querySelector('cg-board,wc-chess-board,chess-board')?.outerHTML.slice(0,250),pieceCount:document.querySelectorAll('cg-board piece,wc-chess-board .piece,chess-board .piece').length,panel:document.getElementById('chesshelper-live-panel')?.dataset.stage,move:document.getElementById('chp-move')?.textContent,detail:document.getElementById('chp-eval')?.textContent,fenInputs:[...document.querySelectorAll('input')].filter(el=>el.value?.split('/').length===8).map(el=>({class:el.className,name:el.name,value:el.value})),activeMoves:[...document.querySelectorAll('move.active,.node.active,[data-ply].active')].map(el=>({tag:el.tagName,attrs:[...el.attributes].map(a=>[a.name,a.value])}))}));
    report.sites.push(result);console.log('Site:',JSON.stringify(result));
    await page.screenshot({path:path.join(root,'artifacts',url.includes('lichess')?'lichess-live.png':'chesscom-live.png'),fullPage:false});
   }catch(error){report.sites.push({url,error:error.message.split('\n')[0]});console.log('Site unavailable:',url,error.message.split('\n')[0]);}
   await page.close();
  }
  fs.writeFileSync(path.join(root,'artifacts','live-smoke.json'),JSON.stringify(report,null,2));
 }finally{await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
