/**
 * 부킹 올리기(2026-09-21 오너: "간결하게, 누구나 쉽게 등록" → A안: 누구나 올리고 매장/개인 양도로 구분).
 *
 * 예전 폼(BookingCreateForm + 섹션 3개, 1,100줄)은 번호 붙은 5단계였다 — 익명 등록·별칭, 시간 모달, 취소 규정 라디오 3개,
 * 메모까지 전부 같은 크기로 늘어서서 복잡해 보였다. 꼭 필요한 건 **골프장·날짜·시간·가격 넷**이다.
 * 조인 시트와 같은 세 묶음: ① 어디·언제 ② 가격·옵션 ③ 더 보기(접힘: 익명·취소 규정·한마디). 굵기 600 까지만.
 * 같은 요금의 여러 시간은 "추가"로 칩만 쌓이고 한 번에 올라간다(매장 매니저의 일괄 등록은 그대로).
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LucideX, LucideLoader2, LucideSearch, LucideChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { COURSES } from "../../data/golfCourses";
import { SPECIAL_OPTIONS } from "../../constants/booking";
import { kstDateKey } from "@/lib/kst";

interface Props {
    onClose: () => void;
    /** 올린 날짜(YYYY-MM-DD) — 목록이 그 날로 옮겨 가야 방금 올린 게 보인다 */
    onCreated?: (date: string) => void;
}

const ACCENT = "#64DD17";
const field = "w-full h-11 px-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-[#64DD17]/60";
const chip = (on: boolean) => cn(
    "h-9 px-3.5 rounded-full text-[13px] font-medium border transition-colors",
    on ? "bg-[#64DD17] border-[#64DD17] text-[#051907]" : "bg-white/[0.04] border-white/10 text-white/70",
);

