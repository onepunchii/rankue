/**
 * /hiking/trail/<산> — 산행 중 '길 띠'(2026-10-13 오너: "gps 추적을 통해 트래킹 체크 … 트래킹 중에 갈림길도 알려 주고 … 너무 복잡하지 않게").
 *
 * 지도가 아니라 **코스의 높낮이 띠 위에 내 자리**를 놓는다. 한 화면에 셋만: 길 띠(지나온 만큼 산호빛) · 정상까지 남은 것 · 앞에 있는 것(갈림길 · 위험 구간 · 대피소).
 * 정상 가까이 오면 정상 인증을 권하고, 마치면 요약(시간 · 길 위의 거리 · 오른 높이)을 남긴다.
 *
 *  - 화면이 켜져 있는 동안만 위치를 본다(지금 앱의 한계 — 기획서 6장의 A 걸음). 켜 둔 동안은 화면이 꺼지지 않게 한다.
 *  - **위치는 이 기기에서만 쓴다.** 걸은 길 · 좌표는 저장하지 않는다(shared/hikingTrail · migrations/hiking_trips.sql).
 *  - 코스 선은 2022년 기록을 줄인 것이라 '길을 벗어났다'는 경보는 내지 않는다 — 이 코스에서 아주 멀 때만 알린다. 안내는 참고용이라고 적는다.
 * 등산을 쓸 수 있는 회원만 쓴다. ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { CoachTour } from "@/components/hiq/CoachTour";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appConfirm } from "@/components/AppDialog";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { apiRequest } from "@/lib/queryClient";
import { durationText } from "@shared/hikingGeo";
import { heightText, hikingMountainPath } from "@shared/hikingMountains";
import { courseFacts } from "@shared/hikingPage";
import { HIKING_POI_NAME, gridNumber, hikingPoiTitle, type HikingPoiKind } from "@shared/hikingPois";
import { TRAIL_OFF_STREAK, aheadText, offStreak, trailSpeech, type TrailPoi } from "@shared/hikingTrail";
import { CourseProfile } from "../components/CourseParts";
import { HikingShell, HkSkel } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { mountainKey, type MountainDetail } from "../lib/api";
import { MyPhotos } from "../photos/MyPhotos";
import { SummitCheckin } from "../stamps/SummitCheckin";
import { useHikingStamps } from "../stamps/useHikingStamps";
import { POI_COLOR } from "../theme";
import { CourseMap } from "../components/CourseMap";
import { kstYmd, sunTimes, sunsetNotice } from "@shared/hikingSun";
import { bgWatchAvailable } from "../trail/bgWatch";
import { setVoiceOn, speakLine, voiceOn } from "../trail/speak";
import { MY_TRIPS_KEY, dropKeptTrail, keepTrail, readKeptTrail, useTrail } from "../trail/useTrail";
import { locationMessage } from "@shared/hikingShare";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

/** 앞에 알려 줄 지점 — 국가지점번호 · 그 밖의 표지는 '다음'에 넣지 않는다(국가지점번호는 아래에 따로) */
const NEXT_KINDS: readonly HikingPoiKind[] = ["SIGN", "DANGER", "SHELTER", "WATER", "TOILET", "VIEW", "PEAK", "CULTURAL", "WILD"];
/** 걸은 시간 — 분까지 그대로("1시간 42분" · "23분"). durationText 는 어림값(5분 단위)이라 여기에는 쓰지 않는다 */
const clock = (ms: number) => { const m = Math.max(0, Math.round(ms / 60_000)); return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`; };

export default function TrailPage() {
    const [, params] = useRoute<{ slug: string }>("/hiking/trail/:slug");
    const slug = params?.slug ? decodeURIComponent(params.slug) : "";
    const picked = new URLSearchParams(useSearch()).get("c");
    const hikingOk = useHikingAccess();
    const qc = useQueryClient();
    const { data: d, isLoading } = useQuery<MountainDetail>({ queryKey: mountainKey(slug), enabled: !!slug, staleTime: 10 * 60_000 });
    const my = useHikingStamps();

    const [courseId, setCourseId] = useState<string | null>(picked);
    const course = d?.courseList.find((c) => c.id === courseId) ?? d?.courseList[0] ?? null;
    const pois: TrailPoi[] = useMemo(() => (d && course ? d.pois.filter((p) => p.courseId === course.id && p.km != null).map((p) => ({ id: p.id, kind: p.kind, name: p.name, note: p.note, km: p.km! })) : []), [d, course]);
    const summit = d && d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
    // 해 지는 때 — 이 산의 자리와 오늘 날짜로 셈한다(화면이 다시 그려질 때마다 — 위치를 받을 때마다 그려진다)
    const sunset = summit ? sunsetNotice(Date.now(), sunTimes(kstYmd(Date.now()), summit.lat, summit.lng)) : null;

    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [done, setDone] = useState<{ minutes: number; km: number; gainM: number; reachedSummit: boolean; saved: boolean } | null>(null);
    const active = startedAt != null && !done;
    // 걷던 산행이 기기에 남아 있으면 이어서 — 잘못 눌러 화면을 떠났다 돌아와도 처음부터가 아니다
    useEffect(() => {
        if (!d || !hikingOk || startedAt != null) return;
        const kept = readKeptTrail(d.id);
        if (kept) { setCourseId(kept.courseId ?? null); setStartedAt(kept.startedAt); }
    }, [d, hikingOk]);
    const start = () => { const now = Date.now(); keepTrail(d!.id, { startedAt: now, courseId: course?.id ?? null, tally: undefined, prev: null, reached: false }); setStartedAt(now); };
    const trail = useTrail({ active, keepId: d?.id ?? null, line: course?.line ?? [], pois, summitKm: course?.summitKm ?? null, summit, kinds: NEXT_KINDS });
    // 화면이 꺼져도 받는 앱(1.4 부터)에서는 화면을 억지로 켜 두지 않는다 — 주머니에 넣고 걸어도 기록된다
    useKeepAwake(active && !trail.background);

    const finish = useMutation({
        mutationFn: async () => {
            const s = trail.summary();
            const endedAt = Date.now();
            const body = { mountainId: d!.id, courseId: course?.id ?? null, startedAt: new Date(startedAt!).toISOString(), endedAt: new Date(endedAt).toISOString(), km: Math.round(s.walkedKm * 100) / 100, gainM: Math.round(s.gainM), reachedSummit: s.reachedSummit };
            const r: { saved: boolean } = await apiRequest("/api/hiq/hiking/trips", { method: "POST", body: JSON.stringify(body) }).catch(() => ({ saved: false }));
            return { minutes: Math.round((endedAt - startedAt!) / 60_000), km: body.km, gainM: body.gainM, reachedSummit: body.reachedSummit, saved: !!r?.saved };
        },
        onSuccess: (r) => { dropKeptTrail(d!.id); setDone(r); qc.invalidateQueries({ queryKey: MY_TRIPS_KEY }); },
    });
    const end = async () => {
        if (!(await appConfirm({ title: "산행을 마칠까요?", message: "걸은 시간과 거리, 오른 높이를 남겨요. 걸은 길은 저장하지 않아요.", confirmText: "마치기", cancelText: "계속 걷기" }))) return;
        finish.mutate();
    };

    const s = trail.state;
    // 경로 이탈(50m) — 또렷한 위치에서 연속 두 번이어야 알린다. 알리는 순간에 한 번만 진동 · 말
    const [offCount, setOffCount] = useState(0);
    const offRef = useRef(0);
    useEffect(() => { if (!active) { offRef.current = 0; setOffCount(0); } }, [active]);
    useEffect(() => {
        if (!active || !s || s.coarse) return;
        const next = offStreak(offRef.current, !!s.off);
        offRef.current = next;
        setOffCount(next);
        if (next === TRAIL_OFF_STREAK && s.off) {
            try { navigator.vibrate?.([200, 120, 200]); } catch { /* 진동을 못 하는 기기 */ }
            if (voiceOn()) speakLine(`코스에서 약 ${s.off.m}미터 벗어났어요. 코스는 ${s.off.dir}쪽이에요.`);
        }
    }, [active, s]);
    const offNow = active && offCount >= TRAIL_OFF_STREAK && s?.off ? s.off : null;
    // 음성 안내 — 가까운 갈림길 · 위험 구간 · 대피소, 정상, 코스에서 멀어짐을 말로(짧게 · 드물게 — shared/hikingTrail.trailSpeech). 기본은 끔
    const [voice, setVoice] = useState(voiceOn);
    const said = useRef<Set<string>>(new Set());
    useEffect(() => { if (!active) said.current = new Set(); }, [active]);
    useEffect(() => {
        if (!active || !s) return;
        // 꺼 둔 동안에도 '이미 지난 것'은 적어 둔다 — 켜는 순간 지나온 지점을 한꺼번에 읽지 않게
        const r = trailSpeech(s, said.current);
        said.current = r.said;
        if (voice) for (const line of r.lines) speakLine(line);
    }, [s, active, voice]);
    const toggleVoice = () => { const on = !voice; setVoice(on); setVoiceOn(on); if (on) speakLine("음성 안내를 켰어요."); };
    // 가까운 국가지점번호 — 구조를 부를 때 알려 줄 번호
    const [sent, setSent] = useState<"idle" | "copied">("idle");
    const sendHere = async () => {
        if (!trail.here || !d) return;
        const text = locationMessage({ mountain: d.name, lat: trail.here.lat, lng: trail.here.lng, atMs: Date.now(), gridNo: grid?.no ?? null });
        if (Capacitor.isNativePlatform()) { await Share.share({ title: "내 위치", text }).catch(() => undefined); return; }
        if (navigator.share) {
            try { await navigator.share({ title: "내 위치", text }); return; } catch (e) { if (e instanceof Error && e.name === "AbortError") return; }
        }
        try { await navigator.clipboard.writeText(text); setSent("copied"); window.setTimeout(() => setSent("idle"), 4000); } catch { window.prompt("이 글을 복사해 보내세요", text); }
    };
    const grid = useMemo(() => {
        if (!s || !d || !course) return null;
        const near = d.pois.filter((p) => p.kind === "GRID" && p.courseId === course.id && p.km != null && gridNumber(p.note ?? p.name)).map((p) => ({ no: gridNumber(p.note ?? p.name)!, awayM: Math.round(Math.abs(p.km! - s.km) * 1000) })).sort((a, b) => a.awayM - b.awayM)[0];
        return near && near.awayM <= 600 ? near : null;
    }, [s, d, course]);
    const stamp = d ? my.stampOf(d.id) : undefined;

    if (isLoading) return <HikingShell title="산행" cta={null}><div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-44" /><HkSkel className="h-32" /></div></HikingShell>;
    if (!d) return <HikingShell title="산행" cta={null}><p className="px-5 pt-16 text-center text-[15px] text-[#F4EFE3B3]">없는 산이에요.</p></HikingShell>;

    return (
        <HikingShell title={`${d.name} 산행`} backTo={hikingMountainPath(d.slug)} cta={null} nav={!active}
            right={active ? <button type="button" onClick={end} disabled={finish.isPending} className="h-9 rounded-full bg-[#FFFFFF1F] px-3.5 text-[13.5px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF2E] disabled:opacity-50" data-testid="trail-end">마치기</button> : undefined}>
            <div className="px-5 pb-6 pt-4" data-testid="trail-page" data-phase={done ? "done" : active ? trail.phase : "ready"}>
                {/* 첫 산행의 코치마크(2026-10-14) — 걷기 전에 한 번: 길 띠 · 지도 · 시작 · 화면 */}
                <CoachTour id="hiking-trail" tone="hiking" when={!active && !done && !!course} steps={[
                    { target: "hk-ribbon", title: "길 띠", body: "코스의 높낮이예요. 걷기 시작하면 지금 내 자리가 이 위를 따라 움직이고, 앞의 갈림길 · 쉼터가 아래에 나와요." },
                    { target: "hk-map", title: "코스 지도", body: "코스가 어느 쪽으로 나 있는지 보여 줘요. 걷기 전에는 옅은 선을 눌러 다른 코스로 바꿀 수 있어요." },
                    { target: "hk-start", title: "산행 시작", body: "누르면 위치를 보기 시작해요. 정상 가까이(150m 안) 가면 '정상 인증' 단추가 떠요. 사진도 걷는 동안 남길 수 있어요." },
                    { target: "hk-screen", title: bgWatchAvailable() ? "화면을 꺼도 돼요" : "화면을 켜 두세요", body: bgWatchAvailable() ? "이 앱은 화면을 꺼도 기록해요. 기록하는 동안 '산행 기록 중' 표시가 떠 있어요." : "지금은 화면이 켜져 있는 동안만 위치를 봐요. 오르는 동안 화면이 꺼지지 않게 해 주세요." },
                ]} />
                {!hikingOk ? (
                    <>
                        <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-4 text-[14.5px] leading-relaxed text-[#F4EFE3CC] break-keep">산행 중에는 코스의 높낮이 띠 위에 내 자리를 놓고, 앞에 있는 갈림길 · 위험 구간 · 대피소와 정상까지 남은 거리를 알려 드려요.</p>
                        <div className="pt-6"><HikingCta /></div>
                    </>
                ) : !course ? (
                    <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-4 text-[14.5px] leading-relaxed text-[#F4EFE3CC] break-keep">이 산은 아직 받아 둔 코스가 없어 길 띠를 그릴 수 없어요. 정상 인증은 산 화면에서 할 수 있어요.</p>
                ) : done ? (
                    <div data-testid="trail-summary">
                        <p className="text-[13px] text-[#F6D9A8]">{done.reachedSummit ? "정상까지 다녀왔어요" : "산행을 마쳤어요"}</p>
                        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">{d.name}</h1>
                        <div className="mt-4 flex rounded-2xl bg-[#FFFFFF0A] py-4" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                            {([[clock(done.minutes * 60_000), "걸은 시간"], [`${done.km.toFixed(1)}km`, "길 위의 거리"], [`${done.gainM.toLocaleString("en-US")}m`, "오른 높이"]] as const).map(([v, label]) => (
                                <div key={label} className="flex-1 text-center">
                                    <div className="text-[21px] font-semibold tabular-nums leading-none">{v}</div>
                                    <div className="mt-1.5 text-[12.5px] text-[#F4EFE399]">{label}</div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-[13px] leading-snug text-[#F4EFE399] break-keep">{done.saved ? "산행 기록에 남겼어요." : "너무 짧은 산행은 기록에 남기지 않아요."} 거리와 높이는 화면을 켜 둔 동안 코스 선 위에서 잰 값이라 실제보다 적을 수 있어요.</p>
                        <Link href={hikingMountainPath(d.slug)} className="mt-5 flex h-12 items-center justify-center rounded-xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59]">{d.name} 화면으로</Link>
                    </div>
                ) : (
                    <>
                        {/* 코스 고르기 — 시작하기 전에만 */}
                        {!active && d.courseList.length > 1 && (
                            <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5" style={{ scrollbarWidth: "none" }} role="tablist" aria-label="코스 고르기">
                                {d.courseList.map((x) => (
                                    <button key={x.id} type="button" role="tab" aria-selected={x.id === course.id} onClick={() => setCourseId(x.id)} data-testid={`trail-course-${x.seq}`}
                                        className="h-10 shrink-0 rounded-full px-3.5 text-[13.5px]" style={{ background: x.id === course.id ? "#F28C6A" : "#FFFFFF14", color: x.id === course.id ? "#2A1208" : "#F4EFE3", fontWeight: x.id === course.id ? 600 : 400 }}>
                                        코스 {x.seq} · {courseFacts(x).km}
                                    </button>
                                ))}
                            </div>
                        )}

                        {offNow && (
                            <p className="mb-2 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold leading-snug break-keep" style={{ background: "#E0533B29", color: "#FFD4CC", boxShadow: "inset 0 0 0 1px #E0533B" }} role="alert" data-testid="trail-off">
                                코스에서 약 {offNow.m}m 벗어났어요 · 코스는 {offNow.dir}쪽
                            </p>
                        )}
                        {/* 위치의 상태 한 줄 */}
                        {active && (
                            <p className="mb-2 flex items-center gap-2 text-[13.5px]" role="status" data-testid="trail-status">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: trail.phase === "on" && s && !s.far && !s.coarse ? "#7FD48A" : trail.phase === "denied" ? "#E0533B" : "#F6D9A8" }} aria-hidden />
                                <span className="text-[#F4EFE3CC] break-keep">
                                    {trail.phase === "denied" ? "위치를 쓸 수 없어요. 설정에서 위치를 허용한 뒤 다시 시작해 주세요."
                                        : trail.phase === "locating" || !s ? "위치를 잡는 중이에요. 하늘이 트인 곳이면 빨라요."
                                        : trail.phase === "lost" ? "위치가 잠깐 끊겼어요. 마지막 자리를 보여 드려요."
                                        : s.coarse ? "위치가 흐려요. 마지막 자리를 보여 드려요."
                                        : s.far ? `이 코스에서 ${aheadText(s.offM)}쯤 떨어져 있어요. 코스가 맞는지 확인해 주세요.`
                                        : `길 위 · 위치 정확도 ${trail.accuracy != null ? `±${Math.round(trail.accuracy)}m` : "확인 중"}`}
                                </span>
                            </p>
                        )}
                        {/* 해 지는 때 — 세 시간 전부터 알린다(그 전에는 그리지 않는다). 내려갈 시간을 남기라는 말 */}
                        {active && sunset && (
                            <p className="mb-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[13.5px] leading-snug break-keep" role="status" data-testid="trail-sunset" data-urgent={sunset.urgent ? "1" : "0"}
                                style={sunset.urgent ? { background: "#F28C6A2E", color: "#FFD9C9", boxShadow: "inset 0 0 0 1px #F28C6A80" } : { background: "#F6D9A81F", color: "#F6D9A8" }}>
                                <svg width="17" height="17" viewBox="0 0 24 24" className="mt-0.5 shrink-0" aria-hidden><path d="M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M6.5 18a5.5 5.5 0 0 1 11 0" fill="currentColor" /></svg>
                                <span>{sunset.text}</span>
                            </p>
                        )}
                        {/* 화면이 꺼져도 받는 중(앱 1.4 부터) — 주머니에 넣어도 된다는 것을 알린다 */}
                        {active && trail.background && trail.phase !== "denied" && (
                            <p className="-mt-0.5 mb-2 pl-[18px] text-[12.5px] text-[#F4EFE380] break-keep" data-testid="trail-background">화면을 꺼도 기록돼요.</p>
                        )}

                        {/* 길 띠 */}
                        <div className="rounded-2xl bg-[#F4EFE3] px-2.5 pb-1.5 pt-2.5 text-[#0E2A33]" data-testid="trail-ribbon" data-tour="hk-ribbon">
                            <CourseProfile line={course.line} pois={pois.map((p) => ({ id: p.id, kind: p.kind as HikingPoiKind, km: p.km }))} summitKm={course.summitKm} now={active && s && !s.far ? s.km : null} />
                        </div>
                        {/* 코스 지도 — 길 띠는 '코스의 어디쯤'을, 지도는 '코스가 어느 쪽에 있는지'를 보여 준다(코스에서 벗어났을 때 돌아갈 방향이 보인다).
                            걷기 전에는 옅은 선을 눌러 코스를 바꿀 수 있고, 걷는 동안에는 바꾸지 않는다 */}
                        <div data-tour="hk-map"><CourseMap className="mt-3" courses={d.courseList} index={Math.max(0, d.courseList.findIndex((c) => c.id === course.id))} onPick={active ? undefined : (k) => setCourseId(d.courseList[k]?.id ?? null)}
                            pois={d.pois} summit={summit} here={active ? trail.here : null} live={active} /></div>

                        {!active ? (
                            <>
                                <div className="mt-3 flex rounded-2xl bg-[#FFFFFF0A] py-3.5">
                                    {([[courseFacts(course).km, "거리"], [courseFacts(course).gain, "오르막"], [courseFacts(course).time, "걷는 시간"]] as const).map(([v, label]) => (
                                        <div key={label} className="flex-1 text-center">
                                            <div className="text-[18px] font-semibold tabular-nums leading-none">{v}</div>
                                            <div className="mt-1.5 text-[12.5px] text-[#F4EFE399]">{label}</div>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={start} data-track-as="hiking-trail-start" data-testid="trail-start" data-tour="hk-start"
                                    className="mt-4 h-14 w-full rounded-2xl bg-[#F28C6A] text-[17px] font-semibold text-[#2A1208] active:bg-[#E67C59]">산행 시작</button>
                                <ul className="mt-4 space-y-1.5 text-[13px] leading-snug text-[#F4EFE399]" data-tour="hk-screen">
                                    <li className="break-keep">· {bgWatchAvailable()
                                        ? "화면을 꺼도 위치를 보고, 앞에 있는 갈림길 · 위험 구간 · 대피소를 알려 드려요. 기록하는 동안 '산행 기록 중' 표시가 떠 있어요."
                                        : "화면을 켜 둔 동안 위치를 보고, 앞에 있는 갈림길 · 위험 구간 · 대피소를 알려 드려요."}</li>
                                    <li className="break-keep">· 위치는 이 기기에서 길 위의 자리를 재는 데만 써요. 걸은 길은 저장하지 않아요.</li>
                                    <li className="break-keep">· 코스는 2022년 기록이에요. 안내는 참고용이니 현장의 표지와 통제를 따라 주세요.</li>
                                </ul>
                            </>
                        ) : (
                            <>
                                {/* 정상까지 */}
                                {s && !s.far && (
                                    <div className="mt-3 flex rounded-2xl bg-[#FFFFFF0A] py-3.5" data-testid="trail-summit-left">
                                        {(s.toSummitM != null
                                            ? [[aheadText(s.toSummitM), "정상까지"], [`${(s.climbToSummitM ?? 0).toLocaleString("en-US")}m`, "남은 오르막"], [durationText(s.minutesToSummit ?? 0), "걷는 시간(어림)"]]
                                            : [[aheadText(s.leftM), s.dir === 1 ? "끝까지" : "출발점까지"], [heightText(s.ele), "지금 높이"], [clock(Date.now() - startedAt!), "걸은 시간"]]
                                        ).map(([v, label]) => (
                                            <div key={label} className="flex-1 text-center">
                                                <div className="whitespace-nowrap text-[19px] font-semibold tabular-nums leading-none">{v}</div>
                                                <div className="mt-1.5 text-[12.5px] text-[#F4EFE399]">{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 정상 가까이 — 인증 */}
                                {s?.nearSummit && (
                                    <div className="mt-3 rounded-2xl bg-[#F4EFE3] px-3.5 py-3 text-[#0E2A33]" data-testid="trail-summit-near">
                                        <p className="text-[12.5px] text-[#8A5E00]">정상이 바로 앞이에요</p>
                                        <p className="mt-0.5 text-[16px] font-semibold break-keep">{stamp?.verified ? `${d.name}에 다시 올랐어요` : `${d.name} 정상 도장을 받아 가세요`}</p>
                                        <SummitCheckin key={`trail-checkin:${d.id}`} mountainId={d.id} name={d.name} stamp={stamp} hasSummit={!!summit} region={d.region} patch={d.lists.includes("kfs100")} />
                                    </div>
                                )}

                                {/* 다음 */}
                                {s && !s.far && (
                                    <section className="mt-5" aria-label="앞에 있는 것" data-testid="trail-next">
                                        <h2 className="mb-2 text-[15px] font-semibold text-[#F4EFE3]">다음</h2>
                                        {s.next.length === 0 ? (
                                            <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-3.5 text-[14px] text-[#F4EFE399]">이 방향으로는 알려 드릴 지점이 더 없어요.</p>
                                        ) : (
                                            <ul className="space-y-2">
                                                {s.next.map((n, i) => {
                                                    const kind = n.poi.kind as HikingPoiKind;
                                                    return (
                                                        <li key={n.poi.id} className="flex items-center gap-3 rounded-2xl px-3.5 py-3" data-testid={`trail-next-${i}`} data-kind={kind}
                                                            style={{ background: i === 0 ? "#FFFFFF14" : "#FFFFFF0A", boxShadow: i === 0 ? `inset 0 0 0 1px ${kind === "DANGER" ? "#E0533B" : "#FFFFFF24"}` : undefined }}>
                                                            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: POI_COLOR[kind] ?? "#8A979B", boxShadow: "0 0 0 2px #F4EFE3" }} aria-hidden />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-[12.5px]" style={{ color: kind === "DANGER" ? "#FF9C8A" : "#F4EFE399" }}>{HIKING_POI_NAME[kind] ?? "지점"}</span>
                                                                <span className={`block truncate text-[#F4EFE3] ${i === 0 ? "text-[17px] font-semibold" : "text-[15px]"}`}>{hikingPoiTitle({ kind, name: n.poi.name, note: n.poi.note })}</span>
                                                            </span>
                                                            <span className="shrink-0 text-right">
                                                                <span className={`block tabular-nums text-[#F6D9A8] ${i === 0 ? "text-[19px] font-semibold" : "text-[15px]"}`}>{aheadText(n.aheadM)}</span>
                                                                {n.climbM >= 10 && <span className="block text-[12.5px] tabular-nums text-[#F4EFE399]">오르막 {n.climbM}m</span>}
                                                            </span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </section>
                                )}

                                <button type="button" onClick={toggleVoice} aria-pressed={voice} data-track-as="hiking-trail-voice" data-testid="trail-voice"
                                    className="mt-4 flex h-12 w-full items-center justify-between rounded-xl px-4 text-[15px] text-[#F4EFE3] active:opacity-80" style={{ background: voice ? "#F28C6A29" : "#FFFFFF14", boxShadow: voice ? "inset 0 0 0 1px #F28C6A" : undefined }}>
                                    <span className="flex items-center gap-2.5 whitespace-nowrap">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10v4h3.5L12 18V6L7.5 10Z" />{voice && <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}</svg>
                                        음성 안내
                                    </span>
                                    <span className="shrink-0 text-[13.5px]" style={{ color: voice ? "#F6D9A8" : "#F4EFE399" }}>{voice ? "켜짐" : "꺼짐"}</span>
                                </button>
                                {voice && <p className="mt-1.5 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">갈림길 · 위험 구간 · 대피소가 가까워질 때와 정상에서 말로 알려요.</p>}

                                {/* 산행 중 사진 — 올리면 그 산의 화면에 보인다(사진마다 비공개로 돌릴 수 있다). 위치 정보는 지운다 */}
                                <div className="mt-5"><MyPhotos key={`trail-photos:${d.id}`} mountainId={d.id} name={d.name} compact /></div>

                                <button type="button" onClick={() => { void sendHere(); }} disabled={!trail.here} data-track-as="hiking-trail-send-location" data-testid="trail-send-location"
                                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24] disabled:opacity-40">
                                    {sent === "copied" ? "위치를 복사했어요 — 붙여 넣어 보내세요" : "내 위치 보내기"}
                                </button>
                                <p className="mt-1.5 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">지금 자리를 카카오맵 링크로 카카오톡 · 문자에 보내요. 서버에는 남지 않아요.</p>
                                {grid && (
                                    <p className="mt-4 rounded-2xl bg-[#FFFFFF0A] px-4 py-3 text-[13.5px] leading-snug text-[#F4EFE3CC] break-keep" data-testid="trail-grid">
                                        가까운 국가지점번호 <span className="font-semibold tabular-nums text-[#F4EFE3]">{grid.no}</span> · {aheadText(grid.awayM)} 거리. 도움을 청할 때 이 번호를 알려 주면 자리를 찾기 쉬워요.
                                    </p>
                                )}
                                <p className="mt-4 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">안내는 참고용이에요 — 현장의 표지와 통제를 따라 주세요. 위치는 이 기기에서만 쓰고, 화면이 켜져 있는 동안만 봐요.</p>
                                <button type="button" onClick={end} disabled={finish.isPending} className="mt-3 h-12 w-full rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24] disabled:opacity-50" data-testid="trail-end-bottom">산행 마치기</button>
                            </>
                        )}
                    </>
                )}
            </div>
        </HikingShell>
    );
}
