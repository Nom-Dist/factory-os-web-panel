# Ubuntu / Debian VPS kurulumu

Panel Minecraft'ın içindeki bilgisayarda değil, VPS üzerinde bir Node uygulaması olarak çalışır. Aynı VPS Minecraft sunucusunu da barındırabilir. Bu rehber Docker Compose ve Caddy ile tek süreç relay'i yayımlar. Kullanıcı VPS üzerinde bağlantı ve webden üretim emrinin çalıştığını doğruladı; kullandığı dağıtım yönteminin bu rehberle birebir aynı olduğu ayrıca doğrulanmadı.

## 1. Ön koşullar

- Docker Engine ve Compose plugin kurulu olmalı. Resmî kurulum: [Ubuntu](https://docs.docker.com/engine/install/ubuntu/) / [Debian](https://docs.docker.com/engine/install/debian/).
- `panel.seninalanin.com` gibi bir alt alan adının A kaydı VPS'in public IPv4 adresine yönelmeli. AAAA kaydı varsa IPv6 yönü de doğru olmalı.
- TCP 80 ve 443 erişilebilir ve başka bir reverse proxy tarafından kullanılmıyor olmalı. UDP 443 HTTP/3 içindir, şart değildir. Hazır Nginx/Caddy kurulumu varsa bu Compose içindeki Caddy'yi aynı portlarda ikinci kez çalıştırmayın; mevcut proxy'ye paneli bağlayın.

Caddy bu alan adı için TLS sertifikası alır ve yeniler; WebSocket bağlantılarını reverse proxy üzerinden geçirir. [Automatic HTTPS](https://caddyserver.com/docs/automatic-https), [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## 2. Kaynakları indir

SSH ile VPS'e bağlandıktan sonra:

```sh
git clone https://github.com/Nom-Dist/factory-os-web-panel.git
cd factory-os-web-panel
```

## 3. Anahtarları ve panel şifresini oluştur

Komuttaki `panel.seninalanin.com` değerini **kendi alan adınla değiştir**. Aşağıdaki blok yeni kurulum içindir; `.env.local` zaten varsa dosyayı değiştirmeden önce mevcut yapılandırmayı inceleyin. İki farklı rastgele anahtar üretilir ve yalnızca VPS'te dosyaya yazılır:

```sh
test ! -e .env.local || { echo '.env.local zaten var; kurulum durduruldu.'; exit 1; }
umask 077
printf 'PANEL_DOMAIN=panel.seninalanin.com\nBRIDGE_TOKEN=%s\nPANEL_TOKEN=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env.local
```

`openssl` kurulu olmalıdır. `PANEL_TOKEN` oturumları imzalayan rastgele anahtardır; tarayıcıya yazılmaz. `BRIDGE_TOKEN` yalnızca oyun sunucusundaki eşleştirme girişine verilir. Gizli anahtarları Git'e veya sohbete göndermeyin.

İmajı derleyip şifre oluşturma aracını etkileşimli terminalde aç:

```sh
sudo docker compose --env-file .env.local build panel
sudo docker compose --env-file .env.local run --rm --no-deps panel node scripts/password-hash.mjs
```

En az 12 karakterli **panel giriş şifreni** iki kez gir. Yazdıkların ekranda görünmez. Araç aşağıdaki biçimde bir hash satırı üretir:

```dotenv
PANEL_PASSWORD_HASH='scrypt:...'
```

Bu satırı `nano .env.local` ile dosyanın sonuna ekle; **tek tırnakları ve hash'in tamamını koru**. `scrypt:...` burada yalnızca biçim örneğidir; aracın ürettiği gerçek satırı kullan. Şifreyi düz metin olarak kaydetme. Docker komutu `-T` olmadan çalıştırılmalıdır; şifre aracı etkileşimli terminal ister.

## 4. Derle ve aç

```sh
sudo docker compose --env-file .env.local up -d --build
sudo docker compose --env-file .env.local ps
sudo docker compose --env-file .env.local logs --tail=80 panel caddy
```

Tarayıcıdan `https://panel.seninalanin.com` adresini açıp **kendi belirlediğin panel şifresiyle** giriş yap. Demo dahil panelin tamamı şifre ister. Panel ve relay aynı container'da çalışır. Panelin 3000 portu public olarak yayımlanmaz; yalnızca Caddy erişir. Container içindeki HOST değeri 0.0.0.0 olarak ayarlanır, `.env.local` içindeki eski yerel HOST değeri bunu değiştirmez.

Oturum 8 saat sürer. Çıkış ve relay'in yeniden başlaması oturumları iptal eder. Şifreyi değiştirmek için aynı aracı tekrar çalıştır, dosyadaki eski `PANEL_PASSWORD_HASH` satırını değiştir ve `up -d` komutuyla container'ı yeniden oluştur. Eksik/geçersiz hash ile panel girişe kapalı kalır; önceki token ile giriş desteklenmez.

## 5. OpenComputers'ı eşleştir

Oyun içindeki Factory Server'da **FactoryOS v0.6.2** ve Internet Card bulunmalıdır. Oyun kaynakları ayrı `factory-os` deposundadır; yayımlanmamış bir sürüm F5/F6 ile indirilemez.

FactoryOS çalışırken server ekranında **F4** tuşuna veya **WEB PANELI / BAGLANTI** düğmesine bas:

1. **PANEL ADRESI**: `https://panel.seninalanin.com` yaz. `/bridge/ingest` otomatik eklenir.
2. **TOKEN**: VPS'teki `BRIDGE_TOKEN` değerini yapıştır. Alan gizlidir; boş bırakılması kayıtlı tokeni korur.
3. Üretim ve stok kuralı yönetimi için **UZAKTAN KONTROL: ACIK** seç.
4. **KAYDET / BAGLAN** düğmesine bas. Başarılı disk kaydından sonra bağlantı hemen uygulanır; FactoryOS'u yeniden başlatman gerekmez.

Pano, fiziksel klavye ve ekrana dokununca açılan klavye desteklenir. Tab alan değiştirir, Enter kaydeder, Esc kapatır. **BAGLANTIYI KES** mevcut AE2 işlerini iptal etmez.

Komut satırı alternatifi:

```sh
factoryos stop
factoryos web pair https://panel.seninalanin.com/bridge/ingest
```

Gizli giriş açılınca `BRIDGE_TOKEN` değerini yapıştır. Ardından:

```sh
factoryos config webControl true
factoryos start --foreground
```

Birkaç saniye sonra panel canlı verileri alır. Gerçek OpenComputers HTTPS/Java sertifika uyumu ve Minecraft üretim kabulü ayrıca doğrulanmalıdır.

## Güncelleme ve kapatma

Önce anahtar dosyasını koruyarak yeni kodu çek, sonra yeniden derle:

```sh
git pull --ff-only
sudo docker compose --env-file .env.local up -d --build
```

Kapatmak için:

```sh
sudo docker compose --env-file .env.local down
```

Bu işlem oyun içindeki üretim işlerini iptal etmez. Relay yeniden başladığında gönderilmiş komutları tekrar yürütmez; güncel cihaz verisini bekler. Caddy sertifikaları named volume'larda tutulur; normal `down` bu volume'ları silmez.
