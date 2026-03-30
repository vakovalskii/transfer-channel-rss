# Extending

## Добавление кросспостинга

Репо подготовлен для кросспоста в любую платформу. Формат данных стандартизирован.

### Шаги

1. Создай `scripts/crosspost/platform.ts`
2. Читай новые посты из `data/new-posts.json`
3. Веди трекер в `data/posted.json`
4. Добавь скрипт в `package.json`
5. Добавь шаг в `.github/workflows/sync.yml`
6. Добавь API-токены в GitHub Secrets

### Формат поста

```json
{
  "id": "neuraldeep/2017",
  "title": "Текст заголовка",
  "type": "text",
  "datetime": "2026-03-28T09:30:00+00:00",
  "tags": ["AI_moment"],
  "text": "Чистый текст поста без HTML",
  "content": "<div>Полный HTML контент</div>",
  "reactions": [{"emoji": "🔥", "count": "74", "isPaid": false}],
  "channel": "neuraldeep",
  "channelTitle": "Валера Ковальский"
}
```

### Пример кросспостера

```typescript
// scripts/crosspost/platform.ts
import { readFileSync, existsSync } from 'node:fs'

const NEW_POSTS = 'data/new-posts.json'

async function main() {
  if (!existsSync(NEW_POSTS)) return
  const posts = JSON.parse(readFileSync(NEW_POSTS, 'utf-8'))

  for (const post of posts) {
    const text = post.text.slice(0, 1000)
    // Ваш API call здесь
    console.log(`Posted: ${post.id}`)
  }
}

main()
```

### Платформы для кросспоста

| Платформа | API | Env |
|-----------|-----|-----|
| VK | `wall.post` | `VK_TOKEN`, `VK_GROUP_ID` |
| Дзен | Publisher API | `DZEN_TOKEN` |
| OK | `mediatopic.post` | `OK_ACCESS_TOKEN`, `OK_GROUP_ID` |
| Email | SMTP | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |

## Добавление новой страницы

1. Создай файл в `src/pages/mypage.astro`
2. Импортируй данные из `src/lib/data.ts`
3. Используй `Layout` из `src/layouts/base.astro`

```astro
---
import Layout from '../layouts/base.astro'
import { getAllPosts, getChannelData } from '../lib/data'

const channel = getChannelData()
channel.seo = { title: 'My Page' }
const posts = getAllPosts()
---

<Layout channel={channel}>
  <h1>My Page</h1>
  <!-- Ваш контент -->
</Layout>
```

## Стилизация

### CSS-переменные (тёмная тема)

Все цвета через переменные в `src/styles/app.css`:

| Переменная | Light | Dark | Назначение |
|-----------|-------|------|-----------|
| `--color-paper` | #f4f1ec | #1a1a2e | Фон страницы |
| `--color-ink` | #000000 | #e0e0e0 | Основной текст |
| `--color-heading` | #333333 | #e8e8e8 | Заголовки |
| `--color-surface` | #ffffff | #22223a | Карточки, кнопки |
| `--color-muted` | #706862 | #b8b0a8 | Вторичный текст |
| `--color-accent` | #b23b00 | #e07040 | Акцент, активные |
| `--color-line` | rgba(0,0,0,0.05) | rgba(255,255,255,0.08) | Бордеры |

### Утилитарные классы

| Класс | Что делает |
|-------|-----------|
| `.badge` | Бейдж канала/тега |
| `.text-dim` | Вторичный текст |
| `.text-body` | Основной текст |
| `.bg-card` | Карточка с бордером |
| `.search-input` | Поле поиска |
| `.nav-pill` | Кнопка навигации |
| `.filter-btn` | Кнопка фильтра |
| `.channel-btn` | Кнопка канала |

**Правило**: никогда не хардкодь цвета в инлайн стилях. Используй CSS-переменные или утилитарные классы.
