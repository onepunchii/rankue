/**
 * 조인 만들기(2026-09-21 오너: "더 심플하고 누구나 만들기 쉽게, 남녀 구별, 스크린 조인").
 *
 * 부킹 폼(BookingCreateForm — 매니저 전화·핫딜·취소 정책·블라인드)에서 조인만 떼어 냈다. 조인은 매장이 파는 티가 아니라
 * "같이 칠 사람" 이라 그 칸들이 필요 없고, 그게 폼을 복잡해 보이게 한 이유였다.
 *
 * 한 화면 세 묶음: ① 어디·언제 ② 누구(자리) ③ 비용·한마디. 게시 버튼이 못 채운 것을 말해 준다.
 * 자리는 경쟁 앱들이 쓰는 4자리 모델 — "나 · 내 동반자 · 모집" 을 한 줄씩 그리고 성별을 토글한다.
 * 굵기는 600 까지만(오너: "텍스트 두께가 두꺼워 답답하다").
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideX, LucideLoader2, LucideSearch, LucideMapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { cn } from "@/lib/utils";
import { COURSES } from "../../data/golfCourses";
import { GOLF_REGION_OPTIONS } from "@shared/golfRegions";
import {
    JOIN_OPTIONS, JOIN_TYPE_LABEL, JOIN_TYPES, normalizeSlots, openSlotCount,
    type CostMode, type JoinSlot, type JoinType, type SlotGender,
} from "@shared/golfJoin";
import { GenderToggle, SlotDots } from "./joinUi";
import { kstDateKey } from "@/lib/kst";
import { DateField, TimeField } from "../common/TeeTimePicker";

interface Props {
    onClose: () => void;
    /** 게시가 끝난 날짜(YYYY-MM-DD) — 목록이 그 날로 옮겨 가야 방금 올린 게 보인다 */
    onCreated?: (date: string) => void;
}

interface Place { name: string; address: string; lat: number; lng: number }

const ACCENT = "#FF6B00";
const field = "w-full h-11 px-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-[14px] text-white placeholder:text-white/35 outline-none focus:border-[#FF6B00]/60";
const chip = (on: boolean) => cn(
    "h-9 px-3.5 rounded-full text-[13px] font-medium border transition-colors",
    on ? "bg-[#FF6B00] border-[#FF6B00] text-white" : "bg-white/[0.04] border-white/10 text-white/70",
);
// 고른 칸은 강조색으로. bg-white 를 쓰면 안 된다 — 골프 테마(index.css :root[data-sport="GOLF"] .bg-white)가 어두운 면으로
// 바꿔 놓아 검정 글자가 사라진다(2026-09-21 오너 캡처: "스크린" 이 안 보임).
const seg = (on: boolean) => cn("flex-1 h-10 rounded-lg text-[13.5px] font-medium transition-colors", on ? "bg-[#FF6B00] text-white" : "text-white/60");

