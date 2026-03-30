# Architecture

## Overview

```
GitHub Actions (cron каждые 15 мин)
│
├─ Fetch: парсит t.me/s/CHANNEL для каждого канала из data/channels.json
├─ Build: Astro SSG → dist/ (2000+ страниц)
│
└─ Deploy:
   ├─► GitHub Pages (основной, PWA-ready)
   └─► SourceCraft Sites (RU-зеркало, Яндекс-инфра)
```

## Почему такая архитектура

**Проблема**: Telegram заблокирован в РФ. Нужен способ читать каналы без VPN.

**Решение**: Парсер работает на серверах GitHub (за рубежом, видит t.me), генерирует статический сайт и деплоит на платформы доступные из РФ.

| Компонент | Где | Почему |
|-----------|-----|--------|
| Парсер | GitHub Actions | t.me заблокирован в РФ, GH серверы за рубежом |
| Сайт | GitHub Pages | Быстрый, бесплатный, поддерживает PWA |
| Зеркало | SourceCraft Sites | Яндекс-инфра, гарантированный доступ из РФ |

## Как работает парсинг

```
t.me/s/CHANNEL → HTML → cheerio → posts.json
```

1. `scripts/fetch-channel.ts` читает `data/channels.json` — список каналов
2. Для каждого канала загружает `https://t.me/s/{channel}` (публичный веб-превью)
3. Парсит HTML через cheerio: тексты, картинки, видео, стикеры, реакции
4. Каждый пост получает composite ID: `{channel}/{postId}`
5. Все посты мёржатся в `data/posts.json`, сортируются по дате
6. Новые посты сохраняются в `data/new-posts.json`

**Пагинация**: параметр `MAX_PAGES` (default 3) — сколько страниц истории загружать. Каждая страница ~15-20 постов.

## Как работает билд

Astro SSG читает `data/posts.json` через `src/lib/data.ts` и генерирует:
- `/` — главная (дайджест с фильтрами, Hot top-5, Channels chart)
- `/posts/{channel}/{id}/` — отдельный пост
- `/hot/` — топ-50 по реакциям
- `/stats/` — статистика каналов
- `/lite/` — текстовый режим (100 постов без медиа)
- `/before/{id}/`, `/after/{id}/` — пагинация
- `/search/{query}/` — поиск по тегам
- `/rss.xml`, `/rss.json` — RSS-фиды

## Деплой

### GitHub Pages
Workflow `sync.yml` билдит и деплоит через `actions/upload-pages-artifact` + `actions/deploy-pages`. Артефакт — не коммит в git.

### SourceCraft Sites
1. После билда `dist/` добавляется в git (`git add -f dist/`)
2. В `dist/` создаётся `.sourcecraft/sites.yaml` с `ref: master`
3. `git subtree split --prefix dist` выносит содержимое dist в отдельную ветку
4. Ветка пушится в SourceCraft как `master`
5. SourceCraft Sites обслуживает файлы из корня ветки master

**Важно**: before/after директории удаляются перед пушем в SourceCraft (экономия 300MB).

## Ограничения

- **SourceCraft CSP**: заголовок `worker-src 'none'` блокирует Service Worker. PWA невозможен на SourceCraft.
- **Telegram CDN**: медиа (картинки, видео) ссылаются на `cdn4.telesco.pe` — заблокирован в РФ. Картинки не грузятся из РФ без VPN.
- **Статический сайт**: фильтры работают только по загруженным постам на текущей странице. Полный поиск — через `/lite/`.
- **dist/ не в git**: 336MB при 14 каналах. Деплой через CI artifacts.
