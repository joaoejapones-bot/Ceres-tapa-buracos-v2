const CACHE_NAME = 'ceres-buracos-v1';
const BASE_PATH = '/Ceres-tapa-buracos-v2/';
const urlsToCache = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'config.js',
  BASE_PATH + 'script.js',
  BASE_PATH + 'gestor.html',
  BASE_PATH + 'gestor.js',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Instalação do Service Worker
self.addEventListener('install', function(event) {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Cache aberto, adicionando arquivos...');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        console.log('Service Worker: Todos os arquivos foram cacheados');
        return self.skipWaiting();
      })
      .catch(function(error) {
        console.error('Service Worker: Falha ao cachear arquivos:', error);
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Ativando...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('Service Worker: Ativado com sucesso');
      return self.clients.claim();
    })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', function(event) {
  const requestUrl = new URL(event.request.url);
  
  // Estratégia: Cache First para recursos estáticos
  if (isStaticResource(event.request)) {
    event.respondWith(
      caches.match(event.request)
        .then(function(response) {
          // Se estiver no cache, retorna do cache
          if (response) {
            console.log('Service Worker: Servindo do cache:', event.request.url);
            return response;
          }
          
          // Se não estiver no cache, busca na rede
          console.log('Service Worker: Buscando da rede:', event.request.url);
          return fetch(event.request)
            .then(function(response) {
              // Verifica se a resposta é válida
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // Clona a resposta para poder cacheá-la
              const responseToCache = response.clone();
              
              // Adiciona ao cache
              caches.open(CACHE_NAME)
                .then(function(cache) {
                  cache.put(event.request, responseToCache);
                });
              
              return response;
            })
            .catch(function(error) {
              console.error('Service Worker: Falha na requisição:', error);
              
              // Para requisições de página, retorna página offline
              if (event.request.destination === 'document') {
                return caches.match(BASE_PATH + 'index.html');
              }
            });
        })
    );
  } 
  // Estratégia: Network First para requisições de API
  else if (isApiRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          // Clona a resposta para cache
          const responseToCache = response.clone();
          
          // Cache de respostas de API por 5 minutos
          caches.open(CACHE_NAME + '-api')
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        })
        .catch(function(error) {
          console.log('Service Worker: Falha na API, tentando cache:', event.request.url);
          
          // Tenta servir do cache da API
          return caches.match(event.request, { cacheName: CACHE_NAME + '-api' });
        })
    );
  }
  // Estratégia: Network First para tiles do mapa
  else if (isMapTileRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          // Cache de tiles por 24 horas
          const responseToCache = response.clone();
          caches.open(CACHE_NAME + '-tiles')
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
          return response;
        })
        .catch(function(error) {
          console.log('Service Worker: Falha no tile do mapa, tentando cache:', event.request.url);
          return caches.match(event.request, { cacheName: CACHE_NAME + '-tiles' });
        })
    );
  }
  // Para outras requisições, usa Network First
  else {
    event.respondWith(fetch(event.request));
  }
});

// Verifica se é um recurso estático
function isStaticResource(request) {
  const url = new URL(request.url);
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
  const staticDomains = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com'];
  
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
         staticDomains.some(domain => url.hostname.includes(domain)) ||
         url.pathname.endsWith('.html') ||
         url.pathname.endsWith('/') ||
         url.pathname.includes('/Ceres-tapa-buracos-v2/');
}

// Verifica se é uma requisição de API
function isApiRequest(request) {
  const url = new URL(request.url);
  return url.hostname.includes('supabase.co') || url.pathname.includes('/api/');
}

// Verifica se é uma requisição de tile do mapa
function isMapTileRequest(request) {
  const url = new URL(request.url);
  return url.hostname.includes('openstreetmap.org') || 
         url.hostname.includes('tile.openstreetmap.org') ||
         url.pathname.includes('/tiles/');
}

// Evento de sincronização em background
self.addEventListener('sync', function(event) {
  console.log('Service Worker: Sincronização em background:', event.tag);
  
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncReports());
  }
});

// Função para sincronizar reportes offline
function syncReports() {
  return caches.open(CACHE_NAME + '-offline')
    .then(function(cache) {
      return cache.keys();
    })
    .then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (key.url.includes('/offline-report/')) {
            return cache.match(key)
              .then(function(response) {
                return response.json();
              })
              .then(function(reportData) {
                // Envia o reporte para o servidor
                return fetch('https://gvcwwymijloemiktshxh.supabase.co/rest/v1/buracos', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': 'sb_publishable_nNYhyacmM__0rZkbYzNvdA_x03YOuC2',
                    'Authorization': 'Bearer sb_publishable_nNYhyacmM__0rZkbYzNvdA_x03YOuC2'
                  },
                  body: JSON.stringify(reportData)
                })
                .then(function(response) {
                  if (response.ok) {
                    // Remove do cache offline após sincronizar
                    return cache.delete(key);
                  }
                });
              });
          }
        })
      );
    });
}

// Evento de notificação push
self.addEventListener('push', function(event) {
  console.log('Service Worker: Mensagem push recebida:', event);
  
  const options = {
    body: event.data ? event.data.text() : 'Novas atualizações disponíveis',
    icon: 'https://cdn-icons-png.flaticon.com/512/3239/3239945.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/3239/3239945.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Abrir App',
        icon: 'https://cdn-icons-png.flaticon.com/512/3239/3239945.png'
      },
      {
        action: 'close',
        title: 'Fechar',
        icon: 'https://cdn-icons-png.flaticon.com/512/1828/1828666.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Ceres Buracos', options)
  );
});

// Evento de clique na notificação
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notificação clicada:', event.notification.data);
  
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow(BASE_PATH)
    );
  }
});
