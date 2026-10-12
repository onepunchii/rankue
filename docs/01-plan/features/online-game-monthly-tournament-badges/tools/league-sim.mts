// 월대회 점수 규칙(안)을 지난 기록에 돌려 본다 — 읽기 전용. 사람은 그 달 안의 순번으로만 찍는다(이름·id 없음).
const { pool } = await import("/Users/choejeonghwan/rankue-app/server/db.ts");
const c = await pool.connect();
try {
    await c.query("set default_transaction_read_only = on");
    const rows = (await c.query(`select to_char(created_at + interval '9 hours', 'YYYY-MM') as mon, to_char(created_at + interval '9 hours', 'YYYY-MM-DD') as "day", host_id::text as h, guest_id::text as g, winner_id::text as w, end_reason as er, game_type as gt from hiq_sim_matches where status = 'finished' and guest_id is not null order by created_at`)).rows;
    for (const mon of [...new Set(rows.map((r: any) => r.mon))]) {
        const ms = rows.filter((r: any) => r.mon === mon);
        const P = new Map<string, { pts: number; counted: number; raw: number; wins: number; opp: Set<string> }>();
        const get = (id: string) => P.get(id) ?? (P.set(id, { pts: 0, counted: 0, raw: 0, wins: 0, opp: new Set() }), P.get(id)!);
        const pairDay = new Map<string, number>();
        for (const m of ms) {
            const a = get(m.h), b = get(m.g); a.raw++; b.raw++;
            const key = `${m.day}|${[m.h, m.g].sort().join("|")}`;
            const n = (pairDay.get(key) ?? 0) + 1; pairDay.set(key, n);
            if (n > 3) continue;                       // 같은 상대와는 하루 3판까지만 점수
            a.counted++; b.counted++; a.opp.add(m.g); b.opp.add(m.h);
            const early = m.er === "resign" || m.er === "timeout";
            for (const [me, id] of [[a, m.h], [b, m.g]] as const) {
                if (m.w === id) { me.pts += 3; me.wins++; }
                else if (m.w && !early) me.pts += 1;   // 끝까지 치고 진 판 1점 · 기권·시간 초과로 진 판 0점
            }
        }
        const list = [...P.values()].sort((x, y) => y.pts - x.pts);
        const q = list.filter((p) => p.counted >= 5 && p.opp.size >= 3), q2 = list.filter((p) => p.counted >= 5 && p.opp.size >= 2), q1 = list.filter((p) => p.counted >= 5);
        console.log(`${mon}: 대전 ${ms.length}판 · 낀 사람 ${list.length}명 · 점수 인정 ${[...pairDay.values()].reduce((s, n) => s + Math.min(n, 3), 0)}판`);
        console.log(`   점수(높은 순) ${list.map((p) => p.pts).join(", ")}`);
        console.log(`   인정 판수     ${list.map((p) => p.counted).join(", ")}`);
        console.log(`   친 판수       ${list.map((p) => p.raw).join(", ")}`);
        console.log(`   다른 상대 수  ${list.map((p) => p.opp.size).join(", ")}`);
        console.log(`   자격: 5판 이상 ${q1.length}명 · +상대 2명 이상 ${q2.length}명 · +상대 3명 이상 ${q.length}명`);
    }
} finally { c.release(); await pool.end(); }
