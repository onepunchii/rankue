/**
 * 골프 관리 — 골프장 데이터(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 왜 이 화면: 골프장 페이지 490곳의 빈칸(로고·홈페이지·전화)과, 경기 화면에 '파 미확인'으로 뜨는 코스(9홀)의 홀별 파를
 * 운영자가 손으로 채울 길이 없었다. 공식 사이트에서 파를 자동으로 채우는 작업이 따로 돌지만 이미지·차단 사이트는 사람이 넣어야 한다.
 *  - 빈칸 칩(파 미확인·코스 없음·로고·홈페이지·전화·좌표·원장 연결·요금, 숫자) + 검색 + 정렬(인기·관심·최근 라운드)
 *  - 줄을 누르면 시트: 골프장 페이지·홈페이지 링크 / 코스별 9칸 파(홀마다 3·4·5 빠른 단추, 합 경고) / 코스 추가 /
 *    홈페이지·전화 고치기 / 로고 올리기·내리기 / 원장 좌표(현장 인증이 이 점을 본다)
 *  - 골프장 이름 고치기 · 원장 좌표를 저장하면 골프장 페이지 좌표도 같이(2026-10-07 오너: "잘못된 정보라 수정가능하게").
 *    어드민에서 고친 이름·좌표·홈페이지·전화는 자료를 다시 적재해도 남는다(golf_course_pages.admin_keep)
 *  - 로고 올리기(2026-10-07): 골프장 홈페이지의 로고를 로고 칸에 끌어다 놓거나 · 복사해 붙여넣거나 · 파일을 고른다(shared/golfLogo.ts)
 *  - 파 저장은 묻고 저장한다 — 이 골프장으로 치는 경기 화면에 바로 쓰인다. 서버는 '고치기 전 값'이 그대로일 때만 쓴다
 *    (그 사이 다른 작업이 먼저 채웠으면 덮지 않고, 새 값을 불러와 보여 준다).
 * 규칙(9칸·3~6·합 34~37·전화·홈페이지·좌표 범위)은 shared/golfParEdit.ts 하나 — 서버도 같은 함수로 막는다.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { appConfirm } from "@/components/AppDialog";
import { cn } from "@/lib/utils";
import { LucideChevronRight, LucideExternalLink, LucidePlus, LucideRotateCcw, LucideSave, LucideMapPin, LucideUpload } from "@/lib/icons";
import { coursePath } from "@shared/golfCourse";
import { distanceKm } from "@shared/golfJoin";
import { ONSITE_RADIUS_KM } from "@shared/golfOnSite";
import {
    MISSING_KEYS, MISSING_LABEL, NINE, NINE_SUM_MIN, NINE_SUM_MAX, NINE_NAME_MAX,
    isParValue, isUnusualNineSum, cleanNineName, nineNameKey, cleanWebsite, cleanPhone,
    checkKoreaCoords, parseLatLngText, parseParsText, cleanCourseName, COURSE_NAME_MAX,
    type MissingKey, type PageCourse, type LogoOrigin,
} from "@shared/golfParEdit";
import { imageUrlFromDrop } from "@shared/golfLogo";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, KpiTile, kstDateTime, ADMIN_STICKY_TOP, SHEET_SAFE_TOP } from "../adminUtils";
import { rasterizeLogo, blobFromBase64, type LogoDraft } from "./logoUpload";

export const GOLF_COURSES_KEY = ["/api/hiq/admin/golf/courses"] as const;
const API = GOLF_COURSES_KEY[0];
const PAGE = 50;

// ── 서버 응답 모양(server/storage/adminGolfCourses.ts) ───────────────────
type Row = {
    slug: string; name: string; region: string; city: string | null; logo: string | null;
    missing: MissingKey[]; nines: number; ninesWithPars: number;
    watchers: number; listings: number; rounds90: number; popularity: number; bookable: boolean;
};
type ListResp = {
    total: number; limit: number; offset: number;
    counts: Record<"all" | MissingKey, number>;
    ledger: { nines: number; ninesWithPars: number };
    rows: Row[];
};
type Nine = { id: string; name: string; pars: unknown; known: boolean; liveMatches: number; updatedAt: string | null };
type Official = { checked: boolean; entry: { logo: string | null; website: string | null; source: string | null } | null };
type Detail = {
    slug: string; name: string; region: string; city: string | null; address: string | null;
    pageLat: number | null; pageLng: number | null;
    logo: string | null; website: string | null; phone: string | null; kind: string | null; holes: number | null;
    courses: PageCourse[] | null; hasFees: boolean; feeFrom: number | null; popularity: number; aliases: string[];
    bookable: boolean; updatedAt: string | null;
    club: { id: string; name: string; region: string | null; address: string | null; lat: number | null; lng: number | null; updatedAt: string | null } | null;
    clubMissing: boolean;
    nines: Nine[];
    liveMatches: number; watchers: number; listings: number; rounds90: number;
    sharedClubPages: { slug: string; name: string }[];
    official: Official;
    logoOrigin: LogoOrigin | null;
    /** 어드민에서 고친 칸(name · coords · website · phone) — 다시 적재해도 남는다 */
    adminKeep?: string[];
};

type Sort = "popularity" | "watchers" | "rounds";
const SORTS: { id: Sort; label: string }[] = [
    { id: "popularity", label: "인기순" },
    { id: "watchers", label: "관심 많은순" },
    { id: "rounds", label: "최근 라운드순" },
];

/** 빈칸 알약의 색 — 경기 화면·현장 인증에 걸리는 것(파·코스·좌표)만 눈에 띄게 */
const PILL_TONE: Record<MissingKey, "alert" | "warn" | "neutral"> = {
    pars: "warn", nines: "alert", coords: "alert", logo: "neutral", website: "neutral", phone: "neutral", club: "neutral", fees: "neutral",
};

const errMsg = (e: unknown) => (e as any)?.message || "잠시 후 다시 해 주세요";
const errCode = (e: unknown): string | undefined => (e as any)?.data?.code;
const isHttpUrl = (s: string | null | undefined): s is string => !!s && /^https?:\/\//i.test(s.trim());

// ── 로고 작은 판 ───────────────────────────────────────────────────
function LogoThumb({ logo, name, size = "sm" }: { logo: string | null; name: string; size?: "sm" | "lg" }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [logo]);
    const box = size === "lg" ? "w-14 h-14 rounded-xl" : "w-10 h-10 rounded-lg";
    if (!logo || broken) {
        const mono = (name.match(/[A-Za-z0-9가-힣]/g) ?? []).slice(0, 2).join("").toUpperCase() || "?";
        return <span aria-hidden className={cn(box, "shrink-0 inline-flex items-center justify-center bg-black/[0.05] text-black/45 font-bold", size === "lg" ? "text-[16px]" : "text-[12.5px]")}>{mono}</span>;
    }
    // 흰색뿐인 로고(-light.png)는 흰 판에서 안 보인다 — 골프장 페이지(CourseLogo)처럼 어두운 판에
    const light = /-light\.png$/i.test(logo);
    return (
        <span className={cn(box, "shrink-0 inline-flex items-center justify-center border border-black/[0.08] p-1", light ? "bg-[#1C1F1D]" : "bg-white")}>
            <img src={logo} alt="" loading="lazy" onError={() => setBroken(true)} className="max-w-full max-h-full object-contain" />
        </span>
    );
}

/** countPars: 폰 카드엔 '파 4/6'(옆에 칸이 없다), 넓은 표엔 '파 미확인'(옆 칸에 숫자가 있다) */
function MissingPills({ r, countPars = true }: { r: Row; countPars?: boolean }) {
    return (
        <>
            {r.missing.map((k) => (
                <Pill key={k} tone={PILL_TONE[k]}>
                    {k === "pars" && countPars ? `파 ${r.ninesWithPars}/${r.nines}` : MISSING_LABEL[k]}
                </Pill>
            ))}
        </>
    );
}

/** 관심·글·라운드 — 0 은 흐리게 */
function Num({ n, label }: { n: number; label: string }) {
    return <span className={cn("tabular-nums", n > 0 ? "text-[rgba(0,0,0,0.87)] font-bold" : "text-black/30")} title={label}>{n}</span>;
}

