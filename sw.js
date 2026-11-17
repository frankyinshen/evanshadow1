// Shadow Reading Pro V98 Service Worker
// Offline strategy: same-origin navigate requests only, "network-first + 3s timeout fallback to cache".
// V88: previous "network-first, fallback only when offline" hung on weak networks and pages never opened,
//      while the whole app is fully usable offline. Now: if network does not respond in 3s, open from cache;
//      when network eventually returns, the new page is still written to cache (putTask is unaffected).
// V89: install precache for './' now uses cache:'reload' to bypass HTTP cache. If the host sets max-age on
//      pages, the old add('./') would store stale HTML into the fresh cache; since we now fall back to cache
//      after only 3s, stale pages are more likely to be opened, so we must store the fresh one.
// V94: 1) Cache key normalized to URL pathname (external review #7). Page URLs with ?mp3= previously used
//         the full URL as the put key, while fallback match({ignoreSearch:true}) returned the "first match"
//         which could be an older entry. After normalization, only one entry per page is stored.
//         Fallback first looks up by the new key (pathname); on miss, falls back to full URL (with
//         ignoreSearch) so V13 legacy entries still hit.
//      2) Cache name bumped to v14 with V94 to force refresh. No logic change.
// V95: Cache name bumped with V95 (selection bar / undo bar moved into preview header covering the whole
//      row; top progress text replaced by a thin progress bar). No logic change.
// V96: Cache name bumped to v16 with V96 (external review fixes: cache page error / orange bar residue /
//      bar mutual exclusion / vocab panel / 375px header, etc.). No logic change.
// V97: Cache name bumped to v17 with V97. Logic change: transient HTTP 5xx from host/CDN now falls back to
//      cache (external review #11) - fetch() RESOLVES on 502/503, the old code showed the error page instead
//      of the cached copy; 4xx (e.g. 404) is a real answer and still passes through.
// V98: Cache name bumped to v18 with V98 (timer popup closes on cancel / subtitle re-fetch for audio-only
//      cache entries / flashcard auto-pronounce / focus reps row visible by default). No SW logic change.
// NOTE: Comments are ASCII-only on purpose. Some hosts return Content-Type without charset=utf-8 for .js,
//       which makes the browser decode the file as GBK on Chinese-locale devices and break SW registration
//       with a SyntaxError. ASCII-only source is immune to this.
// Never intercept third-party resources or media requests (including Range) - audio streaming must work.
var CACHE_NAME = 'shadow_v98_offline_v18';

