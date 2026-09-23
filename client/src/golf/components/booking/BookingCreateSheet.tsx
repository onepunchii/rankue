/**
 * 부킹 올리기(2026-09-21 오너: "간결하게, 누구나 쉽게 등록" → A안: 누구나 올리고 매장/개인 양도로 구분).
 *
 * 예전 폼(BookingCreateForm + 섹션 3개, 1,100줄)은 번호 붙은 5단계였다 — 익명 등록·별칭, 시간 모달, 취소 규정 라디오 3개,
 * 메모까지 전부 같은 크기로 늘어서서 복잡해 보였다. 꼭 필요한 건 **골프장·날짜·시간·가격 넷**이다.
 * 조인 시트와 같은 세 묶음: ① 어디·언제 ② 가격·옵션 ③ 더 보기(접힘: 익명·취소 규정·한마디). 굵기 600 까지만.
 * 같은 요금의 여러 시간은 "추가"로 칩만 쌓이고 한 번에 올라간다(매장 매니저의 일괄 등록은 그대로).
 *
 * 2026-09-23 오너: "부킹매니저가 일단 일이 편해야 많이 넘어온다." → 자리 고르는 한 줄을 가격 위에 뒀다.
 * 4자리(기본)는 예전과 완전히 같은 부킹이고, 1~3자리면 **같은 시트에서 그대로** 조인으로 올라간다.
 * 시트를 새로 여닫거나 타임마다 다시 고르게 하지 않는다 — 매니저의 기본 동작은 여러 타임 일괄 등록이다.
 *
 * 같은 날 오너: "'넘길 자리'가 무슨 말인지 모르겠다" → 말과 그림을 SeatsField 로 옮겼다(거기 주석 참고).
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LucideX, LucideLoader2, LucideSearch, LucideChevronDown, LucideZap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { COURSES } from "../../data/golfCourses";
import { SPECIAL_OPTIONS } from "../../constants/booking";
import { kstDateKey } from "@/lib/kst";
import { DateField, TimeListField } from "../common/TeeTimePicker";
import { MAX_SLOTS, type JoinSlot } from "@shared/golfJoin";
import { SeatsField } from "./SeatsField";

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
    const [times, setTimes] = useState<string[]>([]);
    const [fee, setFee] = useState("");
    // 앱에서 채울 자리. 4 = 팀 전체 양도(= 예전 그대로의 부킹), 1~3 = 남은 자리를 앱이 채워 주는 조인.
    // 기본값 4라 아무것도 안 건드리면 오늘과 결과가 같다 — 매니저에게 새 마찰이 0이어야 한다.
    const [seats, setSeats] = useState(MAX_SLOTS);
    const asJoin = seats < MAX_SLOTS;
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

    // 2026-09-23: 시간을 골라 놓고 "추가"를 안 눌러 빠뜨리는 사고(2026-09-10 제보)가 구조적으로 사라졌다.
    // TimeListField 는 고른 즉시 칩으로 담는다 — 칸에 머무는 '아직 안 담긴 시간' 이 없다.
    // 조인으로 보낼 자리 넷: 첫 칸 HOST(올린 사람) + 고른 자리만큼 OPEN + 나머지는 GUEST(이미 찬 자리).
    // normalizeSlots 규칙(2~4칸 · 첫 칸만 HOST · OPEN 1개 이상)을 그대로 지킨다 — 서버가 같은 함수로 검증한다.
    // 매니저는 성별까지 고를 일이 없으니(자기가 치는 팀이 아니다) 전부 ANY 로 둔다.
    const joinSlots = useMemo<JoinSlot[]>(() => [
        { role: "HOST", gender: "ANY" },
        ...Array.from({ length: seats }, (): JoinSlot => ({ role: "OPEN", gender: "ANY" })),
        ...Array.from({ length: MAX_SLOTS - 1 - seats }, (): JoinSlot => ({ role: "GUEST", gender: "ANY" })),
    ], [seats]);

    const missing =
        !phoneOk ? "휴대폰 번호를 먼저 등록해 주세요"
            : !course ? "골프장을 골라 주세요"
                : !date ? "날짜를 골라 주세요"
                    : times.length === 0 ? "티오프 시간을 골라 주세요"
                        : !fee ? "1인 가격을 적어 주세요"
                            : blind && !blindName.trim() ? "익명 표시 이름을 적어 주세요"
                                : policy === "POLICY_CUSTOM" && !policyText.trim() ? "취소 규정을 적어 주세요"
                                    : null;

    const create = useMutation({
        mutationFn: async () => {
            const body = times.map((t) => ({
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
                // 1~3자리면 같은 본문을 조인으로 바꿔 보낸다. 이 시트는 골프장 마스터에서 고르니 늘 FIELD 고,
                // 가격을 적어 올리니 FIXED 다. joinHeadcount·joinCondition 은 옛 화면·검색이 보는 요약값.
                ...(asJoin ? {
                    listingType: "JOIN",
                    joinType: "FIELD",
                    costMode: "FIXED",
                    slots: joinSlots,
                    joinHeadcount: seats,
                    joinCondition: "성별무관",
                } : null),
            }));
            return apiRequest("/api/hiq/golf/bookings", { method: "POST", body });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            // 조인으로 올렸으면 조인 목록도 갱신돼야 한다 — 키가 달라서 안 새로워졌다(조인 시트와 같은 이유).
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
            toast({
                title: asJoin
                    ? (times.length > 1 ? `${times.length}건을 조인으로 올렸어요` : "조인으로 올렸어요")
                    : (times.length > 1 ? `${times.length}건을 올렸어요` : "부킹을 올렸어요"),
            });
            onCreated?.(date);
            onClose();
        },
        onError: (e: any) => toast({ variant: "destructive", title: "올리지 못했어요", description: e?.message }),
    });

    const label = "text-[12px] font-medium text-white/50";
    // 익명 표시 이름 프리셋 — 옛 폼과 같은 넷(권역 명문 · 권역 회원제/퍼블릭 · IC 인근 · 접근성). 직접 입력도 된다.
    const zone = course ? course.region.substring(0, 2) : "";
    const aliases = course ? [`${zone}권 명문`, course.subType === "회원제" ? `${zone}권 회원제` : `${zone}권 퍼블릭`, "IC 인근 골프장", "접근성 좋은 구장"] : [];

    // 루트에 relative — 설명 팝업(SeatsField)이 이 시트 안에만 깔린다. 중첩 Dialog 를 쓰면 포커스 덫이 서로 싸운다.
    return (
        <div className="relative h-full flex flex-col bg-[#121212] text-white">
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

                    <DateField value={date} onChange={setDate} today={today} accent={ACCENT} onAccent="#051907" />
                    <TimeListField times={times} onChange={setTimes} accent={ACCENT} onAccent="#051907" />
                    {times.length > 1 && <p className="text-[12px] text-white/45 break-keep">같은 가격으로 {times.length}건이 한 번에 올라가요.</p>}
                </section>

                {/* ② 자리·가격·옵션 */}
                <section className="space-y-3">
                    {/* 앱에서 채울 자리 — 가격 바로 위. 이 시트에서 올리는 모든 티타임에 함께 적용된다. */}
                    <SeatsField seats={seats} onChange={setSeats} />

                    <span className={label}>1인 가격</span>
                    <div className="relative">
                        <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","))} placeholder="그린피 (1인)" className={cn(field, "pr-10")} />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-white/45">원</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {/* '긴급' 은 앱 전체에서 앰버 #FFB020 하나다(홈 티커의 ⚡긴급 배지와 같은 색).
                            예전엔 여기만 빨강 + 🔥 이모지라, 같은 말이 화면마다 다른 색으로 나왔다. */}
                        <button
                            type="button" onClick={() => setHotDeal((v) => !v)} aria-pressed={hotDeal}
                            className={cn(chip(hotDeal), "inline-flex items-center gap-1", hotDeal && "bg-[#FFB020] border-[#FFB020] text-[#2A1800]")}
                        >
                            <LucideZap className={cn("w-3.5 h-3.5", !hotDeal && "text-[#FFB020]")} />긴급 할인
                        </button>
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
                                    ? <p className="text-[12px] text-white/45 break-keep">{POLICIES.find((p) => p.id === policy)?.desc}</p>
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
                    {create.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin inline" /> : (missing ?? (times.length > 1 ? `${times.length}건 올리기` : "올리기"))}
                </button>
            </div>
        </div>
    );
}
