# express-drizzle-starter

> 🇬🇧 English version: [README.md](README.md)

Express + TypeScript + Drizzle (PostgreSQL) API iskeleti. pnpm monorepo: `apps/api` çalışır
durumda gelir, `apps/web` boştur — frontend framework'ünü proje başında sen seçersin.

Hazır gelenler: JWT auth (access + refresh, rotation ve çalınma tespitiyle), rol tabanlı yetki,
görsel yükleme (sharp ile WebP'ye dönüştürme), WebSocket, DB'ye yazan hata/yavaş istek logu,
dev için Docker Postgres, prod için Traefik'e bağlanan compose.

## Hızlı başlangıç

```bash
cp .env.example .env                              # JWT secret'larını değiştir
pnpm install
docker compose -f docker-compose.dev.yml up -d    # yalnız postgres
pnpm --filter shared build                        # api shared'ın dist'ini görmeli
pnpm --filter api db:migrate
pnpm dev                                          # api :3000
```

İlk kullanıcıyı oluştur:

```bash
pnpm --filter api user:create admin@example.com sifre123 "Admin" admin
```

Kontrol:

```bash
curl localhost:3000/api/v1/health
curl -X POST localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"sifre123"}'
```

## Komutlar

| Komut                                                       | Nerede | Ne yapar                                             |
| ----------------------------------------------------------- | ------ | ---------------------------------------------------- |
| `pnpm dev`                                                  | kök    | `dev` script'i olan tüm paketleri paralel çalıştırır |
| `pnpm build` / `pnpm check`                                 | kök    | tüm paketleri derler / tip kontrolü yapar            |
| `pnpm --filter api db:generate`                             | api    | şemadan yeni migration üretir                        |
| `pnpm --filter api db:migrate`                              | api    | bekleyen migration'ları uygular                      |
| `pnpm --filter api db:studio`                               | api    | Drizzle Studio'yu açar                               |
| `pnpm --filter api user:create <email> <parola> <ad> [rol]` | api    | kullanıcı oluşturur                                  |

## Klasör yapısı

```
apps/api/src/
├─ index.ts          bootstrap: http + ws + job'lar
├─ app.ts            express kurulumu (helmet, cors, static, rate-limit, errorHandler)
├─ router.ts         TÜM mount'lar tek dosyada, kitleye göre gruplu
├─ core/             modüle özel HİÇBİR şey yok
│  ├─ config/env.ts  zod ile doğrulanan env — hatalı deploy boot'ta patlar
│  ├─ db/            client, migrate, schema/ (tablolar), migrations/
│  ├─ http/          health + middleware (auth, errorHandler, rateLimit, requestLog, upload)
│  ├─ observability/ log YAZMA + budama job'ı
│  ├─ realtime/      WebSocket sunucusu
│  ├─ storage/       diske dokunan TEK dosya
│  └─ utils/         jwt, password, logger, refresh-token
└─ modules/          ürün kodu: auth/ example/ uploads/
packages/shared/src/ validators/ (zod) + api-client/ — frontend'le paylaşılan sözleşme
```

### İki kural (bozma)

1. **Modüller birbirine yalnız `index.ts`'ten erişir.** `modules/x/` içinden
   `modules/y/y.service.js` import edilmez, `modules/y/index.js` import edilir.
2. **`core` hiçbir modüle bağlı değildir.** Bir core dosyası bir modüle ihtiyaç duyuyorsa
   tasarım yanlıştır (örn. log yazma core'da, log okuma modülde olur).

### Modül iskeleti

```
modules/<ad>/
├─ <ad>.service.ts     DB'yle konuşan TEK katman
├─ <ad>.controller.ts  req/res + zod parse; try/catch YOK (Express 5 hatayı errorHandler'a atar)
├─ <ad>.routes.ts      yalnız path ↔ handler + middleware
├─ public.routes.ts    (opsiyonel) aynı modülün anonim yüzeyi — servis ve şema tek kopya kalır
└─ index.ts            modülün public API'si
```

Yeni modül = `modules/example/`'ı kopyala, `router.ts`'e bir import + bir mount satırı ekle.

## Veritabanı

Tablolar `apps/api/src/core/db/schema/` altında, dosya başına bir tablo; `index.ts` hepsini
re-export eder ve `drizzle.config.ts`'in girişidir — barrel'da olmayan tablo `db:generate`
için yoktur.

SQL elle yazılmaz:

```bash
# 1. schema/<tablo>.ts dosyasını yaz veya düzenle, index.ts'e ekle
pnpm --filter api db:generate    # 2. SQL + meta snapshot üretilir
pnpm --filter api db:migrate     # 3. uygulanır
```

Migration'lar sıralıdır, atlanmaz, geri alınmaz — geri dönüş yeni bir migration'la yapılır.
Üretilen `.sql` dosyasını uygulamadan önce oku: Drizzle bir sütun yeniden adlandırmasını
bazen "drop + add" olarak çözer ve bu veri kaybıdır.

Silme yerine pasifleştirme (`is_active`) tercih edilir; geçmiş kayıtlar ve onlara bağlı satırlar
korunur.

## Auth

Tek kullanıcı evreni (`users` tablosu), `role` ile ayrılan yetki. Access token 15 dakika,
refresh 30 gün ve **DB'de izlenir**:

- Her refresh'te rotation — eski satır `used_at` ile yakılır, yeni satır açılır.
- Kullanılmış bir token tekrar gelirse çalınma sayılır ve `family_id`'deki tüm token'lar iptal
  edilir. 10 saniyelik grace penceresi yarışları (kopan bağlantı, ikinci sekme) çalınma
  saymaz.
- Logout aileyi komple revoke eder; parola değişimi kullanıcının TÜM token'larını iptal eder
  ama isteği yapan sekmeye taze bir çift döner.

Bu deseni bozma: refresh ucuna cache veya otomatik retry koymak reuse tespitini yanlış tetikler.

Uçlar: `POST /api/v1/auth/{register,login,refresh,logout}`, `GET|PATCH /api/v1/auth/me`.
Kayıt açık olsun istemiyorsan `auth.routes.ts`'ten `register` satırını sil — kullanıcıları
`user:create` ile ekle.

## Yükleme

`POST /api/v1/uploads/image` (token gerekli, multipart alan adı `file`) görseli sharp ile
WebP'ye çevirip `<UPLOAD_DIR>/<userId>/` altına yazar ve public URL döner. Yeniden kodlama
EXIF'i (konum verisi!) siler ve dosyanın gerçekten görsel olduğunu garantiler.

Diske dokunan tek dosya `core/storage/storage.service.ts` — S3'e geçiş o dosyayı değiştirmekle
sınırlı kalmalı. **Prod'da `uploads` volume'ünün yedeği `pgdata` kadar önemlidir: dosyalar DB
dump'ında yoktur.**

## Loglar

Yalnız ilgi çeken istekler `app_logs` tablosuna yazılır: hata (>= 400) veya yavaş (>= 3 sn).
Başarılı ve hızlı istekler hiçbir şey yazmaz, mekanizmanın maliyeti bu yüzden sıfıra yakındır.
Süresi dolmuş token'dan gelen rutin 401'ler bilinçli olarak atlanır; `/login` ve `/refresh`
401'leri güvenlik olayı olduğu için tutulur. Kayıtlar 14 gün sonra günlük bir job'la silinir.

Logları panelden okumak istersen okuma tarafı bir MODÜL olur (`modules/observability/`),
core'a eklenmez.

## Frontend eklemek

`apps/web` boştur. Framework'ü içine kur, `package.json`'ında `"name": "web"` ve bir `dev`
script'i olsun — kökteki `pnpm dev` (`pnpm --parallel -r dev`) onu kendiliğinden çalıştırır.

Örnek (SvelteKit):

```bash
cd apps/web && pnpm create svelte@latest .
pnpm add shared@workspace:*
```

`vite.config.ts`'e proxy ekle (dev'de reverse proxy gerekmesin diye):

```ts
server: {
  proxy: {
    "/api": "http://localhost:3000",
    "/ws": { target: "ws://localhost:3000", ws: true }
  }
}
```

Sonra `shared`'daki istemciyi kullan:

```ts
import { createApiClient } from "shared";
const api = createApiClient({ baseUrl: "", getAccessToken: () => session.accessToken });
const { items } = await api.examples.list({ page: 1 });
```

Birden fazla frontend gerekiyorsa (ör. `apps/admin`) aynı deseni kopyala: yeni klasör, farklı
port, `docker-compose.yml`'de yeni servis + Traefik router'ı.

## Prod deploy

`docker-compose.yml` VPS'te zaten çalışan, harici `traefik-net` ağına sahip bir Traefik
instance'ı varsayar — Traefik'i kendisi başlatmaz. Entrypoint `https`, cert resolver
`letsencrypt`; seninkiler farklıysa label'ları değiştir.

```bash
cp .env.example .env      # DOMAIN, DB_*, JWT_* → gerçek değerler
docker compose up -d --build
docker compose exec api node dist/core/db/migrate.js
```

Postgres yalnız `internal` ağında; dışarıdan ve Traefik'ten erişilemez. Yüklenen dosyalar
`uploads` volume'ünde kalıcıdır.

## Commit'ler

Conventional Commits — `<tip>(<kapsam>): <konu>`. Küçük harf, emir kipi ve İngilizce ("add",
"added" değil), sonda nokta yok, ~72 karakteri geçmesin.

| Tip        | Ne zaman                                                          |
| ---------- | ----------------------------------------------------------------- |
| `feat`     | yeni endpoint, modül, sayfa ya da kullanıcıya görünen bir yetenek |
| `fix`      | zaten çalışan bir şeydeki hata                                    |
| `docs`     | README, CLAUDE.md, yorumlar                                       |
| `refactor` | davranış aynı, kod farklı                                         |
| `chore`    | bağımlılık, config, araç gereç, ölü kod silme                     |
| `build`    | Dockerfile, compose, tsconfig — build'in kendisi                  |
| `test`     | sadece test                                                       |
| `style`    | sadece biçim, mantık yok (prettier çalıştırmak)                   |
| `perf`     | hız için yapılan değişiklik                                       |

Kapsam, commit'in dokunduğu yer: `api`, `web`, `shared`, `db` — ya da daha darsa modül adı:
`notes`, `auth`, `uploads`.

```
feat(notes): add the notes module with CRUD endpoints
feat(db): add notes table and note_color enum
feat(shared): add note types, constants and api-client service
feat(web): add the /notes route
fix(notes): stop a title-only PATCH from resetting the colour
fix(auth): clear the refresh cookie on the path it was set on
chore: remove the example module
chore(deps): bump drizzle-orm to 0.45.2
docs: rewrite the README for the practice-apps layout
build(docker): pin the postgres image to 16.4
```

Yeni bir uygulama tek commit değil, birkaç commit olarak iniyor — shared sözleşmesi, tablo ve
migration, modül, frontend route'u. Her biri kendi başına build olmalı.

## Yapay zeka araçlarıyla çalışma (CLAUDE.md)

Repo kökündeki [CLAUDE.md](CLAUDE.md) bu iskeletin kurallarını (modül sınırları, Express 5'te
try/catch yazılmaması, migration akışı, refresh token deseni) makine tarafından okunacak biçimde
tutar. Dosya İngilizce; Türkçesi [CLAUDE.TR.md](CLAUDE.TR.md)'de duruyor — araçlar `CLAUDE.md`'yi
okuduğu için kural değiştiğinde ikisi birden güncellenmeli.

- **Claude Code kullanıyorsan** hiçbir şey yapmana gerek yok: dosya her oturumda otomatik
  okunur.
- **Başka bir araç kullanıyorsan** (Cursor, Copilot, Codex, Gemini…) bu dosya kendiliğinden
  yüklenmez. İçeriğini kopyalayıp o aracın kendi kural dosyasına koy — `.cursor/rules/`,
  `.github/copilot-instructions.md`, `AGENTS.md`, `GEMINI.md` ya da aracın istediği her ne ise.
  Kuralları tek yerde tutmak istersen o dosyada `CLAUDE.md`'ye atıfta bulunmak yerine içeriği
  gerçekten kopyala; çoğu araç referans verilen dosyayı kendiliğinden açmaz.
- **Hiç yapay zeka kullanmıyorsan** dosyayı yine de oku: iskeletin neden böyle kurulduğunu
  anlatan en kısa metin odur.

Kuralları değiştirdiğinde `CLAUDE.md`'yi de güncelle — eskimiş bir kural dosyası hiç olmamasından
kötüdür.

## İskeleti kendine uydurma listesi

- [ ] `package.json` ve `docker-compose.yml`'de proje adını değiştir (`name: app`,
      `container_name: app_*`, `traefik.http.routers.app-*`)
- [ ] `.env`'de gerçek `DOMAIN` ve rastgele JWT secret'ları
- [ ] `modules/example/`, `schema/examples.ts`, `validators/example.ts`,
      `api-client/example.service.ts` → sil veya ilk gerçek modülüne dönüştür
- [ ] İhtiyacın yoksa `core/realtime/` (WebSocket) veya `core/storage/` + `modules/uploads/`
      klasörlerini sil
- [ ] `apps/web`'e framework kur, compose'daki `web` servisini aç
- [ ] Claude Code dışında bir yapay zeka aracı kullanacaksan `CLAUDE.md`'yi o aracın kural
      dosyasına kopyala
