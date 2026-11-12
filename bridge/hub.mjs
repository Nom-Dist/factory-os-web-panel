import { randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { array, decode, encode } from "./codec.mjs";

const READS = new Set(["GET_AE2_STOCKS", "GET_CRAFTING_JOBS", "GET_STOCK_RULES", "GET_CRAFT_OPTIONS"]);
const WRITES = new Set(["START_CRAFT", "CANCEL_CRAFT", "ARCHIVE_CRAFT", "SET_STOCK_RULE"]);
const equal = (a, b) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, data, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }); res.end(JSON.stringify(data)); };
async function body(req, limit = 65536) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error("payload_limit"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export function createHub({ bridgeToken = "", panelToken = "", origin = "", now = Date.now, staleMs = 20000, commandMs = 20000 } = {}) {
  const clients = new Set(), pending = new Map(), attempts = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  let device = null, telemetry = null, lastSeen = 0, lastBroadcastOnline = false, closed = false;
  const configured = bridgeToken.length >= 32 && panelToken.length >= 32 && bridgeToken !== panelToken;
  const sign = (v) => createHmac("sha256", panelToken).update(v).digest("base64url");
  function authorized(req) {
    if (!configured) return false;
    const raw = /(?:^|;\s*)factoryos_session=([^;]+)/.exec(req.headers.cookie || "")?.[1];
    if (!raw) return false;
    const [expires, nonce, mac] = raw.split(".");
    return /^\d+$/.test(expires || "") && Number(expires) > now() && Number(expires) <= now() + 8 * 3600000 && equal(sign(`${expires}.${nonce}`), mac);
  }
  function sameOrigin(req) {
    try { return new URL(req.headers.origin).origin === (origin || `http://${req.headers.host}`); } catch { return false; }
  }
  function snapshot() {
    const online = !!telemetry && now() - lastSeen < staleMs;
    return { type: "snapshot", online, receivedAt: lastSeen || null, configured, controlAllowed: configured && online && telemetry?.controlEnabled === true,
      telemetry: online ? telemetry : null };
  }
  function send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 131072) { ws.close(1013, "slow viewer"); return; }
    ws.send(JSON.stringify(data));
  }
  function broadcast() { const data = snapshot(); lastBroadcastOnline = data.online; for (const ws of clients) send(ws, data); }
  function accept(raw) {
    const msg = decode(raw);
    if (!msg || typeof msg !== "object") throw new Error("invalid_message");
    if (msg.kind === "telemetry") {
      if (typeof msg.boot !== "string" || msg.boot.length > 64 || !msg.status || !msg.jobs || !msg.status.ae2 ||
        typeof msg.status.ae2.online !== "boolean" || !msg.status.power?.ae2 || typeof msg.controlEnabled !== "boolean" ||
        typeof msg.status.version !== "string" || typeof msg.rulesRevision !== "number" || typeof msg.paused !== "boolean") throw new Error("invalid_telemetry");
      if (telemetry && telemetry.boot !== msg.boot) {
        for (const [id, p] of pending) { p.resolve({ ok: false, error: p.sent ? "UNCERTAIN" : "DEVICE_RESTARTED" }); clearTimeout(p.timer); pending.delete(id); }
      }
      msg.rules = array(msg.rules); msg.jobs.cpus = array(msg.jobs.cpus); msg.jobs.trackedJobs = array(msg.jobs.trackedJobs);
      msg.status.clients = array(msg.status.clients);
      telemetry = msg; lastSeen = now(); broadcast();
    } else if (msg.kind === "reply" && typeof msg.id === "string") {
      const p = pending.get(msg.id);
      if (!p || !p.sent) return;
      clearTimeout(p.timer); pending.delete(msg.id);
      p.resolve({ ok: msg.ok === true, data: msg.data, error: msg.error || "" });
    } else throw new Error("unsupported_message");
  }
  function nextCommand() {
    // Never replay a sent command after disconnect. The UI must reconcile.
    for (const [id, p] of pending) if (!p.sent) { p.sent = true; return encode({ kind: "command", id, command: p.command, args: p.args }); }
    return encode({ kind: "idle" });
  }
  function flush() {
    if (!device || device.readyState !== WebSocket.OPEN || !telemetry) return;
    for (const [, p] of pending) if (!p.sent && device.bufferedAmount < 16384) device.send(nextCommand());
  }
  function command(command, args) {
    if (!READS.has(command) && !WRITES.has(command)) return Promise.resolve({ ok: false, error: "FORBIDDEN" });
    if (!snapshot().online) return Promise.resolve({ ok: false, error: "DEVICE_OFFLINE" });
    if (WRITES.has(command) && !snapshot().controlAllowed) return Promise.resolve({ ok: false, error: "WEB_CONTROL_DISABLED" });
    if (!args || typeof args !== "object" || Array.isArray(args) || Buffer.byteLength(JSON.stringify(args)) > 8192) return Promise.resolve({ ok: false, error: "INVALID_ARGUMENTS" });
    if (pending.size >= 8) return Promise.resolve({ ok: false, error: "BUSY" });
    const id = randomBytes(16).toString("hex");
    return new Promise((resolve) => {
      const p = { command, args, sent: false, resolve, timer: null };
      p.timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: WRITES.has(command) && p.sent ? "UNCERTAIN" : "TIMEOUT" }); }, commandMs);
      pending.set(id, p); flush();
    });
  }
  async function handle(req, res) {
    const path = new URL(req.url, "http://local").pathname;
    if (!path.startsWith("/bridge/")) return false;
    try {
      if (path === "/bridge/health") { json(res, 200, { configured, deviceOnline: snapshot().online, version: 1 }); return true; }
      if (path === "/bridge/session" && req.method === "POST") {
        if (!sameOrigin(req)) { json(res, 403, { error: "ORIGIN_DENIED" }); return true; }
        const ip = req.socket.remoteAddress || "unknown"; const previous = attempts.get(ip);
        const a = previous && now() - previous.at < 60000 ? previous : { at: now(), count: 0 };
        if (attempts.size >= 256) attempts.delete(attempts.keys().next().value);
        attempts.set(ip, a); a.count++;
        if (a.count > 8) { json(res, 429, { error: "RATE_LIMIT" }); return true; }
        const input = JSON.parse((await body(req, 1024)).toString());
        if (!configured || !equal(input.token, panelToken)) { json(res, 401, { error: "INVALID_ACCESS_KEY" }); return true; }
        const value = `${now() + 8 * 3600000}.${randomBytes(16).toString("hex")}`;
        json(res, 200, { ok: true }, { "Set-Cookie": `factoryos_session=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/bridge; Max-Age=28800${origin.startsWith("https:") ? "; Secure" : ""}` }); return true;
      }
      if (path === "/bridge/logout" && req.method === "POST") {
        if (!sameOrigin(req)) { json(res, 403, { error: "ORIGIN_DENIED" }); return true; }
        json(res, 200, { ok: true }, { "Set-Cookie": "factoryos_session=; HttpOnly; SameSite=Strict; Path=/bridge; Max-Age=0" }); return true;
      }
      if (path === "/bridge/ingest" && req.method === "POST") {
        if (!configured || !equal(req.headers.authorization, `Bearer ${bridgeToken}`)) { json(res, 401, { error: "UNAUTHORIZED_DEVICE" }); return true; }
        accept(await body(req)); const response = nextCommand();
        res.writeHead(200, { "Content-Type": "application/x-factoryos", "Cache-Control": "no-store" }); res.end(response); return true;
      }
      if (!authorized(req)) { json(res, 401, { error: configured ? "SESSION_REQUIRED" : "BRIDGE_NOT_CONFIGURED" }); return true; }
      if (path === "/bridge/state" && req.method === "GET") { json(res, 200, snapshot()); return true; }
      if (path === "/bridge/command" && req.method === "POST") {
        if (!sameOrigin(req)) { json(res, 403, { error: "ORIGIN_DENIED" }); return true; }
        const input = JSON.parse((await body(req, 12288)).toString());
        json(res, 200, await command(input.command, input.args)); return true;
      }
      json(res, 404, { error: "NOT_FOUND" }); return true;
    } catch (err) {
      if (!res.headersSent) json(res, 400, { error: err.message === "payload_limit" ? "PAYLOAD_LIMIT" : "INVALID_REQUEST" });
      return true;
    }
  }
  function upgrade(req, socket, head) {
    const path = new URL(req.url, "http://local").pathname;
    if (path !== "/bridge/device" && path !== "/bridge/view") return false;
    const isDevice = path === "/bridge/device";
    const allowed = isDevice ? configured && equal(req.headers.authorization, `Bearer ${bridgeToken}`) && !device : authorized(req) && sameOrigin(req) && clients.size < 16;
    if (!allowed) { socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); return true; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", () => {});
      if (isDevice) {
        device = ws;
        ws.on("message", (data) => { try { accept(data); flush(); } catch { ws.close(1008, "invalid device message"); } });
        ws.on("close", () => { if (device === ws) device = null; });
      } else {
        ws.sessionCookie = req.headers.cookie; clients.add(ws); send(ws, snapshot());
        ws.on("message", () => ws.close(1008, "read only channel"));
        ws.on("close", () => clients.delete(ws));
      }
    });
    return true;
  }
  const timer = setInterval(() => {
    if (lastBroadcastOnline !== snapshot().online) broadcast();
    if (device?.readyState === WebSocket.OPEN) device.ping();
    for (const ws of clients) if (!authorized({ headers: { cookie: ws.sessionCookie } })) ws.close(1008, "session expired");
  }, 5000);
  // Validate expiration with the original signed cookie on every heartbeat.
  wss.on("connection", () => {});
  function close() {
    if (closed) return; closed = true; clearInterval(timer);
    for (const [, p] of pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: p.sent ? "UNCERTAIN" : "RELAY_STOPPED" }); }
    pending.clear(); for (const ws of clients) ws.terminate(); device?.terminate(); wss.close(); telemetry = null;
  }
  return { handle, upgrade, close, snapshot };
}
