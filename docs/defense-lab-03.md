# Захист ЛР №3 — сценарій до 5 хв

**0:00–0:35 — Що лишилося з попередніх ЛР.** «Це той самий Space Arena у тому самому GitHub-репозиторії. Fixed-step loop, корабель, кулі, World/Map, homing/pickup/колізії залишилися. Тепер ми відокремили мережеве завантаження асетів, звук і лобі від логіки симуляції».

**0:35–1:25 — Loading**. Оновити сторінку, показати прогрес-бар **у Canvas**, відкрити `public/assets/manifest.json` (4 PNG-спрайтшити, 3 WAV, JSON). «Паралельний `loadAll` з `Promise.all`, кожен файл дає один приріст progress; `boot` чекає `await`, але event loop не заблокований. 4xx не ретраємо, мережеві й 5xx ретраємо exponential backoff + jitter». Швидкий перехід до таблиці README: три виміри sequential vs concurrent з чітким застереженням, що це контрольований headless-тест із 20 мс затримкою, а не Mac Vite.

**1:25–2:20 — Lobby**. Показати `/api/rooms`, вводити callsign, обрати, наприклад, Nebula Run і Join. «`Lobby extends EventTarget`; інтервал 5 с, `AbortSignal.timeout` на кожен запит, `stop` очищає timer і abort; DOM окремий модуль, є `for await...of` для async event stream. До натискання Join гра не розпочинається».

**2:20–3:20 — Game + Audio**. WASD, Space, Shift+Space, зіткнення, pickup, показати HP/очки. «У `Game` тільки події `fired`,`hit`,`exploded`; Web Audio підписується окремо. WAV декодуються під час завантаження, але `AudioContext` розблоковується лише дією користувача».

**3:20–4:05 — Failure gallery**. Відкрити `/?failure=404` або `/?failure=json`, показати помилку та **Retry loading**; після Retry лобі знову доступне. Коротко пояснити різницю 404/timeout/abort/broken JSON.

**4:05–5:00 — Reflection (2–3 питання)**. Відповісти з `docs/reflection-lab-03.md`: три стани Promise; чому `await` не блокує JS; різниця `all`, `allSettled`, `race`, `any`; чому `AudioContext` лише після натискання Join. Якщо комісія просить — відкрити README і одну з п'яти головоломок порядку microtasks/tasks/rAF.

**Перед здачею:** `npm run format && npm run check`, браузерний запуск Vite, `git status`, `git tag -l`, успішні `git push origin main` та `git push origin lab-03`; у GitHub мають залишитися `lab-01`, `lab-02`, `lab-03`.
