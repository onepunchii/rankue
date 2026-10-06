// 커뮤니티 게시 전 서버측 필터 (Apple 1.2 / Play UGC 필수 + 심사 리스크 차단)
//
// 두 갈래로 나뉜다:
// 1) 차단(block) — 게시 자체를 거부. 내기당구(real-money gambling로 분류되면 리젝),
//    노골적 욕설·거래 알선.
// 2) 마스킹(mask) — 게시는 허용하되 본문에서 가린다. 전화번호·외부 링크
//    (전화번호 로그인 앱이라 개인정보 유출 경로가 구조적으로 넓다).

import { neutralizeEverydayNaegi } from "../../shared/crewTags.js";

// 금액 표현 — 숫자("5만원", "50,000원")와 한글 숫자("오만원")를 함께 잡는다
const AMOUNT = /(\d{1,3}(,\d{3})+|\d+\s*(만|천)?\s*원|\d+\s*만(?!원)|[일이삼사오육칠팔구십백]+\s*만\s*원)/;
const GAME_WORDS = /(게임|한\s*큐|큐당|이닝|다마|점당|점수당)/;

// 레슨비·수강료·회비 안내는 정상 사용례 — 금액×게임어 근접 규칙에서만 면제한다.
// (내기·빵·정산 패턴은 레슨 글이어도 그대로 차단)
const LESSON_CONTEXT = /(레슨|강습|수강|회비|대관|이용료|가격|비용)/;
// 크루 안(모임) 표면에서만 추가로 면제하는 비용 맥락 — "게임비 1만원씩", "정모비 2만원" 은
// 당구장 테이블비·모임비 안내지 내기가 아니다. 크루는 정산(더치페이) 기능까지 두는 모임이라
// 이 말들이 일상적으로 오간다. 공개 커뮤니티에는 넓히지 않는다.
const CREW_COST_CONTEXT = /(게임비|당구비|테이블비|모임비|정모비|회식|식대|밥값|더치|엔빵|n빵|1\/n)/i;

// 금액+게임 조합, 내기, 빵, 정산 — 당구판 일상어지만 랭큐는 핸디·랭킹이 있어
// 내기 정산 맥락이 구조적으로 붙는다. 심사에서 gambling UGC로 분류될 결정적 패턴.
// 주의: "30점 땄다!" 같은 자랑 게시판 핵심 문장은 차단하면 안 된다 —
// 땄/잃은 반드시 금액과 근접할 때만 잡는다.
const AMOUNT_GAME_PATTERNS: RegExp[] = [
    new RegExp(`${AMOUNT.source}.{0,10}${GAME_WORDS.source}`),
    new RegExp(`${GAME_WORDS.source}.{0,10}${AMOUNT.source}`),
];
const GAMBLING_PATTERNS: RegExp[] = [
    new RegExp(`${AMOUNT.source}.{0,10}내기|내기.{0,10}${AMOUNT.source}`), // "5만원 내기", "내기 오만원"
    /내기\s*(당구|게임|한판|치실|칠|할)/,
    /(만\s*원|천\s*원|백\s*원|만|천)\s*빵/, // 만원빵·천원빵 — 당구장 은어
    /빵\s*(내기|치실|칠|게임)/,
    /(점당|큐당|이닝당)\s*\d+/,
    // "#내기환영", "내기 가능" — 내기를 권하는 모집 문구. 크루 태그·소개로 들어오면
    // 앱이 금전 내기를 부추기는 모양이 된다(Play 실제 금전 도박 정책의 call to action).
    /내기\s*(대?환영|가능|오케이|ok|선호|위주)/i,
    new RegExp(`${AMOUNT.source}.{0,8}(땄|잃)|(땄|잃)(다|어|음|었).{0,6}${AMOUNT.source}`), // "5만원 땄다" (점수 자랑 "30점 땄다"는 통과)
];
// 정산·입금 요청 — 공개 커뮤니티에서는 내기 정산 맥락이라 막지만, 크루 안에서는
// 정모 더치페이 요청("정산 부탁드려요")이 정상 기능이라 크루 표면에서는 검사하지 않는다.
const SETTLEMENT_REQUEST = /(정산|입금|송금|계좌)\s*(부탁|해|하|주세요|요망|번호)/;

