// 影子跟读 Pro V83 Service Worker
// 离线支持：仅对同源 navigate 请求用「网络优先 + 断网回退缓存」策略
// 严禁拦截第三方资源、媒体请求（含 Range 请求）——确保音频流式播放不受影响
var CACHE_NAME = 'shadow_v83_offline_v1';
var PRECACHE_URLS = ['./'];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(PRECACHE_URLS).catch(function() {});
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(names.map(function(n) {
                if (n !== CACHE_NAME) return caches.delete(n);
            }));
        }).then(function() {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    var req = event.request;
    // 仅处理 GET；跳过非 GET（POST/PUT 等）
    if (req.method !== 'GET') return;

    var url;
    try { url = new URL(req.url); } catch(e) { return; }

    // 仅同源请求才处理；第三方资源一律直连放行
    if (url.origin !== self.location.origin) return;

    // 媒体资源（audio/video）一律直连放行，避免拦截 Range 请求破坏流式播放
    var dest = req.destination || '';
    if (dest === 'audio' || dest === 'video' || dest === 'media') return;

    // 显式跳过 Range 请求（音频 seek 时浏览器会发 Range）
    var rangeHeader = req.headers && req.headers.get ? req.headers.get('range') : null;
    if (rangeHeader) return;

    // 仅对 navigate（页面跳转/主文档）请求用网络优先 + 断网回退缓存策略
    if (req.mode === 'navigate' || dest === 'document') {
        event.respondWith(
            fetch(req, { cache: 'no-cache' }).then(function(resp) {
                // 网络成功——克隆响应缓存一份（同源才会进缓存）
                if (resp && resp.ok) {
                    var clone = resp.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(req, clone).catch(function() {});
                    });
                }
                return resp;
            }).catch(function() {
                // 断网——回退到缓存（优先请求本身，再 fallback 到 './' 离线根）
                return caches.match(req).then(function(cached) {
                    if (cached) return cached;
                    return caches.match('./');
                });
            })
        );
        return;
    }
    // 其他同源 GET（JS/CSS/SRT/图片等）：一律直连放行，不拦截
    // 单文件应用无外链 JS/CSS，拦截会导致断网返回 undefined 报错
});
