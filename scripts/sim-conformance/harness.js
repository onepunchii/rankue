/**
 * scripts/sim-conformance/harness.js — 엔진 안에서 실행되는 측정 코드 (순수 JS).
 *
 * 이 파일의 텍스트가 그대로 Node(vm 컨텍스트)·WebKit·Chromium 페이지에 주입된다. 세 엔진이 "같은 소스"를
 * 돌려야 비교가 의미 있으므로 TS 가 아니라 평범한 ES2020 JS 로 두고, 번들(globalThis.Sim)만 참조한다.
 *
 * 숫자는 JSON 십진 문자열이 아니라 IEEE-754 비트 패턴(16진 16자리, 빅엔디언)으로 돌려준다 —
 * 전송 경로(Playwright 직렬화)가 값을 손대지 않았음을 보장하고, ulp 차이를 BigInt 로 정확히 계산하기 위해서다.
 */
(function (root) {
    "use strict";

    var f64 = new Float64Array(1);
    var view = new DataView(f64.buffer);

    /** double → 16진 16자리 (BE). −0, NaN 페이로드까지 구분. */
    function bits(x) {
        view.setFloat64(0, x, false);
        var hi = view.getUint32(0, false).toString(16);
        var lo = view.getUint32(4, false).toString(16);
        while (hi.length < 8) hi = "0" + hi;
        while (lo.length < 8) lo = "0" + lo;
        return hi + lo;
    }

    function vec(v) {
        return [bits(v[0]), bits(v[1]), bits(v[2])];
    }

    /**
     * golden.json 의 shots(simulateShot) 와 fromShots(simulateFrom, 움직이는 시작 상태·t0 ≠ 0) 를 전부 돌려
     * 해시·이벤트·최종 상태를 비트 패턴으로 돌려준다. fromShots 의 i 는 구분을 위해 100000 을 더한다.
     */
    function runShots(Sim, golden) {
        var out = [];
        var from = golden.fromShots || [];
        var total = golden.shots.length + from.length;
        for (var k = 0; k < total; k++) {
            var isFrom = k >= golden.shots.length;
            var s = isFrom ? from[k - golden.shots.length] : golden.shots[k];
            var params = {
                table: Sim.TABLES[s.tableId],
                cue: Sim.DEFAULT_CUE,
                cushionModel: s.cushionModel,
                condition: s.condition,
            };
            var r = isFrom ? Sim.simulateFrom(s.balls, params, s.t0) : Sim.simulateShot(s.balls, s.input, params);
            var events = [];
            for (var e = 0; e < r.events.length; e++) {
                var ev = r.events[e];
                events.push({
                    type: ev.type,
                    t: bits(ev.t),
                    ids: ev.ids.slice(),
                    cushion: ev.cushion || "",
                    from: ev.from || "",
                    to: ev.to || "",
                });
            }
            var final = [];
            for (var b = 0; b < r.final.length; b++) {
                var ball = r.final[b];
                final.push({ id: ball.id, r: vec(ball.r), v: vec(ball.v), w: vec(ball.w), state: ball.state });
            }
            out.push({
                i: isFrom ? 100000 + s.i : s.i,
                hash: r.hash,
                goldenHash: s.hash,
                paramsHash: r.paramsHash,
                duration: bits(r.duration),
                truncated: r.truncated,
                events: events,
                final: final,
            });
        }
        return out;
    }

    /**
     * dmath 자기 검사. 시드 고정 mulberry32 로 n 개 입력을 만들고, 각 함수의 dmath 값과 Math 값의 비트 패턴을
     * 함수별로 16자리씩 이어 붙인 문자열로 돌려준다(20k × 16 자 = 320 KB/함수/종류).
     * mulberry32 는 정수 연산뿐이라 세 엔진에서 입력이 비트 단위로 같다 — 그래서 입력도 함께 돌려주어 검증한다.
     */
    function runDmath(Sim, n, seed) {
        var rnd = Sim.mulberry32(seed);
        function uni(lo, hi) { return lo + (hi - lo) * rnd(); }

        // 함수별 입력 생성기. 인자 2개 함수는 [y, x] 를 돌려준다.
        var specs = [
            { name: "sin",   arity: 1, gen: function () { return [uni(-100, 100)]; },       d: Sim.sin,   m: Math.sin },
            { name: "cos",   arity: 1, gen: function () { return [uni(-100, 100)]; },       d: Sim.cos,   m: Math.cos },
            { name: "tan",   arity: 1, gen: function () { return [uni(-100, 100)]; },       d: Sim.tan,   m: Math.tan },
            { name: "atan",  arity: 1, gen: function () { return [uni(-100, 100)]; },       d: Sim.atan,  m: Math.atan },
            { name: "atan2", arity: 2, gen: function () { return [uni(-10, 10), uni(-10, 10)]; }, d: Sim.atan2, m: Math.atan2 },
            { name: "asin",  arity: 1, gen: function () { return [uni(-1, 1)]; },           d: Sim.asin,  m: Math.asin },
            { name: "acos",  arity: 1, gen: function () { return [uni(-1, 1)]; },           d: Sim.acos,  m: Math.acos },
            { name: "exp",   arity: 1, gen: function () { return [uni(-700, 700)]; },       d: Sim.exp,   m: Math.exp },
            { name: "log",   arity: 1, gen: function () { return [uni(1e-6, 1e6)]; },       d: Sim.log,   m: Math.log },
            { name: "cbrt",  arity: 1, gen: function () { return [uni(-1e6, 1e6)]; },       d: Sim.cbrt,  m: Math.cbrt },
            // 아래 둘은 dmath 에 없다 — Math.* 엔진 차이 정보용으로만.
            { name: "pow",   arity: 2, gen: function () { return [uni(0, 10), uni(-5, 5)]; }, d: null, m: Math.pow },
            { name: "hypot", arity: 2, gen: function () { return [uni(-10, 10), uni(-10, 10)]; }, d: null, m: Math.hypot },
        ];

        var out = {};
        for (var s = 0; s < specs.length; s++) {
            var sp = specs[s];
            var inputs = "";
            var dm = "";
            var mm = "";
            for (var i = 0; i < n; i++) {
                var a = sp.gen();
                for (var j = 0; j < a.length; j++) inputs += bits(a[j]);
                if (sp.d) dm += bits(sp.arity === 2 ? sp.d(a[0], a[1]) : sp.d(a[0]));
                mm += bits(sp.arity === 2 ? sp.m(a[0], a[1]) : sp.m(a[0]));
            }
            out[sp.name] = { arity: sp.arity, inputs: inputs, dmath: sp.d ? dm : null, math: mm };
        }
        return out;
    }

    function engineInfo() {
        var ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "";
        return { userAgent: ua };
    }

    root.__simConformance = { runShots: runShots, runDmath: runDmath, engineInfo: engineInfo, bits: bits };
})(globalThis);
