/* eslint-disable */
var currentPeriod = 'all'
var currentChannel = 'all'
var currentSearch = ''

function filterPeriod(period) {
  currentPeriod = period
  document.querySelectorAll('.filter-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.period === period)
  })
  applyFilters()
}

function filterChannel(ch) {
  currentChannel = ch
  document.querySelectorAll('.channel-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.channel === ch)
  })
  applyFilters()
}

function filterSearch(q) {
  currentSearch = q.toLowerCase()
  applyFilters()
}

function applyFilters() {
  var now = Date.now()
  var periodMs = {
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    all: Infinity,
  }
  var maxAge = periodMs[currentPeriod] || Infinity
  var visible = 0

  document.querySelectorAll('.digest-post').forEach(function (el) {
    var show = true
    if (currentPeriod !== 'all') {
      var dt = new Date(el.dataset.datetime).getTime()
      if (now - dt > maxAge) show = false
    }
    if (currentChannel !== 'all' && el.dataset.channel !== currentChannel) show = false
    if (currentSearch && el.dataset.text.indexOf(currentSearch) === -1) show = false
    el.style.display = show ? '' : 'none'
    if (show) visible++
  })

  document.getElementById('no-results').style.display = visible === 0 ? '' : 'none'
}
