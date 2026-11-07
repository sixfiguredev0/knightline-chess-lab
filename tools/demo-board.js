const demoGame = new Chess();
const demoBoard = document.getElementById('demo-board');
const demoOpening = ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5','Bb3','d6','c3','O-O'];
let demoSelected = null, demoFlipped = false;
const glyph = {p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'};
function renderDemoBoard() {
  demoBoard.replaceChildren(); demoBoard.classList.toggle('flipped', demoFlipped);
  demoBoard.dataset.fen = demoGame.fen(); demoBoard.dataset.turn = demoGame.turn();
  demoGame.board().forEach((rank, row) => rank.forEach((piece, col) => {
    if (!piece) return;
    const square = 'abcdefgh'[col] + (8-row), element = document.createElement('div');
    element.className = `piece ${piece.color}${piece.type} square-${col+1}${8-row} ${piece.color === 'w' ? 'white-piece' : 'black-piece'}${square === demoSelected ? ' selected' : ''}`;
    element.style.left = `${(demoFlipped ? 7-col : col)*12.5}%`; element.style.top = `${(demoFlipped ? 7-row : row)*12.5}%`;
    element.textContent = glyph[piece.type]; element.setAttribute('aria-label', `${piece.color === 'w' ? 'White' : 'Black'} ${piece.type} on ${square}`); demoBoard.appendChild(element);
  }));
}
function resetDemo() { demoFlipped = false; demoGame.reset(); demoOpening.forEach(move => demoGame.move(move)); demoSelected = null; renderDemoBoard(); }
demoBoard.addEventListener('click', event => {
  const rect = demoBoard.getBoundingClientRect();
  const col = Math.floor((event.clientX-rect.left)/rect.width*8), row = Math.floor((event.clientY-rect.top)/rect.height*8);
  const square = 'abcdefgh'[demoFlipped ? 7-col : col] + (demoFlipped ? row+1 : 8-row);
  if (demoSelected) { const moved = demoGame.move({from:demoSelected,to:square,promotion:'q'}); demoSelected = moved ? null : square; }
  else demoSelected = square;
  renderDemoBoard();
});
document.getElementById('demo-flip').onclick = () => { demoFlipped = !demoFlipped; renderDemoBoard(); };
document.getElementById('demo-reset').onclick = async () => { globalThis.demoFail = false; await chrome.storage.local.set({imperfectMoves:false}); resetDemo(); };
document.getElementById('demo-variation').onclick = async () => { globalThis.demoFail = false; await chrome.storage.local.set({imperfectMoves:true,minWeakInterval:1,maxWeakInterval:1}); resetDemo();demoGame.move('d4');renderDemoBoard(); };
document.getElementById('demo-error').onclick = async () => { globalThis.demoFail = true; await chrome.storage.local.set({elo:(await chrome.storage.local.get({})).elo === 1800 ? 1700 : 1800}); };
resetDemo();
const demoPanelObserver = new MutationObserver(() => {
  const panel = document.getElementById('chesshelper-live-panel'), slot = document.getElementById('demo-coach-slot');
  if (panel && slot && panel.parentElement !== slot) slot.appendChild(panel);
});
demoPanelObserver.observe(document.documentElement, {childList:true});

