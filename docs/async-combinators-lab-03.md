# Promise combinators — швидка шпаргалка (ЛР №3)

`Promise` — стан `pending`, `fulfilled` або `rejected`. `.then` приймає результат, `.catch` обробляє відхилення, `.finally` працює в обох результатах; `await` під капотом очікує promise без блокування JS-thread.

```js
const good = Promise.resolve('OK');
const bad = Promise.reject(new Error('offline'));

await Promise.all([good, Promise.resolve(2)]);
// ['OK', 2] — усі мають виконатися, інакше reject першої помилки

await Promise.allSettled([good, bad]);
// [{status:'fulfilled',value:'OK'}, {status:'rejected',reason: Error('offline')}]

await Promise.race([good, new Promise((r) => setTimeout(() => r('late'), 100))]);
// 'OK' — перший fulfilled АБО rejected

await Promise.any([bad, good]);
// 'OK' — перший fulfilled; якщо всі rejected => AggregateError
```

**У проєкті:** `Promise.all` — файловий pipeline `loadAll` (один зламаний критичний файл зупиняє старт), `Promise.race` — очікування наступного оновлення лобі vs таймера в `async *updates`. `allSettled` підходить для необов'язкових аналітичних probes, де треба бачити всі помилки; `any` — для резервних дзеркал assets/API. Ми **не** замінюємо `all` на `allSettled` в обов'язковому pipeline: інакше симуляція могла б запуститися з відсутніми PNG або звуками.

Різниця між callbacks, `.then` і `async/await`:

```js
// Callback у вигляді браузерного event handler:
button.addEventListener('click', () => console.log('clicked'));
// Promise consumer:
fetch('/api/rooms')
  .then((response) => response.json())
  .then(console.log)
  .catch(console.error);
// Та сама концепція в синтаксисі async/await:
async function getRooms() {
  try {
    const response = await fetch('/api/rooms');
    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}
```

При `throw` всередині `.then` наступний promise отримує rejection. Після `await` код функції продовжується в microtask; `setTimeout` виконується в наступному task; rAF — перед рендером браузера.
