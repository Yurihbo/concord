const CACHE_NAME = "concord-shell-v2";
const scopeUrl = new URL(self.registration.scope);
const appUrl = new URL("./", scopeUrl);
const manifestUrl = new URL("manifest.json", appUrl);
const iconUrl = new URL("concord-icon.svg", appUrl);
const icon192Url = new URL("assets/logo-concord-192.png", appUrl);
const icon512Url = new URL("assets/logo-concord.png", appUrl);
const APP_SHELL = [appUrl.href, manifestUrl.href, iconUrl.href, icon192Url.href, icon512Url.href];

function isBypassedRequest(request) {
  if (request.method !== "GET") return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.endsWith("/sw.js")) return true;
  if (url.pathname.includes("/__/auth/") || url.pathname.startsWith("/api/") || url.pathname.includes("/firebase/")) return true;
  if (["code", "state", "authType", "apiKey"].some((key) => url.searchParams.has(key))) return true;
  return false;
}

async function cacheResponse(request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (isBypassedRequest(request)) return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(async () => (await caches.match(request)) || (await caches.match(appUrl.href))),
    );
    return;
  }

  if (request.destination === "script" || request.destination === "style" || request.destination === "font" || request.destination === "image" || url.pathname.endsWith("manifest.json")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => cacheResponse(request, response)).catch(() => new Response("", { status: 503, statusText: "Offline" }))),
    );
  }
});
