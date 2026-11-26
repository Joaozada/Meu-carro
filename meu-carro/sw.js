var CACHE = 'meu-carro-v9';
var FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png', './icon-maskable-512.png', './kuromi.png', './favicon.png'];
var WARN_DAYS = 15;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Tenta a internet primeiro (para pegar atualizações); se falhar, usa o cache.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});

/* ---------- Avisos da troca de óleo ---------- */
function openDB() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('meu-carro-meta', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
function kvGet(k) {
  return openDB().then(function (db) {
    return new Promise(function (res) {
      var q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { res(null); };
    });
  }).catch(function () { return null; });
}
function kvSet(k, v) {
  return openDB().then(function (db) {
    return new Promise(function (res) {
      var t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = res; t.onerror = res;
    });
  }).catch(function () {});
}
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysBetween(a, b) {
  var p = a.split('-'), q = b.split('-');
  return Math.round((new Date(+q[0], +q[1] - 1, +q[2]) - new Date(+p[0], +p[1] - 1, +p[2])) / 864e5);
}
function fmt(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function noticeText(left, due) {
  if (left < 0) return 'A troca está atrasada há ' + (-left) + (left === -1 ? ' dia.' : ' dias.');
  if (left === 0) return 'A troca de óleo vence hoje.';
  return 'Faltam ' + left + (left === 1 ? ' dia' : ' dias') + ' para a troca de óleo (' + fmt(due) + ').';
}

function checkOil() {
  return Promise.all([kvGet('oilDue'), kvGet('lastNotified')]).then(function (v) {
    var due = v[0], notified = v[1];
    if (!due) return;
    var today = ymd(new Date());
    if (notified === today) return;
    var left = daysBetween(today, due);
    if (left > WARN_DAYS) return;
    return self.registration.showNotification('Hora de trocar o óleo do carro', {
      body: noticeText(left, due),
      icon: 'icon-192.png', badge: 'icon-192.png', tag: 'oleo'
    }).then(function () { return kvSet('lastNotified', today); });
  });
}

// Android/Chrome: o sistema acorda o app de tempos em tempos (sem garantia de horário).
self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'checar-oleo') e.waitUntil(checkOil());
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow('./index.html');
    })
  );
});
