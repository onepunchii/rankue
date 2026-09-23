/**
 * 티타임 달력·시계 (2026-09-23 오너: "가장 편하게 올릴 수 있는 캘린더와 시간을 고민해 달라").
 *
 * 그전에는 `<input type="date">` + `<input type="time">` 에 [color-scheme:dark] 만 씌운 **OS 기본 피커**였다.
 * 세 가지가 나빴다. ① 생김새가 기기마다 다르다(안드로이드 시계 다이얼 · iOS 드럼 · 데스크톱 텍스트칸) —
 * 우리 화면 한가운데에 남의 디자인이 박힌다. ② OS 달력은 **요일 색만 보여 줄 뿐** 우리가 강조해야 할 주말을
 * 강조해 주지 않는다. 매니저에게 토·일은 값이 다른 날이라 제일 중요한 정보다. ③ 시계 드럼은 한 번에 한 자리씩
 * 굴려야 해서, 05:31 · 05:38 · 05:45 처럼 **7~8분 간격으로 줄줄이** 올리는 부킹 매니저에게 제일 느리다.
 *
 * 그래서 우리 것을 만들었다. 설계의 축은 하나다 — **"날짜 하나 + 시간 여러 개" 를 빨리 쌓는 것**.
 *  · 날짜: 한 달 달력(오늘 이전은 못 고름). 토·일은 칸 바탕을 살짝 올리고 글자를 밝게 해 눈에 띄게 한다.
 *    색을 새로 늘리지 않는다 — 강조색은 '고른 날' 하나뿐이어야 어디를 골랐는지 즉시 읽힌다.
 *  · 시간: 시(24칸, 골프 하루 순서로 05시부터) → 분(십의 자리 6칸 → 일의 자리 10칸).
 *    한 번 누르면 정각, 두 번 누르면 05:30, 세 번이면 05:38. 드럼과 달리 **어느 시간이든 3탭 안**이고
 *    모든 후보가 동시에 보인다(드럼은 보이지 않는 값을 굴려서 찾아야 한다).
 *  · 여러 개: 고른 시간부터 7·8·10·12분 간격으로 N개를 한 번에 쌓는 지름길. 실제 티타임표가 그 모양이다.
 *    '추가' 를 누르면 다음 칸(+간격)으로 저절로 옮겨 가 연달아 넣는 흐름이 끊기지 않는다.
 *
 * 골프 전용이라 i18n 없이 한국어를 그대로 쓴다(골프 모듈 관례).
 * 강조색은 화면마다 다르다(부킹 라임 #64DD17 · 조인 주황 #FF6B00) — accent/onAccent 로 받는다.
 * `bg-white` 는 쓰지 않는다: 골프 테마(:root[data-sport="GOLF"])가 그 유틸리티를 어두운 면으로 덮어쓴다.
 */
