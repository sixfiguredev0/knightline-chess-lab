const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
const extensionRoot = path.resolve(process.env.KNIGHTLINE_EXTENSION_DIR || root);
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'knightline-check-'));
  const context = await chromium.launchPersistentContext(profile, {headless:true, executablePath:process.env.CHROMIUM_PATH, args:[`--disable-extensions-except=${extensionRoot}`,`--load-extension=${extensionRoot}`]});
  const checks = []; const pass = name => {checks.push(name); console.log(`PASS ${name}`);};
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      globalThis.testEngineRequests = [];
      globalThis.fetch = async (url, options) => {
        const request = JSON.parse(options.body); testEngineRequests.push(request);
        // Reproduce the real provider's rejection that exposed the regression.
        if (request.fen.split(' ')[3] === 'e3') return new Response(JSON.stringify({type:'error',error:'INVALID_FEN_VALIDATION_ERROR',text:'Cannot evaluate given position - wrong FEN.'}),{status:200});
        const black = request.fen.split(' ')[1] === 'b';
        return new Response(JSON.stringify(black ? {from:'e7',to:'e5',move:'e7e5',san:'e5',eval:.3,depth:14,continuationArr:['e7e5','g1f3']} : {from:'e2',to:'e4',move:'e2e4',san:'e4',eval:.33,depth:14,continuationArr:['e2e4','e7e5','g1f3']}),{status:200});
      };
      await chrome.storage.local.set({enabled:true,elo:1800,showArrow:true,showPanel:true,autoplay:false,imperfectMoves:false});
    });
    const {Chess} = require('../lib/chess.js'); const game = new Chess(); const fen = game.fen();
    const pieces = game.board().map((rank,row)=>rank.map((piece,col)=>piece ? `<div class="piece ${piece.color}${piece.type} square-${col+1}${8-row}" style="left:${col*12.5}%;top:${row*12.5}%"></div>` : '').join('')).join('');
    const fixture = `<!doctype html><title>Offline Chess.com adapter fixture</title><style>body{margin:0;background:#181c16}wc-chess-board{position:absolute;left:100px;top:100px;width:512px;height:512px;background:#a5b390}.piece{position:absolute;width:12.5%;height:12.5%}</style><wc-chess-board data-fen="${fen}">${pieces}</wc-chess-board>`;
    const board = await context.newPage();
    await board.route('https://www.chess.com/analysis', route => route.fulfill({contentType:'text/html',body:fixture}));
    await board.goto('https://www.chess.com/analysis');
    await board.locator('#chesshelper-live-panel[data-stage="ready"]').waitFor();
    assert.equal(await board.locator('#chp-move').innerText(),'e4'); pass('MV3 content scripts inject and analyze through the real service worker');
    assert.equal(await board.locator('#chesshelper-arrow-overlay rect').count(),2); pass('packaged CSS and SVG overlay render in the isolated content world');
    const roles={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
    const roundPieces=game.board().map((rank,row)=>rank.map((piece,col)=>piece ? `<piece class="${piece.color==='w'?'white':'black'} ${roles[piece.type]}" data-square="${'abcdefgh'[col]}${8-row}" style="transform:translate(${(7-col)*64}px,${(7-row)*64}px)"></piece>` : '').join('')).join('');
    const roundFixture=`<!doctype html><title>Captured Lichess round markup regression</title><style>body{margin:0;background:#181c16}.cg-wrap{position:absolute;left:100px;top:100px;width:512px;height:512px}cg-board{display:block;position:relative;width:512px;height:512px;background:#a5b390}piece,square{position:absolute;left:0;top:0;width:64px;height:64px}</style><div class="round__app"><div class="round__app__board main-board"><div class="cg-wrap orientation-black manipulable"><cg-container><cg-board>${roundPieces}</cg-board></cg-container></div></div></div>`;
    const round=await context.newPage();
    await round.route('https://lichess.org/AbCd1234/black',route=>route.fulfill({contentType:'text/html',body:roundFixture}));
    await round.goto('https://lichess.org/AbCd1234/black');
    await round.waitForFunction(()=>document.getElementById('chp-eval')?.textContent.includes('White to move'));
    await round.evaluate(()=>{
      document.querySelector('piece[data-square="e2"]').style.transform='translate(192px,192px)';
      for(const y of [64,192]) {const square=document.createElement('square');square.className='last-move';square.style.transform=`translate(192px,${y}px)`;document.querySelector('cg-board').appendChild(square);}
    });
    await round.locator('#chesshelper-live-panel[data-stage="ready"]').waitFor();
    assert.equal(await round.locator('#chp-move').innerText(),'e5');
    pass('black-oriented Lichess live board survives the first e4 pawn push');
    const e4Request=await worker.evaluate(()=>testEngineRequests.find(request=>request.fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b')));
    assert.equal(e4Request.fen,'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    pass('actual service-worker request omits the provider-rejected en-passant target');
    await round.close();
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('#enabled').waitFor({state:'attached'});
    await popup.waitForFunction(() => document.getElementById('enabled').checked);
    assert.equal(await popup.title(),'Knightline · Chess Lab'); pass('extension popup opens under its actual extension origin');
    await popup.locator('.logo img').evaluate(image=>image.decode());
    assert.ok(await popup.locator('.logo img').evaluate(image=>image.naturalWidth>0)); pass('packaged Knightline icon loads');
    const boardTab = await worker.evaluate(async () => (await chrome.tabs.query({url:'https://www.chess.com/analysis'}))[0].id);
    await worker.evaluate(async id => {await chrome.tabs.update(id,{active:true});}, boardTab);
    const status = await popup.evaluate(() => chrome.runtime.sendMessage({type:'GET_RUNTIME_STATUS'}));
    assert.equal(status.status.mode,'Analysis'); assert.equal(status.status.site,'Chess.com'); pass('popup retrieves the active board status after opening');
    await worker.evaluate(() => chrome.storage.local.set({showArrow:false}));
    await board.waitForFunction(() => !document.querySelector('#chesshelper-arrow-overlay')); pass('real storage events update content presentation');
    await worker.evaluate(() => chrome.storage.local.set({enabled:false}));
    await board.waitForFunction(() => !document.querySelector('#chesshelper-live-panel')); pass('real disable switch cleans up the injected panel');
    fs.writeFileSync(path.join(root,'artifacts','extension-check.json'),JSON.stringify({passed:true,packaged:extensionRoot!==root,checks},null,2));
    console.log(`${checks.length} extension checks passed.`);
  } finally {await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
