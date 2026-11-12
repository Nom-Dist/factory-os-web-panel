# FactoryOS web panel

Ayrı Next.js 16 / React 19 uygulaması. Türkçe, masaüstü ve mobil uyumlu panel; canlı AE2 araması, crafting CPU seçimiyle üretim, iptal/arşivleme, stok kuralları ve enerji takibi. Örnek veri yalnızca kullanıcının açtığı **Demo** modunda görünür. Demo modu komut göndermez.

## Ubuntu / Debian VPS

Docker Compose + Caddy için [adım adım VPS kurulumunu](docs/vps.md) kullanın.

## Yerelde açma

Node.js 22+ (geliştirmede 24) gerekir. Bu klasörde:

```powershell
npm ci
npm run dev
```

`http://localhost:3000` adresini açın. Anahtarlar yokken canlı bağlantı ve üretim kapalıdır; tasarımı **Demoyu aç** ile inceleyebilirsiniz.

Canlı deneme için `.env.example` dosyasını `.env.local` olarak kopyalayın. `BRIDGE_TOKEN` ve `PANEL_TOKEN` alanlarına **birbirinden farklı, rastgele ve en az 32 karakterli** değerler yazın. Bu dosya Git tarafından yok sayılır. Anahtarları `NEXT_PUBLIC_` değişkenlerine koymayın. `PUBLIC_ORIGIN` tarayıcıda açtığınız tam origin ile eşleşmelidir; örneğin `http://localhost:3000`. Sunucuyu yeniden başlatın.

- `BRIDGE_TOKEN`: yalnızca OpenComputers sunucusunun gönderim/relay bağlantısı.
- `PANEL_TOKEN`: panel oturumunu açma. HttpOnly / SameSite=Strict cookie kullanılır, token tarayıcı deposuna yazılmaz. Oturum 8 saattir; HTTPS origin'de cookie Secure olur. Bütün canlı veriler ve komutlar oturum gerektirir.

## Oyun sunucusunu bağlama

FactoryOS **v0.6.0** kurulmuş server bilgisayarında Internet Card gerekir. Ana ekran/yan ekran için internet gerekmez. Paneli yayımladıktan sonra HTTPS uplink önerilir:

```sh
factoryos stop
factoryos web pair https://PANEL_ADRESINIZ/bridge/ingest
```

Bridge anahtarı gizli bir girişte istenir. Komut geçmişine veya URL'ye eklenmez. Uzaktan üretim/yönetim için ardından:

```sh
factoryos config webControl true
factoryos start --foreground
```

Panelde **Bağlantı kur** ile **PANEL_TOKEN** girin. Oyun sunucusunun varsayılan 5 saniyelik gönderiminden sonra veriler görünür. Eski OpenComputers HTTPS erişimi Java sertifika deposuna ve mod ağ izinlerine bağlıdır; gerçek oyun kabulü bekleniyor.

Güvenilen ağdaki doğrudan WebSocket seçeneği:

```sh
factoryos web pair ws://RELAY_HOST:3000/bridge/device
```

Bu TCP yolu şifrelenmemiştir; public yayında HTTPS uplink kullanın. Klasik OC Internet Card'ın TCP API'si TLS açmadığı için `wss://` oyun istemcisinde desteklenmez. Tarayıcı HTTPS panelde otomatik `wss://.../bridge/view` kullanır. Modun blacklist/whitelist ayarları özel ağ adreslerini engelleyebilir; mevcut ağ politikasını inceleyin. OC yalnızca dışarı bağlantı kurar, port dinlemez.

## Akış

```text
OpenComputers Factory Server
    ├── ws:// /bridge/device (güvenilen ağ)
    └── HTTPS POST /bridge/ingest (yayımlanan panel)
                   ↓
          Node relay + Next.js panel
                   ↓
      /bridge/view → tarayıcı WebSocket
      /bridge/command ← oturumlu kullanıcı komutu
```

