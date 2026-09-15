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
 * ★Firebase SDK(gstatic) 도 담는다. 처음엔 「남의 도메인은 우리가 들고 있으면 낡는다」고
 *   뺐는데 틀렸다 — 주소에 버전이 박혀 있고(/12.17.1/) 서버도 max-age=31536000 로 준다.
 *   버전을 올리면 주소가 바뀌니 낡을 수가 없다. 그리고 이게 없으면 오프라인에서 앱이
 *   «절반만» 산다: 껍데기는 뜨는데 __fb 가 없어 12초 스플래시 → 검은 화면 → 「앱을 다시
 *   열어 주세요」 잠금화면 → 비번도 안 먹는다 (실기기 확인 2026-09-15).
 *   담아 두면 Auth 가 저장된 로그인을 그대로 살려 잠금이 풀리고, DB 만 «연결 끊김»이 된다.
 *
 * ★오프라인에서 열면 «앱은 열리되 명단은 비어 있고 연결 끊김 표시가 뜬다».
 *   명단 자체를 저장해 두는 건 데이터 설계라 여기서 하지 않는다 (별건).
 */
var VER   = 'iksuni-v4';   // 판을 올리면 activate 가 옛 저장본을 통째로 지운다
var NAV_TIMEOUT = 4000;    // 화면 요청이 이 안에 안 오면 저장본으로 띄운다 (아래 설명)
var SHELL = ['./', './index.html', './manifest.json',
             './icon-192.png', './icon-512.png', './apple-touch-icon.png', './icon-maskable-512.png'];
// 주소에 버전이 박혀 있어 통째로 «영구 저장»해도 되는 것들. index.html 의 import 문과 같아야 한다.
var FB = 'https://www.gstatic.com/firebasejs/12.17.1/';
var VENDOR = [FB + 'firebase-app.js', FB + 'firebase-auth.js', FB + 'firebase-database.js'];

self.addEventListener('install', function(e){
  // 껍데기를 미리 담아 둔다.
  // ★addAll 을 안 쓴다 — 그건 파일 하나만 404 여도 통째로 실패해서, 아이콘 한 장 빠진 것 때문에
  //   오프라인 실행 전체가 조용히 죽는다. index.html 만 필수로 두고 나머지는 실패해도 넘어간다.
  e.waitUntil(
    caches.open(VER).then(function(c){
      return c.add('./index.html').then(function(){
        return Promise.all(SHELL.concat(VENDOR).map(function(u){
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
  // Firebase SDK — 주소가 곧 버전이라 저장본 먼저(없을 때만 받아서 담는다). 이게 오프라인
  // 실행의 핵심이다: 이 셋이 없으면 앱이 잠금화면에서 멈춘다.
  if (VENDOR.indexOf(url.href) >= 0){
    e.respondWith(
      caches.match(req).then(function(hit){
        if (hit) return hit;
        return fetch(req).then(function(res){
          if (res && res.ok){
            var copy = res.clone();
            caches.open(VER).then(function(c){ c.put(req, copy); }).catch(function(){});
          }
          return res;
        });
      }).catch(function(){ return fetch(req); })
    );
    return;
  }
  if (url.origin !== self.location.origin) return;      // 그 밖의 남의 도메인은 그대로 통과

  // ① 화면(HTML) — 네트워크 먼저. 실패할 때만 저장본.
  // ★req 를 그대로 fetch() 에 넘기지 않는다. mode 가 'navigate' 인 요청을 fetch() 가 거부하는
  //   구현이 있고(WebKit), 거부되면 곧장 catch 로 떨어져 «저장본»이 응답이 된다 — 온라인인데도
  //   옛 화면이 영영 뜬다. 실기기에서 테스트 앱이 새 빌드를 못 받는 걸로 드러났다(2026-09-15).
  //   그래서 주소로 새 요청을 만든다.
  if (req.mode === 'navigate' || /\.html($|\?)/.test(url.pathname)){
    // cache:'no-cache' — «반드시 서버에 물어보되, 안 바뀌었으면 304 로 끝낸다».
    //   'reload' 는 검사기(ETag)를 안 보내 매번 330KB 를 통째로 다시 받는다(실측 0.30s vs 0.07s).
    //   no-cache 도 10분 캐시를 무시하고 늘 확인하므로 «낡지 않는다»는 원칙은 그대로다.
    var fromCache = function(){
      return caches.match('./index.html').then(function(hit){
        return hit || caches.match('./');
      }).catch(function(){ return fetch(req); });       // 저장본까지 망가졌으면 그냥 네트워크로
    };
    // ★시한을 둔다. 끊긴 것(비행기 모드)은 fetch 가 바로 거부하지만, «와이파이는 붙었는데
    //   인터넷이 죽은» 공유기에서는 응답도 거부도 없이 매달린다 → 앱이 안 열린다.
    //   NAV_TIMEOUT 안에 안 오면 저장본으로 화면부터 띄우고, 받아 온 것은 뒤에서 저장본을
    //   갱신한다(다음 실행부터 최신). 영업 중에 앱이 안 열리는 것보다 한 판 늦는 게 낫다.
    var net = fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).then(function(res){
      if (res && res.ok){
        var copy = res.clone();
        caches.open(VER).then(function(c){ c.put('./index.html', copy); }).catch(function(){});
      }
      return res;
    });
    e.respondWith(
      Promise.race([
        net.catch(function(){ return null; }),
        new Promise(function(res){ setTimeout(function(){ res(null); }, NAV_TIMEOUT); })
      ]).then(function(res){ return res || fromCache(); })
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
