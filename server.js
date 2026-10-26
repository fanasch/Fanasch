// server.js - ตัวกลางดึงแชท TikTok Live ส่งให้หน้า index.html
// วิธีใช้:
//   npm install ws tiktok-live-connector
//   node server.js
// แล้วเปิด http://localhost:8080 (วาง index.html ไว้โฟลเดอร์เดียวกับไฟล์นี้)
// ช่อง "ที่อยู่เซิร์ฟเวอร์" ในหน้าเว็บเว้นว่างไว้ได้เลย

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const tl = require("tiktok-live-connector");

const PORT = process.env.PORT || 8080;
const Conn = tl.TikTokLiveConnection || tl.WebcastPushConnection; // รองรับทั้ง v1 และ v2

const server = http.createServer((req, res) => {
  const f = path.join(__dirname, "index.html");
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end("ไม่พบ index.html ในโฟลเดอร์เดียวกับ server.js"); return; }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const user = (new URL(req.url, "http://x").searchParams.get("u") || "").replace(/^@/, "").trim();
  const send = (event, data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ event, data })); };
  const status = (text) => { console.log("[status]", text); send("status", { text }); };

  if (!user) { status("ไม่มี TikTok Username"); return; }

  const conn = new Conn(user);
  status("กำลังเชื่อมต่อ @" + user + " ...");

  conn.connect()
    .then(() => status("เชื่อมต่อ @" + user + " สำเร็จ รอคอมเมนต์..."))
    .catch((e) => status("ต่อไม่ได้: " + (e && e.message ? e.message : e) + " (ต้องกำลังไลฟ์อยู่)"));

  conn.on("chat", (d) => {
    send("chat", {
      nickname: d.nickname || (d.user && d.user.nickname) || d.uniqueId || (d.user && d.user.uniqueId) || "user",
      comment: d.comment,
    });
  });

  conn.on("gift", (d) => {
    if (d.giftType === 1 && !d.repeatEnd) return; // ของขวัญต่อเนื่อง: ส่งตอนจบชุดเท่านั้น
    const g = d.giftDetails || {};
    send("gift", {
      nickname: d.nickname || (d.user && d.user.nickname) || d.uniqueId || "user",
      giftName: d.giftName || g.giftName || "Gift",
      repeatCount: d.repeatCount || 1,
      diamondCount: d.diamondCount || g.diamondCount || 0,
    });
  });

  conn.on("disconnected", () => status("ไลฟ์ตัดการเชื่อมต่อ"));
  conn.on("streamEnd", () => status("ไลฟ์จบแล้ว"));

  ws.on("close", () => { try { conn.disconnect(); } catch (e) {} });
});

server.listen(PORT, () => console.log("พร้อมแล้ว: เปิด http://localhost:" + PORT));
