# Transfer Channel RSS

Система зеркалирования Telegram-канала на российские платформы с кросспостингом и PWA.

Решает проблему блокировки Telegram в РФ: контент канала автоматически парсится, публикуется как статический сайт и дублируется в VK, Дзен, OK и email-рассылку.

## Архитектура

```
GitHub Actions (cron каждые 15 мин, серверы за рубежом)
│
├─ 1. Парсит t.me/s/CHANNEL через cheerio
│     Сохраняет посты → data/posts.json
│
├─ 2. Кросспостит новые посты:
│     ├─ VK API (wall.post)
│     ├─ Яндекс.Дзен (Publisher API)
│     ├─ OK / Max (mediatopic.post)
│     └─ Email (SMTP Yandex/Mail.ru)
│
├─ 3. Отправляет Web Push уведомления
│
├─ 4. Собирает Astro SSG → dist/
│
└─ 5. Пушит в зеркала:
      ├─► GitHub Pages (PWA + Push)
      └─► SourceCraft Sites (RU-инфра)
```

### Почему так

| Компонент       | Где                    | Почему                                          |
| --------------- | ---------------------- | ----------------------------------------------- |
| Парсер Telegram | GitHub Actions         | t.me заблокирован в РФ, нужен сервер за рубежом |
| Сайт (PWA)      | GitHub Pages           | Поддерживает Service Worker, PWA install, push  |
| Зеркало         | SourceCraft Sites      | Яндекс-инфра, гарантированный доступ из РФ      |
| Кросспост       | GitHub Actions         | Выполняется вместе с парсингом, один пайплайн   |
| Push-сервер     | SourceCraft Serverless | Хранит подписки, доступен из РФ                 |

## Быстрый старт

### 1. Форкни репо

```bash
git clone https://github.com/vakovalskii/transfer-channel-rss.git
cd transfer-channel-rss
pnpm install
```

### 2. Настрой канал

```bash
cp .env.example .env
# Отредактируй .env — минимум нужен CHANNEL
```

### 3. Загрузи посты

```bash
CHANNEL=your_channel pnpm run fetch
```

Парсер загрузит посты с `t.me/s/your_channel` и сохранит в `data/posts.json`.

### 4. Собери сайт

```bash
pnpm run build
```

Astro сгенерирует статику в `dist/`. Готово к деплою.

### 5. Запусти локально

```bash
pnpm run preview
```

## Структура проекта

```
├── scripts/
│   ├── fetch-channel.ts       # Парсер Telegram → JSON
│   ├── send-push.ts           # Отправка Web Push уведомлений
│   └── crosspost/
│       ├── vk.ts              # Кросспост в VK
│       ├── dzen.ts            # Кросспост в Дзен
│       ├── ok.ts              # Кросспост в OK (Max)
│       └── email.ts           # Email-рассылка (SMTP)
│
├── src/
│   ├── lib/
│   │   └── data.ts            # Чтение постов из data/posts.json
│   ├── pages/                 # Astro SSG страницы
│   ├── components/            # UI компоненты
│   └── layouts/               # Layouts с PWA-баннером
│
├── data/
│   ├── posts.json             # Все посты канала
│   ├── channel.json           # Метаданные канала
│   ├── new-posts.json         # Новые посты (для кросспоста)
│   └── posted.json            # Трекер кросспоста
│
├── push-server/               # Push subscription API (Serverless)
│   ├── index.ts
│   └── Dockerfile
│
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service Worker (push + offline)
│   └── pwa.js                 # PWA install logic
│
├── dist/                      # Собранный статический сайт
│
├── .github/workflows/
│   ├── sync.yml               # Cron: парсинг + кросспост + деплой
│   └── pages.yml              # GitHub Pages деплой
│
├── .sourcecraft/
│   └── sites.yaml             # SourceCraft Sites конфиг
│
├── Dockerfile.site            # Nginx-контейнер (PWA-совместимый)
├── nginx.conf                 # Nginx с правильным CSP для SW
└── astro.config.mjs           # Astro SSG конфигурация
```

## Как работает парсинг

```
t.me/s/CHANNEL → HTML → cheerio → posts.json
```

Скрипт `scripts/fetch-channel.ts`:

1. Загружает публичный веб-превью канала (`https://t.me/s/CHANNEL`)
2. Парсит HTML через cheerio (тексты, изображения, видео, стикеры, реакции)
3. Сравнивает с существующим `data/posts.json`
4. Добавляет новые посты, сохраняет `data/new-posts.json` для кросспоста

