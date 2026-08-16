# CLAUDE.TR.md

> 🇬🇧 English version: [CLAUDE.md](CLAUDE.md) — araçların otomatik okuduğu dosya odur; burası
> insan okuru için çeviridir. Kuralları değiştirdiğinde İKİSİNİ birden güncelle.

Bu dosya, bu repo üzerinde çalışırken Claude Code'a rehberlik eder. Kurulum ve komutlar
README-TR.md'de; burada yalnız KURALLAR var.

## Proje

Express + TypeScript + Drizzle (PostgreSQL) API iskeleti, pnpm monorepo. `apps/api` çalışır
durumda; `apps/web` boştur (framework proje başında seçilir), `packages/shared` iki uç arasındaki
zod sözleşmesini ve API istemcisini tutar.

## Stack

| Katman  | Seçim                                                                             |
| ------- | --------------------------------------------------------------------------------- |
| Backend | Express 5 + `ws` + REST (`/api/v1/*`), TypeScript, ESM (`.js` uzantılı import)    |
| DB      | PostgreSQL 16 + Drizzle ORM                                                       |
| Auth    | JWT Bearer (access 15 dk + refresh 30 gün, DB'de izlenir), rol: `admin` \| `user` |
| Deploy  | Docker Compose; Traefik compose'da DEĞİL, VPS'teki paylaşılan instance            |

## API'nin iç düzeni (modül-birinci)

`apps/api/src` katmana göre değil MODÜLE göre bölünür — bir işi yaparken tek klasör açılır.

```
src/
├─ index.ts   bootstrap (http + ws + job'lar)
├─ app.ts     express kurulumu
├─ router.ts  TÜM mount'lar, kitleye göre gruplu (anonim / authenticated / admin)
├─ core/      modüle özel HİÇBİR şey yok: config, db, http/middleware, observability
│             (log YAZMA), realtime, storage, utils
└─ modules/   auth/ example/ uploads/
```

Modül içi iskelet: `<ad>.service.ts` (DB'yle konuşan tek katman) + `<ad>.controller.ts` +
`<ad>.routes.ts` + `index.ts`. Bir modül birden fazla kitleye hizmet ediyorsa HTTP yüzeyi dosya
adıyla ayrılır (`public.routes.ts`); servis ve şema tek kopya kalır.

**İki kural (asla ihlal etme):**

1. **Modüller birbirine yalnız `index.ts`'ten erişir.** `modules/x/` içinden
   `modules/y/y.service.js` import edilmez.
2. **`core` hiçbir modüle bağlı değildir.** Bir core dosyası modüle ihtiyaç duyuyorsa tasarım
   yanlıştır (log yazma core'da, log okuma modülde).

`routes` yalnız path↔handler + middleware bağlar; `controller` req/res işler (zod parse dahil)
ve servisi çağırır. **Express 5: async handler'daki hata otomatik errorHandler'a düşer,
controller'da try/catch YAZILMAZ.** Servisler hata için `HttpError` fırlatır (mesaj sabit bir
KOD'dur, serbest metin `detail`'e gider).

Validator'lar zod ile ve mümkünse `packages/shared`'dan import edilir — sözleşme frontend'le
paylaşılır, modüle taşınmaz.

## Veritabanı

- Tablolar `core/db/schema/<tablo-adi>.ts`, her dosyada bir tablo, hepsi `schema/index.ts`'ten
  re-export edilir (drizzle-kit'in girişi budur).
- **SQL elle yazılmaz:** şema düzenlenir → `pnpm --filter api db:generate` → üretilen SQL okunur
  → `db:migrate`. Migration'lar sıralı, atlama yok, rollback yok; geri dönüş yeni migration'la.
- Enum listeleri `shared`'da tanımlanır, `pgEnum` onları kullanır — tip iki uçta ayrışamaz.
- Silme yerine pasifleştirme (`is_active`).

## Baştan kabul edilen kurallar

- Public (auth'suz) her uç rate-limit'li ve sıkı doğrulamalı olmak zorunda; yanıt gövdesi
  gereğinden fazla alan içermez.
- Sahiplik her sorgunun filtresidir — bir satır yalnız id ile erişilebilir olmamalı. Başkasının
  satırı için 403 değil 404 döner (varlığını sızdırma).
- Refresh token deseni bozulmadan korunur: rotation + reuse detection + family revoke.
  Refresh ucuna cache/retry konmaz.
- Tutar/kritik hesap yalnız sunucuda, transaction içinde; istemciden gelen hesaplanmış değere
  güvenilmez.
- Diske dokunan tek dosya `core/storage/storage.service.ts`.
- Tek API instance varsayımı (WS state in-memory) — ölçek gerekirse önce Redis pub/sub.
- Yüklenen dosyalar `UPLOAD_DIR` altında; prod'da volume yedeklemesi pgdata kadar önemli.

## Commit'ler

Conventional Commits — `<tip>(<kapsam>): <konu>`. Küçük harf, emir kipi, İngilizce, sonda nokta
yok, ~72 karakteri geçmesin. Tipler: `feat` `fix` `docs` `refactor` `chore` `build` `test`
`style` `perf`. Kapsam: `api`, `web`, `shared`, `db` ya da daha darsa modül adı.

```
feat(notes): add the notes module with CRUD endpoints
fix(auth): clear the refresh cookie on the path it was set on
chore(deps): bump drizzle-orm to 0.45.2
```

Bunları önermek beklenen bir şey (bkz. çalışma anlaşması). Diff'in gerçekte ne yaptığını anlat —
dosya adlarını tekrar etmek yerine önce diff'i oku. Yeni bir uygulama birkaç commit halinde
iniyor (shared sözleşmesi, tablo + migration, modül, frontend route'u); staged değişiklik
bunlardan birden fazlasını kapsıyorsa bölmeyi öner.

## Geliştirme

Claude Code dev server'ları kendiliğinden başlatmaz — `pnpm dev`'i kullanıcı kendi terminalinde
çalıştırır. Doğrulama için çalışan sunucu gerekiyorsa önce port kontrol edilir
(`lsof -nP -iTCP:3000 -sTCP:LISTEN`), kapalıysa kullanıcıya sorulur.
