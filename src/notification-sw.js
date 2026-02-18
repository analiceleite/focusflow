// Service Worker extension for handling notification clicks
// This extends Angular's default service worker

self.addEventListener('notificationclick', function(event) {
  console.log('Notification click received:', event);
  
  event.notification.close();
  
  const action = event.action;
  const data = event.notification.data;
  
  if (action === 'view' || !action) {
    // Abrir ou focar no app quando clicar na notificação
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(function(clientList) {
          // Se já tem uma janela aberta, focar nela
          for (let i = 0; i < clientList.length; i++) {
            const client = clientList[i];
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Se não tem janela aberta, abrir nova
          if (clients.openWindow) {
            return clients.openWindow(data?.url || '/');
          }
        })
    );
  } else if (action === 'dismiss') {
    // Apenas fechar a notificação (já fechada acima)
    console.log('Notification dismissed');
  }
});

// Lidar com push notifications (futuro)
self.addEventListener('push', function(event) {
  console.log('Push notification received:', event);
  
  if (event.data) {
    const data = event.data.json();
    
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-192x192.png',
        tag: data.tag || 'focusflow-notification',
        requireInteraction: true,
        actions: [
          { action: 'view', title: '👀 Ver App' },
          { action: 'dismiss', title: '❌ Dispensar' }
        ],
        data: {
          url: self.location.origin,
          action: data.action || 'push-notification'
        }
      })
    );
  }
});