Поддерживает пагинацию — `MAX_PAGES=10` загрузит до 10 страниц истории.

## Как работает кросспост

После парсинга скрипты из `scripts/crosspost/` берут `data/new-posts.json` и отправляют в каждую платформу. Трекер `data/posted.json` предотвращает дубликаты.

| Платформа | API               | Env-переменные                                                  |
| --------- | ----------------- | --------------------------------------------------------------- |
| VK        | `wall.post`       | `VK_TOKEN`, `VK_GROUP_ID`                                       |
| Дзен      | Publisher API     | `DZEN_TOKEN`                                                    |
| OK        | `mediatopic.post` | `OK_ACCESS_TOKEN`, `OK_GROUP_ID`, `OK_APP_KEY`, `OK_APP_SECRET` |
| Email     | SMTP              | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`              |

## PWA и Push-уведомления

Сайт на GitHub Pages работает как PWA:

- Баннер "Установить" появляется автоматически
- Service Worker кэширует страницы для офлайн-доступа
- Web Push уведомления о новых постах (требует push-сервер)

Push-сервер (`push-server/`) — минимальный API:

- `POST /api/subscribe` — сохранить подписку
- `POST /api/unsubscribe` — удалить подписку
- `GET /api/subscriptions` — список подписок (auth)

## GitHub Actions

### sync.yml (каждые 15 мин)

```
fetch → crosspost → push-notify → build → commit → push mirrors
```

### pages.yml (при пуше в main)

Деплоит `dist/` на GitHub Pages.

## Переменные окружения

### Обязательные

| Переменная | Описание                 |
| ---------- | ------------------------ |
| `CHANNEL`  | Username Telegram-канала |

### Кросспост (опционально)

| Переменная        | Описание                     |
| ----------------- | ---------------------------- |
| `VK_TOKEN`        | Токен группы VK              |
| `VK_GROUP_ID`     | ID группы VK                 |
| `DZEN_TOKEN`      | Токен Дзен Publisher         |
| `OK_ACCESS_TOKEN` | Токен OK API                 |
| `OK_GROUP_ID`     | ID группы OK                 |
| `OK_APP_KEY`      | Ключ приложения OK           |
| `OK_APP_SECRET`   | Секрет приложения OK         |
| `SMTP_HOST`       | SMTP сервер (smtp.yandex.ru) |
| `SMTP_USER`       | Email отправителя            |
| `SMTP_PASS`       | Пароль SMTP                  |

### Push-уведомления

| Переменная          | Описание                       |
| ------------------- | ------------------------------ |
| `VAPID_PUBLIC_KEY`  | Публичный VAPID-ключ           |
| `VAPID_PRIVATE_KEY` | Приватный VAPID-ключ           |
| `PUSH_SERVER_URL`   | URL push-сервера               |
| `API_SECRET`        | Секрет для доступа к подпискам |

### Зеркала

| Переменная          | Описание                  |
| ------------------- | ------------------------- |
| `SOURCECRAFT_TOKEN` | Токен SourceCraft         |
| `SOURCECRAFT_REPO`  | Репо в формате `org/repo` |

### Сайт

| Переменная  | По умолчанию             | Описание           |
| ----------- | ------------------------ | ------------------ |
| `LOCALE`    | `ru`                     | Язык               |
| `TIMEZONE`  | `Europe/Moscow`          | Часовой пояс       |
| `REACTIONS` | `true`                   | Показывать реакции |
| `TAGS`      |                          | Теги через запятую |
| `SITE_URL`  |                          | Базовый URL сайта  |
| `BASE_PATH` | `/transfer-channel-rss/` | Base path          |

## Для AI-агентов

Этот репо структурирован для понимания AI-агентами:

1. **Парсинг**: `scripts/fetch-channel.ts` — единственная точка входа для получения данных из Telegram
2. **Данные**: всё в `data/*.json` — посты, метаданные, трекеры
3. **Сайт**: стандартный Astro SSG, данные читаются через `src/lib/data.ts`
4. **Кросспост**: каждая платформа в отдельном файле `scripts/crosspost/*.ts`, общий формат
5. **CI/CD**: `.github/workflows/sync.yml` — полный пайплайн в одном файле

Для добавления новой платформы кросспоста:

1. Создай `scripts/crosspost/platform.ts` по образцу `vk.ts`
2. Добавь скрипт в `package.json`
3. Добавь шаг в `.github/workflows/sync.yml`
4. Добавь env-переменные в GitHub Secrets

## Основано на

[BroadcastChannel](https://github.com/miantiao-me/BroadcastChannel) — AGPL-3.0
