# FactoryOS web panel

Ayrı Next.js 16 / React 19 uygulaması. Türkçe, masaüstü ve mobil uyumlu panel; canlı AE2 araması, crafting CPU seçimiyle üretim, iptal/arşivleme, stok kuralları ve enerji takibi. Örnek veri yalnızca kullanıcının açtığı **Demo** modunda görünür. Demo modu komut göndermez.

## Ubuntu / Debian VPS

Docker Compose + Caddy için [adım adım VPS kurulumunu](docs/vps.md) kullanın.

## Yerelde açma

Node.js 22+ (geliştirmede 24) gerekir. Bu klasörde:

```powershell
npm ci
npm run password:hash
```

`.env.example` dosyasını `.env.local` olarak kopyalayın. `BRIDGE_TOKEN` ve `PANEL_TOKEN` alanlarına **birbirinden farklı, rastgele ve en az 32 karakterli** değerler yazın. `password:hash` komutu terminalde gizli olarak en az 12 karakterli panel şifresini iki kez ister. Çıktıdaki `PANEL_PASSWORD_HASH='scrypt:...'` satırını `.env.local` dosyasına ekleyin; **tek tırnakları koruyun**. Şifrenin kendisi dosyaya yazılmaz. Bu dosya Git tarafından yok sayılır. Değerleri `NEXT_PUBLIC_` değişkenlerine koymayın. `PUBLIC_ORIGIN` tarayıcıda açtığınız tam origin ile eşleşmelidir; örneğin `http://localhost:3000`.

```powershell
npm run dev
```

`http://localhost:3000` adresini açıp panel şifresiyle giriş yapın. Panelin tamamı, demo görünümü dahil, şifre ister. Yapılandırma eksikse giriş kapalıdır. Şifre/token değişince sunucuyu yeniden başlatın.

- `BRIDGE_TOKEN`: yalnızca OpenComputers sunucusunun gönderim/relay bağlantısı.
- `PANEL_TOKEN`: yalnızca oturum imzalama anahtarıdır; giriş ekranına yazılmaz.
- `PANEL_PASSWORD_HASH`: panel şifresinin rastgele salt ile scrypt özeti. Giriş HttpOnly / SameSite=Strict cookie kullanır, şifre tarayıcı deposuna yazılmaz. Oturum 8 saattir; HTTPS origin'de cookie Secure olur. Çıkış, sunucunun yeniden başlaması veya şifre değişimi eski oturumu geçersiz kılar. Giriş denemeleri hız sınırına tabidir.

## Oyun sunucusunu bağlama

FactoryOS **v0.6.2** kurulmuş server bilgisayarında Internet Card gerekir. Ana ekran/yan ekran için internet gerekmez. Çalışan Factory Server ekranında **F4** tuşuna veya **WEB PANELI / BAGLANTI** düğmesine basın:

1. Panel adresini girin: `https://PANEL_ADRESINIZ`. Menü `/bridge/ingest` yolunu ekler.
2. Web sunucusundaki `BRIDGE_TOKEN` değerini token alanına yapıştırın. Giriş maskelenir; alanı boş bırakmak kayıtlı tokeni korur.
3. Üretim/kural yönetimi için **UZAKTAN KONTROL: ACIK** seçin; yalnız izleme için kapalı bırakın.
4. **KAYDET / BAGLAN** seçin. Disk kaydı başarılı olunca bağlantı, FactoryOS yeniden başlatılmadan uygulanır. Güncelleme sürerken bağlantı ayarı değiştirilmez.

Fiziksel klavye, pano ve dokunmatik klavye desteklenir. Tab alan değiştirir, Enter kaydeder, Esc menüyü kapatır. **BAGLANTIYI KES** yalnızca web erişimini kapatır; mevcut AE2 işleri devam eder.

Komut satırı alternatifi:

```sh
factoryos stop
factoryos web pair https://PANEL_ADRESINIZ/bridge/ingest
```

Bridge anahtarı gizli bir girişte istenir. Komut geçmişine veya URL'ye eklenmez. Uzaktan üretim/yönetim için ardından:

```sh
factoryos config webControl true
factoryos start --foreground
```

Tarayıcıda panel şifresiyle giriş yapın. Oyun sunucusunun varsayılan 5 saniyelik gönderiminden sonra veriler görünür. Eski OpenComputers HTTPS erişimi Java sertifika deposuna ve mod ağ izinlerine bağlıdır; gerçek oyun kabulü bekleniyor.

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

Stok sorguları 24 satırlık mevcut AE2 sayfalamasını kullanır. Tüm envanterin ikinci bir kopyası Lua RAM'inde tutulmaz. Metadata varsayılan 5 saniyede bir (`webInterval`: 2..10), stok görünümü 15 saniyede bir/arama sonrası sorgulanır. Aynı görünüm yenilenirken mevcut satırlar görünür kalır; aynı anda ikinci stok sorgusu gönderilmez. Arama/filtre/sıra/sayfa değişiminde, AE2 veya relay bağlantısı kaybında, cihaz yeniden başladığında ve sorgu hatasında eski liste temizlenir. HTTPS transport komutları sonraki cihaz gönderiminde alır; WS transport hemen iletir. Bir ağ adımında tek okuma/yazma yapılır; kısmi TCP yazmaları ve bağlantı timeout'ları yönetilir. Gönderim ana döngüde nonblocking ilerler.

