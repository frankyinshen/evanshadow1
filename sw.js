// Shadow Reading Pro V100 Service Worker
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
// V99: 1) Offline-with-no-cache hint now says "server unavailable or offline" (the old text only mentioned
//      offline, which misled debugging when the host was actually returning 5xx). 2) Cache name bumped to v19.
// V100: Cache name bumped to v20 with V100 (flip-sentence read toggle + hear-original iOS chain fix +
//      preview auto-play of first sentence + shift-session reset on audio switch + toast queue). No SW logic change.
// V102: Cache name bumped to v22 with V102 (flip-card auto-flip countdown now starts after the card's
//      pronunciation ends; iOS unmuted-gesture unlock for hear-original; stop audio on review report /
//      tab switch / close; preview-exit index persistence; misc small fixes). No SW logic change.
// V103: Cache name bumped to v23 with V103 (practice-page sequential read; vocab filter/search + JSON
//      export/merge; server-browser badges; preview marks for vocab words; vocab st/en remap on subtitle
//      refresh; editor-page full-backup entry; review timer fixes). No SW logic change.
// V104: Cache name bumped to v24 with V104 (external-review batch: review empty-pool states, Map-based
//      vocab merge, flip-timer clears, reps-wheel sync, pw-marks refresh chain, cache-page re-render,
//      server badges). No SW logic change.
// V105: Cache name bumped to v25 with V105 (preview phrase marking for vocab entries; review filter
//      dropdown sync in tabReview; export filename fix; seq-read finished flag scoped to same range).
//      No SW logic change.
// V106: Cache name bumped to v26 with V106 (practice-page gap control next to seq-read; practice-page
//      vocab marks + selection-to-book; vocab sentences batch-star; seq/focus read per-rep progress +
//      blind-listen last-rep reveal + slow-first-rep speed; server-browser batch offline cache + filter
//      chips; external-review fixes for _applyPwMarks phrase union / single-token fallback and
//      vocab-count in tabReview). No SW logic change.
// V107: Cache name bumped to v27 with V107 (proposal 4/5/7/8: vocab entry notes with edit UI in list +
//      flashcard back; SRS spaced repetition ivl/due with due-only review pool toggle + fourth empty-pool
//      state; editor-page sentence jump + text search; backup reminder bar + shadow_last_backup_at;
//      iPad TTS voice fix - explicit u.voice selection in vocabBook._speakText with Eloquence filtering
//      and enhanced/premium scoring). No SW logic change.
// V108: Cache name bumped to v28 with V108 (auto-star vocab sentences on add from both practice and
//      preview pages; iPad TTS voice lock via _voiceCache + localStorage shadow_v108_voice_en/zh to stop
//      mid-session voice switching; dictionary lookup popup with note backfill; editor-page "locate
//      current practice sentence" button; SRS graduation now requires full 1/3/7/15-day chain; practice
//      selection bar z-index 8100 + blind-mode no-select + dismiss calls; batch-cache stop/reset/late-
//      return fixes; edTuneSel keepOpen; IME composing guard; subtitle-1-failure guard; word-boundary
//      matching for old vocab entries; backup reminder bar moved into document flow). No SW logic change.
// V109: Cache name bumped to v29 with V109 (preview "I know it" keeps the star on sentences that still
//      hold ungraduated vocab words; practice-page rate wheel moved into the seq-read settings row so it
//      no longer wraps alone on 375px; _fetchSubsIfMissing requires both sub text AND non-empty segments
//      before skipping re-fetch; _restoreShiftSnap remaps vocab entries added after the shift snapshot;
//      SRS reviewMark only advances the interval chain when the word was actually due; editor-page jump
//      label refresh extracted to _syncEdJumpCur called on renderEditor and switchView; dict popup Esc/
//      shortcut-key handling; vocab-star button only shows while some vocab sentence is unstarred, with
//      _vocabSentIdx(v, cheap) shared locator; focus-phase exit returns to the pre-entry practice sentence
//      when entered from the practice page). No SW logic change.
// V110: Cache name bumped to v30 with V110 (vocabulary module system-level rebuild: entry model adds
//      ph/cn/def fields; Excel export becomes the 8-column AI loop with Rich-Text-InlineStrings bold for
//      the target word and an AI prompt row merged A:H below the data; merge import switches to the
//      word+source dual primary key with sentence-text disambiguation for source-less rows; import now
//      accepts Excel/CSV/JSON via a built-in ZIP reader + raw DEFLATE inflater; panel re-grouped into
//      tabs/due-toggle/clear row, filter row (110px search + flex audio select) and data toolbar, sized
//      96%/540px/88vh on iPad and desktop; open() defaults the audio filter to the current audio;
//      two-level clear dialog (current-audio-first); flashcards rebuilt with fixed bottom action bar,
//      fitText ladders, back-side hierarchy with collapsible details and quick links; lookup silently
//      backfills v.ph/v.def; list rows show phonetic + highlighted cn with smart src-tag hiding;
//      desktop click-to-add on .pw spans; selection release arms a 0.5s auto-add debounce). No SW logic
//      change - cache bump forces refresh only.
// V111: Cache name bumped to v31 with V111 (editor merge of bilingual subtitle lines now groups Chinese
//      with Chinese and English with English, one space apart, via app._mergeBiText; vocab clear dialog
//      always offers both scopes - current-audio button no longer hides at zero words or with no audio
//      loaded, with toast exits, and _isCurrentAudio gains a local://-vs-http filename fallback;
//      preview sentence box ceiling 40vh->46vh with fitText floor 16px->14px). No SW logic change.
// V112: 1) Install precache of './' no longer uses cache.add(): a 301/302 redirect would store a
//         response with redirected:true, and respondWith() on some browsers then fails with a network
//         error. Now fetch() manually, skip non-ok responses, and when resp.redirected rebuild a clean
//         Response (same body/status/headers) before cache.put(). Cache key stays the same Request './'
//         so the existing fallback lookup chain is untouched.
//      2) Fetch race: when the network settles before the 3s timer fires, clearTimeout now cancels the
//         pending fromCache() lookup instead of running it pointlessly after the race is over.
//      3) Cache name bumped to v33. Registration in index.html passes updateViaCache:'none' (the SW
//         script update check bypasses HTTP cache; older browsers ignore the option).
// V114: Cache name bumped to v34 with V114 (editor-page floating undo pill now hides on practice/preview
//         views; flashcard auto-next dropdown initial value fix; narrow-screen navbar single line;
//         preview sentence-jump dropdown; .ass/.ssa and .lrc subtitle parsing with UTF-16 BOM import;
//         local-import subtitle slots accept .ass/.ssa/.lrc). No SW logic change - cache bump forces
//         refresh only.
// V115: 1) Old-cache migration loop in install now also handles redirected responses: when migrating
//         a page response with redirected=true, rebuild a clean Response (same body/status/headers)
//         before fresh.put(), aligned with the V112 fetch precache fix - respondWith() with a
//         redirected response is rejected as a network error on some engines, which would silently
//         drop that migrated entry.
//      2) Cache name bumped to v35 with V115 (full-play resume breakpoint + lock-screen/headset
//         track switching keeps continuous modes + focus-phase blind listen & last-rep reveal +
//         copy-for-AI attaches full subtitles + flashcard undo/pin/edit-word/swipe/due badge +
//         server-dir memory & next-episode + cache-page search/sort + in-place sentence edit +
//         timestamp overlap soft warning). No other SW logic change.
// V115.1: Cache name bumped to v36. Bugfix release for the V115 review findings - no SW logic change:
//      1) Cache page crashed on open (typo: undefined variable sortSel fixed in index.html).
//      2) 375px layout: practice-page edit button moved into the text container (was overlapped by the
//         wakelock button), vocab list row buttons rearranged into a right-side vertical column,
//         flashcard bottom bar compacted so the card text area grows wider and taller.
//      3) Download proxy hardening: fake HTTP-200 HTML pages and 0-byte blobs are now rejected and
//         the final failure message names the actual reason (timeout / unreachable / html / empty).
//      4) Flashcard swipe no longer ghost-flips the next card; moveUp guarded in auto-sort and pinned rows.
//      5) Copy-for-AI: subtitle preload covers the full list, legacy no-source entries never attach the
//         wrong episode's subtitles, and subtitle lines always prefer track 1 (English source text).
//      6) In-place sentence edit keeps the empty-string property (editor textarea no longer hides);
//         server browser restores the full folder history stack and offers a "back to root" entry
//         when the remembered folder fails to load.
// V116: Cache name bumped to v38. Feature release (full-play pause/resume, listen-loop callback
//         generation guards, jump-to-sentence full-play resume anchor, practice trans peek flex fix,
//         narrow-screen filter row wrap). No SW logic change - bump forces cache refresh only.
// V116.1: Cache name bumped to v39. Batch offline cache rework in index.html: 3-way parallel
//         download pool (about 3x faster), per-file automatic retry (2 retries with 0.9s/1.8s backoff
//         inside the direct-then-all-proxies candidate chain), and a network-level circuit breaker
//         (4 consecutive timeout/unreachable failures stop the batch with a clear message instead
//         of crawling for minutes). Aggregate progress text and an end-of-batch toast that says
//         re-clicking only re-downloads the failed items. No SW fetch/install logic change.
// V118: Cache name bumped to v41. Batch-download rework in index.html (subtitle fetch serialized
//         with per-slot retry and URL preserved on failure - the root cause of "downloaded items
//         won't play"; per-file inline progress badges; big-file mutex rewritten as a pending-index
//         queue with in-pool waiters so Promise.all always covers every download; batch-level
//         AbortController so stop/switch truly aborts in-flight fetches; candidate failure-reason
//         aggregation for retry classification). SW logic change here: install old-cache migration
//         now serializes fresh.put() calls and dedupes by normalized key - parallel puts of the
//         same normalized key (old entries differing only in query params) could hit write-lock
//         conflicts on some Cache API implementations.
// V117: Cache name bumped to v40. Offline-download engine rework in index.html per the "browser PWA
//         batch offline download engine" playbook: streaming body reads with an idle watchdog (20s
//         no-data abort, renewed per chunk, 15min total cap) instead of an unbounded body read; Blob
//         assembled from streamed chunks (iOS memory safe); truncation detection; retry
//         classification (timeout/unreachable/5xx/429 retried, 4xx/html/empty fail fast); big-file
//         (>15MB) event-driven mutex with a persisted size table; dual-layer progress with 400ms
//         throttle; weak-network (2g/saveData) concurrency 3->2; silent keep-alive audio during
//         batches so a locked-screen iOS does not freeze the page. No SW fetch/install logic change.
// NOTE: Comments are ASCII-only on purpose. Some hosts return Content-Type without charset=utf-8 for .js,
//       which makes the browser decode the file as GBK on Chinese-locale devices and break SW registration
//       with a SyntaxError. ASCII-only source is immune to this.
// Never intercept third-party resources or media requests (including Range) - audio streaming must work.
var CACHE_NAME = 'shadow_v118_offline_v41';

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
                            // V118: serialize migration puts and dedupe by normalized key - parallel
                            // fresh.put() of the same normalized key (old entries differing only in
                            // query params, e.g. ?mp3=a and ?mp3=b both normalizing to one pathname)
                            // can hit write-lock conflicts on some Cache API implementations.
                            var seenKeys = {};
                            var inner = Promise.resolve();
                            reqs.forEach(function(r) {
                                var k = keyOf(r.url);
                                if (seenKeys[k]) return; // same normalized key already handled
                                seenKeys[k] = true;
                                inner = inner.then(function() {
                                    return oc.match(r).then(function(resp) {
                                        if (!resp || !resp.ok) return null;
                                        // V115: redirected responses must not be stored as-is - respondWith()
                                        // rejects them as network errors on some engines. Rebuild a clean
                                        // Response (same body/status/headers) before putting, same as the
                                        // V112 fetch precache path.
                                        if (resp.redirected) {
                                            return fresh.put(k, new Response(resp.body, {
                                                status: resp.status,
                                                statusText: resp.statusText,
                                                headers: resp.headers
                                            }));
                                        }
                                        return fresh.put(k, resp); // V94: normalize key on migration
                                    });
                                });
                            });
                            return inner;
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
            // V112: do NOT use cache.add() - a 301/302 redirect (e.g. './' -> './index.html' or a language
            // gate) stores a response with redirected:true, and respondWith() with such a response is
            // rejected as a network error on some engines, breaking offline fallback. Instead: fetch
            // manually, skip non-ok responses (cache.add() would have cached 404/5xx pages), and when the
            // response was redirected, rebuild a clean Response with the same body/status/headers.
            // The cache key stays the same Request './' object, so the fallback match('./') lookup chain
            // and the V86 migration behavior are unchanged.
            var homeReq = './';
            try { homeReq = new Request('./', { cache: 'reload' }); } catch(e) {}
            return fetch(homeReq).then(function(resp) {
                if (!resp || !resp.ok) return null;
                if (!resp.redirected) return fresh.put(homeReq, resp);
                return fresh.put(homeReq, new Response(resp.body, {
                    status: resp.status,
                    statusText: resp.statusText,
                    headers: resp.headers
                }));
            }).catch(function() {});
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
        var tid = null; // V112: timer handle - cleared when the network settles first, so the pending
        // fromCache() lookup does not run pointlessly after the race is already over
        var timeout = new Promise(function(resolve) {
            tid = setTimeout(function() { fromCache().then(resolve, function() { resolve(null); }); }, 3000);
        });
        var netEarly = network.then(function(r) {
            try { if (tid) clearTimeout(tid); } catch(e0) {}
            return r;
        }, function(e) {
            try { if (tid) clearTimeout(tid); } catch(e0) {}
            throw e;
        });
        try { netEarly.catch(function() {}); } catch(e1) {} // V115.2: orphan-rejection guard - when the 3s timeout wins the race and the network later rejects (5xx / offline), the netEarly promise had no remaining consumer and logged an Unhandled Promise Rejection; harmless but noisy - this empty catch silences it without touching the race itself.
        event.respondWith(
            // Network wins: return normally; 3s fires first: use cache if available (r non-null), else
            // (r null) keep waiting for network.
            Promise.race([netEarly, timeout]).then(function(r) { return r || network; })
            .catch(function() {
                // Offline and no cache either: return a 503 text hint instead of the browser error page.
                return fromCache().then(function(c) {
                    return c || new Response('Server unavailable or offline, and no cached copy yet: please open this page once while online.',
                        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
                });
            })
        );
        return;
    }
    // Other same-origin GET (JS/CSS/SRT/images, etc.): always pass through, never intercept.
    // This single-file app has no external JS/CSS; intercepting would make offline return undefined errors.
});
