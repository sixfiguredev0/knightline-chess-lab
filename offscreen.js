const host = new LocalEngineHost();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.target !== "offscreen" || sender.id !== chrome.runtime.id)
    return;
  if (message.type === "ENGINE_CANCEL") {
    host.cancel(message.id);
    reply({ ok: true });
    return;
  }
  if (message.type === "ENGINE_RESET") {
    if (host.pending) host.cancel(host.pending.request.id);
    host.destroy();
    reply({ ok: true });
    return;
  }
  if (message.type === "ENGINE_HOST_STATUS") {
    reply({
      ok: true,
      workerRunning: Boolean(host.worker),
      active: Boolean(host.active),
      capabilities: host.options,
      trace: host.trace,
    });
    return;
  }
  if (message.type !== "ENGINE_ANALYZE") return;
  host
    .analyze(message.request)
    .then((data) => reply({ ok: true, data }))
    .catch((error) =>
      reply({ ok: false, error: KnightlineContracts.error(error) }),
    );
  return true;
});