// 거래 알선 — 중고거래는 넣지 않기로 결정(통신판매중개업 신고 의무).
// #장비 태그로 수요만 관찰하므로 직접적인 판매·가격 제시는 차단.
const TRADE_PATTERNS: RegExp[] = [
    /(팝니다|삽니다|판매합니다|급처|네고\s*가능)/,
    new RegExp(`(큐|중고|장비).{0,10}${AMOUNT.source}.{0,6}(판매|팔|양도)`),
];

// 골프 조인·부킹 글("listing")에서만 더 보는 내기 표현(2026-10-06).
// '타당 얼마'는 타수 차이만큼 돈을 주고받는 골프 내기의 관용 표현이다 — 당구의 '점당'과 같은 자리.
// 숫자나 금액 단위(십·백·천·만)가 바로 붙을 때만 잡는다: "타당한 가격"·"타당성"·"타당 이유"는 통과한다.
// '내기 골프·라운드'는 위의 '내기 당구·게임'과 같은 꼴이다. 다만 조인 글에는 "내기 골프 아닙니다·사절"처럼
// **안 한다는 말**이 흔해서, 바로 뒤에 부정이 오면 잡지 않는다(부정이 없는 금액 내기는 위 공통 규칙이 그대로 잡는다).
const LISTING_GAMBLING_PATTERNS: RegExp[] = [
    /타당\s*(?:\d|[일이삼사오육칠팔구]?\s*[십백천만])/,
    /내기\s*(?:골프|라운드|라운딩)(?!\s*(?:는|은|가|이|도)?\s*(?:아니|아닙|안\s*[하해합함]|않|사절|금지|없|x|×|ㄴㄴ))/i,
];
// 사람을 가리키는 '-내기'(새내기·동갑내기…)는 내기가 아니다 — 조인 글의 "새내기 환영"·"동갑내기 가능"이
// '내기 환영·내기 가능'(내기 권유)으로 걸리지 않게 매물 맥락에서만 지우고 본다. 원문은 그대로 저장된다.
const LISTING_PERSON_NAEGI = /(새|풋|신출|동갑|보통|여간|서울|시골)내기/g;
// 매물 글의 "내기 없음·내기X·내기 안 합니다·내기 골프 아닙니다"(2026-10-06 검토) — 안 한다는 말은 금액 옆에 있어도 내기가 아니다.
// 위 공통 규칙(금액×내기)은 부정을 가리지 않아 "캐디피 15만원 엔빵, 내기 없음" 같은 조인 글이 금전 내기로 막혔다
// (가격을 적는 글이라 금액이 늘 곁에 있다). 매물 맥락에서만, 판정 전에 그 '내기'를 지우고 본다 — 원문은 그대로 저장된다.
// 부정 목록은 위 '내기 골프·라운드' 규칙과 같다. 다른 맥락(기본·community·crew)의 판정은 바뀌지 않는다.
// 조건·물음 꼴("내기 없으면 심심하니…", "내기 없나요?", "내기 안 하나요?")은 안 한다는 말이 아니라서 지우지 않는다.
// 한 번 부정했다고 글 전체가 풀리지도 않는다 — 지우는 것은 부정이 붙은 그 '내기'뿐이라 "내기X라더니 5만원 내기"는 그대로 걸린다.
const LISTING_NEGATED_NAEGI = /내기\s*(?:골프|라운드|라운딩)?\s*(?:는|은|가|이|도)?\s*(?:아니|아닙|안\s*[하해합함]|않|사절|금지|없|x|×|ㄴㄴ)(?!으?면|나|냐)/gi;

const ABUSE_WORDS = [
    "씨발", "시발", "병신", "지랄", "좆", "새끼야", "개새끼", "니미", "느금",
];