import { useEffect, useMemo, useState } from "react";
import {
    LucideCalendarDays, LucideClock3, LucideChevronLeft, LucideChevronRight, LucideChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────── 날짜 열쇠(YYYY-MM-DD) 셈 ─────────────────────────── */

function parts(key: string) {
    const [y, m, d] = key.split("-").map(Number);
    return { y, m, d };
}
function toKey(y: number, m: number, d: number) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** 날짜 열쇠 + n일. UTC 로만 셈해서 기기 시간대에 흔들리지 않는다(kst.ts 와 같은 이유). */
export function addDaysKey(key: string, n: number): string {
    const { y, m, d } = parts(key);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return toKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
function dayOfWeek(key: string): number {
    const { y, m, d } = parts(key);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** '9월 25일 (목)'. 오늘·내일·모레는 그 말이 더 빨리 읽힌다. */
export function dateFieldLabel(key: string, today: string): string {
    if (!key) return "날짜";
    const { m, d } = parts(key);
    const near = ["오늘", "내일", "모레"][[0, 1, 2].find((n) => addDaysKey(today, n) === key) ?? -1];
    const base = `${m}월 ${d}일 (${WEEKDAYS[dayOfWeek(key)]})`;
    return near ? `${base} · ${near}` : base;
}

/* ─────────────────────────── 공통 조각 ─────────────────────────── */

interface Accent { accent: string; onAccent: string }

const trigger = "h-11 px-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-[14px] text-white inline-flex items-center gap-2 outline-none focus-visible:border-white/40";
const panel = "rounded-xl bg-white/[0.04] border border-white/[0.09] p-3";

/**
 * 눌러서 고르는 칸 하나.
 * tone="neutral" 은 "골라 놓긴 했지만 아직 답이 아닌 것"(간격 설정, 시를 안 고른 상태의 분)에 쓴다.
 * 강조색은 화면에서 **답 하나**만 입어야 어디를 골랐는지 즉시 읽힌다.
 */
function Cell({
    on, disabled, accent, onAccent, tone = "accent", className, children, ...rest
}: Accent & { on: boolean; disabled?: boolean; tone?: "accent" | "neutral"; className?: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button" disabled={disabled} aria-pressed={on}
            className={cn(
                "rounded-lg text-[13px] font-medium transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-white/50",
                disabled ? "text-white/[0.18]" : on ? "" : "text-white/70 hover:bg-white/[0.07]",
                className,
            )}
            style={on && !disabled
                ? tone === "neutral" ? { backgroundColor: "rgba(255,255,255,0.16)", color: "#ffffff" } : { backgroundColor: accent, color: onAccent }
                : undefined}
            {...rest}
        >
            {children}
        </button>
    );
}

/* ─────────────────────────── 날짜 ─────────────────────────── */

interface DateFieldProps extends Partial<Accent> {
    value: string;
    onChange: (key: string) => void;
    /** 오늘(한국) — 이 날 이전은 못 고른다 */
    today: string;
    /** 몇 달까지 넘길 수 있나. 부킹은 보통 한 달 안이지만 그 뒤도 막지 않는다. */
    monthsAhead?: number;
}

/**
 * 날짜 한 줄 + 펼치면 달력.
 * 접었을 때 높이는 예전 `<input type="date">` 한 줄과 같다 — 시트에서 자리를 더 먹지 않는다.
 */
export function DateField({
    value, onChange, today, monthsAhead = 12, accent = "#64DD17", onAccent = "#051907",
}: DateFieldProps) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState(() => {
        const p = parts(value || today);
        return { y: p.y, m: p.m };
    });
    // 오늘/내일/모레로 달을 넘어가면 달력도 그 달을 봐야 한다.
    useEffect(() => {
        if (!value) return;
        const p = parts(value);
        setView((v) => (v.y === p.y && v.m === p.m ? v : { y: p.y, m: p.m }));
    }, [value]);

    const t = parts(today);
    const limit = useMemo(() => {
        const d = new Date(Date.UTC(t.y, t.m - 1 + monthsAhead, 1));
        return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    }, [t.y, t.m, monthsAhead]);
    const idx = (v: { y: number; m: number }) => v.y * 12 + v.m;
    const canPrev = idx(view) > idx(t);
    const canNext = idx(view) < idx(limit);
    const step = (n: number) => setView((v) => {
        const d = new Date(Date.UTC(v.y, v.m - 1 + n, 1));
        return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    });

    const cells = useMemo(() => {
        const lead = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
        const days = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
        return [
            ...Array.from({ length: lead }, () => ""),
            ...Array.from({ length: days }, (_, i) => toKey(view.y, view.m, i + 1)),
        ];
    }, [view]);

    const shortcut = (n: number) => {
        const k = addDaysKey(today, n);
        return (
            <Cell
                key={n} on={value === k} accent={accent} onAccent={onAccent}
                onClick={() => onChange(k)}
                aria-label={`${["오늘", "내일", "모레"][n]} ${dateFieldLabel(k, today)}`}
                className={cn("h-11 px-3.5", value !== k && "bg-white/[0.06] border border-white/10")}
            >
                {["오늘", "내일", "모레"][n]}
            </Cell>
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-1.5">
                {[0, 1, 2].map(shortcut)}
                <button
                    type="button" onClick={() => setOpen((o) => !o)}
                    aria-expanded={open} aria-label={`날짜 고르기. 지금 ${dateFieldLabel(value, today)}`}
                    className={cn(trigger, "flex-1 min-w-0 justify-between px-3")}
                >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                        <LucideCalendarDays className="w-4 h-4 text-white/40 shrink-0" />
                        <span className="truncate text-[13.5px]">{dateFieldLabel(value, today).split(" · ")[0]}</span>
                    </span>
                    <LucideChevronDown className={cn("w-4 h-4 text-white/40 shrink-0 transition-transform", open && "rotate-180")} />
                </button>
            </div>

            {open && (
                <div className={panel}>
                    <div className="flex items-center justify-between mb-2">
                        <button
                            type="button" onClick={() => step(-1)} disabled={!canPrev} aria-label="이전 달"
                            className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-white/70 disabled:text-white/[0.18]"
                        >
                            <LucideChevronLeft className="w-[18px] h-[18px]" />
                        </button>
                        <span className="text-[14px] font-medium text-white">{view.y}년 {view.m}월</span>
                        <button
                            type="button" onClick={() => step(1)} disabled={!canNext} aria-label="다음 달"
                            className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-white/70 disabled:text-white/[0.18]"
                        >
                            <LucideChevronRight className="w-[18px] h-[18px]" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {WEEKDAYS.map((w, i) => (
                            <span
                                key={w}
                                className={cn(
                                    "h-7 inline-flex items-center justify-center text-[11.5px]",
                                    i === 0 || i === 6 ? "text-white/80 font-medium" : "text-white/35",
                                )}
                            >
                                {w}
                            </span>
                        ))}
                        {cells.map((k, i) => {
                            if (!k) return <span key={`b${i}`} />;
                            const { d } = parts(k);
                            const weekend = i % 7 === 0 || i % 7 === 6;
                            const past = k < today;
                            const on = k === value;
                            return (
                                <Cell
                                    key={k} on={on} disabled={past} accent={accent} onAccent={onAccent}
                                    onClick={() => { onChange(k); setOpen(false); }}
                                    aria-label={`${view.m}월 ${d}일 ${WEEKDAYS[i % 7]}요일`}
                                    className={cn(
                                        "h-10 text-[14px] tabular-nums",
                                        // 주말은 새 색이 아니라 '바탕 한 칸 밝게 + 글자 흰색' 으로 띄운다.
                                        !on && !past && weekend && "bg-white/[0.07] text-white",
                                        !on && k === today && "ring-1 ring-inset ring-white/40",
                                    )}
                                >
                                    {d}
                                </Cell>
                            );
                        })}
                    </div>
                    <p className="mt-2 text-[11.5px] text-white/35 break-keep">밝은 칸이 토·일이에요.</p>
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────── 시간 ─────────────────────────── */

// 골프 하루 순서 — 새벽 티오프(05시)가 맨 앞이고, 심야(00~04시)는 스크린 조인용으로 맨 뒤에 둔다.
const HOURS = [...Array.from({ length: 19 }, (_, i) => i + 5), 0, 1, 2, 3, 4];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 시 → 분(십의 자리) → 분(일의 자리).
 * 정각은 1탭, 05:30 은 2탭, 05:38 은 3탭. OS 시계 드럼과 달리 **후보가 전부 눈에 보인다** —
 * 드럼은 보이지 않는 값을 굴려서 찾아야 해서 티타임을 줄줄이 넣는 사람에게 제일 느리다.
 * 맨 위 큰 숫자가 지금 고른 시간이다. 두 줄로 나뉜 분이 어떻게 합쳐지는지 이 줄이 대신 설명해 준다.
 */
function TimeBoard({
    hour, tens, ones, setHour, setTens, setOnes, accent, onAccent,
}: Accent & {
    hour: number | null; tens: number; ones: number;
    setHour: (h: number) => void; setTens: (t: number) => void; setOnes: (o: number) => void;
}) {
    // 시를 아직 안 골랐으면 분은 '답' 이 아니다 — 강조색을 입히지 않는다.
    const tone = hour === null ? "neutral" : "accent";
    return (
        <div className="space-y-2.5">
            <div className="flex items-baseline gap-2">
                <span className={cn("text-[22px] font-semibold tabular-nums leading-none", hour === null ? "text-white/25" : "text-white")}>
                    {hour === null ? "--" : pad(hour)}:{pad(tens * 10 + ones)}
                </span>
                <span className="text-[11.5px] text-white/35">{hour === null ? "시를 고르면 정해져요" : "티오프"}</span>
            </div>
            <div>
                <span className="block mb-1.5 text-[11.5px] text-white/35">시</span>
                <div className="grid grid-cols-8 gap-1">
                    {HOURS.map((h) => (
                        <Cell
                            key={h} on={hour === h} accent={accent} onAccent={onAccent}
                            onClick={() => setHour(h)} aria-label={`${h}시`}
                            className={cn("h-9 tabular-nums", hour !== h && "bg-white/[0.05]")}
                        >
                            {pad(h)}
                        </Cell>
                    ))}
                </div>
            </div>
            <div>
                <span className="block mb-1.5 text-[11.5px] text-white/35">분 — 10분 단위</span>
                <div className="grid grid-cols-6 gap-1">
                    {[0, 1, 2, 3, 4, 5].map((t) => (
                        <Cell
                            key={t} on={tens === t} tone={tone} accent={accent} onAccent={onAccent}
                            onClick={() => setTens(t)} aria-label={`${t * 10}분대`}
                            className={cn("h-9 tabular-nums", tens !== t && "bg-white/[0.05]")}
                        >
                            {pad(t * 10)}
                        </Cell>
                    ))}
                </div>
                <span className="block mt-2 mb-1.5 text-[11.5px] text-white/35 break-keep">그 아래 1분 — 05:38 같은 티타임도 한 번에</span>
                <div className="grid grid-cols-10 gap-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((o) => (
                        <Cell
                            key={o} on={ones === o} tone={tone} accent={accent} onAccent={onAccent}
                            onClick={() => setOnes(o)} aria-label={`${tens * 10 + o}분`}
                            className={cn("h-8 text-[12.5px] tabular-nums", ones !== o && "bg-white/[0.05]")}
                        >
                            {o}
                        </Cell>
                    ))}
                </div>
            </div>
        </div>
    );
}

function useTimeParts(initial?: string) {
    const [hour, setHour] = useState<number | null>(initial ? Number(initial.slice(0, 2)) : null);
    const [tens, setTens] = useState(initial ? Number(initial[3]) : 0);
    const [ones, setOnes] = useState(initial ? Number(initial[4]) : 0);
    const text = hour === null ? "" : `${pad(hour)}:${pad(tens * 10 + ones)}`;
    const set = (t: string) => { setHour(Number(t.slice(0, 2))); setTens(Number(t[3])); setOnes(Number(t[4])); };
    return { hour, tens, ones, setHour, setTens, setOnes, text, set };
}

/* ── 단수: 조인 만들기 (시간은 보통 하나) ── */

/** 시간 한 줄 + 펼치면 우리 시계. 고른 즉시 값이 올라가서 '확인' 을 안 눌러도 잃어버리지 않는다. */
export function TimeField({
    value, onChange, accent = "#FF6B00", onAccent = "#ffffff",
}: Partial<Accent> & { value: string; onChange: (t: string) => void }) {
    const [open, setOpen] = useState(false);
    const p = useTimeParts(value || undefined);
    const commit = (h: number | null, t: number, o: number) => { if (h !== null) onChange(`${pad(h)}:${pad(t * 10 + o)}`); };

    return (
        <div className="space-y-2">
            <button
                type="button" onClick={() => setOpen((o) => !o)}
                aria-expanded={open} aria-label={`시간 고르기. 지금 ${value || "안 고름"}`}
                className={cn(trigger, "w-full justify-between px-3")}
            >
                <span className="inline-flex items-center gap-1.5">
                    <LucideClock3 className="w-4 h-4 text-white/40" />
                    <span className={cn("tabular-nums", !value && "text-white/35")}>{value || "티오프 시간"}</span>
                </span>
                <LucideChevronDown className={cn("w-4 h-4 text-white/40 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className={panel}>
                    <TimeBoard
                        {...p} accent={accent} onAccent={onAccent}
                        setHour={(h) => { p.setHour(h); commit(h, p.tens, p.ones); }}
                        setTens={(t) => { p.setTens(t); commit(p.hour, t, p.ones); }}
                        setOnes={(o) => { p.setOnes(o); commit(p.hour, p.tens, o); }}
                    />
                    {/* 고른 즉시 값이 올라간다. 이 버튼은 '정하기' 가 아니라 '접기' 다 — 강조색을 또 쓰지 않는다. */}
                    <button
                        type="button" onClick={() => setOpen(false)} disabled={!value}
                        className="mt-2.5 w-full h-10 rounded-lg bg-white/[0.08] border border-white/10 text-[14px] font-medium text-white disabled:text-white/30 disabled:border-white/[0.06]"
                    >
                        {value ? "접기" : "시간을 골라 주세요"}
                    </button>
                </div>
            )}
        </div>
    );
}

/* ── 복수: 부킹 올리기 (매니저는 한 날짜에 여러 타임을 올린다) ── */

const GAPS = [7, 8, 10, 12];

/**
 * 시간 여러 개. 고른 시간은 바로 칩으로 쌓인다.
 * 예전 폼은 '고르고 → 추가 누르기' 라 추가를 빼먹고 올리는 사고가 잦았다(2026-09-10 제보).
 * 여기선 칸에 머무는 '아직 안 담긴 시간' 이 없다 — 담긴 것 = 보이는 칩 전부다.
 */
export function TimeListField({
    times, onChange, accent = "#64DD17", onAccent = "#051907",
}: Partial<Accent> & { times: string[]; onChange: (t: string[]) => void }) {
    const [open, setOpen] = useState(false);
    const [gap, setGap] = useState(8);
    const p = useTimeParts();
    const dup = !!p.text && times.includes(p.text);

    const push = (list: string[]) => {
        const next = Array.from(new Set([...times, ...list])).sort();
        onChange(next);
    };
    /** 담고 나면 다음 칸(+간격)으로 저절로 옮겨 간다 — 연달아 넣는 손이 멈추지 않는다. */
    const advance = (from: string, n: number) => {
        const m = Number(from.slice(0, 2)) * 60 + Number(from.slice(3)) + gap * n;
        if (m >= 24 * 60) return;
        p.set(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    };
    const addOne = () => { if (!p.text || dup) return; push([p.text]); advance(p.text, 1); };
    /** 고른 시간부터 gap 간격으로 count 개. 자정을 넘는 것은 버린다(그 날짜의 티타임이 아니다). */
    const run = (from: string, count: number) => {
        const base = Number(from.slice(0, 2)) * 60 + Number(from.slice(3));
        return Array.from({ length: count }, (_, i) => base + gap * i)
            .filter((m) => m < 24 * 60)
            .map((m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    };
    const addRun = (count: number) => {
        if (!p.text) return;
        push(run(p.text, count));
        advance(p.text, count);
    };
    // 버튼이 실제로 담을 것과 **같은 함수**로 미리 보여 준다.
    const preview = p.text ? run(p.text, 3) : [];

    return (
        <div className="space-y-2">
            <button
                type="button" onClick={() => setOpen((o) => !o)}
                aria-expanded={open} aria-label={`티오프 시간 고르기. ${times.length}개 담음`}
                className={cn(trigger, "w-full justify-between px-3")}
            >
                <span className="inline-flex items-center gap-1.5">
                    <LucideClock3 className="w-4 h-4 text-white/40" />
                    <span className={cn(times.length === 0 && "text-white/35")}>
                        {times.length === 0 ? "티오프 시간" : `티타임 ${times.length}개`}
                    </span>
                </span>
                <LucideChevronDown className={cn("w-4 h-4 text-white/40 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className={panel}>
                    <TimeBoard {...p} accent={accent} onAccent={onAccent} />

                    <button
                        type="button" onClick={addOne} disabled={!p.text || dup}
                        className="mt-2.5 w-full h-10 rounded-lg text-[14px] font-semibold disabled:bg-white/[0.06] disabled:text-white/35"
                        style={p.text && !dup ? { backgroundColor: accent, color: onAccent } : undefined}
                    >
                        {!p.text ? "시간을 골라 주세요" : dup ? `${p.text} 는 이미 담았어요` : `${p.text} 담기`}
                    </button>

                    {/* 실제 티타임표는 7~8분 간격으로 줄줄이 나온다. 한 번에 쌓는 게 매니저의 기본 동작이다. */}
                    <div className="mt-3 pt-3 border-t border-white/[0.07]">
                        <div className="flex items-center gap-1.5 mb-2">
                            <span className="text-[11.5px] text-white/35 mr-auto">연달아 담기 — 간격</span>
                            {GAPS.map((g) => (
                                <Cell
                                    key={g} on={gap === g} tone="neutral" accent={accent} onAccent={onAccent}
                                    onClick={() => setGap(g)} aria-label={`${g}분 간격`}
                                    className={cn("h-7 px-2 text-[12px] tabular-nums", gap !== g && "bg-white/[0.05]")}
                                >
                                    {g}분
                                </Cell>
                            ))}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                            {[2, 3, 4, 6].map((n) => (
                                <button
                                    /* 자정을 넘어 n개를 못 채우면 잠근다 — 눌렀는데 1개만 담기는 일이 없어야 한다. */
                                    key={n} type="button" onClick={() => addRun(n)} disabled={!p.text || run(p.text, n).length < n}
                                    aria-label={`${p.text || "고른 시간"}부터 ${gap}분 간격으로 ${n}개 담기`}
                                    className="h-9 rounded-lg bg-white/[0.06] border border-white/10 text-[13px] font-medium text-white/80 disabled:text-white/[0.2] disabled:border-white/[0.06]"
                                >
                                    {n}개
                                </button>
                            ))}
                        </div>
                        {preview.length > 1 && (
                            <p className="mt-1.5 text-[11.5px] text-white/35 tabular-nums">
                                예) {preview.join(" · ")} …
                            </p>
                        )}
                        {/* 자정을 넘는 시간은 addRun 이 버린다 — 예시에도 안 보여야 "3개 눌렀는데 1개만 담겼다"가 안 생긴다. */}
                        {p.text && preview.length <= 1 && (
                            <p className="mt-1.5 text-[11.5px] text-white/35 break-keep">
                                {p.text} 뒤로는 자정을 넘어가서 연달아 담을 수 없어요.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {times.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {times.map((t) => (
                        <button
                            key={t} type="button" onClick={() => onChange(times.filter((x) => x !== t))}
                            aria-label={`${t} 빼기`}
                            className="h-8 pl-3 pr-2 rounded-full text-[13px] font-medium inline-flex items-center gap-1 tabular-nums"
                            style={{ backgroundColor: `${accent}26`, color: accent }}
                        >
                            {t} <span className="opacity-60">×</span>
                        </button>
                    ))}
                    <button
                        type="button" onClick={() => onChange([])}
                        className="h-8 px-2.5 rounded-full text-[12px] text-white/40"
                    >
                        모두 지우기
                    </button>
                </div>
            )}
        </div>
    );
}
