/**
 * 친선전의 '같은 비율' 다마(2026-10-21 오너: "핸디전 말고 내 다마수 입력할 때 … 핸디에 따른 상대도 다마수 자동 적용해야 되는 거 아닌가?
 * 내가 15개를 치는데 5개만 놓고 싶으면 3분의 1이니깐 상대도 3분의 1로 다마가 축소되는 거지").
 *  · 방장(방 만들기): 다마를 고르면 "내 핸디 15의 3분의 1 — 상대도 자기 핸디의 3분의 1" 한 줄
 *  · 게스트(참가): 고를 칸 대신 "내 다마수 10" 과 까닭 한 줄. 실제 값은 참가할 때 서버가 같은 셈(shared/sim/handicap scaledTarget)으로 정한다
 * 핸디는 온라인 핸디(GET /sim/handicap — 방 만들기 화면의 '내 핸디'와 같은 값).
 */
import { useT } from "@/lib/i18n";
import { ratioParts, scaledTarget } from "@shared/sim/handicap";
import type { MatchPublic } from "../matchApi";

type T = (k: string) => string;
/** '3분의 1' · '2배' · '40%' — 같으면 null */
export function ratioText(t: T, target: number, handi: number): string | null {
    const r = ratioParts(target, handi);
    if (r.kind === "same") return null;
    if (r.kind === "times") return t("sim.match.ratioTimes").replace("{n}", String(r.n));
    if (r.kind === "frac") return t("sim.match.ratioFrac").replace("{p}", String(r.p)).replace("{q}", String(r.q));
    return t("sim.match.ratioPct").replace("{pct}", String(r.pct));
}
const pointUnitOf = (m: Pick<MatchPublic, "gameType" | "rules">) => (m.gameType === "4c" ? (m.rules as { pointUnit?: number }).pointUnit ?? 10 : 1);

/** 방 만들기 — 고른 다마 밑의 한 줄. 내 핸디를 모르면 그리지 않는다 */
export function HostScaledHint({ target, myHandi }: { target: number; myHandi: number | null | undefined }) {
    const { t } = useT();
    if (!myHandi || !(target > 0)) return null;
    const ratio = ratioText(t, target, myHandi);
    return (
        <p className="text-[12.5px] font-medium text-ink-2" data-testid="scaled-host-hint">
            {ratio ? t("sim.match.scaledHost").replace("{mine}", String(myHandi)).split("{ratio}").join(ratio) : t("sim.match.scaledHostSame")}
        </p>
    );
}

/** 참가 — 고를 칸 대신 미리 보기. 방장 핸디 · 내 핸디를 모르면 "참가하면 정해져요" */
export function GuestScaledTarget({ room, myHandi }: { room: Pick<MatchPublic, "gameType" | "rules" | "hostTarget" | "hostHandi">; myHandi: number | null | undefined }) {
    const { t } = useT();
    const host = room.hostHandi ?? null;
    const known = !!host && !!myHandi;
    const mine = known ? scaledTarget(room.hostTarget, host!, myHandi!, pointUnitOf(room)) : null;
    const ratio = known ? ratioText(t, room.hostTarget, host!) : null;
    return (
        <div className="rounded-tile border border-brand/30 bg-brand/[0.06] px-4 py-3" data-testid="scaled-guest">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-ink-1">{t("sim.match.myTarget")}</span>
                <span className="rk-num text-[20px] font-bold text-brand" data-testid="scaled-guest-target">{mine ?? "—"}</span>
            </div>
            <p className="mt-1 text-[12px] font-medium text-ink-3">
                {!known ? t("sim.match.scaledPending")
                    : ratio ? t("sim.match.scaledGuest").replace("{host}", String(host)).replace("{mine}", String(myHandi)).split("{ratio}").join(ratio)
                        : t("sim.match.scaledGuestSame").replace("{mine}", String(myHandi))}
            </p>
        </div>
    );
}
