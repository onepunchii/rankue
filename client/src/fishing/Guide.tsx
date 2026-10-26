/**
 * 어류 도감 · 금어기/금지체장 · 낚시 규칙(2026-10-14 오너가 준 자료 — "이걸로 정보 넣어 줘").
 *
 * 자료는 정적 파일이다(client/public/fishing/guide — server/scripts/fishing-build-guides.ts 가 만든다):
 *  - 도감 374종: 한국어 위키백과(CC BY-SA 4.0)를 주 자료로 다시 쓴 글 + 해양생물자원관 종 설명. 종마다 출처와 라이선스를 적는다.
 *  - 금어기 · 금지체장 67줄: 수산자원관리법 시행령 별표 1 · 2(개정 기준일을 적는다). 지역 · 해역 고시는 따로라고 적는다.
 *  - 규칙 Q&A 74: 조문만 근거로 쓴 글. "법률 자문이 아니에요"와 확인이 더 필요한 부분(needsReview)을 같이 보인다.
 * 글은 받은 그대로 보인다(고쳐 쓰지 않는다). 위키백과 사진은 파일마다 라이선스가 달라 쓰지 않는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronRight, LucideX, LucidePlus } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { FISHING_COLORS as C } from "@shared/fishing";
import { FISH, type FishKind } from "@shared/fishingFish";
import { FISH_GUIDE_NAME, FISH_REG_NAMES } from "@shared/fishingFishInfo";
import { INK, PAPER, SEAL, art } from "./ink";

/** 사진의 작가 · 라이선스 · 파일 문서(위키미디어 공용) — 사진 밑에 적는다 */
export interface GuidePhotoCredit { a: string; l: string; p: string | null }
export interface GuideRow { key: string; name: string; line: string; thin: boolean; reg: boolean; photo: GuidePhotoCredit | null }
export interface Guide { key: string; name: string; intro: string; sections: { h: string; b: string }[]; id: string[]; faq: { q: string; a: string }[]; thin: boolean; sources: { name: string; title?: string; url?: string; license?: string }[]; photo?: { w: number; h: number; author: string; license: string; licenseUrl: string | null; page: string | null } }
/** 도감 사진 — 640px 한 장 · 목록용 120px */
export const guidePhoto = (key: string, small = false) => `/fishing/guide/img/${key}${small ? "-s" : ""}.webp`;
/** 사진 한 줄의 출처 — "사진: 작가 · CC BY-SA 3.0 · 위키미디어 공용" */
export function PhotoCredit({ author, license, page, dark }: { author: string; license: string; page: string | null; dark?: boolean }) {
    const body = `사진: ${author} · ${license} · 위키미디어 공용`;
    return <p className="text-[12px] leading-snug [word-break:keep-all]" style={{ color: dark ? "#F3ECDD80" : "#0F2838B3" }}>{page ? <a href={page} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{body}</a> : body}</p>;
}
export interface RegRow { kind: "closed" | "min"; group: string; name: string; rule: string }
export interface Regs { basis: string; titles: { closed: string; min: string }; rows: RegRow[] }
export interface RuleQa { slug: string; q: string; short: string; body: string; review: string[]; laws: string[]; who: "angler" | "business" }

const get = <T,>(path: string) => async (): Promise<T> => { const r = await fetch(path); if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as T; };
const DAY = 24 * 3600_000;
export const useGuideIndex = (enabled = true) => useQuery<GuideRow[]>({ queryKey: ["fishing-guide", "index"], queryFn: get("/fishing/guide/index.json"), staleTime: DAY, enabled });
export const useGuide = (key: string | null) => useQuery<Guide>({ queryKey: ["fishing-guide", "g", key], queryFn: get(`/fishing/guide/g/${key}.json`), staleTime: DAY, enabled: !!key });
export const useRegs = () => useQuery<Regs>({ queryKey: ["fishing-guide", "regs"], queryFn: get("/fishing/guide/regs.json"), staleTime: DAY });
const useRules = () => useQuery<RuleQa[]>({ queryKey: ["fishing-guide", "rules"], queryFn: get("/fishing/guide/rules.json"), staleTime: DAY });