export function JoinCreateSheet({ onClose, onCreated }: Props) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { member } = useAuth();
    const { location, requestLocation } = useNativeBridge();

    const [type, setType] = useState<JoinType>("FIELD");
    // 장소
    const [query, setQuery] = useState("");
    const [course, setCourse] = useState<{ id: number | string; name: string; region: string } | null>(null);
    const [place, setPlace] = useState<Place | null>(null);
    const [region, setRegion] = useState<string>("");
    // 날짜·시간
    const today = kstDateKey(Date.now());
    const [date, setDate] = useState(today);
    const [time, setTime] = useState("");
    // 자리
    const myGender: SlotGender = (member as any)?.gender === "male" ? "M" : (member as any)?.gender === "female" ? "F" : "ANY";
    const [hostGender, setHostGender] = useState<SlotGender>(myGender === "ANY" ? "M" : myGender);
    const [guests, setGuests] = useState<SlotGender[]>([]);          // 내 동반자
    const [open, setOpen] = useState<SlotGender[]>(["ANY", "ANY"]);  // 모집 자리
    useEffect(() => { if (myGender !== "ANY") setHostGender(myGender); }, [myGender]);
    // 옵션·비용·한마디
    const [options, setOptions] = useState<string[]>([]);
    const [costMode, setCostMode] = useState<CostMode>("FIXED");
    const [fee, setFee] = useState("");
    const [comment, setComment] = useState("");

    // 종류를 바꾸면 장소와 비용 기본값이 바뀐다 — 스크린·파크는 1/N 이 보통이다.
    const pickType = (t: JoinType) => {
        setType(t); setCourse(null); setPlace(null); setQuery("");
        setCostMode(t === "FIELD" ? "FIXED" : "SPLIT");
        setOptions((o) => o.filter((id) => JOIN_OPTIONS.find((x) => x.id === id)?.types.includes(t)));
    };

    // 필드: 골프장 마스터에서 이름으로. 스크린·파크: 장소 검색(키가 있을 때) — 없으면 이름 직접 입력.
    const courseHits = useMemo(() => {
        if (type !== "FIELD" || !query || course) return [];
        const q = query.toLowerCase();
        return COURSES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
    }, [type, query, course]);
    const places = useQuery<Place[]>({
        queryKey: ["/api/hiq/golf/places", query, location?.lat, location?.lng],
        queryFn: async () => {
            const p = new URLSearchParams({ q: query });
            if (location) { p.set("lat", String(location.lat)); p.set("lng", String(location.lng)); }
            return apiRequest(`/api/hiq/golf/places?${p.toString()}`);
        },
        enabled: type !== "FIELD" && query.trim().length >= 2 && !place,
        retry: false,
        staleTime: 60_000,
    });
    const placeApiOff = places.isError && (places.error as any)?.status === 501;

    const slots: JoinSlot[] = [
        { role: "HOST", gender: hostGender },
        ...guests.map((g): JoinSlot => ({ role: "GUEST", gender: g })),
        ...open.map((g): JoinSlot => ({ role: "OPEN", gender: g })),
    ];
    const slotsOk = normalizeSlots(slots) !== null;
    const total = 1 + guests.length + open.length;
    const canAddGuest = total < 4 && open.length >= 1;
    const canAddOpen = total < 4;

    const venueName = type === "FIELD" ? course?.name ?? "" : (place?.name ?? query.trim());
    const missing =
        !venueName ? (type === "FIELD" ? "골프장을 골라 주세요" : "장소 이름을 적어 주세요")
            : !date ? "날짜를 골라 주세요"
                : !time ? "시간을 골라 주세요"
                    : !slotsOk ? "모집 자리를 하나 이상 두세요"
                        : costMode === "FIXED" && !fee ? "비용을 적어 주세요"
                            : null;

    const create = useMutation({
        mutationFn: async () => {
            const regionText = type === "FIELD" ? course!.region : (region || place?.address?.split(" ")[0] || JOIN_TYPE_LABEL[type]);
            return apiRequest("/api/hiq/golf/bookings", {
                method: "POST",
                body: {
                    listingType: "JOIN",
                    joinType: type,
                    courseId: type === "FIELD" ? String(course!.id) : "venue",
                    courseName: venueName,
                    venueName: type === "FIELD" ? null : venueName,
                    region: regionText,
                    lat: place?.lat ?? null, lng: place?.lng ?? null,
                    // 시간대를 반드시 붙인다 — 없으면 서버(UTC)가 9시간 밀린 티타임으로 저장한다.
                    datetime: `${date}T${time}:00+09:00`,
                    greenFee: costMode === "SPLIT" ? 0 : parseInt(fee.replace(/[^0-9]/g, ""), 10) || 0,
                    costMode,
                    slots,
                    options,
                    // 옛 화면·검색이 보는 요약 — 자리 정보의 요약본일 뿐이다
                    joinHeadcount: openSlotCount(slots),
                    joinCondition: open.every((g) => g === "M") ? "남성" : open.every((g) => g === "F") ? "여성" : "성별무관",
                    comment: comment.trim() || null,
                    policyType: "POLICY_CUSTOM",
                },
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] }); // 조인 탭 목록은 키가 다르다 — 오늘 글을 오늘 화면에서 올리면 안 새로워졌다
            qc.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });
            toast({ title: "조인을 올렸어요", description: "신청이 오면 알려 드릴게요." });
            onCreated?.(date);
            onClose();
        },
        onError: (e: any) => toast({ variant: "destructive", title: "올리지 못했어요", description: e?.message }),
    });

    const section = "space-y-3";
    const label = "text-[12px] font-medium text-white/50";
    const optionsForType = JOIN_OPTIONS.filter((o) => o.types.includes(type));

    return (
        <div className="h-full flex flex-col bg-[#121212] text-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                <h2 className="text-[17px] font-semibold">조인 만들기</h2>
                <button type="button" onClick={onClose} aria-label="닫기" className="p-2 -mr-2 text-white/50"><LucideX className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7 pb-28">
                {/* ① 어디·언제 */}
                <section className={section}>
                    <div className="flex rounded-xl bg-white/[0.06] p-1">
                        {JOIN_TYPES.map((t) => (
                            <button key={t} type="button" onClick={() => pickType(t)} className={seg(type === t)}>{JOIN_TYPE_LABEL[t]}</button>
                        ))}
                    </div>

                    <div className="relative">
                        <LucideSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setCourse(null); setPlace(null); }}
                            placeholder={type === "FIELD" ? "골프장 이름 (예: 88, 한양)" : type === "SCREEN" ? "스크린 매장 이름" : "파크골프장 이름"}
                            className={cn(field, "pl-10")}
                        />
                        {(courseHits.length > 0 || (places.data?.length ?? 0) > 0) && (
                            <ul className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-[#1E1E1E] border border-white/10 overflow-hidden shadow-xl">
                                {type === "FIELD"
                                    ? courseHits.map((c) => (
                                        <li key={c.id}>
                                            <button type="button" onClick={() => { setCourse({ id: c.id, name: c.name, region: c.region }); setQuery(c.name); }} className="w-full text-left px-4 py-2.5 hover:bg-white/[0.06]">
                                                <span className="block text-[14px] text-white">{c.name}</span>
                                                <span className="block text-[12px] text-white/45">{c.region} · {c.address}</span>
                                            </button>
                                        </li>
                                    ))
                                    : (places.data ?? []).map((p) => (
                                        <li key={`${p.name}${p.lat}`}>
                                            <button type="button" onClick={() => { setPlace(p); setQuery(p.name); }} className="w-full text-left px-4 py-2.5 hover:bg-white/[0.06]">
                                                <span className="block text-[14px] text-white">{p.name}</span>
                                                <span className="block text-[12px] text-white/45">{p.address}</span>
                                            </button>
                                        </li>
                                    ))}
                            </ul>
                        )}
                    </div>
                    {type !== "FIELD" && (
                        <div className="space-y-2">
                            {/* 장소 검색이 꺼져 있어도 따로 안내하지 않는다(2026-09-23 오너: 없는 기능 예고를 걷어냈다) —
                                입력칸 placeholder 가 무엇을 적는 칸인지 말하고, 바로 아래 지역 칩이 나머지를 받는다. */}
                            {!placeApiOff && !location && !place && (
                                <button type="button" onClick={() => { void requestLocation(); }} className="inline-flex items-center gap-1.5 text-[12.5px] text-[#FF8A33]">
                                    <LucideMapPin className="w-3.5 h-3.5" /> 내 위치 근처부터 찾기
                                </button>
                            )}
                            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-5 px-5">
                                {GOLF_REGION_OPTIONS.map((r) => (
                                    <button key={r.id} type="button" onClick={() => setRegion(region === r.label ? "" : r.label)} className={cn(chip(region === r.label), "shrink-0")}>{r.label}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 부킹 시트와 같은 달력·시계(TeeTimePicker). 조인은 시간이 보통 하나라 단수 쪽을 쓴다. */}
                    <DateField value={date} onChange={setDate} today={today} accent={ACCENT} onAccent="#ffffff" />
                    <TimeField value={time} onChange={setTime} accent={ACCENT} onAccent="#ffffff" />
                </section>

                {/* ② 누구 */}
                <section className={section}>
                    <div className="flex items-center justify-between">
                        <span className={label}>자리</span>
                        <SlotDots slots={slots} size={20} />
                    </div>
                    <ul className="rounded-xl bg-white/[0.04] border border-white/[0.08] divide-y divide-white/[0.06]">
                        <li className="flex items-center gap-3 px-3.5 h-12">
                            <span className="flex-1 text-[14px] text-white">나</span>
                            <GenderToggle value={hostGender} onChange={setHostGender} allowAny={false} />
                        </li>
                        {guests.map((g, i) => (
                            <li key={`g${i}`} className="flex items-center gap-3 px-3.5 h-12">
                                <span className="flex-1 text-[14px] text-white">내 동반자</span>
                                <GenderToggle value={g} onChange={(v) => setGuests((a) => a.map((x, k) => (k === i ? v : x)))} allowAny={false} />
                                <button type="button" onClick={() => setGuests((a) => a.filter((_, k) => k !== i))} aria-label="동반자 빼기" className="text-white/40 text-[18px] leading-none px-1">×</button>
                            </li>
                        ))}
                        {open.map((g, i) => (
                            <li key={`o${i}`} className="flex items-center gap-3 px-3.5 h-12">
                                <span className="flex-1 text-[14px] text-[#FF8A33]">모집</span>
                                <GenderToggle value={g} onChange={(v) => setOpen((a) => a.map((x, k) => (k === i ? v : x)))} allowAny />
                                <button type="button" onClick={() => setOpen((a) => a.filter((_, k) => k !== i))} disabled={open.length <= 1} aria-label="모집 자리 빼기" className="text-white/40 text-[18px] leading-none px-1 disabled:opacity-25">×</button>
                            </li>
                        ))}
                    </ul>
                    <div className="flex gap-2">
                        <button type="button" disabled={!canAddGuest} onClick={() => setGuests((a) => [...a, "M"])} className={cn(chip(false), "disabled:opacity-35")}>+ 내 동반자</button>
                        <button type="button" disabled={!canAddOpen} onClick={() => setOpen((a) => [...a, "ANY"])} className={cn(chip(false), "disabled:opacity-35")}>+ 모집 자리</button>
                        <span className="ml-auto self-center text-[12px] text-white/45">{openSlotCount(slots)}명 모집 · {total}/4</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {optionsForType.map((o) => (
                            <button key={o.id} type="button" onClick={() => setOptions((a) => (a.includes(o.id) ? a.filter((x) => x !== o.id) : [...a, o.id]))} className={chip(options.includes(o.id))}>{o.label}</button>
                        ))}
                    </div>
                </section>

                {/* ③ 비용·한마디 */}
                <section className={section}>
                    <span className={label}>비용</span>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setCostMode("SPLIT")} className={chip(costMode === "SPLIT")}>{type === "FIELD" ? "현장에서 1/N" : "스크린비 1/N"}</button>
                        <button type="button" onClick={() => setCostMode("FIXED")} className={chip(costMode === "FIXED")}>{type === "FIELD" ? "그린피 금액" : "1인 금액"}</button>
                    </div>
                    {costMode === "FIXED" && (
                        <div className="relative">
                            <input inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ","))} placeholder={type === "FIELD" ? "그린피 (1인)" : "1인 금액"} className={cn(field, "pr-10")} />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-white/45">원</span>
                        </div>
                    )}
                    <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 200))} rows={2} placeholder="한마디 (선택) — 예: 명랑 골프, 90타대 환영" className={cn(field, "h-auto py-2.5 resize-none")} />
                </section>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-5 bg-[#121212] border-t border-white/[0.06]">
                <button
                    type="button" onClick={() => create.mutate()} disabled={!!missing || create.isPending}
                    className={cn("w-full h-12 rounded-xl text-[15px] font-semibold transition-colors", missing ? "bg-white/[0.06] text-white/40" : "text-white")}
                    style={missing ? undefined : { backgroundColor: ACCENT }}
                >
                    {create.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin inline" /> : (missing ?? "게시")}
                </button>
            </div>
        </div>
    );
}
