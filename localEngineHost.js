/* A single replaceable Worker, hosted only by the extension's offscreen page. */
class LocalEngineHost {
  constructor() {
    this.worker = null;
    this.boot = null;
    this.active = null;
    this.pending = null;
    this.options = {};
    this.waiters = [];
    this.pumping = false;
    this.serial = 0;
    this.idleTimer = null;
    this.lastGame = null;
    this.trace = [];
  }
  remember(direction, text) {
    this.trace.push({ direction, text: text.slice(0, 500) });
    if (this.trace.length > 80) this.trace.shift();
  }
  send(command) {
    this.remember("command", command);
    this.worker?.postMessage(command);
  }
  wait(predicate, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          reject(
            new KnightlineError("engine", "Local engine did not become ready."),
          );
        }, timeout),
      };
      this.waiters.push(waiter);
    });
  }
  async ensure() {
    if (this.boot) return this.boot;
    if (this.worker) return;
    this.boot = (async () => {
      const worker = new Worker(
        chrome.runtime.getURL("vendor/stockfish/stockfish-19-lite-single.js"),
      );
      this.worker = worker;
      worker.onmessage = (event) => {
        if (this.worker === worker) this.line(String(event.data));
      };
      worker.onerror = (event) => {
        if (this.worker !== worker) return;
        this.fail(
          new KnightlineError(
            "engine",
            `Local engine stopped: ${event.message || "worker error"}`,
          ),
        );
      };
      const uci = this.wait((line) => line === "uciok");
      this.send("uci");
      await uci;
      this.send("setoption name Threads value 1");
      this.send("setoption name Hash value 32");
      this.send("setoption name Ponder value false");
      const ready = this.wait((line) => line === "readyok");
      this.send("isready");
      await ready;
    })()
      .catch((error) => {
        this.destroy(error);
        throw error;
      })
      .finally(() => {
        this.boot = null;
      });
    return this.boot;
  }
  line(line) {
    this.remember("response", line);
    const option = UCIProtocol.option(line);
    if (option) this.options[option.name] = option;
    for (const waiter of [...this.waiters])
      if (waiter.predicate(line)) {
        clearTimeout(waiter.timer);
        this.waiters = this.waiters.filter((w) => w !== waiter);
        waiter.resolve(line);
      }
    const job = this.active;
    if (!job) return;
    const parsed = UCIProtocol.info(line, job.request.fen.split(" ")[1]);
    if (parsed)
      job.reachedDepth = Math.max(
        job.reachedDepth || 0,
        parsed.candidate.depth,
      );
    if (parsed && !parsed.bound) {
      job.lines.set(parsed.rank, parsed.candidate);
      job.byMove.set(
        parsed.candidate.from +
          parsed.candidate.to +
          (parsed.candidate.promotion || ""),
        parsed.candidate,
      );
      const now = Date.now();
      if (!job.cancelled && now - job.lastProgress > 120) {
        job.lastProgress = now;
        chrome.runtime
          .sendMessage({
            type: "ENGINE_PROGRESS",
            target: "broker",
            id: job.request.id,
            data: this.result(job),
          })
          .catch(() => {});
      }
    }
    if (line.startsWith("bestmove ")) {
      clearTimeout(job.timer);
      clearTimeout(job.stopTimer);
      this.active = null;
      if (!job.cancelled) {
        const best = line.split(/\s+/)[1];
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best))
          job.reject(
            new KnightlineError("position", "No legal move is available."),
          );
        else job.resolve(this.result(job, best));
      }
      this.pump();
    }
  }
  result(job, best = null) {
    let candidates = [...job.lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, candidate]) => candidate);
    if (best) {
      const chosen =
        candidates.find((c) => c.from + c.to + (c.promotion || "") === best) ||
        job.byMove.get(best) ||
        normalizeCandidate({ uci: best, turn: job.request.fen.split(" ")[1] });
      candidates = [
        chosen,
        ...candidates.filter(
          (c) => c !== chosen && c.from + c.to + (c.promotion || "") !== best,
        ),
      ].slice(0, job.request.multiPV || 3);
    }
    return {
      ...candidates[0],
      depth: candidates[0]?.depth ?? job.reachedDepth ?? 0,
      evaluation: candidates[0]?.evaluation || null,
      candidates,
      engine: "Stockfish 19.0.1 lite",
      source: "local",
      id: job.request.id,
      positionKey: job.request.positionKey,
      fen: job.request.fen,
      complete: Boolean(best),
      capabilities: this.options,
    };
  }
  analyze(request) {
    clearTimeout(this.idleTimer);
    return new Promise((resolve, reject) => {
      if (this.pending)
        this.pending.reject(
          new KnightlineError("cancelled", "Superseded by a newer position."),
        );
      this.pending = { request, resolve, reject };
      if (this.active) this.cancel(this.active.request.id);
      this.pump();
    });
  }
  cancel(id) {
    if (this.pending?.request.id === id) {
      this.pending.reject(
        new KnightlineError("cancelled", "Analysis cancelled."),
      );
      this.pending = null;
    }
    if (this.active?.request.id === id && !this.active.cancelled) {
      const job = this.active;
      job.cancelled = true;
      job.reject(new KnightlineError("cancelled", "Analysis cancelled."));
      this.send("stop");
      job.stopTimer = setTimeout(() => {
        if (this.active === job) {
          this.destroy(
            new KnightlineError("engine", "Local engine did not stop."),
          );
          this.pump();
        }
      }, 700);
    }
  }
  async pump() {
    if (this.pumping || this.active) return;
    if (!this.pending) {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.destroy(), 60000);
      return;
    }
    this.pumping = true;
    try {
      await this.ensure();
      if (!this.pending) return;
      const job = this.pending;
      this.pending = null;
      this.active = {
        ...job,
        lines: new Map(),
        byMove: new Map(),
        cancelled: false,
        lastProgress: 0,
      };
      const request = job.request,
        settings = request.settings || {};
      if (this.lastGame !== request.gameId) {
        this.send("ucinewgame");
        this.lastGame = request.gameId;
      }
      this.send(`setoption name MultiPV value ${request.multiPV || 3}`);
      this.send(
        `setoption name UCI_LimitStrength value ${settings.strengthMode === "elo" ? "true" : "false"}`,
      );
      if (settings.strengthMode === "elo" && this.options.UCI_Elo) {
        const cap = this.options.UCI_Elo;
        this.send(
          `setoption name UCI_Elo value ${Math.max(cap.min, Math.min(cap.max, settings.strengthElo))}`,
        );
      }
      this.send(
        `setoption name Skill Level value ${settings.strengthMode === "skill" ? settings.skillLevel : 20}`,
      );
      this.send(`position fen ${request.fen}`);
      this.active.timer = setTimeout(
        () =>
          this.fail(
            new KnightlineError(
              "engine",
              "Local analysis exceeded its time budget.",
            ),
          ),
        Math.max(5000, request.timeMs + 3000),
      );
      this.send(
        `go movetime ${request.timeMs}${request.depth ? ` depth ${request.depth}` : ""}`,
      );
    } catch (error) {
      if (this.pending) {
        this.pending.reject(error);
        this.pending = null;
      }
    } finally {
      this.pumping = false;
      if (!this.active && !this.pending) {
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => this.destroy(), 60000);
      } else if (!this.active && this.pending) {
        Promise.resolve().then(() => this.pump());
      }
    }
  }
  destroy(error = new KnightlineError("cancelled", "Engine reset.")) {
    clearTimeout(this.idleTimer);
    if (this.active) {
      clearTimeout(this.active.timer);
      clearTimeout(this.active.stopTimer);
      if (!this.active.cancelled) this.active.reject(error);
    }
    this.active = null;
    this.worker?.terminate();
    this.worker = null;
    this.lastGame = null;
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters = [];
  }
  fail(error) {
    this.destroy(error);
    this.pump();
  }
}
globalThis.LocalEngineHost = LocalEngineHost;
