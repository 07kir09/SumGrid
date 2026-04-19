# Sum Grid

`Sum Grid` — браузерная логическая игра, где нужно отметить клетки так, чтобы суммы выбранных чисел в каждой строке и каждом столбце точно совпали с целями по краям поля.

## Что есть сейчас

- поля `4x4`, `5x5`, `6x6`, `7x7`
- выбор сложности
- подсказка, которая открывает одну правильную клетку
- подсчёт очков за раунд
- общий рейтинг игроков через backend API
- сохранение текущей партии локально в браузере
- сервер без внешних зависимостей на `Node.js`

## Стек

- `HTML`
- `CSS`
- `JavaScript` (ES modules)
- `Node.js` built-in `http` server
- JSON-файл как простое серверное хранилище результатов

## Как запустить

```bash
cd "/Users/kirillvoyakin/vs code/SumGrid"
npm start
```

После запуска приложение будет доступно по адресу:

```text
http://localhost:4173
```

Важно:

- общий рейтинг и уникальные ники работают только через backend
- если открыть `index.html` напрямую или через обычный статический хостинг без `server.js`, запросы `/api/*` будут падать
- если фронтенд крутится отдельно от backend, укажи URL сервера в `index.html` через `<meta name="sumgrid-api-root" content="https://your-backend.example.com">`
- для локальной разработки со статическим фронтом на другом порту backend можно держать на `http://localhost:4173`, сервер уже отдаёт CORS-заголовки

## Деплой: GitHub Pages + Render

Подготовлен вариант, где:

- фронтенд публикуется на GitHub Pages
- backend с API и leaderboard живёт отдельно на Render
- данные результатов и ников лежат на persistent disk

### 1. Деплой backend на Render

В репозитории уже есть [render.yaml](./render.yaml) и healthcheck `GET /api/health`.

Что сделать:

1. На Render создать новый Blueprint / Web Service из этого репозитория.
2. Подтвердить `render.yaml`.
3. Задать переменную `CORS_ALLOWED_ORIGINS`, например:

```text
https://07kir09.github.io,http://localhost:4173,http://localhost:5500,http://127.0.0.1:5500
```

4. Дождаться деплоя и сохранить backend URL, например:

```text
https://sum-grid-api.onrender.com
```

Важно:

- данные сохраняются в `DATA_DIR`, для Render это `/var/data`
- без persistent disk данные leaderboard будут теряться после redeploy/restart

### 2. Деплой фронтенда на GitHub Pages

В репозитории уже есть workflow [deploy-pages.yml](./.github/workflows/deploy-pages.yml) и build-скрипт [build-static.mjs](./scripts/build-static.mjs).

Что сделать в GitHub:

1. Открыть `Settings -> Pages`.
2. В `Source` выбрать `GitHub Actions`.
3. Открыть `Settings -> Secrets and variables -> Actions -> Variables`.
4. Добавить repository variable:

```text
SUMGRID_API_ROOT=https://sum-grid-api.onrender.com
```

После push в `main` workflow соберёт `dist/` и опубликует сайт в GitHub Pages.

### 3. Локальная сборка Pages-бандла

```bash
cd "/Users/kirillvoyakin/vs code/SumGrid"
SUMGRID_API_ROOT=https://sum-grid-api.onrender.com npm run build:pages
```

Сборка появится в `dist/`.

## Production env

Backend использует такие переменные окружения:

- `PORT` — порт сервера
- `HOST` — хост сервера
- `DATA_DIR` — папка для `leaderboard.json` и `players.json`
- `CORS_ALLOWED_ORIGINS` — список origin через запятую для frontend
- `SUMGRID_API_ROOT` — нужен только для сборки GitHub Pages

## Как работает рейтинг

- фронтенд отправляет завершённый результат на `POST /api/results`
- сервер сам пересчитывает очки по времени, сложности, размеру поля, ходам и подсказкам
- результаты сохраняются в `data/leaderboard.json`
- таблица лидеров приходит с `GET /api/leaderboard`

Важно: сейчас идентификация игрока идёт по имени, которое вводится в интерфейсе. Полноценной авторизации пока нет.

## API

### `GET /api/leaderboard`

Параметры:

- `playerName` — имя игрока, для которого вернуть текущую позицию
- `limit` — сколько строк leaderboard вернуть

Пример:

```text
/api/leaderboard?playerName=Kirill&limit=8
```

### `POST /api/results`

Тело запроса:

```json
{
  "playerName": "Kirill",
  "size": 5,
  "difficultyId": "classic",
  "moves": 31,
  "checks": 0,
  "hintsUsed": 1,
  "solutionRevealCount": 0,
  "elapsedMs": 154000,
  "boardId": "puzzle-abc123",
  "createdAt": "2026-04-18T18:00:00.000Z"
}
```

### `GET /api/profile/availability`

Пример:

```text
/api/profile/availability?nickname=Kirill
```

### `POST /api/profile/register`

Тело запроса:

```json
{
  "nickname": "Kirill",
  "limit": 8
}
```

### `GET /api/health`

Пример:

```text
/api/health
```

## Структура проекта

```text
SumGrid/
├─ assets/
├─ data/
├─ src/
│  ├─ api.js
│  ├─ constants.js
│  ├─ game.js
│  ├─ generator.js
│  ├─ main.js
│  ├─ scoring.js
│  ├─ storage.js
│  ├─ ui.js
│  └─ utils.js
├─ styles/
├─ index.html
├─ package.json
├─ README.md
└─ server.js
```
