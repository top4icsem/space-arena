# ЛР №4 — Reflection для захисту

1. **Node event loop:** `timers → pending → poll → check → close`; `process.nextTick` виконується перед Promise microtasks. `setTimeout(0)` та `setImmediate` не мають гарантованого порядку з головного модуля; у callback I/O `setImmediate` буде раніше.
2. **Node і файли:** JS-синхронні обчислення блокують основний потік; файлове I/O може виконуватися у worker pool libuv і повертати завершення до event loop.
3. **CommonJS/ESM:** `require()/module.exports` проти `import/export`, CommonJS завантажує синхронно, ESM дозволяє статичне зв'язування та top-level await; `import.meta.dirname` замінює `__dirname`.
4. **Backpressure:** `write()` повертає `false`, коли черга насичена. Потрібно чекати `drain` або довірити управління `pipeline`, інакше пам'ять безконтрольно зростатиме.
5. **Streams:** `Readable` читає; `Writable` пише; TCP socket — `Duplex` (читає та пише); `Transform` змінює потік, як наш JSON → NDJSON.
6. **WebSocket:** HTTP-клієнт надсилає `Upgrade: websocket`, сервер відповідає `101 Switching Protocols`; далі тривалий двосторонній зв'язок. Це дешевше за частий polling і підходить для чату/ігор.
7. **`error` без слухача:** `EventEmitter` кидає помилку, Node-процес може завершитися. В `Room`, WebSocket та stream є обробники; асинхронні помилки ловимо через `.catch`/`try`.
8. **Повільна мережа:** `socket.bufferedAmount` росте, якщо клієнт не встигає; відкидаємо некритичне або закриваємо сокет. Файлове читання `pipeline` природно сповільнюється.
9. **Валідація JSON:** будь-який сторонній клієнт може надіслати неправильні поля, версію, невідомий тип або дуже великий пакет. Сервер відхиляє, навіть якщо браузерний клієнт наш.

**Важливо:** у ЛР №4 мережеві лише кімнати, присутність і чат; синхронізація кораблів — ЛР №5.
