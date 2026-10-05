/**
 * 랭큐 골프 소개·이용 방법·자주 묻는 것(2026-10-05 오너: "부킹·조인이 사이트맵에 들어가 검색이 는다 — 비로그인 방문자에게
 * 랭큐 골프를 알릴 배너와 당구처럼 설명 버튼, 어떻게 하는지 알려 줄 기능" → "수수료 없음, 2단계까지 진행").
 *
 * 화면(GolfGuide.tsx)과 서버 프리렌더(server/prerender.ts)가 **같은 글**을 쓴다 — 검색엔진이 읽는 글과 사람이 보는 글이 달라지지 않게.
 * 여기 적는 말은 전부 지금 서비스가 실제로 하는 일이어야 한다. 규칙이 바뀌면 같이 고친다:
 *   · 조인 신청은 한 사람씩, 호스트 승인제, 확정자만 채팅방 — shared/golfJoin.ts · server/routes/modules/golf.ts · chat.ts(confirmedOnly)
 *   · 부킹 글은 부킹 매니저만, 조인 글은 로그인한 누구나 — golf.ts POST /bookings
 *   · 긴급 = 오늘 · 필드 · 정액 3만 원 이하 · 티오프 2시간 전까지 — isUrgentJoin
 *   · 1·2·3부 = 11시 전 / 15시 전 / 그 뒤 — shared/golfCourse.ts teePart
 *   · 연락처는 조인에서 올린 사람과 확정자만 — golf.ts withJoinCounts
 *   · 알림은 08~21시만 울리고 밤엔 알림함에만 — services/golfCourseWatch.ts
 *   · 푸시는 앱에서만 울린다(웹 푸시 없음) — 브라우저에서 켠 사람은 알림함에 남는다(components/course/AlertReach.tsx)
 *   · 앱 결제·수수료 없음(오너 확인 2026-10-05)
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
import type { GolfIntent } from "./golfCourse.js";

export const GOLF_INTRO = {
    name: "랭큐 골프",
    line: "빈자리 조인과 남는 티타임을 수수료 없이",
    points: ["수수료 없음 · 현장 정산", "호스트가 보고 승인", "올라오면 알림"],
} as const;

export type GuideTab = "join" | "booking" | "urgent" | "post";
export interface GuideSection { tab: GuideTab; label: string; lead: string; steps: readonly string[]; note?: string }

export const GOLF_GUIDE: readonly GuideSection[] = [
    {
        tab: "join", label: "조인",
        lead: "티타임을 잡은 사람이 남는 자리를 채우는 글이에요. 혼자서도 신청할 수 있어요.",
        steps: [
            "글에서 날짜·시간·골프장·비용·남은 자리를 봐요",
            "신청하면 올린 사람(호스트)이 보고 승인해요",
            "확정되면 채팅방이 열려요. 만날 곳과 준비물을 정해요",
            "비용은 현장에서 나눠 내요. 앱 결제도 랭큐 수수료도 없어요",
        ],
        note: "신청은 한 사람씩이에요. 일행이 있으면 각자 신청해 주세요.",
    },
    {
        tab: "booking", label: "부킹",
        lead: "부킹 매니저가 올린 티타임을 한 팀이 통째로 가져가는 글이에요.",
        steps: [
            "글에서 날짜·시간·골프장·그린피를 봐요",
            "인원을 적어 신청하면 올린 매니저가 확인해요",
            "한 팀이 확정되면 그 티타임은 마감돼요",
            "2~3명이 가져가면 남는 자리는 조인으로 다시 올라올 수 있어요",
        ],
        note: "부킹 매니저라면 로그인한 뒤 채팅의 '문의'로 알려 주세요. 확인되면 티타임을 무료로 올릴 수 있어요.",
    },
    {
        tab: "urgent", label: "긴급",
        lead: "오늘 치는 필드 조인 가운데 3만 원 이하로 나온 빈자리예요. 티오프까지 2시간 넘게 남은 글만 떠요.",
        steps: [
            "긴급 표시 옆의 남은 시간을 먼저 봐요",
            "신청과 호스트 승인은 조인과 같아요",
            "확정되면 바로 채팅방에서 만날 곳을 정해요",
        ],
        note: "밤 9시부터 아침 8시까지는 긴급 알림이 울리지 않아요.",
    },
    {
        tab: "post", label: "올리기",
        lead: "티타임을 잡았는데 자리가 남았나요? 로그인만 하면 누구나 조인 글을 올릴 수 있어요.",
        steps: [
            "조인 목록에서 + 를 눌러요",
            "필드·스크린·파크골프 중에 고르고 장소·날짜·시간을 적어요",
            "모집할 자리(1~3자리)와 비용(1/N 또는 1인 금액)을 정해요",
            "신청이 오면 알림이 가요. 보고 승인하면 끝이에요",
        ],
        note: "올리는 데 드는 돈은 없어요.",
    },
];

export interface Faq { q: string; a: string }

const FAQ = {
    what: { q: "골프 조인이 뭔가요?", a: "티타임을 잡은 사람이 남는 자리를 다른 골퍼와 채우는 것이에요. 랭큐 골프에서는 올린 사람(호스트)이 신청자를 보고 승인해야 확정돼요." },
    solo: { q: "혼자 신청해도 되나요?", a: "네. 조인 신청은 한 사람씩이에요. 일행이 있으면 각자 신청하면 돼요." },
    cost: { q: "비용은 어떻게 내나요?", a: "글에 1/N 또는 1인 금액이 적혀 있어요. 앱에서는 결제하지 않고 현장에서 정산해요. 랭큐가 받는 수수료는 없어요." },
    parts: { q: "1부·2부·3부는 몇 시인가요?", a: "티오프 시각 기준으로 1부는 오전 11시 전, 2부는 오후 3시 전, 3부는 그 뒤예요." },
    contact: { q: "내 연락처가 공개되나요?", a: "조인 글에서는 올린 사람과 확정된 사람끼리만 연락처가 보여요. 확정 전에는 보이지 않아요." },
    cancel: { q: "신청을 취소할 수 있나요?", a: "네. 신청 내역에서 취소할 수 있어요. 확정된 뒤라면 채팅방에 먼저 알려 주세요." },
    urgent: { q: "긴급 조인은 뭐가 다른가요?", a: "오늘 치는 필드 조인 가운데 1인 3만 원 이하로 나온 글이에요. 티오프까지 2시간 넘게 남았을 때만 떠요." },
    who: { q: "글은 누가 올릴 수 있나요?", a: "조인 글은 로그인한 회원 누구나 올릴 수 있어요. 부킹 글은 확인된 부킹 매니저만 올려요." },
    bookingWhat: { q: "부킹은 조인과 뭐가 다른가요?", a: "부킹은 티타임 하나를 한 팀이 통째로 가져가요. 조인은 이미 잡힌 티타임의 남는 자리에 한 사람씩 들어가요." },
    alert: { q: "올라오면 알림을 받을 수 있나요?", a: "네. 관심 골프장(☆)이나 지역 알림을 켜 두면 새 글이 올라올 때 알려 드려요. 푸시는 랭큐 앱에서 울리고, 밤 9시부터 아침 8시까지는 소리 없이 알림함에만 남겨요." },
} satisfies Record<string, Faq>;

/** 그 페이지에 맞는 순서의 자주 묻는 것(여섯 개). 의도가 없으면(전체 골프장) 조인 기준. */
export function golfFaq(intent: GolfIntent | null | undefined): Faq[] {
    if (intent === "booking") return [FAQ.bookingWhat, FAQ.cost, FAQ.who, FAQ.parts, FAQ.alert, FAQ.cancel];
    if (intent === "urgent") return [FAQ.urgent, FAQ.cost, FAQ.solo, FAQ.contact, FAQ.alert, FAQ.cancel];
    return [FAQ.what, FAQ.solo, FAQ.cost, FAQ.parts, FAQ.contact, FAQ.alert];
}

/** 이용 방법 창이 처음 여는 탭 — 그 페이지의 의도 */
export function guideTabFor(intent: GolfIntent | null | undefined): GuideTab {
    return intent === "booking" ? "booking" : intent === "urgent" ? "urgent" : "join";
}
