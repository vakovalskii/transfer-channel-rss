/* eslint-disable */
if ('serviceWorker' in navigator) {
  var base = document.querySelector('link[rel="manifest"]')?.href?.replace('manifest.json', '') || '/'
  navigator.serviceWorker.register(base + 'sw.js')
}
var deferredPrompt = null
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault()
  deferredPrompt = e
  var btn = document.getElementById('install-btn')
  if (btn) btn.style.display = 'inline-flex'
})
function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt()
    deferredPrompt = null
  }
}
async function subscribePush() {
  var pushUrl = document.documentElement.dataset.pushUrl
  var vapidKey = document.documentElement.dataset.vapidKey
  if (!pushUrl || !vapidKey) return
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
}