Relay yalnızca bilinen stok/üretim komutlarını iletir. Sunucu `webControl=false` iken bütün yazma işlemlerini tekrar reddeder. İşler `@factoryos-web` kayıt sahibine aittir; mevcut 16 sahip limitinde bir yer kullanır. Aynı `START_CRAFT` numarası journal tarafından engellenir. Yazılmış bir komut relay veya socket kopmasında tekrar oynatılmaz. Yanıtsız iş **belirsiz** kabul edilip işler ekranından kontrol edilir. Geçmişten kaybolmuş sıra numaraları da tekrar çalışmaz. Güncelleme sırasında normal üretim kilitleri geçerlidir.

Stok sorguları 24 satırlık mevcut AE2 sayfalamasını kullanır. Tüm envanterin ikinci bir kopyası Lua RAM'inde tutulmaz. Metadata varsayılan 5 saniyede bir (`webInterval`: 2..10), stok görünümü 15 saniyede bir/arama sonrası sorgulanır. HTTPS transport komutları sonraki cihaz gönderiminde alır; WS transport hemen iletir. Bir ağ adımında tek okuma/yazma yapılır; kısmi TCP yazmaları ve bağlantı timeout'ları yönetilir. Gönderim ana döngüde nonblocking ilerler.

20 saniye yeni metadata gelmezse panel canlı veriyi kaldırır. Relay belleği kalıcı değildir: yeniden başlayınca eski işleri/komutları restore edip tekrar göndermez, cihazdan yeni snapshot bekler. Asıl kalıcı iş/kural verisi oyun bilgisayarındadır. Aynı relay için tek Factory Server kullanın.

## Kontroller

```powershell
npm run typecheck
npm test
npm run test:flow
npm run build
```

`test:flow` ayrı FactoryOS v0.6.0 kaynak checkout'u, o checkout'un `.tools` klasöründe Lupa ve Python gerektirir. Kaynak checkout otomatik bulunamazsa `FACTORYOS_ROOT=/tam/yol/factory-os npm run test:flow` kullanın. `npm test` tek başına bu web deposunda çalışır. Gerçek Lua 5.2/5.3 bridge'i gerçek localhost TCP/RFC6455 bağlantısıyla Node relay'e bağlar; oturum → stok → quote → aynı START'ın iki kez iletilmesi → tek native çağrı ve önceden journal yazımı doğrulanır. AE2/component/disk mock'tur. Gerçek Minecraft veya HTTPS sertifika kabulü değildir.

## Yayıma hazırlık

Bu sürüm **tek Node süreci** olarak `server.mjs` üzerinden çalışır. `next start` relay'i başlatmaz. Docker destekleyen bir sunucu/platforma veya sürekli Node sürecine dağıtılabilir:

```powershell
npm run build
npm start
```

Container build:

```sh
docker build -t factoryos-panel .
docker run --env-file .env.local -e HOST=0.0.0.0 -e PORT=3000 -p 127.0.0.1:3000:3000 factoryos-panel
```

Docker komutundaki HOST/PORT, yerel `.env.local` değerlerini container içinde geçersiz kılar. Böylece uygulama container'ın ağ arayüzünü dinler; host'ta port yalnızca reverse proxy'nin erişeceği loopback adresine açılır.

Reverse proxy HTTPS/WSS sonlandırmalı, WebSocket upgrade başlıklarını geçirmeli, `PUBLIC_ORIGIN` gerçek `https://...` adresine ayarlanmalıdır. Container imajına `.env.local` alınmaz. Docker imajı bu oturumda çalıştırılmadı; üretim Node build'i doğrulandı.

Vercel güncel olarak WebSocket destekler; fakat bu özel custom-server relay standart `next build` dağıtımıyla otomatik çalışmaz. Vercel hedefi seçilirse upgrade route'ları platformun WebSocket API'sine taşınmalı ve instance'lar arası koordinasyon harici bir depoyla yapılmalıdır. Bu sürüm için Docker/tek süreç Node yolu hazırdır. Hosting yayını henüz yapılmadı. Bağımsız kaynak deposu: https://github.com/Nom-Dist/factory-os-web-panel.

[Desktop önizleme](docs/previews/web-panel-desktop.png) · [Mobil önizleme](docs/previews/web-panel-mobile.png). Görseller **örnek veri** içerir.
