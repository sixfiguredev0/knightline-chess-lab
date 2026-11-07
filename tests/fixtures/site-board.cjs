const fs = require("node:fs"),
  path = require("node:path");
const chess = fs.readFileSync(
  path.join(__dirname, "../../lib/chess.js"),
  "utf8",
);
function siteBoard({
  site = "lichess",
  fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  orientation = "white",
  includeFen = true,
  mini = true,
  readOnly = false,
  second = false,
} = {}) {
  const tag = site === "lichess" ? "cg-board" : "wc-chess-board";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Controlled ${site} board fixture</title><style>body{background:#161d12;margin:0;color:#e5f2d7;font:14px sans-serif}.wrap{position:absolute;left:180px;top:100px;width:512px;height:512px}.second{left:750px}.mini-game{position:absolute;left:10px;top:10px;width:128px;height:128px}cg-board,wc-chess-board{position:relative;display:block;width:100%;height:100%;background:repeating-conic-gradient(#b6c39c 0% 25%,#60744d 0% 50%) 0 0/25% 25%}piece,.piece,square{position:absolute;left:0;top:0;width:12.5%;height:12.5%;display:grid;place-items:center;font-size:40px;user-select:none}.white{color:white}.black{color:#111}.selected{background:#f7f47766}#promotion-choice{position:absolute;left:700px;top:120px;width:80px;height:320px;background:#ddd;z-index:10}#promotion-choice square{position:relative;width:80px;height:80px;cursor:pointer}#promotion-choice piece{width:80px;height:80px}.toolbar{position:absolute;top:650px;left:180px}</style></head><body>${mini ? `<a class="mini-game"><${tag} id="mini-board"></${tag}></a>` : ""}<div class="round__app board-layout-main"><div class="main-board wrap cg-wrap orientation-${orientation}"><${tag} id="fixture-board"${readOnly ? ' data-readonly="true"' : ""}></${tag}></div><div class="rmoves"><div id="fixture-history"></div></div></div>${second ? `<div class="main-board wrap second cg-wrap orientation-${orientation}"><${tag} id="second-board"></${tag}></div>` : ""}<div class="toolbar">Controlled fixture. No account or external game.</div><script>${chess}\n</script><script>
 const fixtureGame=new Chess(${JSON.stringify(fen)});let fixtureOrientation=${JSON.stringify(orientation)},fixtureSelected=null,fixturePending=null,fixtureInputEvents=0,fixtureDrag=null;const fixtureSite=${JSON.stringify(site)},fixtureReadOnly=${readOnly};const fixtureBoard=document.getElementById('fixture-board');const role={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'},glyph={p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'};
 function fixtureRender(){document.querySelector('.wrap').classList.toggle('orientation-black',fixtureOrientation==='black');document.querySelector('.wrap').classList.toggle('orientation-white',fixtureOrientation==='white');fixtureBoard.replaceChildren();${includeFen ? "fixtureBoard.dataset.fen=fixtureGame.fen();fixtureBoard.dataset.turn=fixtureGame.turn();" : ""}
 const map={};fixtureGame.board().forEach((rank,row)=>rank.forEach((p,col)=>{if(p)map['abcdefgh'[col]+(8-row)]=p;}));if(fixturePending){const p=map[fixturePending.from];delete map[fixturePending.from];map[fixturePending.to]=p;}
 for(const [square,piece]of Object.entries(map)){const col='abcdefgh'.indexOf(square[0]),row=8-Number(square[1]),el=document.createElement(fixtureSite==='lichess'?'piece':'div');el.className=fixtureSite==='lichess'?(piece.color==='w'?'white':'black')+' '+role[piece.type]:'piece '+piece.color+piece.type+' square-'+(col+1)+(8-row);el.dataset.square=square;el.textContent=glyph[piece.type];if(square===fixtureSelected)el.classList.add('selected');const x=(fixtureOrientation==='black'?7-col:col)*64,y=(fixtureOrientation==='black'?7-row:row)*64;el.style.transform='translate('+x+'px,'+y+'px)';fixtureBoard.appendChild(el);}
 const history=document.getElementById('fixture-history');history.replaceChildren();fixtureGame.history().forEach(san=>{const el=document.createElement(fixtureSite==='lichess'?'z7yx':'span');el.className=fixtureSite==='lichess'?'':'move-text-component';el.textContent=san;history.appendChild(el);});
 const mini=document.getElementById('mini-board');if(mini&&!mini.children.length){for(const el of fixtureBoard.children){const copy=el.cloneNode(true);copy.style.transform='';mini.appendChild(copy);}}
 const second=document.getElementById('second-board');if(second&&!second.children.length)for(const el of fixtureBoard.children)second.appendChild(el.cloneNode(true));
 document.getElementById('promotion-choice')?.remove();if(fixturePending){const picker=document.createElement('div');picker.id='promotion-choice';for(const type of ['q','n','r','b']){const square=document.createElement('square'),el=document.createElement('piece');el.className=fixtureSite==='chesscom'?'promotion-piece '+fixtureGame.turn()+type:(fixtureGame.turn()==='w'?'white':'black')+' '+role[type];el.textContent=glyph[type];square.appendChild(el);square.addEventListener('click',()=>{fixtureGame.move({...fixturePending,promotion:type});fixturePending=null;fixtureRender();});picker.appendChild(square);}document.body.appendChild(picker);}
 }
 function fixtureSquare(event){const rect=fixtureBoard.getBoundingClientRect(),col=Math.floor((event.clientX-rect.left)/64),row=Math.floor((event.clientY-rect.top)/64);return 'abcdefgh'[fixtureOrientation==='black'?7-col:col]+(fixtureOrientation==='black'?row+1:8-row);}
 function fixtureTry(from,to){if(fixtureReadOnly)return;const piece=fixtureGame.get(from);if(piece?.type==='p'&&((piece.color==='w'&&to[1]==='8')||(piece.color==='b'&&to[1]==='1'))){const legal=fixtureGame.moves({verbose:true}).some(m=>m.from===from&&m.to===to);if(legal){fixturePending={from,to};fixtureSelected=null;fixtureRender();return;}}
 const result=fixtureGame.move({from,to,promotion:'q'});fixtureSelected=result?null:to;fixtureRender();}
 fixtureBoard.addEventListener('click',event=>{fixtureInputEvents++;if(fixtureReadOnly)return;const square=fixtureSquare(event);if(fixtureSelected)fixtureTry(fixtureSelected,square);else{fixtureSelected=square;fixtureRender();}});
 fixtureBoard.addEventListener('mousedown',event=>{fixtureInputEvents++;fixtureDrag={from:fixtureSquare(event),x:event.clientX,y:event.clientY,moved:false};});document.addEventListener('mousemove',event=>{if(fixtureDrag&&Math.hypot(event.clientX-fixtureDrag.x,event.clientY-fixtureDrag.y)>10)fixtureDrag.moved=true;});document.addEventListener('mouseup',event=>{if(!fixtureDrag)return;const drag=fixtureDrag;fixtureDrag=null;if(drag.moved)fixtureTry(drag.from,fixtureSquare(event));});
 function fixtureMove(move){const result=fixtureGame.move(move);if(!result)throw new Error('Illegal fixture move');fixtureSelected=null;fixtureRender();return result.san;}
 function fixtureSetFen(fen){if(!fixtureGame.load(fen))throw new Error('Invalid fixture FEN');fixturePending=null;fixtureSelected=null;fixtureRender();}
 function fixtureFlip(){fixtureOrientation=fixtureOrientation==='white'?'black':'white';fixtureRender();}
 function fixtureReset(){fixtureGame.reset();fixtureSelected=null;fixturePending=null;fixtureRender();}
 fixtureRender();
 </script></body></html>`;
}
module.exports = { siteBoard };
