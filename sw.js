/* Service Worker ของระบบลงทะเบียนอบรม PSU:LASC
   - แคชหน้าเว็บไว้เปิดได้เมื่อเน็ตหลุด แต่โหลดของใหม่จากเน็ตก่อนเสมอ
   - ข้อมูลจาก Firebase / ฟอนต์ / ไลบรารี QR ไม่แคช */
const CACHE = 'psu-lasc-training-v4';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './logo-lasc.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');
  e.respondWith(
    fetch(isHTML ? new Request(e.request.url, { cache: 'reload' }) : e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((res) => res || (isHTML ? caches.match('./index.html') : Response.error()))
      )
  );
});
