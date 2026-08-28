/* 익순이 서비스 워커 — 앱 껍데기만 캐시한다.
 *
 * 목적: 콜드 스타트(홈 화면에서 처음 켤 때) 흰 화면 번쩍임 제거.
 *   서비스 워커가 없으면 실행할 때마다 GitHub Pages 에서 index.html 을 새로
 *   받아오고, 그 사이 웹뷰가 흰색으로 보인다. 껍데기를 캐시해 두면 네트워크
 *   대기 없이 즉시 그려진다.
 *
 * 전략: stale-while-revalidate (같은 출처 GET 만).
 *   - 캐시에 있으면 그걸 즉시 준다 → 번쩍임 없음.
 *   - 동시에 뒤에서 새로 받아 캐시를 갱신한다 → 배포한 새 버전은 "다음 실행"부터 보인다.
 *   - Firebase(다른 출처)·WebSocket 등은 건드리지 않는다. 예약 데이터는 항상 실시간.
 *
 * 캐시 갱신: CACHE 이름의 버전을 올리면 옛 캐시가 activate 에서 정리된다.
 *   index.html 자체는 버전을 안 올려도 revalidate 로 갱신되지만, 확실히 밀고
 *   싶을 때 아래 숫자를 올린다.
 */
var CACHE = 'iksuni-shell-v1';
var SHELL = [
  './',
  'index.html',
  'manifest.json',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // 하나라도 실패하면 설치가 통째로 깨지지 않게 개별 처리
      return Promise.all(SHELL.map(function(u){
        return c.add(new Request(u, { cache: 'reload' })).catch(function(){});
      }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        // 이 앱 캐시(iksuni-*)의 옛 버전만 지운다. CacheStorage 는 출처(origin)
        // 단위라 songtudy.github.io 의 다른 프로젝트 캐시까지 보이므로 접두어로 거른다.
        if (k !== CACHE && k.lastIndexOf('iksuni-', 0) === 0) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Firebase 등은 그대로 통과

  // 내비게이션(주소창/홈 화면 실행)은 항상 index.html 껍데기로 응답
  var isNav = req.mode === 'navigate';
  var key = isNav ? 'index.html' : req;

  e.respondWith(
    caches.open(CACHE).then(function(cache){
      return cache.match(key).then(function(cached){
        var fresh = fetch(req).then(function(res){
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(key, res.clone());   // 뒤에서 캐시 갱신 → 다음 실행부터 최신
          }
          return res;
        }).catch(function(){ return cached; });   // 오프라인이면 캐시로

        return cached || fresh;   // 캐시 있으면 즉시, 없으면 네트워크
      });
    })
  );
});
