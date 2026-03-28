/* eslint-disable */
// PWA Install + Push subscription
(function () {
  // Register Service Worker
  var base = document.querySelector('link[rel="manifest"]')
  var basePath = base ? base.href.replace('manifest.json', '') : '/'

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(basePath + 'sw.js').catch(function () {})
  }

  // Install prompt
  var deferredPrompt = null
  var banner = document.getElementById('install-banner')
  var installBtn = document.getElementById('install-btn')
  var dismissBtn = document.getElementById('dismiss-install')

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault()
    deferredPrompt = e
    // Show install banner
    if (banner && !localStorage.getItem('pwa-dismissed')) {
      banner.style.display = 'flex'
    }
    if (installBtn) installBtn.style.display = 'inline-flex'
  })

  window.installApp = function () {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      deferredPrompt.userChoice.then(function (result) {
        if (result.outcome === 'accepted') {
          if (banner) banner.style.display = 'none'
        }
        deferredPrompt = null
      })
    }
  }

  window.dismissInstall = function () {
    if (banner) banner.style.display = 'none'
    localStorage.setItem('pwa-dismissed', '1')
  }

  // Push subscription
  window.subscribePush = async function () {
    var pushUrl = document.documentElement.dataset.pushUrl
    var vapidKey = document.documentElement.dataset.vapidKey
    if (!pushUrl || !vapidKey) return
    try {
      var reg = await navigator.serviceWorker.ready
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })
      await fetch(pushUrl + '/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
    } catch (e) {}
  }

  // Auto-show banner on second visit if not dismissed
  if (banner && !localStorage.getItem('pwa-dismissed')) {
    var visits = parseInt(localStorage.getItem('pwa-visits') || '0', 10) + 1
    localStorage.setItem('pwa-visits', String(visits))
    if (visits >= 2 && !window.matchMedia('(display-mode: standalone)').matches) {
      // Will show when beforeinstallprompt fires
    }
  }
})()
