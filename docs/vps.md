# Ubuntu / Debian VPS kurulumu

Panel Minecraft'ın içindeki bilgisayarda değil, VPS üzerinde bir Node uygulaması olarak çalışır. Aynı VPS Minecraft sunucusunu da barındırabilir. Bu rehber Docker Compose ve Caddy ile tek süreç relay'i yayımlar; henüz gerçek bir VPS'e uygulanmadı.

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

## 3. Anahtarları oluştur

Komuttaki `panel.seninalanin.com` değerini **kendi alan adınla değiştir**. Aşağıdaki blok yeni kurulum içindir; `.env.local` zaten varsa dosyayı değiştirmeden önce mevcut yapılandırmayı inceleyin. İki farklı rastgele anahtar üretilir ve yalnızca VPS'te dosyaya yazılır:

```sh
test ! -e .env.local || { echo '.env.local zaten var; kurulum durduruldu.'; exit 1; }
umask 077
printf 'PANEL_DOMAIN=panel.seninalanin.com\nBRIDGE_TOKEN=%s\nPANEL_TOKEN=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > .env.local
```

`openssl` kurulu olmalıdır. Gizli anahtarları Git'e veya sohbete göndermeyin. `PANEL_TOKEN` panel oturumu içindir; `BRIDGE_TOKEN` yalnızca oyun sunucusundaki eşleştirme girişine verilir. Dosyayı kendi terminalinde görüntülemek için `cat .env.local` kullanabilirsin.

## 4. Derle ve aç

```sh
sudo docker compose --env-file .env.local up -d --build
sudo docker compose --env-file .env.local ps
sudo docker compose --env-file .env.local logs --tail=80 panel caddy
```

Tarayıcıdan `https://panel.seninalanin.com` adresini açıp **Bağlantı kur** düğmesinde `PANEL_TOKEN` değerini gir. Panel ve relay aynı container'da çalışır. Panelin 3000 portu public olarak yayımlanmaz; yalnızca Caddy erişir. Container içindeki HOST değeri 0.0.0.0 olarak ayarlanır, `.env.local` içindeki eski yerel HOST değeri bunu değiştirmez.

## 5. OpenComputers'ı eşleştir

Oyun içindeki Factory Server'da **FactoryOS v0.6.0** ve Internet Card bulunmalıdır. v0.6.0 oyun kaynakları ayrı `factory-os` deposundadır; yayımlanmamış bir sürüm F5/F6 ile indirilemez.

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
