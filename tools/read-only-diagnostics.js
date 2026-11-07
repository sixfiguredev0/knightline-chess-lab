/* Run in DevTools' Knightline extension execution context. Reads only. */
(async()=>{
  const report={schema:1,extensionVersion:typeof chrome!=='undefined'&&chrome.runtime?.getManifest?chrome.runtime.getManifest().version:'Page context: choose Knightline in the Console context selector',site:location.hostname.includes('lichess')?'Lichess':'Chess.com'};
  if(globalThis.KnightlineDiagnostics?.snapshot)Object.assign(report,globalThis.KnightlineDiagnostics.snapshot());
  else{
    const app=globalThis.ChessHelperApp;
    report.controller={state:app?.autoMoveController?.state||null,reconstructedFen:app?.autoMoveController?.currentFen||null};
    if(globalThis.BoardReader){const boards=BoardReader.candidates?BoardReader.candidates().map(({board,id,width,height,main})=>({id,width,height,main,pieceCount:board.querySelectorAll('piece,.piece').length})):[];const board=BoardReader.board(),parsed=board&&BoardReader.read(board);report.boards=boards;report.orientation=parsed?.orientation;report.pieces=parsed?.pieces;if(parsed){const hint=BoardReader.hint(board,parsed.pieces,parsed.orientation);report.turnHint=hint.turn;report.sourceFen=hint.fen;}}
  }
  console.log(JSON.stringify(report,null,2));return report;
})();