const PHONE_RE = /(01[016789])[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
// "공일공 일이삼사..." 식 한글 숫자 전화번호 — 마스킹 우회의 가장 흔한 형태
const PHONE_KR_RE = /[공영]\s*[일이]\s*[공영]([\s.-]*[공영일이삼사오육칠팔구]){7,9}/g;
// 오픈채팅·외부 메신저 링크 — 커뮤니티 밖 1:1 채널로 빠지는 순간 신고·차단이 무력화된다
const LINK_RE = /(https?:\/\/[^\s]+|open\.kakao\.com[^\s]*|카톡\s*아이디|카카오톡?\s*(아이디|ID|id))/g;

export interface FilterResult {
    blocked: boolean;
    reason?: string;
}

export interface FilterOptions {
    // "crew" — 크루 안 표면(게시판·댓글·사진·채팅·크루 소개). 내기·빵·점당·욕설·거래는
    // 커뮤니티와 똑같이 막고, 모임비·정산 이야기만 오탐에서 뺀다.
    // "listing" — 골프 조인·부킹 글의 자유 입력 칸(2026-10-06). 이 글은 **티타임을 팔고 양도하는 글**이라
    // 커뮤니티에서 막는 말(팝니다·급처·네고 가능, 입금 부탁, "스크린 2게임 3만원")이 본문 그 자체다.
    // 그래서 거래·정산·금액×게임 규칙은 건너뛰고, 내기(내기·빵·점당·타당)와 욕설만 막는다.
    context?: "community" | "crew" | "listing";
}

export function checkContent(text: string, opts: FilterOptions = {}): FilterResult {
    const t = (text || "").trim();
    if (!t) return { blocked: false };
    const isCrew = opts.context === "crew";
    const isListing = opts.context === "listing";
    const gamblingReason = "금전 내기 관련 표현은 게시할 수 없습니다. 랭큐 커뮤니티는 금전 내기를 금지합니다.";

    // 금액×게임어 근접 규칙 — 레슨비 안내 같은 정상 사용례는 면제. 매물 글은 가격을 적는 글이라 통째로 건너뛴다.
    if (!isListing && !LESSON_CONTEXT.test(t) && !(isCrew && CREW_COST_CONTEXT.test(t))) {
        for (const re of AMOUNT_GAME_PATTERNS) {
            if (re.test(t)) {
                return { blocked: true, reason: gamblingReason };
            }
        }
    }
    // 내기 패턴은 '끝내기·보내기' 같은 평범한 동사의 '내기'를 지운 문자열로 본다 — "끝내기 가능?" 오탐 방지
    // 매물 글은 사람을 가리키는 '-내기'와 부정이 붙은 '내기'("내기 없음·내기X")도 지우고 본다.
    const g = isListing
        ? neutralizeEverydayNaegi(t).replace(LISTING_PERSON_NAEGI, "$1__").replace(LISTING_NEGATED_NAEGI, "__")
        : neutralizeEverydayNaegi(t);
    for (const re of GAMBLING_PATTERNS) {
        if (re.test(g)) {
            return { blocked: true, reason: gamblingReason };
        }
    }
    if (isListing) {
        for (const re of LISTING_GAMBLING_PATTERNS) {
            if (re.test(g)) {
                return { blocked: true, reason: gamblingReason };
            }
        }
    }
    if (!isCrew && !isListing && SETTLEMENT_REQUEST.test(t)) {
        return { blocked: true, reason: gamblingReason };
    }
    if (!isListing) {
        for (const re of TRADE_PATTERNS) {
            if (re.test(t)) {
                return { blocked: true, reason: "직접적인 판매·거래 글은 게시할 수 없습니다." };
            }
        }
    }
    // "씨 발", "씨1발" 같은 띄어쓰기·숫자 끼워넣기 우회를 잡기 위해
    // 공백·숫자·특수문자를 걷어낸 문자열로도 검사한다.
    // 매물 글은 **공백은 남기고** 숫자·특수문자만 걷는다 — 공백까지 걷으면 낱말 경계가 붙어
    // "용병 신청"(병신)·"선착순이니 미리"(니미)·"7시 발렛"(시발)·"어느 금요일"(느금) 같은 평범한 안내가 욕설로 걸린다.
    // 글자 사이에 숫자·기호를 끼운 우회("씨1발")는 매물 글에서도 그대로 잡힌다.
    const squashed = isListing
        ? t.replace(/[\d!@#$%^&*()_+\-=~.,'"?<>[\]{}|\\/;:]/g, "")
        : t.replace(/[\s\d!@#$%^&*()_+\-=~.,'"?<>[\]{}|\\/;:]/g, "");
    for (const w of ABUSE_WORDS) {
        if (t.includes(w) || squashed.includes(w)) {
            return { blocked: true, reason: "부적절한 표현이 포함되어 있습니다." };
        }
    }
    return { blocked: false };
}

// 전화번호·외부 링크 자동 마스킹 — 게시는 허용, 노출만 막는다
export function maskContacts(text: string): string {
    return (text || "")
        .replace(PHONE_RE, "01*-****-****")
        .replace(PHONE_KR_RE, "01*-****-****")
        .replace(LINK_RE, "(외부 링크는 표시되지 않습니다)");
}
