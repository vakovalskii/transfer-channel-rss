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
    var icon = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'
    // Update all theme buttons (sidebar + page nav-pills)
    var btns = document.querySelectorAll('#theme-toggle, #theme-btn')
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = icon
    }
  }

  // Apply immediately to avoid flash
  apply(getPreference())

  // Re-apply after DOM loads (for dynamically rendered buttons)
  document.addEventListener('DOMContentLoaded', function() {
    apply(getPreference())
  })

  window.toggleTheme = function () {
    var current = document.documentElement.getAttribute('data-theme') || 'light'
    apply(current === 'dark' ? 'light' : 'dark')
  }
})()
