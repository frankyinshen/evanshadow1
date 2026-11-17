// 影子跟读 Pro V96 Service Worker
// 离线支持：仅对同源 navigate 请求用「网络优先 + 3 秒超时回退缓存」策略
// V88: 原「网络优先，断网才回退」在弱网下 fetch 一直挂着、页面迟迟打不开——而整个应用本可离线用；
//      现在 3 秒没回应就先用缓存打开，网络回来后新页面仍会写进缓存（putTask 不受影响）
// V89: install 预缓存 './' 改用 cache:'reload' 绕过 HTTP 缓存——托管端若给页面设了 max-age，
//      原写法会把旧版本 HTML 存进新缓存；现在 3 秒就回退缓存，旧页面被打开的概率比以前高，必须存新的
// V94: 1) 存取键归一为 pathname（外部审查7）——带 ?mp3= 参数的页面 URL，原来 put 用完整 URL 做键、
//         回退 match({ignoreSearch:true}) 取"第一个匹配"，可能取到更旧的条目；归一后每个页面只存一份。
//         回退时先按新键（pathname）查，miss 再按完整 URL 查（带 ignoreSearch），V13 旧缓存条目也能命中。
//      2) 缓存名随 V94 升 v14 强制刷新；无逻辑改动
// V95: 随 V95（划选浮条/撤销条移进预习顶栏盖住整行 + 顶栏进度文字改细进度条）升缓存名强制刷新；无逻辑改动
// V96: 随 V96（外部审查修复 13 项：缓存页报错/橙条残留/浮条互斥/生词本面板/375px 顶栏等）升缓存名 v16 强制刷新；无逻辑改动
// 严禁拦截第三方资源、媒体请求（含 Range 请求）——确保音频流式播放不受影响
var CACHE_NAME = 'shadow_v96_offline_v16';

// V94: 键归一——同源页面请求一律用 URL pathname 做缓存键（query 参数不参与）
var keyOf = function(u) {
    try { return new URL(u, self.location.href).pathname; } catch(e) { return u; }
};

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            // V86: 升级迁移——先把旧版本缓存里的响应搬进新缓存。
            // 旧缓存里只有页面导航响应（fetch 只缓存 navigate），全量搬运代价极小；
            // 这样即使 './' 预缓存 404（独立文件名部署、目录无默认首页），
            // 激活删除旧缓存后断网仍有旧页面可用，不再需要"install 失败保旧 SW"的保守策略
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
                                    if (resp && resp.ok) return fresh.put(keyOf(r.url), resp); // V94: 迁移时同步归一键
                                });
                            }));
                        });
                    });
                });
                return chain.then(function() { return fresh; });
            });
        }).then(function(fresh) {
            // 预缓存 './'：目录有默认首页则缓存之；404（独立文件名部署）静默跳过——
            // 页面在用户在线打开时由 fetch 事件动态缓存，上面的旧缓存迁移已兜底。
            // V89: 用 cache:'reload' 绕过 HTTP 缓存强制取最新页面（原 add('./') 在托管端
            // 设了 max-age 时会把旧版 HTML 存进新缓存；现在 3 秒就回退缓存，存旧的更易被打开）；
            // Request 构造在不支持的古老浏览器抛错时退回普通 add（再失败仍静默）
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

    // 仅对 navigate（页面跳转/主文档）请求：网络优先 + 3 秒超时回退缓存 + 断网回退缓存
    if (req.mode === 'navigate' || dest === 'document') {
        var putTask = Promise.resolve();
        var pageKey = keyOf(req.url); // V94: 本页面的归一缓存键
        var fromCache = function() {
            // V84.3: 回退只在自身 CACHE_NAME 内查找（原 caches.match 会搜同源全部缓存，
            // 可能命中其他应用的页面）；V94: 先按归一键（pathname）查——
            // 带参 URL 不再可能命中"同页面的另一份旧条目"，miss 再按完整 URL 查（V13 旧键兼容）
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
            // 网络成功——克隆响应缓存一份（同源才会进缓存）
            if (resp && resp.ok) {
                var clone = resp.clone();
                // V84.3: putTask 只构造一次——同一 Response body 只能消费一次，
                // 无论超时与否缓存写入都只发生一次；V94: put 键用归一 pathname
                putTask = caches.open(CACHE_NAME).then(function(cache) {
                    return cache.put(pageKey, clone);
                }).catch(function() {});
            }
            return resp;
        });
        // V88: 同步登记——即使 3 秒后先用了缓存，网络回来的新页面仍会写入缓存；
        // 网络失败也吞掉（回退逻辑由 race 的 catch 处理）
        try { event.waitUntil(network.then(function() { return putTask; }, function() {})); } catch(e) {}
        var timeout = new Promise(function(resolve) {
            setTimeout(function() { fromCache().then(resolve, function() { resolve(null); }); }, 3000);
        });
        event.respondWith(
            // 网络赢：正常返回；3 秒先到：有缓存先用缓存（r 非空），没缓存（r 为 null）继续等网络
            Promise.race([network, timeout]).then(function(r) { return r || network; })
            .catch(function() {
                // 断网且缓存也没有：返回 503 文字提示而非浏览器错误页
                return fromCache().then(function(c) {
                    return c || new Response('离线且尚无缓存：请联网打开一次本页面',
                        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
                });
            })
        );
        return;
    }
    // 其他同源 GET（JS/CSS/SRT/图片等）：一律直连放行，不拦截
    // 单文件应用无外链 JS/CSS，拦截会导致断网返回 undefined 报错
});
