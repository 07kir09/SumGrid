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
