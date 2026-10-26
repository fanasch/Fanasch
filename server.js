// รัน: npm i tiktok-live-connector ws   แล้ว   node server.js
const { WebSocketServer } = require("ws");
const { WebcastPushConnection } = require("tiktok-live-connector");
const wss = new WebSocketServer({ port: 8080 });
const conns = {};
function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function bcast(u, o) { wss.clients.forEach(c => { if (c.u === u) send(c, o); }); }
function start(u) {
  if (conns[u]) return;
  const c = new WebcastPushConnection(u);
  conns[u] = c;
  c.connect()
    .then(() => bcast(u, { event: "status", data: { text: "เชื่อมต่อ @" + u + " แล้ว" } }))
    .catch(e => { delete conns[u]; bcast(u, { event: "status", data: { text: "เชื่อม @" + u + " ไม่ได้: " + e.message + " (ต้องกำลังไลฟ์อยู่)" } }); });
  c.on("chat", d => bcast(u, { event: "chat", data: { nickname: d.nickname || d.uniqueId, comment: d.comment } }));
  c.on("gift", d => {
    if (d.giftType === 1 && !d.repeatEnd) return;
    bcast(u, { event: "gift", data: { nickname: d.nickname || d.uniqueId, giftName: d.giftName, repeatCount: d.repeatCount, diamondCount: d.diamondCount } });
  });
  c.on("disconnected", () => { delete conns[u]; bcast(u, { event: "status", data: { text: "หลุดจากไลฟ์" } }); });
}
wss.on("connection", (ws, req) => {
  const u = (new URL(req.url, "http://x").searchParams.get("u") || "").replace(/^@/, "");
  ws.u = u;
  if (!u) return send(ws, { event: "status", data: { text: "ไม่ได้ใส่ username" } });
  send(ws, { event: "status", data: { text: "กำลังเชื่อม @" + u + " ..." } });
  start(u);
});
console.log("พร้อมแล้ว ws://localhost:8080/");
