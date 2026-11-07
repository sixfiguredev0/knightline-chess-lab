/* Offline classroom fixture only. This file is never loaded by the extension. */
(() => {
  const defaults = {enabled: true, elo: 1800, showArrow: true, showPanel: true, turnOverride: 'auto', autoplay: false, minDelay: 300, maxDelay: 4000, imperfectMoves: false, minWeakInterval: 1, maxWeakInterval: 1};
  const listeners = [];
  const read = () => { try { return {...defaults, ...JSON.parse(localStorage.getItem('chess-lab-demo') || '{}')}; } catch { return {...defaults}; } };
  const notify = (before, next) => {
    const changes = {};
    for (const key of Object.keys(next)) if (before[key] !== next[key]) changes[key] = {oldValue: before[key], newValue: next[key]};
    if (Object.keys(changes).length) listeners.forEach(listener => listener(changes, 'local'));
  };
  addEventListener('storage', event => { if (event.key === 'chess-lab-demo') notify({...defaults, ...JSON.parse(event.oldValue || '{}')}, read()); });
  const messages = [];
  globalThis.chrome = {
    storage: {local: {get: async fallback => ({...fallback, ...read()}), set: async patch => { const before = read(), next = {...before, ...patch}; localStorage.setItem('chess-lab-demo', JSON.stringify(next)); notify(before, next); }}, onChanged: {addListener: listener => listeners.push(listener)}},
    runtime: {onMessage: {addListener: listener => messages.push(listener)}, sendMessage: async message => {
      if (message.type === 'GET_RUNTIME_STATUS') return {version: '4.8.1', status: {site: 'Offline demo', mode: 'Analysis', result: 'Recorded sample · no network needed'}};
      if (message.type !== 'ANALYZE_FEN') return {ok: true};
      if (globalThis.demoFail) return {ok: false, error: 'Demo connection error. Press Try analysis again.'};
      await new Promise(resolve => setTimeout(resolve, globalThis.demoDelay ?? 420));
      const game = new Chess(message.fen), legal = game.moves({verbose: true});
      const find = san => legal.find(move => move.san === san);
      const selected = message.depth === 2 ? find('h3') || legal[legal.length - 1] : find('d4') || find('e4') || legal[0];
      if (!selected) return {ok: false, error: 'Position complete'};
      const candidate = (move, score) => ({...move, move: move.from + move.to + (move.promotion || ''), eval: score, turn: game.turn(), depth: message.depth || 14});
      const best = candidate(selected, message.depth === 2 ? .12 : .42);
      const variation = new Chess(message.fen), line = []; variation.move(selected); line.push(best.move);
      for (let index = 0; index < 5; index++) {
        const next = variation.moves({verbose: true});
        const move = next.find(move => ['exd4', 'cxd4', 'Re8', 'Nc3', 'Bb7'].includes(move.san)) || next[0];
        if (!move) break; variation.move(move); line.push(move.from + move.to + (move.promotion || ''));
      }
      return {ok: true, data: {...best, continuationArr: line, candidates: [best, ...legal.filter(move => move.san !== selected.san).slice(0, 2).map(move => candidate(move, .18))]}};
    }}
  };
  globalThis.demoMessages = messages;
})();
