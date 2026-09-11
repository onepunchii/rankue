// 크루 분위기 태그 중 금전 내기를 권하는 것을 가려낸다(감사 S5).
//
// "#내기환영" 같은 태그를 앱이 추천 목록에 내놓으면 앱이 스스로 금전 내기를 부추기는 모양이 된다
// (Apple 5.3.4, Play 실제 금전 도박 정책의 call to action). 커뮤니티·크루 필터는 내기 표현을 막는데
// 추천 태그만 권하고 있어 정책이 모순이었다.
//  - 추천 목록: 크루 만들기·설정 화면에서 뺐다.
//  - 새로 저장: 서버 필터(server/utils/contentFilter.ts)가 거부한다.
//  - 이미 저장된 크루: 데이터는 고치지 않고 화면에서만 거른다(이 파일). 운영 DB 기준 해당 크루는 0곳이지만,
//    옛 화면이 넣은 값이 남아 있으면 설정 화면에서 선택된 채로 저장돼 서버 거부를 부르므로 폼에 싣기 전에 뺀다.
//
// 규칙을 좁게 잡은 이유: "#이겨내기" 처럼 '내기'가 말끝에 붙는 평범한 말까지 가리면 안 된다.
// 그래서 '내기'로 시작하거나, 내기 뒤에 권유·게임 말이 붙은 경우만 본다.

// '-내기'로 끝나는 평범한 동사(끝내기·보내기·이겨내기…) — 이 '내기'는 돈 걸기가 아니다.
// "끝내기 가능한가요", "끝내기 위주로 연습" 이 금전 내기로 막히던 오탐(2026-09-11 검토 code:R1)을 없앤다.
// 앞말을 목록으로 못박는 이유: "소액내기환영", "즐겜내기가능" 처럼 명사 뒤에 붙은 진짜 내기는 계속 막혀야 해서
// "앞에 한글이 붙으면 통과" 같은 넓은 규칙을 쓸 수 없다. 서버 필터(server/utils/contentFilter.ts)도 이 함수를 쓴다.
// 일부러 뺀 말: '따내기'("5만원 따내기"는 돈을 딴다는 말이다).
const EVERYDAY_NAEGI = /(끝|보|해|이겨|견뎌|버텨|알아|찾아|만들어|흉|빼|꺼|골라|걸러|밀어|받아|떠|펴|돌려|쫓아|몰아|밝혀|캐|짜|뽑아|털어|깨|길러|키워|적어|그려|드러|벗어|우려|올려|잡아|막아|지켜|살려|치러|넘겨|이뤄|읽어|솎아|걷어)내기/g;

/** '-내기'로 끝나는 평범한 동사의 '내기'를 지운 문자열 — 내기 판정 직전에만 쓴다(원문은 그대로 저장한다). */
export function neutralizeEverydayNaegi(text: string): string {
    return text.replace(EVERYDAY_NAEGI, "$1__");
}

const BETTING_TAG_PATTERNS: RegExp[] = [
    /^내기/,                                                       // #내기환영 #내기가능 #내기당구
    /내기(대?환영|가능|오케이|ok|선호|위주|당구|게임|한판)/i,          // #소액내기환영 #즐겜내기가능
    /^빵(내기|치기|당구|게임)/,                                     // #빵당구
    /^점당/,                                                       // #점당
    /^(돈|머니)(당구|게임|내기)/,                                    // #돈당구
];

/** 태그 하나가 금전 내기를 권하는 태그인가. '#'·공백·대소문자는 무시한다. */
export function isBettingTag(tag: unknown): boolean {
    if (typeof tag !== "string") return false;
    const t = neutralizeEverydayNaegi(tag.replace(/^#+/, "").replace(/\s+/g, "").toLowerCase());
    if (!t) return false;
    return BETTING_TAG_PATTERNS.some((re) => re.test(t));
}

/** 화면에 보여 줄 크루 태그 — 내기 권유 태그와 문자열이 아닌 값을 뺀다. 원래 순서는 유지한다. */
export function withoutBettingTags(tags: readonly unknown[] | null | undefined): string[] {
    return (tags ?? []).filter((t): t is string => typeof t === "string" && !isBettingTag(t));
}
