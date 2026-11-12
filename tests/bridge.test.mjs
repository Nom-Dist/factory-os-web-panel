import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { decode, encode } from "../bridge/codec.mjs";
import { createHub } from "../bridge/hub.mjs";
import { hashPassword, verifyPassword } from "../bridge/password.mjs";

function fixtureTelemetry(boot = "test-device-boot") {
  return { kind: "telemetry", boot, controlEnabled: true, status: { version: "0.6.0", ae2: { online: true, itemTypes: 1 },
    power: { ae2: { supported: false } }, clients: [] }, jobs: { cpus: [], trackedJobs: [] }, rules: [], rulesRevision: 0, paused: false };
}
async function fixture(options = {}) {
  let hub; const server = http.createServer((req, res) => hub.handle(req, res));
  server.on("upgrade", (req, socket, head) => hub.upgrade(req, socket, head));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`, bridgeToken = randomBytes(32).toString("hex"), panelToken = randomBytes(32).toString("hex");
  const password = "test-only panel password "+randomBytes(8).toString("hex");
  const passwordHash = await hashPassword(password);
  hub = createHub({ bridgeToken, panelToken, passwordHash, origin: base, commandMs: 500, ...options });
  const post = (path, value, cookie = "", origin = base) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(value) });
  async function login() {
    const res = await post("/bridge/session", { password }); assert.equal(res.status, 200);
    const cookies = res.headers.getSetCookie();
    assert.match(cookies[0], /HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800/);
    assert.match(cookies[1], /Path=\/bridge; Max-Age=0/);
    return cookies[0].split(";")[0];
  }
  const ingest = (message) => fetch(base + "/bridge/ingest", { method: "POST", headers: { Authorization: `Bearer ${bridgeToken}` }, body: encode(message) });
  return { hub, base, bridgeToken, post, login, ingest, panelToken, password, close: async () => { hub.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); } };
}
function messages(ws) {
  const queued = [], waiting = [];
  ws.on("message", data => { if (waiting.length) waiting.shift()(data); else queued.push(data); });
  return () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("message timeout")), 3000);
    const done = data => { clearTimeout(timer); resolve(data); };
    if (queued.length) done(queued.shift()); else waiting.push(done);
  });
}
test("data-only wire codec handles UTF-8, numbers, arrays and hostile payloads", () => {
  const sample = { label: "Üretim / bakır", items: [{ amount: 64, enabled: true }], nilValue: null };
  const out = decode(encode(sample)); assert.equal(out.label, sample.label); assert.equal(out.items[0].amount, 64); assert.equal(out.items[0].enabled, true);
  assert.equal(encode("ü"), "s2:ü");
  for (const text of ["return os.execute('x')", "m2:s1:an1:1s1:an1:2", "s100:x", "tmore", "m1:s9:__proto__m0:", "n3:NaN"]) assert.throws(() => decode(text));
  assert.throws(() => decode(Buffer.alloc(65537))); assert.throws(() => encode({ bad: Infinity }));
});
test("sessions protect reads, reject cross-origin writes, and never expose keys", async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(f.base + "/bridge/state")).status, 401);
    assert.equal((await f.post("/bridge/session", { password: "wrong" })).status, 401);
    assert.equal((await f.post("/bridge/session", { token: f.panelToken })).status, 401);
    const cookie = await f.login();
    const state = await (await fetch(f.base + "/bridge/state", { headers: { Cookie: cookie } })).json();
    assert.equal(state.online, false); assert.equal(state.controlAllowed, false); assert.equal(JSON.stringify(state).includes(f.bridgeToken), false);
    assert.equal((await f.post("/bridge/command", { command: "START_CRAFT", args: {} }, cookie, "https://evil.invalid")).status, 403);
    assert.equal((await fetch(f.base + "/bridge/ingest", { method: "POST", body: encode(fixtureTelemetry()) })).status, 401);
    const invalid = await f.ingest({ kind: "telemetry" }); assert.equal(invalid.status, 400);
    const denied = await (await f.post("/bridge/command", { command: "START_CRAFT", args: {} }, cookie)).json(); assert.equal(denied.error, "DEVICE_OFFLINE");
  } finally { await f.close(); }
});
test("HTTPS poll uplink carries an authenticated command and its response", async () => {
  const f = await fixture();
  try {
    const cookie = await f.login(); assert.equal((await f.ingest(fixtureTelemetry())).status, 200);
    const browser = f.post("/bridge/command", { command: "START_CRAFT", args: { token: "quote", sequence: 1, amount: 8 } }, cookie);
    let command; const deadline = Date.now() + 2500;
    do { command = decode(await (await f.ingest(fixtureTelemetry())).arrayBuffer()); if (command.kind !== "command") await new Promise(r => setTimeout(r, 5)); } while (command.kind !== "command" && Date.now() < deadline);
    assert.equal(command.command, "START_CRAFT"); assert.equal(command.args.amount, 8);
    await f.ingest({ kind: "reply", id: command.id, ok: true, data: { state: "computing", id: "web:1" } });
    const reply = await (await browser).json(); assert.equal(reply.ok, true); assert.equal(reply.data.state, "computing");
    const bad = await (await f.post("/bridge/command", { command: "GET_UPDATE_FILE", args: {} }, cookie)).json(); assert.equal(bad.error, "FORBIDDEN");
    const readOnly = fixtureTelemetry(); readOnly.controlEnabled = false; await f.ingest(readOnly);
    const denied = await (await f.post("/bridge/command", { command: "START_CRAFT", args: {} }, cookie)).json(); assert.equal(denied.error, "WEB_CONTROL_DISABLED");
  } finally { await f.close(); }
});
test("real WebSockets stream telemetry, round-trip commands, and never replay lost writes", async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    const viewer = new WebSocket(f.base.replace("http:", "ws:") + "/bridge/view", { headers: { Cookie: cookie, Origin: f.base } });
    const viewMessage = messages(viewer); await once(viewer, "open"); assert.equal(JSON.parse(await viewMessage()).online, false);
    const device = new WebSocket(f.base.replace("http:", "ws:") + "/bridge/device", { headers: { Authorization: `Bearer ${f.bridgeToken}` } });
    const deviceMessage = messages(device); await once(device, "open"); device.send(encode(fixtureTelemetry()));
    assert.equal(JSON.parse(await viewMessage()).online, true);
    const browser = f.post("/bridge/command", { command: "START_CRAFT", args: { amount: 64 } }, cookie);
    const command = decode(await deviceMessage()); assert.equal(command.command, "START_CRAFT");
    device.close(); await once(device, "close");
    const lost = await (await browser).json(); assert.equal(lost.error, "UNCERTAIN");
    const replacement = new WebSocket(f.base.replace("http:", "ws:") + "/bridge/device", { headers: { Authorization: `Bearer ${f.bridgeToken}` } });
    await once(replacement, "open"); replacement.send(encode(fixtureTelemetry()));
    let replayed = 0; replacement.on("message", () => replayed++);
    await new Promise(r => setTimeout(r, 80)); assert.equal(replayed, 0);
    viewer.close(); replacement.close();
  } finally { await f.close(); }
});
test("stale device data is hidden, reboot clears pending requests, sessions expire", async () => {
  let time = Date.now(); const f = await fixture({ now: () => time });
  try {
    const cookie = await f.login(); await f.ingest(fixtureTelemetry()); assert.equal(f.hub.snapshot().online, true);
    time += 20001; assert.equal(f.hub.snapshot().online, false); assert.equal(f.hub.snapshot().telemetry, null);
    await f.ingest(fixtureTelemetry("new-boot")); assert.equal(f.hub.snapshot().online, true);
    time += 8 * 3600000 + 1; assert.equal((await fetch(f.base + "/bridge/state", { headers: { Cookie: cookie } })).status, 401);
  } finally { await f.close(); }
});

test("password hashing uses a fresh salt, rejects wrong passwords and malformed hashes", async () => {
  const a = await hashPassword("a strong test password"), b = await hashPassword("a strong test password");
  assert.notEqual(a, b); assert.equal(await verifyPassword("a strong test password", a), true);
  assert.equal(await verifyPassword("wrong", a), false); assert.equal(await verifyPassword("test", "broken"), false);
  await assert.rejects(hashPassword("short"));
});
test("generated password hashes survive Next.js env file loading", async () => {
  const hash = await hashPassword("test-only env password"), dir = await mkdtemp(join(tmpdir(), "factoryos-password-env-"));
  const file = join(dir, ".env.local");
  try {
    await writeFile(file, `FACTORYOS_ENV_HASH='${hash}'\n`);
    const {stdout} = await promisify(execFile)(process.execPath, ["-e", "require('@next/env').loadEnvConfig(process.argv[1]); process.stdout.write(process.env.FACTORYOS_ENV_HASH)", dir]);
    assert.equal(stdout, hash);
    assert.equal(await verifyPassword("test-only env password", stdout), true);
  } finally { await unlink(file); await rmdir(dir); }
});
test("logout revokes the cookie and all viewer connections for that session", async () => {
  const f = await fixture();
  try {
    const cookie = await f.login();
    const status = await (await fetch(f.base + "/bridge/session", {headers:{Cookie:cookie}})).json(); assert.equal(status.authenticated,true);
    const viewer = new WebSocket(f.base.replace("http:","ws:")+"/bridge/view",{headers:{Cookie:cookie,Origin:f.base}});
    await once(viewer,"open"); const closed = once(viewer,"close");
    assert.equal((await f.post("/bridge/logout",{},cookie)).status,200); await closed;
    assert.equal((await fetch(f.base+"/bridge/state",{headers:{Cookie:cookie}})).status,401);
  } finally { await f.close(); }
});
test("missing password configuration cannot fall back to the old access key", async () => {
  const f = await fixture({passwordHash:""});
  try { assert.equal((await f.post("/bridge/session",{token:f.panelToken,password:f.password})).status,503); }
  finally { await f.close(); }
});
