/* eslint-disable */
;(function () {
  var STORAGE_KEY = 'theme-preference'

  function getPreference() {
    var stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
    var btn = document.getElementById('theme-toggle')
    if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'
  }

  // Apply immediately to avoid flash
  apply(getPreference())

  window.toggleTheme = function () {
    var current = document.documentElement.getAttribute('data-theme') || 'light'
    apply(current === 'dark' ? 'light' : 'dark')
  }
})()
