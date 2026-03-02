// Service Worker for Web Push Notifications
// Push-only — no caching, offline support, or fetch interception

// Determine vertical from hostname for branded notifications
var isFoodTrucks = self.location.hostname === 'foodtruckn.app'
var notifIcon = isFoodTrucks ? '/icons/ft-icon-192.png' : '/icons/fm-icon-192.png'
var defaultTitle = isFoodTrucks ? "Food Truck'n" : 'Farmers Marketing'

// Vibrate pattern: consistent across all urgencies
var VIBRATE_PATTERN = [200, 100, 200]

self.addEventListener('push', function(event) {
  if (!event.data) return

  var data
  try {
    data = event.data.json()
  } catch (_e) {
    data = { title: 'New Notification', body: event.data.text() }
  }

  // Sound: play OS sound unless user has sound disabled
  // Vibrate: always on (fallback when sound is off)
  var soundEnabled = data.soundEnabled !== false

  var options = {
    body: data.body || '',
    icon: data.icon || notifIcon,
    badge: notifIcon,
    data: { url: data.url || '/', urgency: data.urgency || 'standard' },
    tag: data.tag || 'default',
    silent: !soundEnabled,
    vibrate: VIBRATE_PATTERN,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || defaultTitle, options)
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()

  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Reuse existing window if possible
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i]
        if ('focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
