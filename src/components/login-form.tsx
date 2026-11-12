"use client";
import { useEffect, useState } from "react";
import { Factory, LoaderCircle, LockKeyhole, ShieldCheck, ArrowRight } from "lucide-react";

export default function LoginForm() {
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/bridge/session", { cache: "no-store" }).then(r => r.json()).then(data => {
      if (!active) return;
      if (data.authenticated) window.location.replace("/"); else setConfigured(data.configured === true);
    }).catch(() => { if (active) setError("Sunucuya ulaşılamadı. Sayfayı yenileyip tekrar deneyin."); });
    return () => { active = false; };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const res = await fetch("/bridge/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "INVALID_PASSWORD" ? "Şifre yanlış. Tekrar deneyin." : data.error === "RATE_LIMIT" ? "Çok fazla giriş denemesi. Bir dakika sonra tekrar deneyin." : data.error === "PASSWORD_NOT_CONFIGURED" ? "Sunucuda panel şifresi henüz yapılandırılmadı." : "Giriş yapılamadı. Bağlantıyı kontrol edin.");
      setPassword(""); window.location.replace("/");
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return <main className="login-page"><section className="login-card"><div className="login-brand"><span className="brand-mark"><Factory size={23} /></span><strong>Factory<span>OS</span></strong></div><div className="login-lock"><LockKeyhole size={26} /></div><div className="eyebrow">ÖZEL FABRİKA KONTROL ODASI</div><h1>Fabrikana giriş yap.</h1><p>Canlı verilere ve üretim kontrollerine erişmek için panel şifreni gir.</p><form onSubmit={submit}><label className="form-label" htmlFor="panel-password">Panel şifresi<input id="panel-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256} autoComplete="current-password" disabled={busy || configured === false} /></label>{error && <div className="form-error" role="alert">{error}</div>}{configured === false && <div className="form-error" role="status">Panel henüz yapılandırılmadı. VPS’te <code>npm run password:hash</code> ile şifre hash’i oluşturup ortam ayarlarına ekle.</div>}<button className="button primary full-width" disabled={busy || configured !== true}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}Giriş yap</button></form><div className="login-security"><ShieldCheck size={16} /><span>Şifre hash olarak saklanır. Giriş yapmadan panel ve canlı veriler açılmaz.</span></div><small>OpenComputers × AE2 · FactoryOS</small></section></main>;
}
