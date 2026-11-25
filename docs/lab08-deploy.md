# ЛР №8 — Docker, публічна гра, продакшн-режим

Цей файл — покрокова інструкція для **того самого** репозиторію `top4icsem/space-arena`.

## 1. Встановлення ZIP-доповнення

1. Закрий сервери, які займають 3000/5173: `lsof -nP -iTCP:3000 -sTCP:LISTEN` та аналогічно для 5173. Для своїх старих процесів — `kill PID`.
2. Переконайся, що зміни ЛР №7 закомічені: `git status`.
3. Розпакуй ZIP у **корінь попереднього проєкту**, щоб поруч із `package.json` був `apply-lab08.mjs` і `.lab08_patch/`.
4. З кореня виконай:

```bash
node apply-lab08.mjs
npm install --include=optional
npm run format
npm run check
CI=true npm run test:e2e
```

Зміни не зачіпають `.git` і старі теги. Якщо `npm run check` не пройшов, НЕ пушити до виправлення.

## 2. Перевірка Docker Desktop (macOS)

Встанови Docker Desktop і переконайся, що він запущений (команда `docker info`). Потім:

```bash
npm run test:docker
# перевіряє двоетапну збірку, image <200 MB, /health, /ready, /metrics і docker stop <10s

docker compose up -d --build
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/ready
curl -s http://127.0.0.1:3000/metrics

docker compose logs --tail=15
# У кінці вимкнути локальний запуск:
docker compose down
```

У фінальному образі `node:22-alpine`, без dev-залежностей, користувач `node`, `HEALTHCHECK`, `CMD ["node", ...]` без npm-обгортки. `BUILD_SHA` задається під час збірки і відображається в `/health`. Розмір перевіряється скриптом: не стверджуй, що <200 MB, поки перевірка не завершилася.

## 3. Безпека WebSocket та метрики

- У production **обов'язково** задай `ALLOWED_ORIGINS` — список точних HTTPS origin, наприклад `https://my-space-arena.fly.dev`. `*`, slash після домену, довільні HTTP-запити від інших Origin відхиляються.
- Ліміт TCP-підключень для IP — `MAX_CONNECTIONS_PER_IP`, за замовчуванням 8. Не довіряємо довільному `X-Forwarded-For`: інакше зловмисник обійшов би захист. На хостингах із shared reverse-proxy потрібне додаткове налаштування довірених proxy-IP, це обмеження.
- Розміри пакета, rate-limit, Zod, авторитетна фізика — з попередніх робіт.
- Логи Node в stdout — pino JSONL; id кімнати / гравця пишуться для join/leave/chat, **текст чату й ключі не записуються в pino**. Історичний NDJSON match replay із ЛР №4 окремий.
- `GET /health` — доступність процесу, `sha`, `tag` і uptime; `GET /ready` — 200 поки приймаємо гравців, 503 коли закриваємося; `GET /metrics` — Prometheus text (безкоштовний endpoint); `GET /api/perf` — JSON для попередніх лабораторних.
- Метрики: активні гравці й кімнати, 5-секундне усереднення повідомлень/байтів за секунду, tick p50/p95/p99, event loop utilization/delay, RSS/heap.
- На SIGTERM не приймаємо нові клієнти, надсилаємо WS `shutdown`, закриваємо WS із кодом 1001, дочікуємося NDJSON і виходимо 0. Аварійний крайній строк — 9 секунд.

## 4. Деплой: GHCR + Fly.io

Потрібен користувацький Fly.io акаунт і власна назва застосунку. Це **не може** бути створено лише розпакуванням ZIP.