// ── 목록 ───────────────────────────────────────────────────────────
export default function GolfCoursesView() {
    const [missing, setMissing] = useState<"all" | MissingKey>("all");
    const [q, setQ] = useState("");
    const dq = useDebounce(q.trim(), 250);
    const [sort, setSort] = useState<Sort>("popularity");
    const [limit, setLimit] = useState(PAGE);
    const [openSlug, setOpenSlug] = useState<string | null>(null);
    useEffect(() => setLimit(PAGE), [missing, dq, sort]);

    const list = useQuery<ListResp>({
        queryKey: [...GOLF_COURSES_KEY, { missing: missing === "all" ? undefined : missing, q: dq || undefined, sort, limit }],
        placeholderData: keepPreviousData,
    });
    const data = list.data;
    const rows = Array.isArray(data?.rows) ? data!.rows : [];
    const counts = data?.counts;
    const ledger = data?.ledger;
    const pct = ledger && ledger.nines ? Math.round((ledger.ninesWithPars / ledger.nines) * 100) : 0;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
                <KpiTile label="골프장 페이지" value={counts?.all ?? "-"} unit="곳" onClick={() => setMissing("all")} />
                <KpiTile label="파 채운 코스" value={ledger ? pct : "-"} unit="%" tone="brand"
                    sub={ledger ? `${ledger.ninesWithPars.toLocaleString()}/${ledger.nines.toLocaleString()}줄` : undefined} />
                <KpiTile label="파 미확인 골프장" value={counts?.pars ?? "-"} unit="곳" tone={counts?.pars ? "alert" : "default"}
                    sub={counts ? `코스 없음 ${counts.nines}곳` : undefined} onClick={() => setMissing("pars")} />
            </div>

            {/* 도구 줄: 빈칸 칩(가로로 밀림) · 검색 · 정렬 */}
            <div className={`${ADMIN_STICKY_TOP} z-10 -mx-4 md:mx-0 px-4 md:px-0 py-2 bg-surface-0 space-y-2`}>
                <FilterChips value={missing} onChange={setMissing} options={[
                    { id: "all" as const, label: "전체", count: counts?.all },
                    ...MISSING_KEYS.map((k) => ({ id: k, label: MISSING_LABEL[k], count: counts?.[k], alert: k === "pars" || k === "nines" || k === "coords" })),
                ]} />
                <div className="flex gap-2">
                    <SearchBox value={q} onChange={setQ} placeholder="골프장 이름·지역" className="flex-1" />
                    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬"
                        className="h-10 px-2 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/65 outline-none">
                        {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </div>
            </div>

            {data && (
                <p className="text-[13px] font-bold text-black/50">
                    {missing === "all" && !dq ? "전체" : "조건에 맞는 골프장"} <span className="text-brand tabular-nums">{data.total.toLocaleString()}</span>곳
                    {missing !== "all" && <span className="ml-1.5 font-medium text-black/40">· {MISSING_HINT[missing]}</span>}
                </p>
            )}

            {list.isLoading ? <EmptyState>불러오는 중…</EmptyState>
                : list.isError ? <EmptyState>목록을 불러오지 못했습니다 — {errMsg(list.error)}</EmptyState>
                : rows.length === 0 ? <EmptyState>해당하는 골프장이 없습니다.</EmptyState>
                : (
                    <>
                        {/* 폰: 카드 목록 */}
                        <ul className="md:hidden rounded-2xl bg-white border border-black/[0.08] divide-y divide-black/[0.05] overflow-hidden">
                            {rows.map((r) => (
                                <li key={r.slug}>
                                    <button onClick={() => setOpenSlug(r.slug)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-black/[0.04]">
                                        <LogoThumb logo={r.logo} name={r.name} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-bold text-[14px] text-[rgba(0,0,0,0.87)] truncate">{r.name}</span>
                                            <span className="block text-[12px] text-black/45 truncate">
                                                {[r.region, r.city].filter(Boolean).join(" · ")}
                                                {r.nines > 0 && <> · 코스 {r.nines}</>}
                                                {(r.watchers > 0 || r.listings > 0 || r.rounds90 > 0) && (
                                                    <> · 관심 {r.watchers} · 글 {r.listings} · 라운드 {r.rounds90}</>
                                                )}
                                            </span>
                                            {r.missing.length > 0 && <span className="mt-1 flex flex-wrap gap-1"><MissingPills r={r} /></span>}
                                        </span>
                                        <LucideChevronRight className="w-4 h-4 text-black/25 shrink-0" />
                                    </button>
                                </li>
                            ))}
                        </ul>

                        {/* 넓은 화면: 표 */}
                        <div className="hidden md:block rounded-2xl overflow-hidden border border-black/10">
                            <table className="w-full text-left bg-white text-sm">
                                <thead>
                                    <tr className="border-b border-black/10 bg-black/[0.02] text-[12px]">
                                        <th className="px-4 py-3 font-black text-black/55">골프장</th>
                                        <th className="px-3 py-3 font-black text-black/55">빈칸</th>
                                        <th className="px-3 py-3 font-black text-black/55 text-right" title="원장 코스(9홀) 중 파가 있는 줄 / 전체">파 있는 코스</th>
                                        <th className="px-3 py-3 font-black text-black/55 text-right" title="관심(☆) 등록">관심</th>
                                        <th className="px-3 py-3 font-black text-black/55 text-right" title="앞으로의 부킹·조인 글">글</th>
                                        <th className="px-3 py-3 font-black text-black/55 text-right" title="최근 90일 라운드">라운드</th>
                                        <th className="px-3 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.slug} onClick={() => setOpenSlug(r.slug)} className="border-b border-black/[0.05] hover:bg-brand/[0.03] cursor-pointer">
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <LogoThumb logo={r.logo} name={r.name} />
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-[rgba(0,0,0,0.87)] truncate max-w-[260px]">{r.name}</div>
                                                        <div className="text-[12px] text-black/45">{[r.region, r.city].filter(Boolean).join(" · ")}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1 max-w-[300px]">{r.missing.length ? <MissingPills r={r} countPars={false} /> : <span className="text-black/30 text-[12px]">-</span>}</div></td>
                                            <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                                                {r.nines ? <span className={r.ninesWithPars < r.nines ? "text-amber-700 font-bold" : "text-black/60"}>{r.ninesWithPars}/{r.nines}</span> : <span className="text-black/30">-</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-right"><Num n={r.watchers} label="관심" /></td>
                                            <td className="px-3 py-2.5 text-right"><Num n={r.listings} label="글" /></td>
                                            <td className="px-3 py-2.5 text-right"><Num n={r.rounds90} label="라운드(90일)" /></td>
                                            <td className="px-3 py-2.5 text-right"><LucideChevronRight className="w-4 h-4 text-black/25 inline" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {data && data.total > rows.length && (
                            <button onClick={() => setLimit((n) => n + PAGE)} disabled={list.isFetching}
                                className="w-full h-11 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/60 hover:text-brand disabled:opacity-60">
                                {list.isFetching ? "불러오는 중…" : `더 보기 (${rows.length.toLocaleString()} / ${data.total.toLocaleString()})`}
                            </button>
                        )}
                    </>
                )}

            <CourseSheet slug={openSlug} onClose={() => setOpenSlug(null)} />
        </div>
    );
}

/** 칩을 눌렀을 때 한 줄 설명 — 무엇이 빈 것이고 어디에 걸리는지 */
const MISSING_HINT: Record<MissingKey, string> = {
    pars: "코스 줄은 있는데 파가 빈 곳 — 경기 화면에 '파 미확인'",
    nines: "원장에 코스 줄이 하나도 없는 곳 — 회원이 이름을 적어야 경기 시작",
    logo: "골프장 페이지에 이름 글자판이 대신 보이는 곳",
    website: "홈페이지 단추가 없는 곳",
    phone: "대표 전화가 없는 곳",
    coords: "원장 좌표가 없는 곳 — 현장 인증(2km)이 원장 좌표부터 봅니다",
    club: "라운드 원장에 짝이 없는 곳 — 코스·파·좌표를 넣을 수 없음",
    fees: "그린피 표·대표 그린피가 없는 곳(자료에서 옴, 여기서 고치지 않음)",
};

// ── 시트 ───────────────────────────────────────────────────────────
function useCourseDetail(slug: string | null) {
    return useQuery<Detail>({
        queryKey: [...GOLF_COURSES_KEY, "detail", slug ?? ""],
        queryFn: () => apiRequest(`${API}/${encodeURIComponent(slug!)}`),
        enabled: !!slug,
        // 파를 채우는 다른 작업이 같은 줄을 쓴다 — 열 때마다 새로 읽는다
        staleTime: 0,
    });
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "info" }) {
    return (
        <div className="rounded-xl bg-black/[0.03] px-2.5 py-2">
            <p className="text-[11px] font-bold text-black/45">{label}</p>
            <p className={cn("mt-0.5 text-[15px] font-black tabular-nums", tone === "info" ? "text-blue-700" : "text-[rgba(0,0,0,0.87)]")}>{value}</p>
        </div>
    );
}

function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-[12px] font-black text-black/45">{title}</h3>
                {meta && <span className="text-[11.5px] text-black/40 truncate">{meta}</span>}
            </div>
            {children}
        </section>
    );
}