// V94: key normalization - same-origin page requests use URL pathname as the cache key (query params ignored)
var keyOf = function(u) {
    try { return new URL(u, self.location.href).pathname; } catch(e) { return u; }
};

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            // V86: upgrade migration - move responses from old cache into the new one first.
            // Old cache only holds navigation responses (fetch caches navigate only), so the cost is tiny.
            // This way even if precaching './' 404s (standalone filename deploy, no directory index),
            // after activation deletes the old cache we still have a page available offline -
            // no need for the conservative "keep old SW if install fails" strategy.
            var olds = names.filter(function(n) { return /^shadow_v\d+_offline_/.test(n) && n !== CACHE_NAME; });
            return Promise.all(olds.map(function(n) { return caches.open(n); }));
        }).then(function(oldCaches) {
            return caches.open(CACHE_NAME).then(function(fresh) {
                var chain = Promise.resolve();
                oldCaches.forEach(function(oc) {
                    chain = chain.then(function() {
                        return oc.keys().then(function(reqs) {
                            return Promise.all(reqs.map(function(r) {
                                return oc.match(r).then(function(resp) {
                                    if (resp && resp.ok) return fresh.put(keyOf(r.url), resp); // V94: normalize key on migration
                                });
                            }));
                        });
                    });
                });
                return chain.then(function() { return fresh; });
            });
        }).then(function(fresh) {
            // Precache './': if the directory has an index page, cache it; 404 (standalone filename deploy)
            // is silently skipped - the page will be cached dynamically by the fetch event when the user
            // opens it online, and the old-cache migration above already covers the fallback.
            // V89: use cache:'reload' to bypass HTTP cache and force the freshest page (the original add('./')
            // would store stale HTML if the host set max-age; since we now fall back after 3s, stale pages
            // are even more likely to be opened).
            // If Request constructor throws on very old browsers, fall back to plain add (still silent on fail).
            var homeReq = './';
            try { homeReq = new Request('./', { cache: 'reload' }); } catch(e) {}
            return fresh.add(homeReq).catch(function() {});
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(names.map(function(n) {
                // V84.3: cleanup narrowed to this app's own namespace (shadow_vNN_offline_*) -
                // caches.keys() returns all same-origin caches; the original /^shadow_/ would delete caches
                // of other apps on the same domain (e.g. an English listening player) that start with shadow_.
                if (n !== CACHE_NAME && /^shadow_v\d+_offline_/.test(n)) return caches.delete(n);
            }));
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    var req = event.request;
    // Only handle GET; skip non-GET (POST/PUT etc.)
    if (req.method !== 'GET') return;

    var url;
    try { url = new URL(req.url); } catch(e) { return; }

    // Only same-origin requests are handled; third-party resources always pass through
    if (url.origin !== self.location.origin) return;

    // Media resources (audio/video) always pass through; never block Range requests and break streaming
    var dest = req.destination || '';
    if (dest === 'audio' || dest === 'video' || dest === 'media') return;

    // Explicitly skip Range requests (audio seek sends Range)
    var rangeHeader = req.headers && req.headers.get ? req.headers.get('range') : null;
    if (rangeHeader) return;

    // Only navigate (page navigation / main document) requests: network-first + 3s timeout fallback + offline fallback
    if (req.mode === 'navigate' || dest === 'document') {
        var putTask = Promise.resolve();
        var pageKey = keyOf(req.url); // V94: normalized cache key for this page
        var fromCache = function() {
            // V84.3: fallback only looks up inside our own CACHE_NAME (caches.match searches all same-origin
            // caches and could hit another app's page); V94: first try the normalized key (pathname) -
            // a URL with params can no longer hit an older copy of the same page; on miss, fall back to the
            // full URL (with ignoreSearch) for V13 legacy key compatibility.
            return caches.open(CACHE_NAME).then(function(cache) {
                return cache.match(pageKey, { ignoreSearch: true }).then(function(c) {
                    if (c) return c;
                    return cache.match(req, { ignoreSearch: true }).then(function(c2) {
                        return c2 || cache.match('./', { ignoreSearch: true });
                    });
                });
            });
        };
        var network = fetch(req, { cache: 'no-cache' }).then(function(resp) {
            // V97(external review #11): transient 5xx from host/CDN - reject so the race falls back to cache
            // instead of showing the error page (fetch RESOLVES on 502/503; 4xx like 404 is a real answer, pass through)
            if (resp && resp.status >= 500 && resp.status < 600) {
                throw new Error('HTTP ' + resp.status);
            }
            // Network success - clone the response and cache one copy (same-origin only)
            if (resp && resp.ok) {
                var clone = resp.clone();
                // V84.3: putTask is built once - the same Response body can only be consumed once,
                // so cache write happens exactly once whether we timed out or not; V94: put key is the
                // normalized pathname.
                putTask = caches.open(CACHE_NAME).then(function(cache) {
                    return cache.put(pageKey, clone);
                }).catch(function() {});
            }
            return resp;
        });
        // V88: register synchronously - even if we already returned from cache after 3s, the page returned
        // by the network later is still written to the cache; network failure is swallowed (the race's
        // catch handles the fallback).
        try { event.waitUntil(network.then(function() { return putTask; }, function() {})); } catch(e) {}
        var timeout = new Promise(function(resolve) {
            setTimeout(function() { fromCache().then(resolve, function() { resolve(null); }); }, 3000);
        });
        event.respondWith(
            // Network wins: return normally; 3s fires first: use cache if available (r non-null), else
            // (r null) keep waiting for network.
            Promise.race([network, timeout]).then(function(r) { return r || network; })
            .catch(function() {
                // Offline and no cache either: return a 503 text hint instead of the browser error page.
                return fromCache().then(function(c) {
                    return c || new Response('Offline and no cache yet: please open this page once while online.',
                        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
                });
            })
        );
        return;
    }
    // Other same-origin GET (JS/CSS/SRT/images, etc.): always pass through, never intercept.
    // This single-file app has no external JS/CSS; intercepting would make offline return undefined errors.
});
