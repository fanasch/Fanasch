// server.js - ตัวกลางดึงแชท TikTok Live ส่งให้หน้า index.html
// วิธีใช้:
//   npm install ws tiktok-live-connector youtube-chat
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
let LiveChat = null;
try { LiveChat = require("youtube-chat").LiveChat; } catch (e) {} // ใช้ดึงแชท YouTube โดยไม่ต้องมี API Key

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

  // ---- YouTube (ไม่ต้องใช้ API Key): ?y=<videoId> ----
  const yid = (new URL(req.url, "http://x").searchParams.get("y") || "").trim();
  if (yid) {
    if (!LiveChat) { status("ยังไม่ได้ติดตั้ง youtube-chat: รัน npm install youtube-chat แล้วเปิด server.js ใหม่"); return; }
    const lc = new LiveChat({ liveId: yid });
    status("กำลังเชื่อมต่อ YouTube " + yid + " ...");
    lc.on("start", () => status("เชื่อมต่อ YouTube สำเร็จ รอคอมเมนต์..."));
    lc.on("error", (e) => status("YouTube error: " + (e && e.message ? e.message : e)));
    lc.on("end", () => status("ไลฟ์จบแล้ว"));
    lc.on("chat", (c) => {
      const text = (c.message || []).map((m) => m.text || m.emojiText || "").join("");
      const role = c.isOwner || c.isModerator ? "mod" : c.isMembership ? "sub" : "";
      const base = { platform: "yt", nickname: (c.author && c.author.name) || "user", role };
      if (c.superchat) {
        const sc = c.superchat;
        send("gift", { ...base, comment: text || "Super Chat", label: "💬 Super Chat", amountText: String(sc.amountString || sc.amount || "") });
      } else if (text) {
        send("chat", { ...base, comment: text });
      }
    });
    lc.start().then((ok) => { if (ok === false) status("ต่อไม่ได้ ตรวจสอบว่าไลฟ์กำลังออกอากาศและเปิดแชทอยู่"); });
    ws.on("close", () => { try { lc.stop(); } catch (e) {} });
    return;
  }

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
