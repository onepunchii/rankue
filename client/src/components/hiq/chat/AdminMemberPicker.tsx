/**
 * 회원에게 메시지 — 운영자 전용(2026-10-06 오너: "관리자는 누구와도 다 채팅을 할 수 있게 … 누군가와 소통이 필요할 때").
 * 회원을 찾아 고르면 **그 회원의 문의 방**(/chat/support/<회원 id>)으로 간다. 방을 따로 만들지 않는다 — 문의 방은 열쇠가 곧 방이고,
 * 운영자가 쓰는 순간 그 회원의 채팅 목록에 방이 생기고 푸시가 간다. 회원에게는 운영자 개인이 아니라 '랭큐 운영팀'으로 보인다(서버가 바꾼다).
 * 운영자 개인 계정으로 1:1 을 여는 방식은 쓰지 않는다(1:1 은 친구끼리만 · 개인 대화와 운영 연락 분리 · 다른 운영자가 이어받기).
 *
 * FriendPicker 와 같은 **전체 화면 층**이다(Radix Sheet 아님) — 검색칸에 키보드가 뜨면 index.css 의 다이얼로그 키보드 회피가
 * 시트를 밀어 반쪽만 보였다. 여기는 처음부터 검색이라 그 문제가 그대로 난다. 키보드 높이만큼 아래를 비운다.
 *
 * 줄 하나는 '사람'이 아니라 **회원 행**이다(2026-10-06 검토). 회원 행은 매장별이라 같은 번호로 제휴 매장과 본 사이트에 따로 가입한 사람은
 * 두 줄로 나온다. 문의 방 열쇠가 회원 행 id 라, 매장 행을 고르면 푸시는 그 사람 폰에 가는데 앱(본 사이트 행으로 로그인)에서는 방이 안 열린다.
 * 그래서 매장에서 가입한 줄에는 매장 이름을, 로그인 계정이 없는 줄(푸시가 안 간다)에는 표시를 달고, 그런 줄이 있으면 고르는 법을 한 줄 적는다.
 * 앱이 로그인하는 줄을 서버가 위에 둔다(chat.repo searchMembersForAdmin).
 *
 * 찾은 결과는 React Query 캐시에 넣지 않는다 — 그 캐시는 기기에 7일 저장된다(lib/queryClient 의 persist). 회원 이름·전화 끝 4자리가
 * 운영자 폰의 저장소에 남을 이유가 없다. 이 층이 떠 있는 동안만 메모리에 둔다.
 * 서버(GET /api/hiq/chat/admin/members)는 운영자가 아니면 403 이다 — 이 층을 숨기는 것은 편의이고 권한은 서버가 지킨다.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { LucideLoader2, LucideX, LucideSearch, LucideChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import { useT } from "@/lib/i18n";
import { INTL_TAG } from "@/components/hiq/chat/ChatRoom";
import { MEMBER_SEARCH_LIMIT, memberSearchTerm, type AdminMemberHit } from "@shared/chatSupport";

type Result = { status: "idle" | "loading" | "error" | "done"; term: string | null; hits: AdminMemberHit[] };
const IDLE: Result = { status: "idle", term: null, hits: [] };

export function AdminMemberPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    const [q, setQ] = useState("");
    // 한 글자마다 서버를 두드리지 않는다(한글은 조합 중에도 값이 바뀐다).
    const debounced = useDebounce(q, 300);
    const [res, setRes] = useState<Result>(IDLE);
    const [attempt, setAttempt] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const close = () => { onOpenChange(false); setQ(""); setRes(IDLE); };

    // 열려 있는 동안 뒤 화면이 같이 스크롤되지 않게, ESC 로 닫힌다. 처음부터 검색이라 검색칸에 바로 포커스를 준다.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        (inputRef.current ?? panelRef.current)?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // 찾기 — 2글자 미만이면 묻지 않는다(서버도 같은 규칙: shared/chatSupport memberSearchTerm). 늦게 온 앞 요청의 답은 버린다.
    const asked = open ? memberSearchTerm(debounced) : null;
    useEffect(() => {
        if (!asked) { setRes(IDLE); return; }
        const ctrl = new AbortController();
        setRes({ status: "loading", term: asked, hits: [] });
        apiRequest(`/api/hiq/chat/admin/members?q=${encodeURIComponent(asked)}`, { signal: ctrl.signal })
            .then((rows) => { if (!ctrl.signal.aborted) setRes({ status: "done", term: asked, hits: Array.isArray(rows) ? (rows as AdminMemberHit[]) : [] }); })
            .catch(() => { if (!ctrl.signal.aborted) setRes({ status: "error", term: asked, hits: [] }); });
        return () => ctrl.abort();
    }, [asked, attempt]);

    if (!open) return null;

    const live = memberSearchTerm(q);
    // 입력이 답보다 앞서 있으면(디바운스 중·요청 중) 기다리는 중이다 — 앞 검색어의 결과를 지금 입력의 답처럼 보이지 않는다.
    const waiting = live !== null && (res.term !== live || res.status === "loading");
    const joinedLabel = (iso: string | null) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (!Number.isFinite(d.getTime())) return null;
        const date = new Intl.DateTimeFormat(INTL_TAG[locale], { year: "2-digit", month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(d);
        return t("chat.adminPicker.joined").replace("{date}", date);
    };
    const pick = (h: AdminMemberHit) => { close(); setLocation(`/chat/support/${h.id}`); };

    return (
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("chat.adminMessage")} className="fixed inset-0 z-[60] flex flex-col bg-surface-0 text-ink-1 outline-none" style={{ paddingBottom: "var(--keyboard-height, 0px)" }}>
            <header className="shrink-0 h-14 px-2 flex items-center gap-1 border-b border-surface-line">
                <button type="button" onClick={close} aria-label={t("chat.close")} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2">
                    <LucideX className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[16px] font-semibold truncate">{t("chat.adminMessage")}</h2>
                    <p className="text-[11.5px] font-medium text-ink-3 truncate">{t("chat.adminPicker.desc")}</p>
                </div>
            </header>
            <div className="px-4 py-2.5 shrink-0">
                <label className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-surface-2">
                    <LucideSearch className="w-4 h-4 text-ink-4 shrink-0" />
                    <input
                        ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chat.adminPicker.search")}
                        enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={30}
                        className="flex-1 min-w-0 bg-transparent text-[14px] text-ink-1 placeholder:text-ink-4 outline-none"
                    />
                </label>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]" aria-live="polite">
                {live === null ? (
                    <p className="py-10 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.adminPicker.hint")}</p>
                ) : waiting ? (
                    <div className="flex justify-center py-8 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                ) : res.status === "error" ? (
                    <div className="py-10 px-4 text-center space-y-3">
                        <p className="text-[13px] font-medium text-ink-3">{t("chat.adminPicker.failed")}</p>
                        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-10 px-4 rounded-full bg-surface-2 text-[13px] font-semibold text-ink-1 active:bg-surface-3">{t("chat.adminPicker.retry")}</button>
                    </div>
                ) : res.hits.length === 0 ? (
                    <p className="py-10 px-4 text-center text-[13px] font-medium text-ink-3">{t("chat.adminPicker.empty")}</p>
                ) : (
                    <>
                        <ul>
                            {res.hits.map((h) => {
                                // 같은 이름을 가려내는 보조 정보 — 가입한 매장(본 사이트·글로벌 행이면 없음) · 닉네임(이름과 다를 때) · 종목 · 가입일 · 전화 끝 4자리. 없는 칸은 뺀다.
                                // 매장을 맨 앞에 둔다: 같은 사람의 두 줄은 닉네임·번호가 같아서 이 칸으로만 갈린다(줄이 넘쳐 잘려도 남는다).
                                // 매장 이름은 사장님이 정한 글자다 — replace 는 바꿔 넣는 글자의 '$'를 특수하게 읽으므로 split·join 으로 끼운다.
                                const facts = [
                                    h.store ? t("chat.adminPicker.store").split("{name}").join(h.store) : null,
                                    h.nickname,
                                    h.sport === "GOLF" ? t("chat.attach.sportGolf") : h.sport === "BILLIARDS" ? t("chat.attach.sportBilliards") : null,
                                    joinedLabel(h.joinedAt),
                                    h.phoneLast4 ? t("chat.adminPicker.phoneEnd").replace("{n}", h.phoneLast4) : null,
                                ].filter((x): x is string => !!x);
                                return (
                                    <li key={h.id}>
                                        <button type="button" onClick={() => pick(h)} className="w-full px-2 py-2.5 flex items-center gap-3 rounded-xl active:bg-surface-2 text-left">
                                            <span className="w-10 h-10 shrink-0 rounded-full bg-surface-3 overflow-hidden flex items-center justify-center text-[14px] font-semibold text-ink-2">
                                                {h.profileImageUrl ? <img src={h.profileImageUrl} alt="" className="w-full h-full object-cover" /> : h.name.charAt(0)}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-[14px] font-medium text-ink-1 truncate">{h.name}</span>
                                                    {h.staff && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-surface-2 text-ink-2 text-[10.5px] font-semibold">{t("chat.adminPicker.staff")}</span>}
                                                    {h.banned && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 text-[10.5px] font-semibold">{t("chat.adminPicker.banned")}</span>}
                                                    {h.noAccount && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-surface-2 text-ink-2 text-[10.5px] font-semibold">{t("chat.adminPicker.noAccount")}</span>}
                                                </span>
                                                {facts.length > 0 && <span className="block text-[12px] font-medium text-ink-3 truncate rk-num">{facts.join(" · ")}</span>}
                                            </span>
                                            <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        {/* 매장 줄·계정 없는 줄이 섞여 있으면 어느 줄을 골라야 하는지 적는다 — 표시만으로는 '그래서 어느 줄'인지 모른다 */}
                        {res.hits.some((h) => !!h.store || h.noAccount) && (
                            <p className="py-3 px-4 text-[12px] font-medium text-ink-3 break-keep">{t("chat.adminPicker.rowHint")}</p>
                        )}
                        {/* 서버는 20명에서 끊는다 — 꽉 찼으면 더 있을 수 있다고 알린다(없는 줄 알고 포기하지 않게) */}
                        {res.hits.length >= MEMBER_SEARCH_LIMIT && (
                            <p className="py-3 px-4 text-center text-[12px] font-medium text-ink-4">{t("chat.adminPicker.more").replace("{n}", String(MEMBER_SEARCH_LIMIT))}</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
