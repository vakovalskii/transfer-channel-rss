import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  astro: true,
  pnpm: false,
  ignores: ['scripts/**', 'push-server/**', 'public/sw.js', 'public/pwa.js', 'public/digest.js', 'public/theme.js', 'data/**'],
  rules: {
    'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
  },
})
