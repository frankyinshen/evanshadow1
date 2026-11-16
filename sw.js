// 影子跟读 Pro V85 Service Worker
// 离线支持：仅对同源 navigate 请求用「网络优先 + 断网回退缓存」策略
// 严禁拦截第三方资源、媒体请求（含 Range 请求）——确保音频流式播放不受影响
var CACHE_NAME = 'shadow_v85_offline_v5';
var PRECACHE_URLS = ['./'];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // V84.3: 不再吞掉 addAll 失败——预缓存失败让本次安装失败、旧 SW 继续服务，
            // 防止"新 SW 激活→删旧缓存→新缓存却是空的→断网打不开应用"（浏览器稍后会自动重试安装）
            return cache.addAll(PRECACHE_URLS);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(names.map(function(n) {
                // V84.3: 清理范围收窄到本应用专属命名（shadow_vNN_offline_*）——
                // caches.keys() 返回同源全部缓存，原 /^shadow_/ 会误删同域其他应用
                // （如英语精听播放器）以 shadow_ 开头的缓存
                if (n !== CACHE_NAME && /^shadow_v\d+_offline_/.test(n)) return caches.delete(n);
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
                    // V84.3: putTask 只构造一次——同一 Response body 只能消费一次，
                    // 原写法 waitUntil 失效的兜底分支会对同一 clone 发起第二次 put；
                    // 现在无论 waitUntil 是否成功登记，缓存写入都只发生一次
                    var putTask = caches.open(CACHE_NAME).then(function(cache) {
                        return cache.put(req, clone);
                    }).catch(function() {});
                    try {
                        // V84.1: 缓存写入纳入 event.waitUntil——SW 在写完前不会被终止（防偶发丢缓存），
                        // 同时不阻塞响应返回（网络优先策略下导航不被缓存写盘拖慢）
                        event.waitUntil(putTask);
                    } catch(e) {
                        // event 已失效：putTask 已在执行，无需重复写入
                    }
                }
                return resp;
            }).catch(function() {
                // V84.3: 断网回退只在自身 CACHE_NAME 内查找（原 caches.match 会搜同源全部缓存，
                // 可能命中其他应用的页面）；带 ?mp3= 参数的 URL 用 ignoreSearch 兜底；
                // 最终兜底返回 503 文字提示而非浏览器错误页
                return caches.open(CACHE_NAME).then(function(cache) {
                    return cache.match(req, { ignoreSearch: true }).then(function(cached) {
                        return cached || cache.match('./', { ignoreSearch: true });
                    });
                }).then(function(cached) {
                    return cached || new Response('离线且尚无缓存：请联网打开一次本页面',
                        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
                });
            })
        );
        return;
    }
    // 其他同源 GET（JS/CSS/SRT/图片等）：一律直连放行，不拦截
    // 单文件应用无外链 JS/CSS，拦截会导致断网返回 undefined 报错
});
