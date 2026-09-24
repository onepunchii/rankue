/**
 * 그린피(2026-09-24) — TGM 표. 행: 주중·토요일·일요일…, 열: 비회원·정회원·가족회원(값이 하나도 없는 열은 뺀다).
 * 아래 한 줄: 캐디피·카트비, 그리고 **4인 1팀 기준 1인 비용**(주중 비회원 + 캐디피·카트비 N빵) — 사람들이 실제로 계산하는 숫자다.
 */
import { weekdayFee, wonShort, type Fees, type FeeRow } from "@shared/golfCourse";
import { Card, Section } from "./ui";

const COLS: { key: keyof Omit<FeeRow, "day">; label: string }[] = [
    { key: "nonMember", label: "비회원" }, { key: "member", label: "정회원" }, { key: "family", label: "가족회원" },
];

export function GreenFees({ fees }: { fees: Fees }) {
    const rows = fees.rows.filter((r) => COLS.some((c) => r[c.key]));
    const cols = COLS.filter((c) => rows.some((r) => r[c.key]));
    if (!rows.length || !cols.length) return null;
    const caddie = fees.extra?.caddie ?? null, cart = fees.extra?.cart ?? null;
    const wd = weekdayFee(fees);
    const perHead = wd && (caddie || cart) ? wd + Math.round(((caddie ?? 0) + (cart ?? 0)) / 4) : null;

    return (
        <Section id="fee" title="그린피">
            <Card className="overflow-hidden">
                <table className="w-full text-[14px] tabular-nums">
                    <thead>
                        <tr className="text-[12px] text-[#FFFFFF80]">
                            <th className="text-left font-medium px-3.5 py-2.5">구분</th>
                            {cols.map((c) => <th key={c.key} className="text-right font-medium px-3 py-2.5">{c.label}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#FFFFFF0F] border-t border-[#FFFFFF0F]">
                        {rows.map((r) => {
                            const weekend = /토|일|주말|공휴/.test(r.day);
                            return (
                                <tr key={r.day}>
                                    <td className={`px-3.5 py-3 font-medium ${weekend ? "text-[#FF8A80]" : "text-[#FFFFFFCC]"}`}>{r.day}</td>
                                    {cols.map((c, i) => (
                                        <td key={c.key} className={`px-3 py-3 text-right ${i === 0 ? "text-white font-semibold" : "text-[#FFFFFFB3]"}`}>
                                            {wonShort(r[c.key]) || <span className="text-[#FFFFFF33]">—</span>}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {(caddie || cart) && (
                    <div className="px-4 py-3 border-t border-[#FFFFFF0F] bg-[#FFFFFF05] flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                        {caddie ? <span><span className="text-[#FFFFFF80]">캐디피</span> <span className="text-white font-medium tabular-nums">{wonShort(caddie)}</span></span> : null}
                        {cart ? <span><span className="text-[#FFFFFF80]">카트비</span> <span className="text-white font-medium tabular-nums">{wonShort(cart)}</span></span> : null}
                        {perHead && <span className="ml-auto text-[#FFFFFF99]">4인 주중 1인 약 <span className="text-[#8BE84A] font-semibold tabular-nums">{wonShort(perHead)}</span></span>}
                    </div>
                )}
            </Card>
        </Section>
    );
}
