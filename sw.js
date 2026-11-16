/* ═════════ Service Worker: تشغيل القارئ دون اتصال ═════════
   - الصفحة: من الشبكة أولًا (حتى يصل كل تحديث فورًا)، ومن الكاش عند انقطاع الاتصال.
   - الخطوط والأيقونات: من الكاش أولًا (لا تتغير).
   - VERSION يُستبدل تلقائيًا برقم الـ commit عند النشر (.github/workflows/deploy.yml)،
     فكل push ينتج كاشًا جديدًا ويُمسح القديم.
   - للطوارئ: tools/sw-killswitch.js يلغي هذا الملف من أجهزة الزوار. */
const VERSION = '__BUILD__';
const PREFIX = 'ayah-reader-';
const CACHE = PREFIX + VERSION;
const PAGE = './';
const PAGES = [PAGE, 'RRR/'];   // الصفحات التي تعمل دون اتصال: قارئ الآيات والقارئ المفتوح
const ASSETS = [
  'fonts/fonts.css',
  'fonts/amiri-quran-400-arabic.woff2',
  'fonts/amiri-quran-400-latin.woff2',
  'fonts/noto-naskh-arabic-var-arabic.woff2',
  'fonts/noto-naskh-arabic-var-latin.woff2',
  'fonts/readex-pro-var-arabic.woff2',
  'fonts/readex-pro-var-latin.woff2',
  'fonts/scheherazade-new-400-arabic.woff2',
  'fonts/scheherazade-new-400-latin.woff2',
  'fonts/scheherazade-new-700-arabic.woff2',
  'fonts/scheherazade-new-700-latin.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
const NETWORK_TIMEOUT = 5000;

const scopeURL = new URL(self.registration.scope);
const pageURL = new URL(PAGE, scopeURL).href;

/* الاستجابات الناتجة عن تحويل (redirect) لا يجوز تقديمها للتنقّل، فننسخها كاستجابة عادية */
async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([...PAGES, ...ASSETS].map(async (u) => {
      const res = await fetch(new Request(new URL(u, scopeURL), { cache: 'reload' }));
      if (!res.ok) throw new Error('precache failed: ' + u);
      await cache.put(new URL(u, scopeURL).href, await clean(res));
    }));
    await self.skipWaiting();   // النسخة الجديدة تستلم فورًا دون انتظار إغلاق التبويبات
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isPage(req, url) {
  return req.mode === 'navigate' || url.pathname.endsWith('.html') || !/\.[a-z0-9]+$/i.test(url.pathname);   // ملف html أو مجلد مثل /RRR
}
/* مفتاح الكاش لكل صفحة (بلا ?query): المجلد و index.html داخله نفس الصفحة،
   و /RRR بلا شرطة أخيرة هو نفسه /RRR/ */
function pageKey(url) {
  let p = url.pathname.replace(/index\.html$/, '');
  if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
  return url.origin + p;
}

async function networkFirst(key) {
  const cache = await caches.open(CACHE);
  const fromNet = fetch(key, { cache: 'no-cache', credentials: 'same-origin' }).then(async (res) => {
    if (res.ok) {
      const c = await clean(res);
      await cache.put(key, c.clone());
      return c;
    }
    return res;
  });
  const cached = await cache.match(key);
  if (!cached) return fromNet;   // أول زيارة: لا بديل عن الشبكة
  // شبكة بطيئة جدًا: نعرض النسخة المحفوظة بعد مهلة، والتحديث يكمل في الخلفية
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT));
  return Promise.race([fromNet.then((r) => (r.ok ? r : cached), () => cached), timeout]);
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scopeURL.origin) return;                       // العدّاد والروابط الخارجية: كما هي
  if (url.pathname.startsWith(scopeURL.pathname + 'admin')) return;  // لوحة الإدارة تحتاج اتصالًا
  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(isPage(req, url) ? networkFirst(pageKey(url)) : cacheFirst(req));
});
