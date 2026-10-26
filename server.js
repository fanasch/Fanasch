// เซิร์ฟเวอร์กลาง: เสิร์ฟหน้าเว็บ + ดึงคอมเมนต์ TikTok ให้หลายคนใช้พร้อมกัน
// รัน: npm install แล้ว node server.js   (เปิดที่ http://localhost:8080)
const http = require("http"), fs = require("fs"), path = require("path");
const { WebSocketServer } = require("ws");
const { WebcastPushConnection } = require("tiktok-live-connector");

const PORT = process.env.PORT || 8080;
const MAX_USERS = +process.env.MAX_USERS || 30; // จำกัดจำนวนชื่อไลฟ์พร้อมกัน กัน TikTok บล็อก IP
const pageFile = ["index.html", "Live_Chat_Overlay_Studio.html"].map(f => path.join(__dirname, f)).find(f => fs.existsSync(f));

const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.end("ok"); return; }
  if (!pageFile) { res.statusCode = 500; res.end("ไม่พบไฟล์หน้าเว็บ"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  fs.createReadStream(pageFile).pipe(res);
});

const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = {}; // username -> { conn, clients:Set, timer }

function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function bcast(u, o) { const r = rooms[u]; if (r) r.clients.forEach(c => send(c, o)); }
const status = (u, text) => bcast(u, { event: "status", data: { text } });

function openRoom(u) {
  const room = { conn: new WebcastPushConnection(u), clients: new Set(), timer: null };
  rooms[u] = room;
  const c = room.conn;
  c.connect()
    .then(() => status(u, "เชื่อมต่อ @" + u + " แล้ว รอคอมเมนต์..."))
    .catch(e => status(u, "เชื่อม @" + u + " ไม่ได้: " + e.message + " (ต้องกำลังไลฟ์อยู่)"));
  c.on("chat", d => bcast(u, { event: "chat", data: { nickname: d.nickname || d.uniqueId, comment: d.comment } }));
  c.on("gift", d => {
    if (d.giftType === 1 && !d.repeatEnd) return;
    bcast(u, { event: "gift", data: { nickname: d.nickname || d.uniqueId, giftName: d.giftName, repeatCount: d.repeatCount, diamondCount: d.diamondCount } });
  });
  c.on("disconnected", () => status(u, "หลุดจากไลฟ์ของ @" + u));
  return room;
}
function closeRoom(u) {
  const r = rooms[u]; if (!r) return;
  try { r.conn.disconnect(); } catch (e) {}
  delete rooms[u];
}

wss.on("connection", (ws, req) => {
  const u = (new URL(req.url, "http://x").searchParams.get("u") || "").replace(/^@/, "");
  ws.isAlive = true; ws.on("pong", () => ws.isAlive = true);
  if (!/^[\w.]{1,40}$/.test(u)) { send(ws, { event: "status", data: { text: "username ไม่ถูกต้อง" } }); return ws.close(); }
  if (!rooms[u] && Object.keys(rooms).length >= MAX_USERS) { send(ws, { event: "status", data: { text: "เซิร์ฟเวอร์เต็มชั่วคราว ลองใหม่ภายหลัง" } }); return ws.close(); }
  const room = rooms[u] || openRoom(u);
  clearTimeout(room.timer);
  room.clients.add(ws);
  send(ws, { event: "status", data: { text: "กำลังเชื่อม @" + u + " ..." } });
  ws.on("close", () => {
    room.clients.delete(ws);
    if (!room.clients.size) room.timer = setTimeout(() => { if (!room.clients.size) closeRoom(u); }, 30000);
  });
});

setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
server.listen(PORT, () => console.log("พร้อมแล้ว http://localhost:" + PORT));
