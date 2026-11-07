/* UCI parsing is independent of browser APIs and never trusts provider HTML. */
class UCIProtocol {
  static option(line) {
    const match = line.match(/^option name (.+?) type (\w+)(.*)$/);
    if (!match) return null;
    const out = { name: match[1], type: match[2] };
    for (const key of ["min", "max"]) {
      const value = match[3].match(new RegExp(`\\b${key} (-?\\d+)`));
      if (value) out[key] = Number(value[1]);
    }
    return out;
  }
  static info(line, turn = "w") {
    if (!line.startsWith("info ")) return null;
    const score = line.match(/\bscore (cp|mate) (-?\d+)/),
      pv = line.match(/\bpv (.+)$/),
      depth = line.match(/\bdepth (\d+)/),
      rank = line.match(/\bmultipv (\d+)/);
    if (!score || !pv || !depth) return null;
    const moves = pv[1]
      .trim()
      .split(/\s+/)
      .filter((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move));
    if (!moves.length) return null;
    const sign = turn === "b" ? -1 : 1,
      value = Number(score[2]) * sign,
      type = score[1] === "mate" ? "mate" : "cp";
    const candidate = normalizeCandidate({
      uci: moves[0],
      turn,
      depth: Number(depth[1]),
      continuationArr: moves,
      score:
        type === "cp" ? value : Math.sign(value) * (100000 - Math.abs(value)),
      ...(type === "mate" ? { mate: value } : { eval: value / 100 }),
      evaluation: { type, value, perspective: "white" },
    });
    return candidate
      ? {
          rank: Number(rank?.[1] || 1),
          candidate,
          bound: /\b(?:lowerbound|upperbound)\b/.test(line),
        }
      : null;
  }
}
globalThis.UCIProtocol = UCIProtocol;
