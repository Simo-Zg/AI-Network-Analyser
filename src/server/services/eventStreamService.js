const clients = new Set();

function send(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function registerClient(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  send(res, "connected", { ok: true, timestamp: new Date().toISOString() });
  clients.add(res);

  req.on("close", () => {
    clients.delete(res);
  });
}

function broadcast(event, data) {
  for (const client of clients) {
    send(client, event, data);
  }
}

module.exports = {
  registerClient,
  broadcast
};