1. Встанови Fly CLI за офіційною інструкцією (https://fly.io/docs/flyctl/install/), авторизуйся.
2. Створи унікальний Fly app, наприклад `space-arena-<твій-суфікс>`: `flyctl apps create <назва>`.
3. Для створеного застосунку задай секрет Origin **саме твого HTTPS URL**:

```bash
flyctl secrets set --app <назва> ALLOWED_ORIGINS=https://<назва>.fly.dev
```

4. У GitHub `Settings → Secrets and variables → Actions` створи **Repository secret** `FLY_API_TOKEN` (отримай його через `flyctl auth token` — ніколи не коміть!) і **Repository variable** `FLY_APP_NAME` зі значенням назви app.
5. Перед деплоєм зроби публічним GHCR package (якщо потрібно для Fly pull) у налаштуваннях пакета. У workflow образ буде `ghcr.io/top4icsem/space-arena:v1.0.0`.
6. Після того як **всі тести локально пройшли** й робота готова:

```bash
git add -A
git commit -m "Lab 08: production Docker, metrics, shutdown, PWA and release"
git push origin main
git tag lab-08
git tag v1.0.0
git push origin lab-08
git push origin v1.0.0
```

Теги мають вказувати на ОДИН І ТОЙ САМИЙ фінальний коміт. CI на `v*` запускає перевірки, збирає образ у GHCR **лише після успіху**, а за наявності `FLY_APP_NAME` + `FLY_API_TOKEN` запускає деплой з цим образом. Без секрету Fly публікація в GHCR відбудеться, але публічна адреса ще не працюватиме — це потрібно завершити окремо.

7. Підтверди SHA:

```bash
git rev-list -n 1 v1.0.0
curl -s https://<назва>.fly.dev/health
```

Значення `sha` має дорівнювати SHA коміту з тегу. Відкрий `https://<назва>.fly.dev` і в Chrome DevTools → Network → WS перевір `wss://<назва>.fly.dev/ws` (не `ws://`). Для перевірки Origin спробуй інший `Origin`: сервер має повернути 403.

**Одна кімната = один процес**: цей навчальний сервер зберігає матчі в пам'яті. Не запускай кілька незалежних інстансів без sticky sessions та зовнішнього room-state, інакше гравці роз'їдуться по різних кімнатах.

## 5. Фактичні мережеві виміри та докази

- Двоє реальних гравців із **різних** інтернет-мереж (наприклад домашній Wi‑Fi та мобільна мережа) одночасно входять до тієї самої кімнати, бачать рух і повідомлення.
- В обох браузерах DevTools Console: `window.__spaceArenaDebug.getNetwork().stats.rtt` (мс). Запиши **фактичні** RTT з кожного пристрою у README, не вигадуй числа.
- Скрін Chrome DevTools → Network → WS показує `wss://`, збережи в `docs/`.
- Запиши 3–5-хвилинне відео з двома клієнтами, `/metrics`, `docker stop`, PWA-інсталяцією та GitHub CI.
- Для відмови сервера на локальній копії: два браузери у матчі, `docker stop <id>`; клієнти повинні повернутися в лобі. Для насильного kill перевір окремо `docker kill <id>`.
- `npm run fault:frames` створює некоректні WS пакети; 1008/1009 означає відключення. Перевір p99 іншої кімнати до і після (`/api/perf`) й запиши фактичні дані.
- Перевір PWA: Chrome Android → меню → Install app/Add to Home screen. На iOS Safari → Share → Add to Home Screen. Офлайн гра не працює — потрібен сервер; service worker кешує лише оболонку й assets.

## 6. Контрольний список для здачі

[ ] `npm run check` зелений; `CI=true npm run test:e2e` зелений

[ ] `npm run test:docker` зелений, скрін реального розміру image і часу docker stop

[ ] GitHub Actions зелений за `v1.0.0`, package в GHCR

[ ] Дійсна `https://` адреса і WebSocket `wss://` через proxy

[ ] Два гравці з різних мереж, RTT таблиця в README

[ ] README містить GIF, схему, таблиці ЛР5/7, обмеження, відео

[ ] Теги `lab-08` та `v1.0.0`

[ ] Відео 3–5 хв та короткий п'ятихвилинний захист
