// JARVIS service worker: app ki files cache karta hai taaki offline mein UI khul sake.
// AI jawab offline mein nahi aayenge (wo internet aur Worker se aate hain).
const CACHE = "jarvis-shell-v1";
const SHELL = [
  "./", "index.html", "style.css", "notes.css", "app.js",
  "manifest.json", "icon-192.png", "icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: online ho to hamesha taaza file, offline ho to cache se.
// Isse GitHub par update karne ke baad naya version turant milta hai.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Worker/API calls ko haath nahi lagate

  e.respondWith(
    fetch(req.url, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