function addDays(key: string, n: number): string {
    const [y, m, d] = key.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const POLICIES = [
    { id: "POLICY_STANDARD", label: "표준", desc: "우천 시 현장 기준 환불 · 4일 전 취소 가능" },
    { id: "POLICY_STRICT", label: "취소 불가", desc: "휴장 시에만 환불 · 양도만 가능" },
    { id: "POLICY_CUSTOM", label: "직접 입력", desc: "" },
] as const;

export function BookingCreateSheet({ onClose, onCreated }: Props) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { member } = useAuth();
    const phoneOk = !!member?.phone && !String(member.phone).startsWith("social:");

    const [query, setQuery] = useState("");
    const [course, setCourse] = useState<{ id: number | string; name: string; region: string; subType?: string } | null>(null);
    const today = kstDateKey(Date.now());
    const [date, setDate] = useState(today);
    const [time, setTime] = useState("");
    const [times, setTimes] = useState<string[]>([]);
    const [fee, setFee] = useState("");
    const [hotDeal, setHotDeal] = useState(false);
    const [options, setOptions] = useState<string[]>([]);
    const [more, setMore] = useState(false);
    const [blind, setBlind] = useState(false);
    const [blindName, setBlindName] = useState("");
    const [policy, setPolicy] = useState<(typeof POLICIES)[number]["id"]>("POLICY_STANDARD");
    const [policyText, setPolicyText] = useState("");
    const [comment, setComment] = useState("");

    const hits = useMemo(() => {
        if (!query || course) return [];
        const q = query.toLowerCase();
        return COURSES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
    }, [query, course]);

    const addTime = () => {
        if (!time) return;
        setTimes((a) => (a.includes(time) ? a : [...a, time].sort()));
        setTime("");
    };
    // 시간을 골라 놓고 "추가"를 안 누른 채 올리는 일이 많다(2026-09-10 제보) — 입력칸의 시간도 함께 센다.
    const allTimes = time && !times.includes(time) ? [...times, time].sort() : times;

    const missing =
        !phoneOk ? "휴대폰 번호를 먼저 등록해 주세요"
            : !course ? "골프장을 골라 주세요"
                : !date ? "날짜를 골라 주세요"
                    : allTimes.length === 0 ? "티오프 시간을 골라 주세요"
                        : !fee ? "1인 가격을 적어 주세요"
                            : blind && !blindName.trim() ? "익명 표시 이름을 적어 주세요"
                                : policy === "POLICY_CUSTOM" && !policyText.trim() ? "취소 규정을 적어 주세요"
                                    : null;

    const create = useMutation({
        mutationFn: async () => {
            const body = allTimes.map((t) => ({
                listingType: "BOOKING",
                courseId: String(course!.id), courseName: course!.name, region: course!.region,
                // 시간대를 반드시 붙인다 — 없으면 서버(UTC)가 9시간 밀린 티타임으로 저장한다.
                datetime: `${date}T${t}:00+09:00`,
                greenFee: parseInt(fee.replace(/[^0-9]/g, ""), 10) || 0,
                isHotDeal: hotDeal,
                options,
                isBlind: blind, blindName: blind ? blindName.trim() : null,
                policyType: policy, policyCustomText: policy === "POLICY_CUSTOM" ? policyText.trim() : null,
                comment: comment.trim() || null,
            }));
            return apiRequest("/api/hiq/golf/bookings", { method: "POST", body });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
            toast({ title: allTimes.length > 1 ? `${allTimes.length}건을 올렸어요` : "부킹을 올렸어요" });
            onCreated?.(date);
            onClose();
        },
        onError: (e: any) => toast({ variant: "destructive", title: "올리지 못했어요", description: e?.message }),
    });

    const label = "text-[12px] font-medium text-white/50";
    // 익명 표시 이름 프리셋 — 옛 폼과 같은 넷(권역 명문 · 권역 회원제/퍼블릭 · IC 인근 · 접근성). 직접 입력도 된다.
    const zone = course ? course.region.substring(0, 2) : "";
    const aliases = course ? [`${zone}권 명문`, course.subType === "회원제" ? `${zone}권 회원제` : `${zone}권 퍼블릭`, "IC 인근 골프장", "접근성 좋은 구장"] : [];

    return (
        <div className="h-full flex flex-col bg-[#121212] text-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                <h2 className="text-[17px] font-semibold">부킹 올리기</h2>
                <button type="button" onClick={onClose} aria-label="닫기" className="p-2 -mr-2 text-white/50"><LucideX className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7 pb-28">
                {/* ① 어디·언제 */}
                <section className="space-y-3">
                    <div className="relative">
                        <LucideSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setCourse(null); }}
                            placeholder="골프장 이름 (예: 88, 한양)"
                            className={cn(field, "pl-10")}
                        />
                        {hits.length > 0 && (
                            <ul className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-[#1E1E1E] border border-white/10 overflow-hidden shadow-xl">
                                {hits.map((c) => (
                                    <li key={c.id}>
                                        <button type="button" onClick={() => { setCourse({ id: c.id, name: c.name, region: c.region, subType: (c as any).subType }); setQuery(c.name); }} className="w-full text-left px-4 py-2.5 hover:bg-white/[0.06]">
                                            <span className="block text-[14px] text-white">{c.name}</span>
                                            <span className="block text-[12px] text-white/45">{c.region} · {c.address}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex gap-1.5">
                        {[["오늘", 0], ["내일", 1], ["모레", 2]].map(([l, n]) => (
                            <button key={l as string} type="button" onClick={() => setDate(addDays(today, n as number))} className={chip(date === addDays(today, n as number))}>{l as string}</button>
                        ))}
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className={cn(field, "[color-scheme:dark]")} aria-label="날짜" />
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTime(); }} className={cn(field, "[color-scheme:dark]")} aria-label="티오프 시간" />
                        <button type="button" onClick={addTime} disabled={!time} className="h-11 px-4 rounded-xl bg-white/[0.08] text-[14px] font-medium text-white disabled:opacity-35">추가</button>
                    </div>
                    {times.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {times.map((t) => (
                                <button key={t} type="button" onClick={() => setTimes((a) => a.filter((x) => x !== t))} className="h-8 pl-3 pr-2 rounded-full bg-[#64DD17]/15 text-[#8BE84A] text-[13px] font-medium inline-flex items-center gap-1" aria-label={`${t} 빼기`}>
                                    {t} <span className="text-[#8BE84A]/60">×</span>
                                </button>
                            ))}
                            <span className="self-center text-[12px] text-white/45">같은 가격으로 {times.length}건</span>
                        </div>
                    )}
                </section>

                {/* ② 가격·옵션 */}
                <section className="space-y-3">
                    <span className={label}>1인 가격</span>
                    <div className="relative">
                        <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","))} placeholder="그린피 (1인)" className={cn(field, "pr-10")} />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-white/45">원</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => setHotDeal((v) => !v)} className={cn(chip(hotDeal), hotDeal && "bg-red-500 border-red-500 text-white")}>🔥 긴급 할인</button>
                        {SPECIAL_OPTIONS.map((o) => (
                            <button key={o.id} type="button" onClick={() => setOptions((a) => (a.includes(o.id) ? a.filter((x) => x !== o.id) : [...a, o.id]))} className={chip(options.includes(o.id))}>{o.label}</button>
                        ))}
                    </div>
                </section>

                {/* ③ 더 보기 — 대부분 안 건드린다. 기본값(공개·표준 규정·메모 없음)으로 올라간다. */}
                <section className="space-y-3">
                    <button type="button" onClick={() => setMore((v) => !v)} className="w-full flex items-center justify-between text-[13px] font-medium text-white/60">
                        <span>더 보기 — 익명 · 취소 규정 · 한마디{!more && policy === "POLICY_STANDARD" && !blind && !comment ? " (기본값)" : ""}</span>
                        <LucideChevronDown className={cn("w-4 h-4 transition-transform", more && "rotate-180")} />
                    </button>
                    {more && (
                        <div className="space-y-4 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
                            <div className="space-y-2">
                                <label className="flex items-center justify-between text-[14px] text-white">
                                    <span>골프장 이름 숨기기</span>
                                    <input type="checkbox" checked={blind} onChange={(e) => { setBlind(e.target.checked); if (e.target.checked && !blindName && course) setBlindName(`${course.region} 골프장`); }} className="w-5 h-5 accent-[#64DD17]" />
                                </label>
                                {blind && (
                                    <>
                                        <div className="flex flex-wrap gap-1.5">
                                            {aliases.map((a) => <button key={a} type="button" onClick={() => setBlindName(a)} className={chip(blindName === a)}>{a}</button>)}
                                        </div>
                                        <input value={blindName} onChange={(e) => setBlindName(e.target.value.slice(0, 30))} placeholder="대신 보일 이름 직접 입력" className={field} />
                                    </>
                                )}
                            </div>
                            <div className="space-y-2">
                                <span className={label}>취소·환불 규정</span>
                                <div className="flex gap-1.5">
                                    {POLICIES.map((p) => <button key={p.id} type="button" onClick={() => setPolicy(p.id)} className={chip(policy === p.id)}>{p.label}</button>)}
                                </div>
                                {policy !== "POLICY_CUSTOM"
                                    ? <p className="text-[12px] text-white/45">{POLICIES.find((p) => p.id === policy)?.desc}</p>
                                    : <textarea value={policyText} onChange={(e) => setPolicyText(e.target.value.slice(0, 300))} rows={2} placeholder="취소·환불 규정을 적어 주세요" className={cn(field, "h-auto py-2.5 resize-none")} />}
                            </div>
                            <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 300))} rows={2} placeholder="한마디 (선택) — 예: 카트비 포함, 2인 플레이 가능" className={cn(field, "h-auto py-2.5 resize-none")} />
                        </div>
                    )}
                </section>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-5 bg-[#121212] border-t border-white/[0.06]">
                <button
                    type="button" onClick={() => create.mutate()} disabled={!!missing || create.isPending}
                    className={cn("w-full h-12 rounded-xl text-[15px] font-semibold transition-colors", missing ? "bg-white/[0.06] text-white/40" : "text-[#051907]")}
                    style={missing ? undefined : { backgroundColor: ACCENT }}
                >
                    {create.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin inline" /> : (missing ?? (allTimes.length > 1 ? `${allTimes.length}건 올리기` : "올리기"))}
                </button>
            </div>
        </div>
    );
}
