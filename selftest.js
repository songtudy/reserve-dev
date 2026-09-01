/* 익순이 셀프테스트 — index.html?selftest 로 실행된다.
   index.html 안 IIFE 가 window.__ixTest 로 실제 배포되는 순수 함수들을 노출하고,
   여기서 알려진 입력/출력으로 단언 검사를 돌려 화면에 결과를 뿌린다.
   (복붙한 사본이 아니라 배포되는 그 함수를 그대로 검사한다.) */
(function(){
  'use strict';
  var T = window.__ixTest;
  var results = [];
  var groups = [];
  var curGroup = null;

  function group(name){ curGroup = { name: name, rows: [] }; groups.push(curGroup); }
  function J(v){ try { return JSON.stringify(v); } catch(e){ return String(v); } }

  // 깊은 동등 비교 (undefined 필드도 구분)
  function eq(a, b){
    if (a === b) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object'){
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (var i = 0; i < ka.length; i++){
        if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
        if (!eq(a[ka[i]], b[ka[i]])) return false;
      }
      return true;
    }
    return false;
  }

  function check(name, got, want){
    var ok = eq(got, want);
    var row = { name: name, ok: ok, got: got, want: want };
    (curGroup ? curGroup.rows : results).push(row);
    if (!curGroup) results.push(row);
  }
  function tru(name, cond, detail){
    (curGroup ? curGroup.rows : results).push({ name: name, ok: !!cond, got: detail === undefined ? cond : detail, want: true });
  }

  /* ==================== parse (양식 파싱) ==================== */
  group('parse — 양식 파싱');
  (function(){
    var r = T.parse('14:00 임동현 2명');
    check('기본 한 줄', r.length && { t: r[0].time, n: r[0].name, p: r[0].pax, s: r[0].status },
          { t: '14:00', n: '임동현', p: 2, s: 'pending' });

    check('방문 꼬리', T.parse('15:00 김동현 4명 방문')[0].status, 'arrived');
    check('취소 꼬리', T.parse('17:00 이동현 3명 취소')[0].status, 'cancelled');

    var m = T.parse('19:00 박동현 2명 (창가석)')[0];
    check('(메모)', { name: m.name, memo: m.memo }, { name: '박동현', memo: '창가석' });

    check('시 표기', T.parse('14시30분 홍길동 2명')[0].time, '14:30');
    check('. 표기', T.parse('14.30 홍길동 2명')[0].time, '14:30');
    check('분 없는 정각', T.parse('14시 홍길동 2명')[0].time, '14:00');

    check('빈 줄·공백은 무시', T.parse('\n  \n14:00 홍길동 2명\n\n').length, 1);
    check('여러 줄', T.parse('12:00 A 2명\n13:00 B 3명').length, 2);

    var bad = T.parse('이건 양식이 아님\n14:00 홍길동 2명\n15:00 없음');
    check('오류 줄은 bad 로', bad.bad.map(function(b){ return b.no; }), [1, 3]);
    check('오류 줄은 out 에서 제외', bad.length, 1);

    check('알 수 없는 꼬리는 오류', T.parse('14:00 홍길동 2명 뭐임').bad.length, 1);
    check('24시 이상은 오류', T.parse('25:00 홍길동 2명').bad.length, 1);
    check('60분 이상은 오류', T.parse('14:70 홍길동 2명').bad.length, 1);
    check('0명은 오류', T.parse('14:00 홍길동 0명').bad.length, 1);

    var dup = T.parse('14:00 홍길동 2명\n14:00 홍길동 2명');
    tru('같은 시각·이름·인원도 서로 다른 id', dup.length === 2 && dup[0].id !== dup[1].id,
        dup.length === 2 ? [dup[0].id, dup[1].id] : dup.length);

    check('이름 안의 공백은 하나로', T.parse('14:00 Donghyun   Lee 3명')[0].name, 'Donghyun Lee');
    check('seq 는 입력 순서', T.parse('12:00 A 2명\n13:00 B 3명').map(function(x){ return x.seq; }), [0, 1]);
  })();

  /* ==================== normTime ==================== */
  group('normTime — 시간 입력 정규화');
  check('"1530" → 15:30', T.normTime('1530'), '15:30');
  check('"15:30"', T.normTime('15:30'), '15:30');
  check('"15시30분"', T.normTime('15시30분'), '15:30');
  check('"15.30"', T.normTime('15.30'), '15:30');
  check('"9:5" → 09:05', T.normTime('9:5'), '09:05');
  check('"14" → 14:00', T.normTime('14'), '14:00');
  check('공백 허용', T.normTime(' 15 : 30 '), '15:30');
  check('범위 밖은 null', T.normTime('25:00'), null);
  check('쓰레기는 null', T.normTime('abc'), null);

  /* ==================== 날짜 계산 ==================== */
  group('날짜 — pad / ymd / shiftDate / dayGap');
  check('pad 한 자리', T.pad(3), '03');
  check('pad 두 자리', T.pad(12), 12 + '');
  check('ymd', T.ymd(new Date(2026, 7, 5)), '2026-08-05');
  check('shiftDate +1 (월말 넘김)', T.shiftDate('2026-08-31', 1), '2026-09-01');
  check('shiftDate -1', T.shiftDate('2026-09-01', -1), '2026-08-31');
  check('shiftDate 연말 넘김', T.shiftDate('2026-12-31', 1), '2027-01-01');
  (function(){
    var today = T.bizDate();
    check('dayGap(오늘) === 0', T.dayGap(today), 0);
    check('dayGap(내일) === 1', T.dayGap(T.shiftDate(today, 1)), 1);
    check('dayGap(어제) === -1', T.dayGap(T.shiftDate(today, -1)), -1);
  })();

  /* ==================== 시간대 판정 ==================== */
  group('시간대 — slotMin / slotLive');
  check('slotMin "14:30"', T.slotMin('14:30'), 14 * 60 + 30);
  (function(){
    var on = T.consts.GRACE_ON_HOUR, off = T.consts.GRACE_OFF_HOUR;
    tru('정각: 유예(11분) 전이면 live', T.slotLive('14:00', 14 * 60 + on - 0.5) === true);
    tru('정각: 유예 지나면 아님', T.slotLive('14:00', 14 * 60 + on + 0.5) === false);
    tru('비정각: 예약 시각 전이면 live', T.slotLive('14:30', 14 * 60 + 30 - 0.01) === true);
    tru('비정각: 예약 시각 + 5초 지나면 아님', T.slotLive('14:30', 14 * 60 + 30 + off + 0.01) === false);
  })();

  /* ==================== 집계 ==================== */
  group('tallyStatus — 방문/취소/대기 집계');
  (function(){
    var items = [
      { status: 'arrived' }, { status: 'arrived' },
      { status: 'cancelled' },
      { status: 'pending' }, { status: 'pending' }, { status: 'pending' }
    ];
    check('집계', T.tallyStatus(items), { came: 2, off: 1, pend: 3, total: 6 });
    check('빈 배열', T.tallyStatus([]), { came: 0, off: 0, pend: 0, total: 0 });
  })();

  /* ==================== groupByTime / liveNowTime ==================== */
  group('groupByTime / liveNowTime');
  (function(){
    var items = [
      { time: '12:00', status: 'pending', seq: 0 },
      { time: '12:00', status: 'arrived', seq: 1 },
      { time: '13:00', status: 'pending', seq: 2 }
    ];
    var g = T.groupByTime(items);
    check('시간대 2개로', g.map(function(x){ return x.time; }), ['12:00', '13:00']);
    check('12:00 에 2건', g[0].items.length, 2);

    // liveNowTime 은 "오늘"일 때만 동작 → viewDate 를 오늘로 세팅
    var today = T.bizDate();
    T.setViewDate(today);
    // 대기가 남은 시간대는, 아직 안 지났으면(slotLive) "지금" 으로 잡힌다.
    // 하드코딩한 미래 시각은 자정 근처에 실행하면 과거가 되므로, 지금 시각 기준
    // slotLive 와 일치하는지로 검사한다 (둘의 배선을 확인하는 게 목적).
    var fs = '23:59';
    var expect = T.slotLive(fs, T.nowMin()) ? fs : null;
    check('대기 + 아직 안 지남 → 그 시간대', T.liveNowTime(T.groupByTime(
      [{ time: fs, status: 'pending', seq: 0 }])), expect);
    var futureDone = [{ time: fs, status: 'arrived', seq: 0 }];
    check('대기 없으면 null', T.liveNowTime(T.groupByTime(futureDone)), null);
  })();

  /* ==================== isCollapsed (접힘 상태머신) ==================== */
  group('isCollapsed — 시간대 접힘 규칙');
  (function(){
    T.setState({ date: T.bizDate(), items: [] });
    T.setCollapsed({});
    T.setTouched({});
    check('대기 있으면 안 접힘', T.isCollapsed('14:00', 2), false);
    // 대기 0 + 방금 바뀐 흔적 없음 → COLLAPSE_DELAY 지난 것으로 봄 → 접힘
    check('대기 0 + 오래됨 → 접힘', T.isCollapsed('14:00', 0), true);
    // 방금 만진 것으로 표시하면 유예 중 → 안 접힘
    T.setTouched({ '15:00': Date.now() });
    check('대기 0 + 방금 체크 → 유예(안 접힘)', T.isCollapsed('15:00', 0), false);
    // 손으로 접어둔 상태(대기 없음)면 그대로 접힘 유지
    T.setTouched({});
    T.setCollapsed({ '16:00': { v: true, done: true } });
    check('수동 접기 유지', T.isCollapsed('16:00', 0), true);
    T.setCollapsed({ '16:00': { v: false, done: true } });
    check('수동 펼침 유지', T.isCollapsed('16:00', 0), false);
    // 수동 상태였는데 대기 여부가 바뀌면 규칙으로 복귀
    T.setCollapsed({ '17:00': { v: true, done: true } });
    check('대기 생기면 수동 무시 → 펼침', T.isCollapsed('17:00', 1), false);
    T.setState({ date: T.bizDate(), items: [] });
    T.setCollapsed({});
    T.setTouched({});
  })();

  /* ==================== reportText / uniqueId / nextSeq ==================== */
  group('reportText / uniqueId / nextSeq (state 의존)');
  (function(){
    T.setState({ date: '2026-08-31', items: [
      { id: 'a', time: '12:00', name: '김동현', pax: 2, status: 'pending', seq: 0 },
      { id: 'b', time: '12:00', name: '박동현', pax: 3, status: 'arrived', seq: 1 },
      { id: 'c', time: '13:00', name: '이동현', pax: 4, status: 'cancelled', seq: 2 }
    ]});
    check('reportText 양식', T.reportText(),
      '12:00 김동현 2명\n12:00 박동현 3명 방문\n\n13:00 이동현 4명 취소');
    check('nextSeq', T.nextSeq(), 3);
    check('uniqueId 는 base|n 꼴', T.uniqueId('12:00', '김동현', 2).indexOf('12:00|김동현|2|'), 0);
    T.setState(null);
  })();

  /* ==================== 로그 유틸 ==================== */
  group('log — validLogDate / cleanLogEntry / mergeLogRows');
  check('유효 날짜', T.validLogDate('2026-08-31'), true);
  check('없는 날짜(2월 30일)', T.validLogDate('2026-02-30'), false);
  check('형식 틀림', T.validLogDate('2026-8-1'), false);
  (function(){
    var good = T.cleanLogEntry({ id: 'ev1234567890ab', at: 1000, t: '12:00', k: '방문', s: '홍길동' }, true);
    tru('정상 엔트리 통과', good && good.k === '방문' && good.id === 'ev1234567890ab');
    check('at 없으면 버림', T.cleanLogEntry({ t: '12:00', k: '방문' }, true), null);
    check('requireId 인데 id 없으면 버림', T.cleanLogEntry({ at: 1, t: '1', k: 'x' }, true), null);

    var rows = T.mergeLogRows([
      [{ id: 'evAAAAAAAAAAAAAA', at: 100, t: '12:00', k: '방문', s: 'A' }],
      [{ id: 'evAAAAAAAAAAAAAA', at: 100, t: '12:00', k: '방문', s: 'A' },   // 같은 id → 한 줄
       { id: 'evBBBBBBBBBBBBBB', at: 200, t: '12:01', k: '취소', s: 'B' }]
    ], 10);
    check('같은 id 중복 제거', rows.length, 2);
    check('최신(at 큰) 먼저', rows[0].s, 'B');
    check('limit 로 자름', T.mergeLogRows([[
      { id: 'ev0000000000000a', at: 3, t: '1', k: 'x', s: '' },
      { id: 'ev0000000000000b', at: 2, t: '1', k: 'x', s: '' },
      { id: 'ev0000000000000c', at: 1, t: '1', k: 'x', s: '' }
    ]], 2).length, 2);
  })();

  // logKeyId 는 결정적이어야 여러 폰의 같은 이벤트가 한 줄로 합쳐진다 — 해시가 바뀌면 이 값도 바뀜
  group('logKeyId — 여러 폰 중복 방지용 결정적 id');
  check('같은 입력 → 같은 id',
    T.logKeyId('st:13:00|홍길동|2|1:arrived:14567') === T.logKeyId('st:13:00|홍길동|2|1:arrived:14567'), true);
  check('다른 입력 → 다른 id',
    T.logKeyId('st:13:00|홍길동|2|1:arrived:14567') !== T.logKeyId('st:13:00|홍길동|2|1:cancelled:14567'), true);
  check('형식은 LOG_ID_PATTERN 통과 (ev + 14자)',
    /^ev[a-z0-9]{14}$/.test(T.logKeyId('ac:13:00 홍길동')), true);
  // 고정 스냅샷 — 해시가 바뀌면 여기서 빨간불 (배포된 앱과 옛날 앱이 같은 이벤트에 다른 id → 중복 로그)
  check('결정적 id 스냅샷 (자동 취소)', T.logKeyId('ac:13:00 홍길동'), 'ev0gsxw210j9jwob');
  check('결정적 id 스냅샷 (상태 변경)', T.logKeyId('st:13:00|홍길동|2|1:arrived:14567'), 'ev178qk651k9gz0v');

  /* ==================== 룰렛 steps 수식 ==================== */
  group('rltSteps — 룰렛 이동 칸수 (모든 인원에서 일관)');
  (function(){
    var landFail = 0, overCap = 0, tooShort = 0, cap = T.consts.RLT_STEP_CAP;
    for (var n = 2; n <= 40; n++){                          // 실사용은 2~5지만 전 범위 점검
      for (var w = 0; w < n; w++){
        for (var f = 0; f < n; f++){
          var s = T.rltSteps(n, w, f);
          if (((f + s) % n) !== w) landFail++;              // 반드시 당첨칸에 착지
          if (s > cap && n <= cap) overCap++;               // n ≤ cap 이면 칸수도 cap 이하 (전 구간 곡선 감속)
          if (s < 1) tooShort++;
        }
      }
    }
    tru('모든 (n 2~40, winner, from) 에서 당첨칸 착지', landFail === 0, landFail + ' fails');
    tru('n ≤ ' + cap + ' 이면 칸수 ≤ ' + cap + ' (감속이 전 구간 곡선 지배)', overCap === 0, overCap + ' over');
    tru('칸수 항상 1 이상', tooShort === 0, tooShort);
    check('보통 인원(2~5): 3바퀴 이상 돈다', (function(){
      for (var n = 2; n <= 5; n++) for (var w = 0; w < n; w++) for (var f = 0; f < n; f++)
        if (T.rltSteps(n, w, f) / n < 3) return false;
      return true;
    })(), true);
    check('큰 인원(예: 12명)도 최소 한 바퀴 근처는 돈다', (function(){
      var min = 99;
      for (var w = 0; w < 12; w++) for (var f = 0; f < 12; f++) min = Math.min(min, T.rltSteps(12, w, f));
      return min >= 10;   // 12칸 중 10칸 = 거의 한 바퀴
    })(), true);
  })();

  /* ==================== 오프라인 쓰기 큐 병합 ==================== */
  group('wqEntry — 오프라인 쓰기 큐 병합');
  (function(){
    var D = '2026-08-31';
    // 새 patch
    check('patch (prev 없음)', T.wqEntry(null, D, 'x', 'patch', { patch: { status: 'arrived' }, ts: 100 }),
      { date: D, id: 'x', op: 'patch', patch: { status: 'arrived' }, ts: 100 });
    // patch + patch → 병합, ts 는 큰 쪽
    check('patch 위에 patch → 필드 병합',
      T.wqEntry({ date: D, id: 'x', op: 'patch', patch: { status: 'arrived' }, ts: 100 },
                D, 'x', 'patch', { patch: { memo: '창가' }, ts: 90 }),
      { date: D, id: 'x', op: 'patch', patch: { status: 'arrived', memo: '창가' }, ts: 100 });
    // put 위에 patch → item 에 흡수
    check('put 위에 patch → item 병합',
      T.wqEntry({ date: D, id: 'x', op: 'put', item: { id: 'x', status: 'pending', ts: 50 }, ts: 50 },
                D, 'x', 'patch', { patch: { status: 'cancelled' }, ts: 60 }),
      { date: D, id: 'x', op: 'put', item: { id: 'x', status: 'cancelled', ts: 50 }, ts: 60 });
    // del 은 이전 무엇이든 덮음
    check('del 은 우선',
      T.wqEntry({ date: D, id: 'x', op: 'patch', patch: { status: 'arrived' }, ts: 100 },
                D, 'x', 'del', { ts: 200 }),
      { date: D, id: 'x', op: 'del', ts: 200 });
    // del 이 걸려 있으면 뒤따르는 patch 는 무시 (삭제 유지)
    check('del 위에 patch → del 유지',
      T.wqEntry({ date: D, id: 'x', op: 'del', ts: 200 },
                D, 'x', 'patch', { patch: { status: 'pending' }, ts: 300 }),
      { date: D, id: 'x', op: 'del', ts: 200 });
    // 담기는 객체는 원본과 참조 공유 안 함
    (function(){
      var src = { id: 'x', status: 'pending', ts: 1 };
      var e = T.wqEntry(null, D, 'x', 'put', { item: src, ts: 1 });
      src.status = 'MUTATED';
      check('put item 은 복사본 (원본 변경에 안 흔들림)', e.item.status, 'pending');
    })();
  })();

  /* ==================== stalePurgeDates — 오래된 날짜 정리 (시계 오류 방어) ==================== */
  group('stalePurgeDates — 가장 최근 날짜는 절대 안 지운다');
  (function(){
    var sp = T.stalePurgeDates;
    var days = ['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01'];
    check('limit=8-31 → 그보다 오래된 것만, 최근(9-01) 제외',
      sp(days, '2026-08-31').sort(), ['2026-08-29', '2026-08-30']);
    check('limit 이 미래(시계 3일 빠름) → 그래도 최근 날짜는 남는다',
      sp(days, '2026-09-04'), ['2026-08-29', '2026-08-30', '2026-08-31']);
    check('날짜 하나뿐 → 그게 최근이라 안 지움', sp(['2026-09-01'], '2026-09-04'), []);
    check('날짜 형식 아닌 키(__logs__ 등)는 무시', sp(['__logs__', '2026-08-01', '2026-09-01'], '2026-08-15'), ['2026-08-01']);
    check('futureLimit 주면 그보다 미래인 날짜도 지움(최근 제외)',
      sp(['2026-09-01', '2026-09-05', '2026-09-09'], '2026-08-01', '2026-09-02').sort(), ['2026-09-05']);
    check('빈 목록 → []', sp([], '2026-09-01'), []);
  })();

  /* ==================== kstParts — 서버 epoch → 한국시간 조각 ==================== */
  group('kstParts — UTC epoch → KST(UTC+9) 벽시계 (기기 시간대 무관)');
  (function(){
    var kp = T.kstParts;
    // 2026-09-01 04:30:00 UTC = 2026-09-01 13:30:00 KST
    var a = kp(Date.UTC(2026, 8, 1, 4, 30, 0));
    check('04:30 UTC → KST 13:30 / 2026-09-01', [a.y, a.mon, a.day, a.h, a.min], [2026, 8, 1, 13, 30]);
    // 2026-09-01 20:00 UTC = 2026-09-02 05:00 KST (날짜 넘어감)
    var b = kp(Date.UTC(2026, 8, 1, 20, 0, 0));
    check('20:00 UTC → KST 다음날 05:00', [b.y, b.mon, b.day, b.h], [2026, 8, 2, 5]);
    // 2026-12-31 15:00 UTC = 2027-01-01 00:00 KST (연말 넘어감)
    var c = kp(Date.UTC(2026, 11, 31, 15, 0, 0));
    check('연말: 12/31 15:00 UTC → KST 2027-01-01 00시', [c.y, c.mon, c.day, c.h], [2027, 0, 1, 0]);
    // 초 단위도 보존
    var e = kp(Date.UTC(2026, 8, 1, 4, 15, 42));
    check('초 보존', [e.h, e.min, e.s], [13, 15, 42]);
  })();

  /* ==================== 자동취소 — 15분 창 ==================== */
  group('autoCancelDue — 예약시각 +15분 1분 창에서만');
  (function(){
    var d = T.autoCancelDue, S = 14 * 60;   // 14:00
    var P = function(){ return { status: 'pending', time: '14:00' }; };
    tru('정확히 +15분 → 취소', d(P(), S + 15) === true);
    tru('+15분 30초 → 취소', d(P(), S + 15.5) === true);
    tru('+15분 59초 → 취소', d(P(), S + 15 + 0.98) === true);
    tru('+14분 30초 (아직) → 아님', d(P(), S + 14.5) === false);
    tru('+16분 30초 (창 지남) → 아님', d(P(), S + 16.5) === false);
    tru('+25분 (뒤늦게) → 아님', d(P(), S + 25) === false);
    tru('대기 아니면 → 아님', d({ status: 'arrived', time: '14:00' }, S + 15) === false);
  })();

  /* ==================== dev/prod 판정 ==================== */
  group('computeDev — 실배포에서만 prod, 그 외 전부 dev');
  (function(){
    var cd = T.computeDev;
    check('실배포 /reserve/ → prod',            cd('songtudy.github.io', '/reserve/'), false);
    check('실배포 /reserve/index.html → prod',   cd('songtudy.github.io', '/reserve/index.html'), false);
    check('실배포 슬래시 없음 /reserve → prod',  cd('songtudy.github.io', '/reserve'), false);
    check('테스트 /reserve-dev/ → dev',          cd('songtudy.github.io', '/reserve-dev/'), true);
    check('/reserve-something/ → dev',           cd('songtudy.github.io', '/reserve-x/'), true);
    check('localhost → dev',                     cd('localhost', '/reserve/'), true);
    check('localhost 복사본 경로 → dev',         cd('localhost', '/v152/index.html'), true);
    check('file:// (host 없음) → dev',            cd('', '/Users/x/reserve/index.html'), true);
    check('남의 fork → dev',                     cd('someone.github.io', '/reserve/'), true);
    check('루트 / → dev',                        cd('songtudy.github.io', '/'), true);
  })();

  /* ==================== HTML 조각 sanity ==================== */
  group('HTML 헬퍼 sanity');
  check('esc 는 < > & 만 변환 (따옴표는 그대로)', T.esc('<a href="&">'), '&lt;a href="&amp;"&gt;');
  tru('hourOptions 는 영업시간 범위', (function(){
    var h = T.hourOptions();
    return h.indexOf('value="' + T.pad(T.consts.HOUR_MIN) + '"') >= 0
        && h.indexOf('value="' + T.pad(T.consts.HOUR_MAX) + '"') >= 0
        && h.indexOf('value="' + T.pad(T.consts.HOUR_MIN - 1) + '"') < 0;
  })());

  /* ==================== 렌더 ==================== */
  render();

  function render(){
    var pass = 0, fail = 0;
    groups.forEach(function(g){ g.rows.forEach(function(r){ r.ok ? pass++ : fail++; }); });

    var css = ''
      + 'body{margin:0;background:#0f1319;color:#f0f3f6;'
      + 'font:15px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif;'
      + '-webkit-font-smoothing:antialiased;padding:0 0 40px}'
      + '.bar{position:sticky;top:0;background:#0f1319;border-bottom:1px solid #252c36;padding:16px 18px;z-index:1}'
      + '.bar b{font-size:19px;font-weight:800}'
      + '.tot{margin-left:10px;font-weight:800}'
      + '.ok{color:#5fb08a}.no{color:#c9736a}'
      + '.grp{padding:14px 18px 4px;font-size:12px;font-weight:800;letter-spacing:.04em;color:#8792a0}'
      + '.row{display:flex;gap:10px;padding:7px 18px;border-top:1px solid #1c222b;align-items:baseline}'
      + '.mk{flex:0 0 auto;font-weight:800}'
      + '.nm{flex:1;min-width:0}'
      + '.dt{display:block;margin-top:3px;font-size:12px;color:#8792a0;white-space:pre-wrap;word-break:break-all}'
      + '.dt .g{color:#7fc9a5}.dt .w{color:#d2938c}';

    var html = '<style>' + css + '</style>'
      + '<div class="bar"><b>익순이 셀프테스트</b>'
      + '<span class="tot ' + (fail ? 'no' : 'ok') + '">' + pass + ' / ' + (pass + fail)
      + (fail ? '  (' + fail + ' 실패)' : '  전부 통과') + '</span></div>';

    groups.forEach(function(g){
      html += '<div class="grp">' + esc(g.name) + '</div>';
      g.rows.forEach(function(r){
        html += '<div class="row"><span class="mk ' + (r.ok ? 'ok' : 'no') + '">'
          + (r.ok ? '✓' : '✕') + '</span><span class="nm">' + esc(r.name);
        if (!r.ok){
          html += '<span class="dt"><span class="w">got </span>' + esc(J(r.got))
            + '\n<span class="g">want</span> ' + esc(J(r.want)) + '</span>';
        }
        html += '</span></div>';
      });
    });

    document.body.innerHTML = html;
    document.title = (fail ? '✕ ' : '✓ ') + pass + '/' + (pass + fail) + ' — 셀프테스트';
  }

  function esc(s){ return String(s).replace(/[<>&]/g, function(c){ return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }
})();
