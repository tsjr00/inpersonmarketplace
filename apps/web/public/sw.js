// Service Worker for Web Push Notifications
// Push-only — no caching, offline support, or fetch interception

self.addEventListener('push', function(event) {
  if (!event.data) return

  var data
  try {
    data = event.data.json()
  } catch (e) {
    data = { title: 'New Notification', body: event.data.text() }
  }

  var options = {
    body: data.body || '',
    icon: '/logos/logo-icon-color.png',
    badge: '/logos/logo-icon-color.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'default',
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Farmers Marketing', options)
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
