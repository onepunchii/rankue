import { useEffect } from "react";

// 일별 유니크 접속자 비콘 — 슈퍼관리자 대시보드의 "접속자" 지표를 채운다.
//
// ★ 하루 한 번만 보낸다. localStorage 에 "마지막으로 보낸 날짜"를 남겨 게이트하므로
//   사용자가 화면을 몇 번 이동해도 서버 쓰기는 1회다.
//
// ⚠️ 기존 "방문(24시간)" 지표와 다른 것을 센다. 그쪽은 hiq_visit_logs 로
//   **회원의 매장 방문 기록**이라 로그인하지 않은 사람은 잡히지 않는다.
//   이 비콘은 가입 여부와 무관한 접속자를 센다.
//
// 저장하는 것: 난수 방문자 ID 하나뿐. IP·계정·경로를 보내지 않는다.

const ID_KEY = "rankue-visitor";
const DAY_KEY = "rankue-visit-day";

/** KST 기준 오늘. 서버도 Asia/Seoul 로 집계하므로 기준을 맞춘다. */
function kstToday(): string {
    // en-CA 는 yyyy-mm-dd 형식을 준다 — 문자열을 직접 조립하지 않아도 된다.
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function VisitBeacon() {
    useEffect(() => {
        try {
            const today = kstToday();
            if (localStorage.getItem(DAY_KEY) === today) return; // 오늘 이미 보냈다

            let id = localStorage.getItem(ID_KEY);
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem(ID_KEY, id);
            }

            // 낙관적으로 먼저 날짜를 적는다 — 전송이 실패해도 그날 계속 재시도해 서버를 두드리지 않는다.
            // 한 명 덜 잡히는 것이, 실패할 때마다 반복 호출하는 것보다 낫다.
            localStorage.setItem(DAY_KEY, today);

            void fetch("/api/visit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ v: id }),
                keepalive: true, // 바로 이탈해도 전송이 끊기지 않게
            }).catch(() => { });
        } catch {
            // 시크릿 모드 등에서 localStorage 가 막힌 경우. 부가 기능이므로 조용히 넘어간다.
        }
    }, []);

    return null;
}
