# Transfer Channel RSS

Зеркало Telegram-канала как статический сайт. Решает проблему блокировки Telegram в РФ.

**GitHub Actions** парсит канал с серверов за рубежом, генерирует статику через Astro и деплоит на **GitHub Pages** + **SourceCraft Sites** (Яндекс-инфра, белые списки РФ).

## Архитектура

```
GitHub Actions (cron каждые 15 мин)
│
├─ Парсит t.me/s/CHANNEL → data/posts.json
├─ Собирает Astro SSG → dist/
│
└─ Деплоит:
   ├─► GitHub Pages      ← основной сайт
   └─► SourceCraft Sites ← RU-зеркало (Яндекс)
```

| Что     | Где               | Зачем                                           |
| ------- | ----------------- | ----------------------------------------------- |
| Парсер  | GitHub Actions    | t.me заблокирован в РФ, нужен сервер за рубежом |
| Сайт    | GitHub Pages      | Основной хостинг, PWA, доступен из РФ           |
| Зеркало | SourceCraft Sites | Яндекс-инфра, гарантированный доступ из РФ      |

## Быстрый старт

### 1. Форкни и настрой

```bash
git clone https://github.com/vakovalskii/transfer-channel-rss.git
cd transfer-channel-rss
cp .env.example .env
# В .env укажи CHANNEL=your_channel_name
pnpm install
```

### 2. Загрузи посты

```bash
pnpm run fetch
```

### 3. Собери и проверь

```bash
pnpm run build
pnpm run preview
```

### 4. Задеплой

Пуш в `main` — GitHub Pages деплоится автоматически через `.github/workflows/pages.yml`.

Cron-синхронизация каждые 15 мин — `.github/workflows/sync.yml`.

## Настройка GitHub

1. Сделай репо **публичным** (нужен для GitHub Pages)
2. `Settings → Pages → Source: GitHub Actions`
3. `Settings → Secrets → Actions` — добавь:

| Secret    | Описание                 |
| --------- | ------------------------ |
| `CHANNEL` | Username Telegram-канала |

Готово. Через 15 минут сайт обновится.

## Настройка SourceCraft (опционально)

SourceCraft Sites — зеркало на Яндекс-инфре. Если GitHub заблокируют, сайт будет доступен через SourceCraft.

1. Создай **публичную организацию** на [sourcecraft.dev](https://sourcecraft.dev)
2. Создай **публичный репо** `transfer-channel-rss` в организации
3. Добавь GitHub Secrets:

| Secret              | Описание                                            |
| ------------------- | --------------------------------------------------- |
| `SOURCECRAFT_TOKEN` | Персональный токен SourceCraft (скоупы: repo write) |
| `SOURCECRAFT_REPO`  | `org/repo` (например `ndts/transfer-channel-rss`)   |

Конфиг `.sourcecraft/sites.yaml` уже в репо — Sites подхватит `dist/` из ветки `master` автоматически.

URL зеркала: `https://<org>.sourcecraft.site/<repo>`

## Структура

```
scripts/
  fetch-channel.ts       ← парсер: t.me → data/posts.json

src/
  lib/data.ts            ← читает data/posts.json для Astro
  pages/                 ← SSG-страницы (index, posts, search, rss)
  components/            ← UI (header, list, item)
  layouts/base.astro     ← layout + PWA

data/
  posts.json             ← все посты канала
  channel.json           ← метаданные (title, avatar)
  new-posts.json         ← новые посты (последний fetch)

dist/                    ← собранный сайт (коммитится в репо)

.github/workflows/
  sync.yml               ← cron: fetch → build → deploy
  pages.yml              ← GitHub Pages deploy

.sourcecraft/
  sites.yaml             ← SourceCraft Sites конфиг
```

## Как добавить кросспостинг

Репо подготовлен для расширения. Чтобы добавить кросспост в VK, Дзен, OK или email:

1. Создай `scripts/crosspost/platform.ts`
2. Читай новые посты из `data/new-posts.json`
3. Веди трекер в `data/posted.json` (избегай дублей)
4. Добавь скрипт в `package.json` и шаг в `sync.yml`
5. Добавь API-токены в GitHub Secrets

Формат поста в `data/posts.json`:

```json
{
  "id": "2017",
  "title": "Текст заголовка",
  "type": "text",
  "datetime": "2026-03-28T09:30:00+00:00",
  "tags": ["AI_moment"],
  "text": "Чистый текст поста",
  "content": "<html>Полный HTML</html>",
  "reactions": [{ "emoji": "🔥", "count": "74" }]
}
```

## Переменные

| Переменная      | По умолчанию             | Описание                      |
| --------------- | ------------------------ | ----------------------------- |
| `CHANNEL`       | —                        | Username канала (обязательно) |
| `TELEGRAM_HOST` | `t.me`                   | Хост для парсинга             |
| `LOCALE`        | `ru`                     | Язык (dayjs)                  |
| `TIMEZONE`      | `Europe/Moscow`          | Часовой пояс                  |
| `MAX_PAGES`     | `5`                      | Страниц истории при fetch     |
| `REACTIONS`     | `true`                   | Показывать реакции            |
| `TAGS`          | —                        | Теги через запятую            |
| `SITE_URL`      | —                        | URL сайта (Astro `site`)      |
| `BASE_PATH`     | `/transfer-channel-rss/` | Base path (Astro `base`)      |

## Основано на

[BroadcastChannel](https://github.com/miantiao-me/BroadcastChannel) — AGPL-3.0
