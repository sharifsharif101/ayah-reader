/* ═════════ زر الطوارئ: إلغاء الـ Service Worker من أجهزة كل الزوار ═════════
   الاستخدام عند حدوث خلل في التشغيل دون اتصال:
     1) انسخ هذا الملف فوق sw.js في جذر المشروع (cp tools/sw-killswitch.js sw.js)
     2) اعمل commit و push
   عند زيارة أي شخص للموقع بعدها: يُمسح الكاش، ويُلغى الـ Service Worker، وتُعاد تحميل الصفحة
   لتعمل من الشبكة مباشرة كما كان الموقع قبل إضافة ميزة العمل دون اتصال.
   لإعادة الميزة لاحقًا: أرجع sw.js الأصلي من git (git checkout <commit> -- sw.js) واعمل push. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();   // لازم حتى يقدر يعيد تحميل الصفحات المفتوحة
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ayah-reader-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
