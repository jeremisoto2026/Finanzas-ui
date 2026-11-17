self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() || 'Tienes un recordatorio pendiente.' }
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Recordatorio de Finanzas', {
    body: payload.body || 'Tienes un pago próximo a vencer.',
    tag: payload.tag || 'finanzas-recordatorio',
    renotify: false,
    data: { url: payload.url || '/', notificationId: payload.notificationId || null },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus()
        if ('navigate' in client && client.url !== targetUrl) await client.navigate(targetUrl)
        return
      }
    }
    await self.clients.openWindow(targetUrl)
  })())
})