20 saniye yeni metadata gelmezse panel canlı veriyi kaldırır. Relay belleği kalıcı değildir: yeniden başlayınca eski işleri/komutları restore edip tekrar göndermez, cihazdan yeni snapshot bekler. Asıl kalıcı iş/kural verisi oyun bilgisayarındadır. Aynı relay için tek Factory Server kullanın.

## Kontroller

v0.2.2 üretim penceresi planlama sonucunu bekler: **Kontrol et ve üret → kaynak/plan denetimi → başladı veya hata**. Hata açıklaması pencerede ve üretim geçmişinde görünür, ham sürücü yanıtı **AE2 hata ayrıntısı** altında açılır. Açıklama alanları için oyun sunucusunu v0.6.2'ye güncelleyin. OC ayrı bir eksik malzeme listesi sağlamadığı için kesin malzeme/miktar uydurulmaz; [sınırlar](https://github.com/Nom-Dist/factory-os/blob/main/docs/crafting.md) açıklanır. [Denetim](docs/previews/web-panel-craft-checking.png) ve [hata](docs/previews/web-panel-craft-failed.png) ekranları yerel gerçek Lua/relay bağlantısında, **mock AE2** ile tarayıcıda doğrulandı. Dolu CPU reddi ve CPU boşalınca başarılı başlangıç da sınandı; gerçek Minecraft hata kabulü bekleniyor.

```powershell
npm run typecheck
npm test
npm run test:flow
npm run build
```

`test:flow` ayrı FactoryOS v0.6.2 kaynak checkout'u, o checkout'un `.tools` klasöründe Lupa ve Python gerektirir. Kaynak checkout otomatik bulunamazsa `FACTORYOS_ROOT=/tam/yol/factory-os npm run test:flow` kullanın. `npm test` tek başına bu web deposunda çalışır. Gerçek Lua 5.2/5.3 bridge'i gerçek localhost TCP/RFC6455 bağlantısıyla Node relay'e bağlar; oturum → stok → quote → aynı START'ın iki kez iletilmesi → tek native çağrı ve önceden journal yazımı doğrulanır. AE2/component/disk mock'tur. Gerçek Minecraft veya HTTPS sertifika kabulü değildir.

## Yayıma hazırlık

Kullanıcı 12 Kasım 2026'da VPS kurulumu, Factory Server bağlantısı ve webden üretim emrinin çalıştığını bildirdi. Bu bildirim ayrıntılı iptal/reboot/eksik malzeme senaryolarının kabulü değildir.

Depo yenileme düzeltmesi üretim Node sunucusunda, gerçek relay/WebSocket üzerinden beş saniye geciken **örnek cihaz yanıtlarıyla** tarayıcıda doğrulandı. Periyodik ve elle yenilemede satırlar görünür kaldı, miktarlar güncellendi; arama değişiminde ve AE2 bağlantısı kaybında eski sonuçlar temizlendi. [Yenileme sırasında görünür liste](docs/previews/web-panel-stock-refresh.png) gerçek Minecraft verisi içermez.

Bu sürüm **tek Node süreci** olarak `server.mjs` üzerinden çalışır. `next start` relay'i başlatmaz. Docker destekleyen bir sunucu/platforma veya sürekli Node sürecine dağıtılabilir:

```powershell
npm run build
npm start
```

Container build:

```sh
docker build -t factoryos-panel .
```

Çalıştırma için [Compose rehberini](docs/vps.md) kullanın. Compose tek tırnaklı şifre hash'ini doğru okur ve paneli yalnızca Caddy'nin eriştiği iç ağa açar. `.env.local` dosyası doğrudan `docker run --env-file` ile aynı biçimde yorumlanmaz.

Reverse proxy HTTPS/WSS sonlandırmalı, WebSocket upgrade başlıklarını geçirmeli, `PUBLIC_ORIGIN` gerçek `https://...` adresine ayarlanmalıdır. Container imajına `.env.local` alınmaz. Docker imajı bu oturumda çalıştırılmadı; üretim Node build'i doğrulandı.

Vercel güncel olarak WebSocket destekler; fakat bu özel custom-server relay standart `next build` dağıtımıyla otomatik çalışmaz. Vercel hedefi seçilirse upgrade route'ları platformun WebSocket API'sine taşınmalı ve instance'lar arası koordinasyon harici bir depoyla yapılmalıdır. Bu sürüm için Docker/tek süreç Node yolu hazırdır. Bağımsız kaynak deposu: https://github.com/Nom-Dist/factory-os-web-panel.

[Şifreli giriş](docs/previews/web-panel-login.png) · [Desktop önizleme](docs/previews/web-panel-desktop.png) · [Mobil önizleme](docs/previews/web-panel-mobile.png). Dashboard görselleri **örnek veri** içerir.
