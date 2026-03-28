import tailwindcss from '@tailwindcss/vite'
import astroIcon from 'astro-icon'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [astroIcon()],
  vite: {
    plugins: [tailwindcss()],
  },
})
