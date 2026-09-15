/* 익순이 서비스워커 — 「오프라인에서도 앱이 열리게」 하는 것만 맡는다.
 *
 * ★설계 원칙: 절대 낡지 않는다.
 *   서비스워커의 고전적 사고는 「한번 저장하면 새 버전이 영영 안 온다」이다. 그래서
 *   화면을 이루는 index.html 은 «네트워크 먼저» 로만 간다 — 온라인이면 언제나 서버 것이
 *   보이고, 저장본은 네트워크가 실패했을 때만 쓴다. 즉 저장본이 새 버전을 가로막는 일이 없다.
 *   (앱 안의 「새 버전으로 업데이트」 띠도 그대로 작동한다. 그쪽은 HEAD 로 확인한다.)
 *
 *   아이콘·manifest 는 «저장본 먼저, 뒤에서 갱신»(stale-while-revalidate) — 거의 안 바뀌고
 *   바뀌어도 한 번 늦게 보일 뿐이라 안전하다.
 *
 * ★Firebase SDK(gstatic)는 일부러 안 건드린다. 오프라인엔 어차피 받을 명단이 없고,
 *   남의 도메인 것을 우리가 오래 들고 있으면 그게 또 낡는다.
 *
 * ★오프라인에서 열면 «앱은 열리되 명단은 비어 있고 연결 끊김 표시가 뜬다».
 *   명단 자체를 저장해 두는 건 데이터 설계라 여기서 하지 않는다 (별건).
 */
var VER   = 'iksuni-v1';
var SHELL = ['./', './index.html', './manifest.json',
             './icon-192.png', './icon-512.png', './apple-touch-icon.png', './icon-maskable-512.png'];

self.addEventListener('install', function(e){
  // 껍데기를 미리 담아 둔다.
  // ★addAll 을 안 쓴다 — 그건 파일 하나만 404 여도 통째로 실패해서, 아이콘 한 장 빠진 것 때문에
  //   오프라인 실행 전체가 조용히 죽는다. index.html 만 필수로 두고 나머지는 실패해도 넘어간다.
  e.waitUntil(
    caches.open(VER).then(function(c){
      return c.add('./index.html').then(function(){
        return Promise.all(SHELL.map(function(u){
          return u === './index.html' ? null : c.add(u).catch(function(){});
        }));
      });
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  // 옛 판을 지우고 바로 넘겨받는다.
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.map(function(k){ return k === VER ? null : caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;                     // 쓰기는 손대지 않는다
  var url;
  try { url = new URL(req.url); } catch(err){ return; }
  if (url.origin !== self.location.origin) return;      // 남의 도메인(Firebase 등)은 그대로 통과

  // ① 화면(HTML) — 네트워크 먼저. 실패할 때만 저장본.
  if (req.mode === 'navigate' || /\.html($|\?)/.test(url.pathname)){
    e.respondWith(
      fetch(req).then(function(res){
        if (res && res.ok){
          var copy = res.clone();
          caches.open(VER).then(function(c){ c.put('./index.html', copy); });
        }
        return res;
      }).catch(function(){
        return caches.match('./index.html').then(function(hit){
          return hit || caches.match('./');
        }).catch(function(){ return fetch(req); });     // 저장본까지 망가졌으면 그냥 네트워크로
      })
    );
    return;
  }

  // ② 나머지 우리 파일 — 저장본 먼저, 뒤에서 조용히 갱신.
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if (res && res.ok){
          var copy = res.clone();
          caches.open(VER).then(function(c){ c.put(req, copy); }).catch(function(){});
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    }).catch(function(){ return fetch(req); })          // ★무슨 일이 있어도 네트워크로는 간다
  );
});