/** "잔더 (어류)" → "잔더" — 위키백과 문서 이름의 꼬리를 뗀다 */
export const guideName = (n: string) => n.replace(/\s*\((어류|물고기|동물)\)$/, "");
/** 목록의 한 줄 — 학명 괄호를 뗀다 */
const plainLine = (s: string) => s.replace(/\s*\([A-Za-z][A-Za-z .,-]*\)/, "").replace(/\s+/g, " ");
/** 우리 어종(어탁이 있는 스물둘)의 도감 이름 → 어종 */
const OURS_BY_GUIDE = new Map<string, FishKind>(FISH.flatMap((f) => (FISH_GUIDE_NAME[f.id] ? [[FISH_GUIDE_NAME[f.id] as string, f] as const] : [])));
export const oursOfGuide = (name: string): FishKind | null => OURS_BY_GUIDE.get(name) ?? FISH.find((f) => f.name === guideName(name)) ?? null;

const SHEET = { background: PAPER, color: INK, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" } as const;
const RULE = "1px dashed #0F283826";

/** 글 속의 **굵게** · [이름](주소) 만 살린다 */
function Inline({ text }: { text: string }) {
    const parts: ReactNode[] = [];
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
    let at = 0, m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(text))) {
        if (m.index > at) parts.push(text.slice(at, m.index));
        parts.push(m[1] ? <span key={i++} className="font-semibold">{m[1]}</span> : <a key={i++} href={m[3]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "#1F5A78" }}>{m[2]}</a>);
        at = m.index + m[0].length;
    }
    if (at < text.length) parts.push(text.slice(at));
    return <>{parts}</>;
}
/** 규칙 글(## 제목 · - 줄 · 문단)만 그리는 작은 그림꾼 */
function MdLite({ text }: { text: string }) {
    const blocks = text.split("\n").reduce<{ kind: "h" | "li" | "p"; text: string }[]>((acc, raw) => {
        const line = raw.trim();
        if (!line) return acc;
        if (line.startsWith("## ")) acc.push({ kind: "h", text: line.slice(3) });
        else if (line.startsWith("- ")) acc.push({ kind: "li", text: line.slice(2) });
        else acc.push({ kind: "p", text: line });
        return acc;
    }, []);
    return (
        <div className="space-y-1.5 text-[14px] leading-relaxed [word-break:keep-all]">
            {blocks.map((b, i) => b.kind === "h" ? <p key={i} className="pt-2 text-[13px] font-semibold" style={{ color: "#0F2838B3" }}>{b.text}</p>
                : b.kind === "li" ? <p key={i} className="flex gap-2"><span aria-hidden style={{ color: "#0F283866" }}>·</span><span><Inline text={b.text} /></span></p>
                    : <p key={i} style={{ color: "#0F2838B3" }}><Inline text={b.text} /></p>)}
        </div>
    );
}