function CourseSheet({ slug, onClose }: { slug: string | null; onClose: () => void }) {
    // 닫히는 동안(밀려 나가는 애니메이션)에도 내용을 그대로 둔다 — 마지막으로 연 골프장을 기억
    const [shown, setShown] = useState<string | null>(slug);
    useEffect(() => { if (slug) setShown(slug); }, [slug]);
    const detail = useCourseDetail(shown);
    const d = detail.data && detail.data.slug === shown ? detail.data : null;
    return (
        <Sheet open={!!slug} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="right" style={SHEET_SAFE_TOP} className="w-full sm:max-w-lg p-0 gap-0 flex flex-col bg-surface-0">
                {!d ? (
                    <div className="p-6">
                        <SheetTitle className="text-[16px] font-bold text-black/60">{detail.isError ? "골프장을 불러오지 못했습니다" : "불러오는 중…"}</SheetTitle>
                        <SheetDescription className="mt-1 text-[13px] text-black/45">{detail.isError ? errMsg(detail.error) : shown}</SheetDescription>
                    </div>
                ) : (
                    <>
                        <div className="shrink-0 bg-white border-b border-black/[0.07] px-5 pt-6 pb-4">
                            <div className="flex items-center gap-3 pr-8">
                                <LogoThumb logo={d.logo} name={d.name} size="lg" />
                                <div className="min-w-0">
                                    <SheetTitle className="text-[18px] font-black text-[rgba(0,0,0,0.87)] truncate">{d.name}</SheetTitle>
                                    <SheetDescription className="text-[13px] text-black/50 truncate">
                                        {[d.region, d.city, d.kind, d.holes ? `${d.holes}홀` : null].filter(Boolean).join(" · ")}
                                    </SheetDescription>
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <a href={coursePath(d.slug)} target="_blank" rel="noopener"
                                    className="flex-1 h-9 rounded-lg border border-black/10 flex items-center justify-center gap-1.5 text-[13px] font-bold text-black/65 hover:border-brand/40 hover:text-brand">
                                    골프장 페이지 <LucideExternalLink className="w-3.5 h-3.5" />
                                </a>
                                {isHttpUrl(d.website) ? (
                                    <a href={d.website.trim()} target="_blank" rel="noopener noreferrer"
                                        className="flex-1 h-9 rounded-lg border border-black/10 flex items-center justify-center gap-1.5 text-[13px] font-bold text-black/65 hover:border-brand/40 hover:text-brand">
                                        홈페이지 <LucideExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                ) : (
                                    <span className={cn("flex-1 h-9 rounded-lg border border-dashed flex items-center justify-center text-[13px] font-bold",
                                        d.website ? "border-amber-500/40 text-amber-700" : "border-black/10 text-black/30")}>
                                        {d.website ? "홈페이지 주소 확인" : "홈페이지 없음"}
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-2">
                                <Stat label="관심" value={d.watchers} />
                                <Stat label="지금 글" value={d.listings} />
                                <Stat label="라운드 90일" value={d.rounds90} />
                                <Stat label="진행 중 경기" value={d.liveMatches} tone={d.liveMatches ? "info" : undefined} />
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
                            <NinesSection d={d} />
                            <Section title="골프장 이름"><NameEditor d={d} /></Section>
                            <Section title="홈페이지 · 전화"><ContactEditor d={d} /></Section>
                            <Section title="로고"><LogoEditor d={d} /></Section>
                            <Section title={d.club ? "좌표" : "골프장 페이지 좌표"} meta={d.club ? `현장 인증 반경 ${ONSITE_RADIUS_KM}km` : undefined}><CoordsEditor d={d} /></Section>
                            <p className="text-[11.5px] leading-relaxed text-black/40">
                                파·코스·원장 좌표는 라운드 원장에 저장돼 그대로 남습니다. 여기서 고친 이름·좌표·홈페이지·전화와 올린 로고도
                                자료를 다시 적재할 때 덮이지 않습니다(내린 로고는 자료에 있으면 다시 붙습니다).
                                공개 골프장 페이지에는 1분 안에 반영됩니다.{d.hasFees ? "" : " 그린피는 자료에서 오는 값이라 여기서 고치지 않습니다."}
                            </p>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ── 코스·파 ────────────────────────────────────────────────────────
type Draft = (number | null)[];
/** 원장 값 → 9칸(모르는 칸은 비움). 9칸이 아니면(빈 배열 등) 전부 비움 */
function toDraft(pars: unknown): Draft {
    if (Array.isArray(pars) && pars.length === NINE) return pars.map((v) => (isParValue(v) ? v : null));
    return Array(NINE).fill(null);
}
const sumOf = (d: Draft) => d.reduce<number>((a, v) => a + (v ?? 0), 0);

function NinesSection({ d }: { d: Detail }) {
    const [adding, setAdding] = useState(false);
    useEffect(() => setAdding(false), [d.slug]);
    if (!d.club) {
        return (
            <Section title="코스 · 파">
                <div className="rounded-2xl border border-dashed border-black/15 bg-white p-4 text-[13px] leading-relaxed text-black/55">
                    {d.clubMissing
                        ? "이 페이지가 가리키는 라운드 원장 줄이 없습니다(지워진 원장). 코스·파를 넣을 수 없습니다 — 좌표는 아래에서 골프장 페이지 좌표를 고칩니다."
                        : "라운드 원장(경기 화면이 쓰는 골프장 목록)에 짝이 없는 골프장입니다. 코스·파를 넣을 데가 없습니다 — 적재 스크립트가 이름·좌표로 짝을 짓습니다. 좌표는 아래에서 골프장 페이지 좌표를 바로 고칩니다."}
                </div>
            </Section>
        );
    }
    const known = d.nines.filter((n) => n.known).length;
    return (
        <Section title="코스 · 파" meta={`원장 '${d.club.name}' · 파 있는 코스 ${known}/${d.nines.length}`}>
            <div className="space-y-2.5">
                {d.sharedClubPages.length > 0 && (
                    <p className="rounded-xl bg-blue-500/[0.06] px-3 py-2 text-[12px] leading-relaxed text-blue-800">
                        같은 원장을 쓰는 페이지: {d.sharedClubPages.map((p) => p.name).join(", ")} — 여기서 파를 고치면 그 페이지 코스 표도 같이 바뀝니다.
                    </p>
                )}
                {d.nines.length === 0 && !adding && (
                    <div className="rounded-2xl border border-dashed border-black/15 bg-white p-4 text-[13px] leading-relaxed text-black/55">
                        원장에 코스 줄이 하나도 없습니다 — 경기 화면 전반·후반 목록이 비어 있어 회원이 이름을 직접 적고 시작합니다.
                        공식 홈페이지 코스 안내를 보고 '코스 추가'로 넣어 주세요.
                    </div>
                )}
                {d.nines.map((n) => <NineEditor key={n.id} nine={n} sharedPages={d.sharedClubPages.length} />)}
                {adding ? (
                    <AddNineForm clubId={d.club.id} existing={d.nines.map((n) => n.name)} onClose={() => setAdding(false)} />
                ) : (
                    <button onClick={() => setAdding(true)}
                        className="w-full h-10 rounded-xl border border-dashed border-black/15 bg-white flex items-center justify-center gap-1.5 text-[13px] font-bold text-black/60 hover:border-brand/40 hover:text-brand">
                        <LucidePlus className="w-4 h-4" /> 코스 추가
                    </button>
                )}
            </div>
        </Section>
    );
}

/** 9칸 파 — 칸에 숫자(3~6)를 치거나 3·4·5 단추. 아무 칸에나 9개 숫자를 붙여넣으면 한 번에 채운다 */
function ParGrid({ value, onChange, base, disabled }: { value: Draft; onChange: (v: Draft) => void; base?: Draft; disabled?: boolean }) {
    const set = (i: number, v: number | null) => { const next = [...value]; next[i] = v; onChange(next); };
    return (
        <div className="grid grid-cols-9 gap-1">
            {value.map((v, i) => {
                const changed = !!base && base[i] !== v;
                return (
                    <div key={i} className="flex flex-col gap-1 min-w-0">
                        <span className="text-center text-[11px] font-bold text-black/40 tabular-nums">{i + 1}</span>
                        <input
                            aria-label={`${i + 1}번 홀 파`}
                            inputMode="numeric"
                            value={v ?? ""}
                            disabled={disabled}
                            onFocus={(e) => e.currentTarget.select()}
                            onPaste={(e) => {
                                const parsed = parseParsText(e.clipboardData.getData("text"));
                                if (parsed) { e.preventDefault(); onChange(parsed); }
                            }}
                            onChange={(e) => {
                                const s = e.target.value.replace(/\D/g, "").slice(-1);
                                if (!s) return set(i, null);
                                const n = Number(s);
                                if (isParValue(n)) set(i, n);
                            }}
                            className={cn(
                                "h-10 w-full min-w-0 rounded-lg border text-center text-[16px] font-black tabular-nums outline-none focus:border-brand/60 disabled:opacity-60",
                                v == null ? "border-amber-400/70 bg-amber-50 text-black/40"
                                    : changed ? "border-brand/50 bg-brand/[0.07] text-brand"
                                    : "border-black/10 bg-white text-[rgba(0,0,0,0.87)]",
                            )}
                        />
                        {[3, 4, 5].map((n) => (
                            <button key={n} type="button" disabled={disabled} onClick={() => set(i, n)} aria-label={`${i + 1}번 홀 파 ${n}`}
                                className={cn("h-7 rounded-md text-[12.5px] font-bold tabular-nums disabled:opacity-60",
                                    v === n ? "bg-brand text-white" : "bg-black/[0.04] text-black/55 hover:bg-black/[0.08]")}>
                                {n}
                            </button>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

function SumLine({ draft, hint }: { draft: Draft; hint?: string }) {
    const empty = draft.filter((v) => v == null).length;
    const sum = sumOf(draft);
    const unusual = empty === 0 && isUnusualNineSum(sum);
    return (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
            <span className={cn("truncate", empty && empty < NINE ? "text-amber-700 font-bold" : "text-black/40")}>
                {empty && empty < NINE ? `빈 칸 ${empty}` : hint ?? "칸에 9개 숫자를 한 번에 붙여넣을 수 있습니다"}
            </span>
            <span className={cn("shrink-0 tabular-nums font-bold", unusual ? "text-amber-700" : "text-black/60")}>
                합 {sum}{unusual && ` · 보통 ${NINE_SUM_MIN}~${NINE_SUM_MAX}`}
            </span>
        </div>
    );
}

function NineEditor({ nine, sharedPages }: { nine: Nine; sharedPages: number }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const parsKey = JSON.stringify(nine.pars ?? null);
    const base = useMemo(() => toDraft(JSON.parse(parsKey)), [parsKey]);
    const [draft, setDraft] = useState<Draft>(base);
    // 서버 값이 바뀌면(저장·다른 작업이 먼저 채움) 그 값으로 다시 맞춘다 — 낡은 칸 위에서 고치지 않게
    useEffect(() => setDraft(base), [base]);
    // 파를 아는 코스는 한 줄로 접어 둔다(고칠 일이 드물다) — 미확인 코스만 처음부터 펼친다
    const [open, setOpen] = useState(!nine.known);
    useEffect(() => { if (!nine.known) setOpen(true); }, [nine.known]);
    const dirty = draft.some((v, i) => v !== base[i]);
    const complete = draft.every((v) => v != null);
    const sum = sumOf(draft);

    const save = useMutation({
        mutationFn: (vars: { pars: number[]; force: boolean }) =>
            apiRequest(`${API}/nines/${nine.id}/pars`, { method: "PUT", body: { pars: vars.pars, expectedOld: nine.pars, force: vars.force } }),
        onSuccess: (r: any) => {
            toast({ title: "파를 저장했습니다", description: r?.pagesUpdated?.length ? "골프장 페이지 코스 표도 고쳤습니다" : undefined });
            setOpen(false);
            void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
        onError: (e) => {
            toast({ title: "파 저장 실패", description: errMsg(e), variant: "destructive" });
            // 다른 곳에서 먼저 바뀌었으면 새 값을 불러와 칸을 그 값으로 맞춘다(덮지 않는다)
            if (errCode(e) === "PARS_CHANGED") void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
    });

    const onSave = async () => {
        if (!complete || save.isPending) return;
        const pars = draft as number[];
        const unusual = isUnusualNineSum(sum);
        const lines = [
            "이 코스 파를 저장할까요? 이 골프장으로 치는 경기 화면에 바로 쓰입니다",
            `${nine.name}: ${pars.join(" ")} (합 ${sum})`,
        ];
        if (unusual) lines.push(`합이 ${sum}입니다 — 9홀 파 합은 보통 ${NINE_SUM_MIN}~${NINE_SUM_MAX}입니다. 맞는지 한 번 더 보세요.`);
        if (nine.liveMatches > 0) lines.push(`지금 이 코스로 진행 중인 경기 ${nine.liveMatches}개에도 바로 반영됩니다.`);
        if (sharedPages > 0) lines.push("같은 원장을 쓰는 다른 페이지의 코스 표도 같이 바뀝니다.");
        if (!(await appConfirm({ message: lines.join("\n"), confirmText: "저장" }))) return;
        save.mutate({ pars, force: unusual });
    };

    const header = (
        <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-[14px] text-[rgba(0,0,0,0.87)] truncate">{nine.name}</span>
            {nine.known ? <Pill tone="brand">파 {sumOf(base)}</Pill> : <Pill tone="warn">파 미확인</Pill>}
            {nine.liveMatches > 0 && <Pill tone="info">진행 중 {nine.liveMatches}</Pill>}
            <span className="ml-auto shrink-0 text-[11px] text-black/35 tabular-nums">{nine.updatedAt ? `${kstDateTime(nine.updatedAt)} 고침` : ""}</span>
        </div>
    );

    if (!open) {
        return (
            <Panel className="p-3">
                {header}
                <div className="mt-2 flex items-center gap-2">
                    <div className="grid grid-cols-9 gap-1 flex-1 min-w-0" aria-label={`${nine.name} 홀별 파`}>
                        {base.map((v, i) => (
                            <span key={i} className="h-8 rounded-md bg-black/[0.035] flex items-center justify-center text-[14px] font-bold tabular-nums text-[rgba(0,0,0,0.8)]">{v ?? "-"}</span>
                        ))}
                    </div>
                    <button onClick={() => setOpen(true)} aria-label={`${nine.name} 파 고치기`}
                        className="shrink-0 h-8 px-2.5 rounded-lg border border-black/10 bg-white text-[12.5px] font-bold text-black/60 hover:border-brand/40 hover:text-brand">
                        고치기
                    </button>
                </div>
            </Panel>
        );
    }

    return (
        <Panel className="p-3">
            <div className="mb-2">{header}</div>
            <ParGrid value={draft} onChange={setDraft} base={base} disabled={save.isPending} />
            <SumLine draft={draft} />
            {nine.known && !dirty && (
                <button onClick={() => setOpen(false)} className="mt-2 w-full h-8 rounded-lg text-[12.5px] font-bold text-black/45 hover:text-black/70">접기</button>
            )}
            {dirty && (
                <div className="mt-2.5 flex gap-2">
                    <button onClick={() => { setDraft(base); if (nine.known) setOpen(false); }} disabled={save.isPending}
                        className="flex-1 h-9 rounded-lg border border-black/10 bg-white flex items-center justify-center gap-1.5 text-[13px] font-bold text-black/60 disabled:opacity-50">
                        <LucideRotateCcw className="w-3.5 h-3.5" /> 되돌리기
                    </button>
                    <button data-admin-write onClick={() => void onSave()} disabled={!complete || save.isPending}
                        className="flex-1 h-9 rounded-lg bg-brand text-white flex items-center justify-center gap-1.5 text-[13px] font-bold hover:bg-brand-strong disabled:opacity-40">
                        <LucideSave className="w-3.5 h-3.5" /> {save.isPending ? "저장 중…" : complete ? "파 저장" : "9칸을 다 채우세요"}
                    </button>
                </div>
            )}
        </Panel>
    );
}

function AddNineForm({ clubId, existing, onClose }: { clubId: string; existing: string[]; onClose: () => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [name, setName] = useState("");
    const [draft, setDraft] = useState<Draft>(() => Array(NINE).fill(null));
    const nameCheck = cleanNineName(name);
    const dup = nameCheck.ok && existing.some((n) => nineNameKey(n) === nineNameKey(nameCheck.name));
    const filled = draft.filter((v) => v != null).length;
    const sum = sumOf(draft);
    const ready = nameCheck.ok && !dup && (filled === 0 || filled === NINE);

    const add = useMutation({
        mutationFn: (body: { clubId: string; name: string; pars: number[]; force: boolean }) => apiRequest(`${API}/nines`, { method: "POST", body }),
        onSuccess: () => {
            toast({ title: "코스를 추가했습니다" });
            void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
            onClose();
        },
        onError: (e) => toast({ title: "코스 추가 실패", description: errMsg(e), variant: "destructive" }),
    });

    const onAdd = async () => {
        if (!ready || !nameCheck.ok || add.isPending) return;
        const pars = filled === NINE ? (draft as number[]) : [];
        const unusual = pars.length > 0 && isUnusualNineSum(sum);
        const lines = [`'${nameCheck.name}' 코스를 추가할까요? 경기 화면 전반·후반 목록에 바로 나옵니다.`];
        lines.push(pars.length ? `파 ${pars.join(" ")} (합 ${sum})` : "파는 비워 둡니다 — 경기 화면에 '파 미확인'으로 뜹니다.");
        if (unusual) lines.push(`합이 ${sum}입니다 — 9홀 파 합은 보통 ${NINE_SUM_MIN}~${NINE_SUM_MAX}입니다. 맞는지 한 번 더 보세요.`);
        if (!(await appConfirm({ message: lines.join("\n"), confirmText: "추가" }))) return;
        add.mutate({ clubId, name: nameCheck.name, pars, force: unusual });
    };

    const nameError = name.trim() && !nameCheck.ok ? nameCheck.error : dup ? "같은 이름의 코스가 이미 있습니다" : null;
    return (
        <Panel className="p-3 border-brand/30">
            <p className="text-[13px] font-bold text-[rgba(0,0,0,0.87)]">코스 추가</p>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={NINE_NAME_MAX + 5} placeholder="코스 이름 (예: 문화 OUT)"
                className={cn("mt-2 w-full h-10 px-3 rounded-lg border bg-white text-[16px] md:text-sm outline-none focus:border-brand/50", nameError ? "border-red-400" : "border-black/10")} />
            <p className={cn("mt-1 text-[11.5px] leading-relaxed", nameError ? "text-red-600 font-bold" : "text-black/40")}>
                {nameError ?? "18홀 코스가 둘이면 '문화 OUT' · '문화 IN'처럼 띄어 쓰세요 — 경기 화면이 앞 낱말로 후반 코스를 짝짓습니다. 9홀 하나짜리는 한 줄(두 번 돕니다)."}
            </p>
            <div className="mt-3"><ParGrid value={draft} onChange={setDraft} disabled={add.isPending} /></div>
            <SumLine draft={draft} hint={filled === 0 ? "파를 모르면 비워 두고 추가해도 됩니다" : undefined} />
            <div className="mt-2.5 flex gap-2">
                <button onClick={onClose} disabled={add.isPending}
                    className="flex-1 h-9 rounded-lg border border-black/10 bg-white text-[13px] font-bold text-black/60 disabled:opacity-50">닫기</button>
                <button data-admin-write onClick={() => void onAdd()} disabled={!ready || add.isPending}
                    className="flex-1 h-9 rounded-lg bg-brand text-white text-[13px] font-bold hover:bg-brand-strong disabled:opacity-40">
                    {add.isPending ? "추가 중…" : filled > 0 && filled < NINE ? "9칸을 다 채우거나 비우세요" : "추가"}
                </button>
            </div>
        </Panel>
    );
}

// ── 홈페이지·전화 ──────────────────────────────────────────────────
// ── 골프장 이름 ────────────────────────────────────────────────────
function NameEditor({ d }: { d: Detail }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [name, setName] = useState(d.name);
    // 경기 시작 화면에는 원장 골프장 이름이 뜬다 — 그 원장을 이 페이지만 쓰고 진행 중 경기가 없을 때만 같이 바꿀 수 있다
    const clubRenamable = !!d.club && d.sharedClubPages.length === 0 && d.liveMatches === 0;
    // 원장 이름이 지금 페이지 이름과 같았으면(같이 틀렸다) 같이 바꾸는 쪽이 기본. 원래 달랐으면 건드리지 않는 쪽이 기본
    const clubDefault = clubRenamable && d.club!.name === d.name;
    const [alsoClub, setAlsoClub] = useState(clubDefault);
    useEffect(() => { setName(d.name); setAlsoClub(clubDefault); }, [d.slug, d.name, clubDefault]);
    const c = cleanCourseName(name);
    const next = c.ok ? c.name : name;
    const clubDiffers = !!d.club && d.club.name !== next;
    const dirty = next !== d.name;

    const save = useMutation({
        mutationFn: (body: { name: string; expected: string; alsoClub: boolean }) => apiRequest(`${API}/${encodeURIComponent(d.slug)}/name`, { method: "PUT", body }),
        onSuccess: (r: any) => {
            toast({ title: "이름을 바꿨습니다", description: r?.club ? "경기 시작 화면의 이름도 같이 바꿨습니다" : undefined });
            void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
        onError: (e) => {
            toast({ title: "이름 저장 실패", description: errMsg(e), variant: "destructive" });
            if (errCode(e) === "PAGE_CHANGED") void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
    });

    // 페이지 이름은 맞는데 경기 시작 화면의 이름(원장)만 다를 때 — 원장 이름을 이 이름으로 맞춘다
    const onMatchClub = async () => {
        if (!clubRenamable || dirty || save.isPending || d.club!.name === d.name) return;
        if (!(await appConfirm({ message: `경기 시작 화면의 이름을 '${d.club!.name}'에서 '${d.name}'(으)로 바꿀까요?`, confirmText: "바꾸기" }))) return;
        save.mutate({ name: d.name, expected: d.name, alsoClub: true });
    };

    const onSave = async () => {
        if (!c.ok || !dirty || save.isPending) return;
        const withClub = clubRenamable && alsoClub && clubDiffers;
        const lines = [`골프장 이름을 '${c.name}'(으)로 바꿀까요?`, "골프장 페이지 제목·검색·공유 카드에 바로 쓰입니다. 주소는 그대로이고, 옛 이름으로도 계속 검색됩니다."];
        if (withClub) lines.push(`경기 시작 화면의 이름(원장 '${d.club!.name}')도 같이 바꿉니다.`);
        if (!(await appConfirm({ message: lines.join("\n"), confirmText: "바꾸기" }))) return;
        save.mutate({ name: c.name, expected: d.name, alsoClub: withClub });
    };

    return (
        <Panel className="p-3 space-y-2.5">
            <label className="block">
                <span className="text-[12px] font-bold text-black/50">이름</span>
                <input data-course-name value={name} onChange={(e) => setName(e.target.value)} maxLength={COURSE_NAME_MAX + 10} autoComplete="off"
                    className={cn("mt-1 w-full h-10 px-3 rounded-lg border bg-white text-[16px] md:text-sm outline-none focus:border-brand/50", !c.ok ? "border-red-400" : "border-black/10")} />
                <span className={cn("mt-1 block text-[11.5px] leading-relaxed", !c.ok ? "text-red-600 font-bold" : "text-black/40")}>
                    {!c.ok ? c.error : "주소(링크)는 바뀌지 않고, 옛 이름은 별칭으로 남아 그 이름으로도 검색됩니다."}
                </span>
            </label>
            {d.club && dirty && (
                <label className={cn("flex items-start gap-2 text-[12px] leading-relaxed", clubRenamable ? "text-black/60 cursor-pointer" : "text-black/40")}>
                    <input type="checkbox" className="mt-0.5 accent-brand" checked={clubRenamable && alsoClub} disabled={!clubRenamable} onChange={(e) => setAlsoClub(e.target.checked)} />
                    <span>
                        경기 시작 화면의 이름(원장 '{d.club.name}')도 같이 바꾸기
                        {!clubRenamable && <span className="block text-[11.5px]">{d.liveMatches > 0 ? "진행 중인 경기가 있어 지금은 원장 이름을 바꾸지 않습니다." : "이 원장을 다른 골프장 페이지도 같이 쓰고 있어 원장 이름은 바꾸지 않습니다."}</span>}
                    </span>
                </label>
            )}
            {d.club && !dirty && d.club.name !== d.name && (
                <div data-club-name className="rounded-xl bg-black/[0.03] px-3 py-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-black/55">경기 시작 화면에는 원장 이름 <b className="text-black/75">'{d.club.name}'</b>(으)로 뜹니다.</p>
                    {clubRenamable && (
                        <button data-admin-write type="button" onClick={() => void onMatchClub()} disabled={save.isPending}
                            className="shrink-0 h-8 px-3 rounded-lg bg-white border border-black/10 text-[12.5px] font-bold text-black/65 disabled:opacity-50">이 이름으로 맞추기</button>
                    )}
                </div>
            )}
            {dirty && (
                <div className="flex gap-2">
                    <button onClick={() => { setName(d.name); setAlsoClub(clubDefault); }} disabled={save.isPending}
                        className="flex-1 h-9 rounded-lg border border-black/10 bg-white text-[13px] font-bold text-black/60 disabled:opacity-50">되돌리기</button>
                    <button data-admin-write onClick={() => void onSave()} disabled={!c.ok || save.isPending}
                        className="flex-1 h-9 rounded-lg bg-brand text-white text-[13px] font-bold hover:bg-brand-strong disabled:opacity-40">
                        {save.isPending ? "저장 중…" : "이름 저장"}
                    </button>
                </div>
            )}
        </Panel>
    );
}

function ContactEditor({ d }: { d: Detail }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [website, setWebsite] = useState(d.website ?? "");
    const [phone, setPhone] = useState(d.phone ?? "");
    useEffect(() => { setWebsite(d.website ?? ""); setPhone(d.phone ?? ""); }, [d.slug, d.website, d.phone]);
    const w = cleanWebsite(website);
    const p = cleanPhone(phone);
    const wDirty = website !== (d.website ?? "");
    const pDirty = phone !== (d.phone ?? "");
    const dirty = wDirty || pDirty;
    const valid = (!wDirty || w.ok) && (!pDirty || p.ok);
    // 지금 들어 있는 값이 꼴에 안 맞으면(앞뒤 공백·http 없는 주소) 알려 준다 — 그 주소로는 링크가 깨진다
    const wStoredBad = !!d.website && !wDirty && !cleanWebsite(d.website).ok;
    const pStoredBad = !!d.phone && !pDirty && !cleanPhone(d.phone).ok;

    const save = useMutation({
        mutationFn: (body: Record<string, unknown>) => apiRequest(`${API}/${encodeURIComponent(d.slug)}`, { method: "PATCH", body }),
        onSuccess: (_r, body) => {
            const what = ["website" in body ? "홈페이지" : null, "phone" in body ? "전화" : null].filter(Boolean).join("·");
            toast({ title: `${what}를 저장했습니다` });
            void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
        onError: (e) => {
            toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
            if (errCode(e) === "PAGE_CHANGED") void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
    });

    const onSave = async () => {
        if (!dirty || !valid || save.isPending) return;
        const body: Record<string, unknown> = {};
        const expected: Record<string, string | null> = {};
        if (wDirty && w.ok) { body.website = w.value; expected.website = d.website; }
        if (pDirty && p.ok) { body.phone = p.value; expected.phone = d.phone; }
        body.expected = expected;
        const clearingSite = wDirty && w.ok && !w.value && !!d.website;
        const clearing = [clearingSite ? "홈페이지 주소" : null, pDirty && p.ok && !p.value && d.phone ? "전화번호" : null].filter(Boolean);
        if (clearing.length) {
            const lines = [`${clearing.join("·")}를 지울까요? 골프장 페이지에서 그 단추가 빠집니다.`];
            if (!(await appConfirm({ message: lines.join("\n"), tone: "danger", confirmText: "지우기" }))) return;
        }
        save.mutate(body);
    };

    const field = "w-full h-10 px-3 rounded-lg border bg-white text-[16px] md:text-sm outline-none focus:border-brand/50";
    return (
        <Panel className="p-3 space-y-2.5">
            <label className="block">
                <span className="text-[12px] font-bold text-black/50">홈페이지</span>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" inputMode="url" autoComplete="off"
                    className={cn("mt-1", field, wDirty && !w.ok ? "border-red-400" : "border-black/10")} />
                {wDirty && !w.ok && <span className="mt-1 block text-[11.5px] font-bold text-red-600">{w.error}</span>}
                {wStoredBad && <span className="mt-1 block text-[11.5px] font-bold text-amber-700">지금 주소가 http(s):// 로 시작하지 않거나 꼴이 맞지 않아 링크가 깨집니다 — 고쳐 주세요</span>}
            </label>
            <label className="block">
                <span className="text-[12px] font-bold text-black/50">대표 전화</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="031-123-4567" inputMode="tel" autoComplete="off"
                    className={cn("mt-1 tabular-nums", field, pDirty && !p.ok ? "border-red-400" : "border-black/10")} />
                {pDirty && !p.ok && <span className="mt-1 block text-[11.5px] font-bold text-red-600">{p.error}</span>}
                {pStoredBad && <span className="mt-1 block text-[11.5px] font-bold text-amber-700">지금 번호에 공백 등 꼴에 맞지 않는 글자가 있습니다 — 고쳐 주세요</span>}
            </label>
            {dirty && (
                <div className="flex gap-2 pt-0.5">
                    <button onClick={() => { setWebsite(d.website ?? ""); setPhone(d.phone ?? ""); }} disabled={save.isPending}
                        className="flex-1 h-9 rounded-lg border border-black/10 bg-white text-[13px] font-bold text-black/60 disabled:opacity-50">되돌리기</button>
                    <button data-admin-write onClick={() => void onSave()} disabled={!valid || save.isPending}
                        className="flex-1 h-9 rounded-lg bg-brand text-white text-[13px] font-bold hover:bg-brand-strong disabled:opacity-40">
                        {save.isPending ? "저장 중…" : "저장"}
                    </button>
                </div>
            )}
        </Panel>
    );
}

// ── 로고 ───────────────────────────────────────────────────────────
const ORIGIN_LABEL: Record<LogoOrigin, string> = {
    official: "골프장 공식 홈페이지 로고",
    dbegl: "더블이글 자료 로고",
    upload: "어드민에서 올린 로고",
    other: "기타 주소",
};

/** 적재 스크립트를 다시 돌리면 로고가 어디서 다시 붙는지 — 내리기 전·후에 같은 말을 한다 */
function reAddNotes(origin: LogoOrigin | null, official: Official, slug: string): string[] {
    const notes: string[] = [];
    if (origin === "upload") notes.push("어드민에서 올린 로고입니다 — 자료를 다시 적재해도 남습니다. 내리면 저장소의 파일도 지웁니다.");
    if (origin === "dbegl") notes.push("더블이글 자료 로고입니다 — 적재 스크립트를 --dbegl 로 다시 돌리면 다시 붙습니다(golf-course-dbegl.ts 에서 막아야 합니다).");
    if (official.checked && official.entry?.logo) {
        notes.push(`공식 로고 자료(server/scripts/data/golf-logos-official.json)에 '${slug}' 항목이 있습니다 — 적재 스크립트(golf-course-pages.ts)나 golf-logos-official.ts --write 를 다시 돌리면 로고가 다시 붙습니다. 계속 내려 두려면 그 표에서도 빼야 합니다.`);
    } else if (!official.checked && origin === "official") {
        notes.push("공식 홈페이지 로고 파일(g-….png)입니다 — golf-logos-official.json 에 항목이 있으면 적재 스크립트가 다시 붙입니다(서버가 자료 파일을 읽지 못해 확인하지 못했습니다).");
    }
    return notes;
}

function LogoEditor({ d }: { d: Detail }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [after, setAfter] = useState<string[] | null>(null);
    useEffect(() => setAfter(null), [d.slug]);
    const before = reAddNotes(d.logoOrigin, d.official, d.slug);

    const clear = useMutation({
        mutationFn: () => apiRequest(`${API}/${encodeURIComponent(d.slug)}`, { method: "PATCH", body: { logo: null, expected: { logo: d.logo } } }),
        onSuccess: (r: any) => {
            toast({ title: "로고를 내렸습니다" });
            setAfter(reAddNotes(r?.removedLogo?.origin ?? null, r?.official ?? { checked: false, entry: null }, d.slug));
            void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
        onError: (e) => {
            toast({ title: "로고 내리기 실패", description: errMsg(e), variant: "destructive" });
            if (errCode(e) === "PAGE_CHANGED") void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
    });

    // ── 올리기: 끌어다 놓기 · 붙여넣기 · 파일 고르기 ──
    const [draft, setDraft] = useState<LogoDraft | null>(null);
    const [busy, setBusy] = useState<"reading" | "fetching" | null>(null);
    const [over, setOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    useEffect(() => { setDraft(null); setBusy(null); setOver(false); }, [d.slug]);

    const fail = (e: unknown) => toast({ title: "로고를 가져오지 못했습니다", description: errMsg(e), variant: "destructive" });
    const takeBlob = async (blob: Blob) => {
        setBusy("reading");
        try { setDraft(await rasterizeLogo(blob)); } catch (e) { fail(e); } finally { setBusy(null); }
    };
    // 다른 사이트에서 끌어온 그림은 주소만 온다 — 서버가 대신 받아 준다(화면은 다른 사이트의 그림을 읽지 못한다)
    const takeUrl = async (url: string) => {
        setBusy("fetching");
        try {
            const r = await apiRequest(`${API}/logo/fetch`, { method: "POST", body: { url } });
            setDraft(await rasterizeLogo(blobFromBase64(r.base64, r.mime)));
        } catch (e) { fail(e); } finally { setBusy(null); }
    };
    const working = busy !== null;

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        if (working) return;
        const file = Array.from(e.dataTransfer.files ?? []).find((f) => f.type.startsWith("image/"));
        if (file) return void takeBlob(file);
        const url = imageUrlFromDrop(e.dataTransfer.getData("text/html"), e.dataTransfer.getData("text/uri-list"), e.dataTransfer.getData("text/plain"));
        if (url) return void takeUrl(url);
        toast({ title: "그림을 찾지 못했습니다", description: "로고 그림 자체를 끌어다 놓거나, 그림을 복사해 붙여넣어 주세요", variant: "destructive" });
    };

    // 붙여넣기 — 이 시트가 열려 있는 동안. 글자 칸(홈페이지·전화·파)에 붙여넣는 것은 건드리지 않는다
    const live = useRef({ working, takeBlob });
    live.current = { working, takeBlob };
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
            const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"));
            const file = item?.getAsFile();
            if (!file || live.current.working) return;
            e.preventDefault();
            void live.current.takeBlob(file);
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, []);

    const upload = useMutation({
        mutationFn: (x: LogoDraft) => apiRequest(`${API}/${encodeURIComponent(d.slug)}/logo`, { method: "POST", body: { png: x.png, light: x.light, expected: { logo: d.logo } } }),
        onSuccess: () => {
            toast({ title: "로고를 올렸습니다" });
            setDraft(null);
            setAfter(null);
            void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
        onError: (e) => {
            toast({ title: "로고 올리기 실패", description: errMsg(e), variant: "destructive" });
            if (errCode(e) === "PAGE_CHANGED") void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
    });
    const onUpload = async () => {
        if (!draft || upload.isPending) return;
        if (d.logo && !(await appConfirm({ message: "지금 로고를 이 그림으로 바꿀까요? 골프장 페이지·경기 목록에 바로 보입니다.", confirmText: "바꾸기" }))) return;
        upload.mutate(draft);
    };

    const onClear = async () => {
        if (!d.logo || clear.isPending) return;
        const lines = ["로고를 내릴까요? 골프장 페이지·경기 목록에 이름 글자판이 대신 보입니다.", ...before];
        if (!(await appConfirm({ message: lines.join("\n"), tone: "danger", confirmText: "내리기" }))) return;
        clear.mutate();
    };

    return (
        <Panel className={cn("p-3 transition-colors", over && "ring-2 ring-brand bg-brand/[0.04]")}>
            <div
                data-logo-drop
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!over) setOver(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
                onDrop={onDrop}
                className="flex items-center gap-3">
                {d.logo ? <LogoThumb logo={d.logo} name={d.name} size="lg" /> : (
                    <span className="w-14 h-14 shrink-0 rounded-xl border border-dashed border-black/15 flex items-center justify-center text-[11.5px] text-black/35">없음</span>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[rgba(0,0,0,0.87)]">{d.logo ? ORIGIN_LABEL[d.logoOrigin ?? "other"] : "로고 없음 — 이름 글자판"}</p>
                    {d.logo && <p className="text-[11.5px] text-black/40 truncate">{d.logo}</p>}
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-black/45">
                        {over ? "여기에 놓으세요" : busy === "fetching" ? "그 사이트에서 그림을 받아 오는 중…" : busy === "reading" ? "그림을 읽는 중…"
                            : "골프장 홈페이지의 로고를 여기로 끌어다 놓거나, 그림을 복사해 붙여넣으세요(⌘V)."}
                    </p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && !working) void takeBlob(f); }} />
                <button onClick={() => fileRef.current?.click()} disabled={working || upload.isPending}
                    className="shrink-0 h-9 px-3 rounded-lg border border-black/10 bg-white text-[13px] font-bold text-black/70 hover:bg-black/[0.03] disabled:opacity-40 inline-flex items-center gap-1.5">
                    <LucideUpload className="w-4 h-4" />파일
                </button>
                <button data-admin-write onClick={() => void onClear()} disabled={!d.logo || clear.isPending}
                    className="shrink-0 h-9 px-3 rounded-lg border border-red-500/30 text-[13px] font-bold text-red-600 hover:bg-red-500/[0.05] disabled:opacity-35 disabled:hover:bg-transparent">
                    {clear.isPending ? "내리는 중…" : "로고 내리기"}
                </button>
            </div>
            {draft && (
                <div data-logo-draft className="mt-3 rounded-xl border border-black/[0.08] bg-black/[0.02] p-3">
                    <div className="flex items-center gap-3">
                        {/* 골프장 페이지의 로고판과 같은 모양으로 미리 본다 — 흰 판, 흰색뿐인 로고면 어두운 판 */}
                        <span className={cn("shrink-0 h-16 min-w-[64px] max-w-[176px] rounded-2xl px-3 py-2 inline-flex items-center justify-center border border-black/[0.08]", draft.light ? "bg-[#1C1F1D]" : "bg-white")}>
                            <img src={draft.png} alt="올릴 로고 미리 보기" className="max-w-full max-h-full object-contain" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-[rgba(0,0,0,0.87)]">올릴 로고</p>
                            <p className="text-[11.5px] text-black/45 tabular-nums">{draft.width}×{draft.height}px · {Math.max(1, Math.round(draft.bytes / 1024))}KB</p>
                            <label className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-black/60 cursor-pointer">
                                <input type="checkbox" checked={draft.light} onChange={(e) => setDraft({ ...draft, light: e.target.checked })} className="accent-brand" />
                                흰색 로고 — 어두운 판에 얹기
                            </label>
                        </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button onClick={() => setDraft(null)} disabled={upload.isPending}
                            className="flex-1 h-9 rounded-lg border border-black/10 bg-white text-[13px] font-bold text-black/60 disabled:opacity-50">취소</button>
                        <button data-admin-write onClick={() => void onUpload()} disabled={upload.isPending}
                            className="flex-1 h-9 rounded-lg bg-brand text-white text-[13px] font-bold hover:bg-brand-strong disabled:opacity-40">
                            {upload.isPending ? "올리는 중…" : d.logo ? "이 로고로 바꾸기" : "이 로고 올리기"}
                        </button>
                    </div>
                </div>
            )}
            {d.logo && before.length > 0 && (
                <ul className="mt-2.5 space-y-1 text-[11.5px] leading-relaxed text-black/50">{before.map((n) => <li key={n}>{n}</li>)}</ul>
            )}
            {after && after.length > 0 && (
                <div className="mt-2.5 rounded-xl bg-amber-500/[0.1] px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                    {after.map((n) => <p key={n}>{n}</p>)}
                </div>
            )}
        </Panel>
    );
}

// ── 원장 좌표 ──────────────────────────────────────────────────────
/** 새 좌표가 페이지 좌표와 이만큼 넘게 떨어지면 한 번 더 묻는다(다른 골프장을 찍었을 수 있다) */
const FAR_KM = 3;
const fmtLL = (lat: number, lng: number) => `${lat}, ${lng}`;

function CoordsEditor({ d }: { d: Detail }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const club = d.club;
    const page = d.pageLat != null && d.pageLng != null ? { lat: d.pageLat, lng: d.pageLng } : null;
    // 원장에 짝이 있으면 원장 좌표를 고친다(저장하면 페이지 좌표도 같은 값으로). 짝이 없으면 페이지 좌표를 바로 고친다
    const cur = club ? (club.lat != null && club.lng != null ? fmtLL(club.lat, club.lng) : "") : page ? fmtLL(page.lat, page.lng) : "";
    const [text, setText] = useState(cur);
    useEffect(() => setText(cur), [d.slug, cur]);
    const parsed = text.trim() ? parseLatLngText(text) : null;
    const check = parsed ? checkKoreaCoords(parsed.lat, parsed.lng) : null;
    const dirty = text.trim() !== cur;
    const far = check?.ok && page ? distanceKm(check.lat, check.lng, page.lat, page.lng) : null;

    const save = useMutation({
        // 원장 좌표를 저장할 때 이 페이지(slug)를 같이 보낸다 — 서버가 골프장 페이지 좌표도 같은 값으로 맞춘다
        mutationFn: (body: { lat: number; lng: number }) => club
            ? apiRequest(`${API}/clubs/${club.id}/coords`, { method: "PATCH", body: { ...body, slug: d.slug } })
            : apiRequest(`${API}/${encodeURIComponent(d.slug)}/coords`, { method: "PATCH", body }),
        onSuccess: () => {
            toast({ title: "좌표를 저장했습니다", description: club ? "골프장 페이지 좌표도 같은 값으로 맞췄습니다" : undefined });
            void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
        onError: (e) => {
            toast({ title: "좌표 저장 실패", description: errMsg(e), variant: "destructive" });
            if (errCode(e) === "PAGE_CHANGED" || errCode(e) === "PAGE_HAS_CLUB") void qc.invalidateQueries({ queryKey: GOLF_COURSES_KEY });
        },
    });

    // 원장 좌표는 그대로 두고 페이지 좌표만 어긋나 있는 경우 — 원장 좌표로 맞춘다
    const pageOff = !!club && club.lat != null && club.lng != null && (!page || page.lat !== club.lat || page.lng !== club.lng);
    const pageOffKm = pageOff && page ? distanceKm(club!.lat!, club!.lng!, page.lat, page.lng) : null;

    const onSave = async () => {
        if (!check?.ok || save.isPending) return;
        const lines = club
            ? [`좌표를 저장할까요? 현장 인증은 이 점에서 ${ONSITE_RADIUS_KM}km 안인지로 판정하고, 골프장 페이지 좌표(지도·가까운 골프장·날씨)도 같은 값으로 바뀝니다.`, `위도 ${check.lat} · 경도 ${check.lng}`]
            : [`골프장 페이지 좌표를 저장할까요? 지도·가까운 골프장·날씨가 이 점을 씁니다.`, `위도 ${check.lat} · 경도 ${check.lng}`];
        if (far != null && far > FAR_KM) lines.push(`지금 골프장 페이지 좌표와 ${far.toFixed(1)}km 떨어져 있습니다 — 다른 골프장을 찍지 않았는지 보세요.`);
        if (!(await appConfirm({ message: lines.join("\n"), confirmText: "저장" }))) return;
        save.mutate({ lat: check.lat, lng: check.lng });
    };
    const onSyncPage = async () => {
        if (!pageOff || save.isPending) return;
        const lines = [`골프장 페이지 좌표를 원장 좌표(${cur})로 맞출까요? 지도·가까운 골프장·날씨가 이 점을 씁니다.`];
        if (page) lines.push(`지금 페이지 좌표: ${fmtLL(page.lat, page.lng)}${pageOffKm != null ? ` (${pageOffKm.toFixed(1)}km 차이)` : ""}`);
        if (!(await appConfirm({ message: lines.join("\n"), confirmText: "맞추기" }))) return;
        save.mutate({ lat: club!.lat!, lng: club!.lng! });
    };

    // 원장 좌표가 없을 때 현장 인증이 무엇을 쓰는지(golf.repo.ts courseCoordsFor): 그 원장을 쓰는 페이지가 하나뿐이면 페이지 좌표
    const fallback = !cur && page && d.sharedClubPages.length === 0;
    const mapAt = check?.ok ? check : club && club.lat != null && club.lng != null ? { lat: club.lat, lng: club.lng } : page;
    const link = "h-9 px-3 rounded-lg border border-black/10 bg-white inline-flex items-center gap-1.5 text-[12.5px] font-bold text-black/60 hover:border-brand/40 hover:text-brand";
    return (
        <Panel className="p-3 space-y-2.5">
            {club ? (
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div className="rounded-xl bg-black/[0.03] px-2.5 py-2 min-w-0">
                        <p className="font-bold text-black/45">원장 좌표</p>
                        <p className={cn("mt-0.5 tabular-nums truncate", cur ? "text-[rgba(0,0,0,0.87)] font-bold" : "text-red-600 font-bold")}>{cur || "없음"}</p>
                    </div>
                    <div className="rounded-xl bg-black/[0.03] px-2.5 py-2 min-w-0">
                        <p className="font-bold text-black/45">골프장 페이지 좌표</p>
                        <p className={cn("mt-0.5 tabular-nums truncate", pageOff ? "text-amber-700 font-bold" : "text-black/60")}>{page ? fmtLL(page.lat, page.lng) : "없음"}</p>
                    </div>
                </div>
            ) : (
                <p className="text-[12px] leading-relaxed text-black/50">라운드 원장에 짝이 없는 골프장입니다 — 여기서는 골프장 페이지 좌표(지도·가까운 골프장·날씨)를 바로 고칩니다.</p>
            )}
            {club && (
                <p className="text-[12px] leading-relaxed text-black/50">원장 좌표를 저장하면 골프장 페이지 좌표도 같은 값으로 바뀝니다.</p>
            )}
            {pageOff && !dirty && (
                <div data-coords-sync className="rounded-xl bg-amber-500/[0.1] px-3 py-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-amber-900">
                        골프장 페이지 좌표가 원장 좌표와 다릅니다{pageOffKm != null ? ` (${pageOffKm.toFixed(1)}km)` : ""}.
                    </p>
                    <button data-admin-write type="button" onClick={() => void onSyncPage()} disabled={save.isPending}
                        className="shrink-0 h-8 px-3 rounded-lg bg-white border border-amber-600/30 text-[12.5px] font-bold text-amber-900 disabled:opacity-50">
                        원장 좌표로 맞추기
                    </button>
                </div>
            )}
            {club && !cur && (
                <p className={cn("text-[12px] leading-relaxed", fallback ? "text-black/50" : "text-red-600 font-bold")}>
                    {fallback ? "지금은 현장 인증이 골프장 페이지 좌표로 대신합니다 — 원장에도 넣어 두면 확실합니다."
                        : "이 골프장 라운드는 지금 현장 인증을 할 수 없습니다 — 좌표를 넣어 주세요."}
                </p>
            )}
            <label className="block">
                <span className="text-[12px] font-bold text-black/50">위도, 경도</span>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="37.27612, 127.43011" inputMode="decimal" autoComplete="off"
                    className={cn("mt-1 w-full h-10 px-3 rounded-lg border bg-white text-[16px] md:text-sm tabular-nums outline-none focus:border-brand/50",
                        dirty && text.trim() && !check?.ok ? "border-red-400" : "border-black/10")} />
                <span className={cn("mt-1 block text-[11.5px]", dirty && text.trim() && !check?.ok ? "text-red-600 font-bold" : "text-black/40")}>
                    {!text.trim() ? "지도 앱에서 '좌표 복사'한 값을 그대로 붙여넣으세요"
                        : !parsed ? "'위도, 경도' 꼴로 적어 주세요(예: 37.27612, 127.43011)"
                        : !check?.ok ? (check as { error: string }).error
                        : `위도 ${check.lat} · 경도 ${check.lng}`}
                </span>
                {far != null && far > FAR_KM && <span className="mt-1 block text-[11.5px] font-bold text-amber-700">골프장 페이지 좌표와 {far.toFixed(1)}km 떨어져 있습니다</span>}
            </label>
            <div className="flex flex-wrap gap-2">
                {page && text.trim() !== fmtLL(page.lat, page.lng) && (
                    <button type="button" onClick={() => setText(fmtLL(page.lat, page.lng))} className={link}>페이지 좌표 넣기</button>
                )}
                {mapAt && (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${mapAt.lat},${mapAt.lng}`} target="_blank" rel="noopener noreferrer" className={link}>
                        <LucideMapPin className="w-3.5 h-3.5" /> 지도에서 보기
                    </a>
                )}
                <a href={`https://map.naver.com/p/search/${encodeURIComponent(d.name)}`} target="_blank" rel="noopener noreferrer" className={link}>
                    이름으로 지도 검색 <LucideExternalLink className="w-3.5 h-3.5" />
                </a>
            </div>
            {dirty && (
                <div className="flex gap-2">
                    <button onClick={() => setText(cur)} disabled={save.isPending}
                        className="flex-1 h-9 rounded-lg border border-black/10 bg-white text-[13px] font-bold text-black/60 disabled:opacity-50">되돌리기</button>
                    <button data-admin-write onClick={() => void onSave()} disabled={!check?.ok || save.isPending}
                        className="flex-1 h-9 rounded-lg bg-brand text-white text-[13px] font-bold hover:bg-brand-strong disabled:opacity-40">
                        {save.isPending ? "저장 중…" : "좌표 저장"}
                    </button>
                </div>
            )}
        </Panel>
    );
}
