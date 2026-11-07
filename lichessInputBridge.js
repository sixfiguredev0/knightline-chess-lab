/* Lichess input compatibility, installed before Chessground binds its handler.
 * Only extension-requested cg-board mousedown delivery uses the compatibility
 * view. Normal events, Event.isTrusted, and every other listener stay unchanged.
 * This MAIN-world file has no extension APIs, account access, or network calls.
 */
(() => {
  const add = EventTarget.prototype.addEventListener,
    remove = EventTarget.prototype.removeEventListener;
  const records = new WeakMap(),
    requested = new WeakSet();
  const capture = (options) =>
    typeof options === "boolean" ? options : Boolean(options?.capture);
  function record(target, type, listener, options) {
    if (
      type !== "mousedown" ||
      target.tagName !== "CG-BOARD" ||
      !listener ||
      !["object", "function"].includes(typeof listener)
    )
      return null;
    let listeners = records.get(target);
    if (!listeners) {
      listeners = new WeakMap();
      records.set(target, listeners);
    }
    let entries = listeners.get(listener);
    if (!entries) {
      entries = new Map();
      listeners.set(listener, entries);
    }
    const key = type + ":" + capture(options);
    if (!entries.has(key))
      entries.set(key, function (event) {
        const delivered = requested.has(event)
          ? new Proxy(event, {
              get(original, property) {
                if (property === "isTrusted") return true;
                const value = Reflect.get(original, property, original);
                return typeof value === "function"
                  ? value.bind(original)
                  : value;
              },
            })
          : event;
        return typeof listener === "function"
          ? listener.call(this, delivered)
          : listener.handleEvent(delivered);
      });
    return entries.get(key);
  }
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    return add.call(
      this,
      type,
      record(this, type, listener, options) || listener,
      options,
    );
  };
  EventTarget.prototype.removeEventListener = function (
    type,
    listener,
    options,
  ) {
    const wrapped = records
      .get(this)
      ?.get(listener)
      ?.get(type + ":" + capture(options));
    return remove.call(this, type, wrapped || listener, options);
  };
  add.call(
    document,
    "knightline:board-input",
    (event) => {
      const board = event.target;
      if (
        board?.tagName !== "CG-BOARD" ||
        !board.isConnected ||
        typeof event.detail !== "string" ||
        event.detail.length > 512
      )
        return;
      let request;
      try {
        request = JSON.parse(event.detail);
      } catch {
        return;
      }
      if (
        request.version !== 1 ||
        request.type !== "mousedown" ||
        !Number.isFinite(request.x) ||
        !Number.isFinite(request.y)
      )
        return;
      const rect = board.getBoundingClientRect();
      if (
        !rect.width ||
        request.x < rect.left ||
        request.x > rect.right ||
        request.y < rect.top ||
        request.y > rect.bottom
      )
        return;
      const target = document.elementFromPoint(request.x, request.y);
      if (!(target === board || board.contains(target))) return;
      const input = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: request.x,
        clientY: request.y,
        button: 0,
        buttons: 1,
      });
      requested.add(input);
      target.dispatchEvent(input);
      requested.delete(input);
      event.preventDefault();
    },
    true,
  );
})();
