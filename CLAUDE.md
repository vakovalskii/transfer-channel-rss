# Transfer Channel RSS

Multi-channel Telegram digest → static site on GitHub Pages + SourceCraft Sites.

## Quick Reference

- **Fetch posts**: `pnpm run fetch`
- **Build site**: `pnpm run build`
- **Preview**: `pnpm run preview`
- **Add channel**: edit `data/channels.json`, run fetch
- **Deploy**: push to `main` (auto via GitHub Actions every 15 min)

## Project Structure

```
scripts/fetch-channel.ts    ← парсер: TG → data/posts.json
src/lib/data.ts             ← data layer для Astro SSG
src/pages/                  ← страницы (index, hot, stats, lite, posts)
src/components/item.astro   ← компонент поста
src/layouts/base.astro      ← layout + sidebar + theme
src/styles/app.css          ← стили + CSS vars для тёмной темы
data/channels.json          ← список каналов
data/posts.json             ← все посты (генерируется fetch)
public/                     ← static assets (pwa.js, theme.js, digest.js, sw.js, icons)
.github/workflows/sync.yml  ← CI/CD: fetch → build → deploy pages + sourcecraft
```

## Key Conventions

- **Post IDs**: composite `{channel}/{numericId}` (e.g. `neuraldeep/2017`)
- **Routes**: `[...id].astro` catch-all для composite IDs
- **Colors**: всегда через CSS variables (`var(--color-heading)`), никогда хардкод `#333`
- **Dark theme**: `html[data-theme='dark']` в app.css, утилитарные классы `.badge`, `.text-dim`, `.text-body`
- **dist/ not in git**: деплой через CI artifacts, для SourceCraft — subtree split
- **ESLint ignores**: `scripts/`, `public/*.js`, `data/` — Node.js скрипты без astro lint rules
- **Base path**: `/transfer-channel-rss/` — все ссылки через `import.meta.env.BASE_URL`

## Docs

- [Architecture](docs/architecture.md) — как устроена система, деплой, ограничения
- [Setup](docs/setup.md) — пошаговая настройка с нуля
- [Extending](docs/extending.md) — кросспостинг, новые страницы, стилизация
