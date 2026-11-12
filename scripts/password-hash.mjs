import { emitKeypressEvents } from "node:readline";
import { hashPassword } from "../bridge/password.mjs";

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Run this command in an interactive terminal. Passwords are not accepted as command-line arguments.");
  process.exit(1);
}
emitKeypressEvents(process.stdin);
async function hidden(prompt) {
  process.stdout.write(prompt); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const done = () => { process.stdin.off("keypress", key); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); };
    function key(text, info) {
      if (info.ctrl && info.name === "c") { done(); reject(new Error("Canceled")); }
      else if (info.name === "return") { done(); resolve(value); }
      else if (info.name === "backspace") value = [...value].slice(0, -1).join("");
      else if (!info.ctrl && !info.meta && text && !/[\x00-\x1f\x7f]/.test(text) && Buffer.byteLength(value + text) <= 256) value += text;
    }
    process.stdin.on("keypress", key);
  });
}
try {
  const first = await hidden("Yeni panel sifresi (en az 12 karakter, gizli): ");
  const second = await hidden("Sifreyi tekrar girin: ");
  if (first !== second) throw new Error("Passwords do not match.");
  const hash = await hashPassword(first);
  console.log("Asagidaki satiri .env.local dosyasina ekleyin. Tek tirnaklari koruyun:");
  console.log(`PANEL_PASSWORD_HASH='${hash}'`);
} catch (err) { console.error(err.message); process.exitCode = 1; }