/** 금어기 · 금지체장 — 법이 정한 값. 이름이 우리 이름과 다르면(조피볼락 · 넙치 · 참문어) 그 이름을 앞에 적는다 */
export function RegBox({ names, regs, label, onRules }: { names: readonly string[]; regs: Regs | undefined; label: string; onRules?: () => void }) {
    const rows = regs ? regs.rows.filter((r) => names.includes(r.name)) : [];
    if (!rows.length) return null;
    const many = new Set(rows.map((r) => r.name)).size > 1 || rows[0].name !== label;
    return (
        <div className="rounded-xl px-3.5 py-3" style={{ border: `1.5px solid ${SEAL}`, background: PAPER, color: INK }} data-testid="fishing-reg">
            <ul className="space-y-1.5">
                {rows.map((r) => (
                    <li key={`${r.kind}-${r.name}`} className="flex gap-2.5 text-[14px] leading-relaxed [word-break:keep-all]">
                        <span className="w-[56px] shrink-0 font-semibold" style={{ color: SEAL }}>{r.kind === "closed" ? "금어기" : "금지체장"}</span>
                        <span className="min-w-0 flex-1">{many ? <span className="mr-1" style={{ color: "#0F2838B3" }}>{r.name}</span> : null}{r.rule}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-[12.5px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838B3" }}>낚시하는 사람에게도 적용돼요. 시 · 도가 더 엄하게 고시한 곳이 있을 수 있어요.</p>
            <p className="mt-1 flex items-baseline justify-between gap-2 text-[12px] [word-break:keep-all]" style={{ color: "#0F2838B3" }}>
                <span>출처: {regs!.basis}</span>
                {onRules && <button type="button" onClick={onRules} className="shrink-0 font-semibold" style={{ color: "#1F5A78" }} data-testid="fishing-reg-rules">낚시 규칙</button>}
            </p>
        </div>
    );
}

/** 도감 글 한 장 — 처음엔 소개와 두 칸만, '더 보기'로 나머지 */
export function GuideStory({ guide }: { guide: Guide }) {
    const [all, setAll] = useState(false);
    const shown = all ? guide.sections : guide.sections.slice(0, 2);
    const more = guide.sections.length > 2 || guide.id.length > 0 || guide.faq.length > 0;
    return (
        <div className="overflow-hidden rounded-2xl" style={SHEET} data-testid="fishing-guide-story">
            {guide.photo && (
                <figure className="m-0" data-testid="fishing-guide-photo">
                    <img src={guidePhoto(guide.key)} alt={`${guideName(guide.name)} 사진`} width={guide.photo.w} height={guide.photo.h} loading="lazy" decoding="async" className="block max-h-[260px] w-full object-cover" style={{ background: "#0F2838" }} />
                    <figcaption className="px-3.5 pt-2"><PhotoCredit author={guide.photo.author} license={guide.photo.license} page={guide.photo.page} /></figcaption>
                </figure>
            )}
            <p className="px-3.5 pb-3 pt-3.5 text-[15px] leading-relaxed [word-break:keep-all]">{guide.intro}</p>
            {shown.map((s) => (
                <div key={s.h} className="flex gap-3 px-3.5 py-3" style={{ borderTop: RULE }}>
                    <span className="w-[64px] shrink-0 pt-0.5 text-[13px]" style={{ color: "#0F2838B3" }}>{s.h}</span>
                    <span className="min-w-0 flex-1 text-[14.5px] leading-relaxed [word-break:keep-all]">{s.b}</span>
                </div>
            ))}
            {all && guide.id.length > 0 && (
                <div className="px-3.5 py-3" style={{ borderTop: RULE }}>
                    <p className="text-[13px]" style={{ color: "#0F2838B3" }}>이렇게 알아봐요</p>
                    <ul className="mt-1.5 space-y-1.5">{guide.id.map((t, i) => <li key={t} className="flex gap-2 text-[14.5px] leading-relaxed [word-break:keep-all]"><span className="shrink-0 tabular-nums" style={{ color: "#0F283873" }}>{i + 1}</span><span>{t}</span></li>)}</ul>
                </div>
            )}
            {all && guide.faq.length > 0 && (
                <div className="px-3.5 py-3" style={{ borderTop: RULE }}>
                    <p className="text-[13px]" style={{ color: "#0F2838B3" }}>자주 묻는 것</p>
                    <dl className="mt-1.5 space-y-2.5">{guide.faq.map((f) => <div key={f.q}><dt className="text-[14.5px] font-semibold [word-break:keep-all]">{f.q}</dt><dd className="mt-0.5 text-[14px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838CC" }}>{f.a}</dd></div>)}</dl>
                </div>
            )}
            {more && !all && (
                <button type="button" onClick={() => setAll(true)} className="flex h-11 w-full items-center justify-center text-[13.5px] font-semibold active:bg-[#0F28380A]" style={{ borderTop: RULE, color: "#1F5A78" }} data-testid="fishing-guide-more">더 보기</button>
            )}
            <p className="border-t px-3.5 py-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ borderColor: "#0F28381F", color: "#0F2838B3" }}>
                자료: {guide.sources.map((s, i) => (
                    <Fragment key={`${s.name}${i}`}>{i ? " · " : ""}{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{s.name}{s.title ? ` 「${s.title}」` : ""}</a> : s.name}{s.license ? ` (${s.license})` : ""}</Fragment>
                ))}{guide.thin ? " · 자료가 짧은 어종이에요" : ""}
            </p>
        </div>
    );
}

/** 우리 어종(어탁이 있는 스물둘)의 도감 글 키 — 목록에서 이름으로 찾는다 */
export function useOurGuideKey(fish: FishKind): string | null {
    const name = FISH_GUIDE_NAME[fish.id];
    const { data } = useGuideIndex(!!name);
    return name && data ? data.find((g) => g.name === name)?.key ?? null : null;
}

/** 도감의 한 장(어탁이 없는 어종) — 이름 · 글 · 금어기, 여기서 바로 조과를 적는다 */
export function GuideSheet({ row, onClose, onAdd, onRules }: { row: GuideRow; onClose: () => void; onAdd: (species: string) => void; onRules: () => void }) {
    const { data: g, isError } = useGuide(row.key);
    const { data: regs } = useRegs();
    const name = guideName(row.name);
    return (
        <div role="dialog" aria-modal="true" aria-label={`${name} 도감`} className="fixed inset-0 z-[60] flex flex-col" style={{ background: C.bg, color: C.foam }} data-testid="fishing-guide-sheet">
            <div className="h-[env(safe-area-inset-top)] shrink-0" aria-hidden />
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: C.line }}>
                <h2 className="flex-1 text-[16px] font-semibold">어류 도감</h2>
                <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF0F] active:bg-[#FFFFFF1F]" data-testid="fishing-guide-close"><LucideX className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4">
                <p className="px-1 text-[27px] font-semibold leading-tight tracking-tight">{name}</p>
                <RegBox names={[row.name]} regs={regs} label={row.name} onRules={onRules} />
                {g ? <GuideStory guide={g} /> : <p className="rounded-2xl px-4 py-6 text-center text-[14px]" style={{ border: "1px dashed #FFFFFF2E", color: C.dim }}>{isError ? "글을 불러오지 못했어요" : "불러오는 중…"}</p>}
            </div>
            <div className="shrink-0 border-t px-4 pt-3" style={{ borderColor: C.line, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                <button type="button" onClick={() => onAdd(name)} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:opacity-90" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-guide-add">
                    <LucidePlus weight="bold" className="h-5 w-5" />{name} 조과 적기
                </button>
            </div>
        </div>
    );
}

/** 가나다 색인 — 첫 글자의 초성(쌍자음은 홑자음 칸에) */
const CHO = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"] as const;
const CHO_ALL = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const FOLD: Record<string, string> = { ㄲ: "ㄱ", ㄸ: "ㄷ", ㅃ: "ㅂ", ㅆ: "ㅅ", ㅉ: "ㅈ" };
export function choOf(name: string): string | null {
    const c = name.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) return null;
    const ch = CHO_ALL[Math.floor(c / 588)];
    return FOLD[ch] ?? ch;
}

/** 도감 화면 — 찾기 · 가나다 색인 · 금어기 있는 어종. 우리 어종은 어탁이 붙고, 누르면 어종 한 장이 열린다 */
export function GuideBook({ onOurs, onOther }: { onOurs: (fish: FishKind) => void; onOther: (row: GuideRow) => void }) {
    const { data: list, isError } = useGuideIndex();
    const [q, setQ] = useState("");
    const [cho, setCho] = useState<string>("ㄱ");
    const [regOnly, setRegOnly] = useState(false);
    const query = q.replace(/\s+/g, "");
    const rows = useMemo(() => {
        const all = list ?? [];
        if (query) return all.filter((r) => r.name.replace(/\s+/g, "").includes(query));
        if (regOnly) return all.filter((r) => r.reg);
        return all.filter((r) => choOf(r.name) === cho);
    }, [list, query, cho, regOnly]);
    const chip = "relative h-9 min-w-9 shrink-0 rounded-full px-2.5 text-[13.5px] rk-hit44";
    return (
        <div data-testid="fishing-guide-book">
            <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={20} placeholder="어종 이름으로 찾기 — 예: 감성돔" type="search"
                className="h-12 w-full rounded-xl px-3.5 text-[15px] outline-none placeholder:text-[#F3ECDD59]" style={{ background: "#FFFFFF0F", color: C.foam }} data-testid="fishing-guide-q" />
            {!query && (
                <div className="-mx-5 mt-2.5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="가나다">
                    <button type="button" aria-pressed={regOnly} onClick={() => setRegOnly(true)} className={cn(chip, regOnly && "font-semibold")} style={regOnly ? { background: SEAL, color: "#FFF4EC" } : { background: "#FFFFFF0F", color: C.soft }} data-testid="fishing-guide-reg">금어기</button>
                    {CHO.map((c) => {
                        const on = !regOnly && c === cho;
                        return <button key={c} type="button" aria-pressed={on} onClick={() => { setCho(c); setRegOnly(false); }} className={cn(chip, on && "font-semibold")} style={on ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }} data-testid="fishing-guide-cho">{c}</button>;
                    })}
                </div>
            )}
            <div className="mt-3 overflow-hidden rounded-2xl" style={SHEET}>
                {!list ? <p className="px-4 py-8 text-center text-[14px]" style={{ color: "#0F2838B3" }}>{isError ? "도감을 불러오지 못했어요" : "불러오는 중…"}</p>
                    : rows.length === 0 ? <p className="px-4 py-8 text-center text-[14px]" style={{ color: "#0F2838B3" }}>찾는 어종이 없어요</p> : (
                        <ul>
                            {rows.map((r, i) => {
                                const ours = oursOfGuide(r.name);
                                return (
                                    <li key={r.key} style={{ borderTop: i ? RULE : undefined }}>
                                        <button type="button" onClick={() => (ours ? onOurs(ours) : onOther(r))} className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-[#0F28380A]" data-testid="fishing-guide-row" data-ours={ours ? ours.id : undefined}>
                                            <span className="flex h-11 w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: r.photo ? "#0F2838" : "transparent" }}>
                                                {r.photo ? <img src={guidePhoto(r.key, true)} alt="" width={120} height={80} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                                    : ours ? <img src={art(ours.id)} alt="" width={640} height={400} loading="lazy" decoding="async" className="h-9 w-[50px] object-contain" style={{ mixBlendMode: "multiply" }} /> : <span className="text-[17px] font-semibold" style={{ color: "#0F283840" }}>{r.name.slice(0, 1)}</span>}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5"><span className="truncate text-[15.5px] font-semibold">{guideName(r.name)}</span>{r.reg && <span className="shrink-0 rounded-[4px] px-1.5 py-px text-[12px]" style={{ border: `1px solid ${SEAL}`, color: SEAL }}>금어기</span>}</span>
                                                <span className="mt-0.5 line-clamp-1 text-[13px]" style={{ color: "#0F2838B3" }}>{plainLine(r.line)}</span>
                                            </span>
                                            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: "#0F283859" }} aria-hidden />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
            </div>
            <p className="mt-2.5 px-1 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>
                {list ? `${list.length}종 · ` : ""}글은 한국어 위키백과(CC BY-SA 4.0)와 국립해양생물자원관 해양생물종정보를 바탕으로 했어요. 사진은 위키미디어 공용의 자유 라이선스 사진이고, 종마다 작가 · 라이선스가 적혀 있어요.
            </p>
        </div>
    );
}

/** 낚시 규칙 — 금어기 · 금지체장 표 + 낚시하는 사람의 물음. 사업자 물음은 접어 둔다 */
export function RulesPage() {
    const { data: regs } = useRegs();
    const { data: rules, isError } = useRules();
    const [kind, setKind] = useState<"closed" | "min">("closed");
    const [open, setOpen] = useState<string | null>(null);
    const [biz, setBiz] = useState(false);
    const angler = (rules ?? []).filter((r) => r.who === "angler"), business = (rules ?? []).filter((r) => r.who === "business");
    const tab = (id: "closed" | "min", label: string) => (
        <button type="button" aria-pressed={kind === id} onClick={() => setKind(id)} className={cn("h-9 flex-1 rounded-full text-[13.5px] relative rk-hit44", kind === id && "font-semibold")} style={kind === id ? { background: "#0F2838", color: "#F3ECDD" } : { color: "#0F2838B3" }} data-testid={`fishing-rules-${id}`}>{label}</button>
    );
    const qa = (r: RuleQa, i: number) => {
        const on = open === r.slug;
        return (
            <li key={r.slug} style={{ borderTop: i ? RULE : undefined }} data-testid="fishing-rule">
                <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : r.slug)} className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-[#0F28380A]">
                    <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug [word-break:keep-all]">{r.q}</span>
                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 transition-transform" style={{ color: "#0F283859", transform: on ? "rotate(90deg)" : undefined }} aria-hidden />
                </button>
                {on && (
                    <div className="px-3.5 pb-3.5">
                        <p className="rounded-lg px-3 py-2.5 text-[14px] leading-relaxed [word-break:keep-all]" style={{ background: "#0F28380A" }}>{r.short}</p>
                        <div className="mt-2"><MdLite text={r.body} /></div>
                        {r.review.length > 0 && (
                            <details className="mt-2.5 rounded-lg px-3 py-2" style={{ background: "#C8372D0D" }}>
                                <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: SEAL }}>확인이 더 필요한 부분 {r.review.length}</summary>
                                <ul className="mt-1.5 space-y-1">{r.review.map((t) => <li key={t} className="text-[13px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838B3" }}>· {t}</li>)}</ul>
                            </details>
                        )}
                    </div>
                )}
            </li>
        );
    };
    return (
        <div data-testid="fishing-rules">
            <p className="rounded-xl px-3.5 py-3 text-[13px] leading-relaxed [word-break:keep-all]" style={{ background: "#FFFFFF0A", color: C.soft }}>
                법률 자문이 아니에요. 낚시관리법 · 수산자원관리법 · 내수면어업법 조문만 근거로 썼고(2026년 10월 14일 국가법령정보센터 현행 본문), 시 · 도와 시 · 군의 고시는 따로 있을 수 있어요.
            </p>

            {regs && (
                <section className="pt-7" data-testid="fishing-rules-table">
                    <h2 className="mb-3 text-[18px] font-semibold tracking-tight">금어기 · 금지체장</h2>
                    <div className="overflow-hidden rounded-2xl" style={SHEET}>
                        <div className="m-2.5 flex rounded-full p-0.5" style={{ background: "#0F28380F" }} role="group" aria-label="표">{tab("closed", "금어기")}{tab("min", "금지체장")}</div>
                        <ul>
                            {regs.rows.filter((r) => r.kind === kind).map((r) => (
                                <li key={r.name} className="flex gap-3 px-3.5 py-2.5" style={{ borderTop: RULE }}>
                                    <span className="w-[84px] shrink-0 text-[14.5px] font-semibold [word-break:keep-all]">{r.name}</span>
                                    <span className="min-w-0 flex-1 text-[14px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838CC" }}>{r.rule}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="border-t px-3.5 py-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ borderColor: "#0F28381F", color: "#0F2838B3" }}>{kind === "closed" ? regs.titles.closed : regs.titles.min} — {regs.basis}. 낚시하는 사람에게도 적용돼요.</p>
                    </div>
                </section>
            )}

            <section className="pt-8">
                <h2 className="mb-3 text-[18px] font-semibold tracking-tight">낚시하는 사람이 묻는 것</h2>
                <div className="overflow-hidden rounded-2xl" style={SHEET}>
                    {!rules ? <p className="px-4 py-8 text-center text-[14px]" style={{ color: "#0F2838B3" }}>{isError ? "불러오지 못했어요" : "불러오는 중…"}</p> : <ul>{angler.map(qa)}</ul>}
                </div>
            </section>
            {business.length > 0 && (
                <section className="pt-6">
                    <button type="button" aria-expanded={biz} onClick={() => setBiz((v) => !v)} className="flex h-12 w-full items-center justify-between rounded-xl px-3.5 text-[14px]" style={{ background: "#FFFFFF0A", color: C.soft }} data-testid="fishing-rules-biz">
                        <span>낚시터 · 낚시어선 사업자의 물음 {business.length}</span>
                        <LucideChevronRight weight="bold" className="h-4 w-4" style={{ transform: biz ? "rotate(90deg)" : undefined }} aria-hidden />
                    </button>
                    {biz && <div className="mt-2.5 overflow-hidden rounded-2xl" style={SHEET}><ul>{business.map(qa)}</ul></div>}
                </section>
            )}
        </div>
    );
}

/** 어종 한 장에 넣는 도감 글 — 우리 어종의 이름표로 찾는다(없으면 아무것도 그리지 않는다) */
export function OurGuideStory({ fish }: { fish: FishKind }) {
    const key = useOurGuideKey(fish);
    const { data: g } = useGuide(key);
    return g ? <GuideStory guide={g} /> : null;
}
