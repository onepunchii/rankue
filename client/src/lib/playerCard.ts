// 선수 카드 PNG 주소 — 서버 정본(server/services/playerCard.ts 의 *CardUrl)과 같은 규칙.
// og:image(useSeo)·"카드 공유" 버튼이 함께 쓴다. ko 는 파라미터 없음.
const ORIGIN = "https://www.rankue.co.kr";
const withLang = (url: string, lang: string) => (lang === "ko" ? url : `${url}?lang=${lang}`);

export const umbCardUrl = (category: string, umbId: string, lang = "ko") =>
    withLang(`${ORIGIN}/og/player/${category}/${encodeURIComponent(umbId)}.png`, lang);
/** 골프 카드는 ko·en 만 — 다른 언어는 ko 로 접는다(골프 페이지와 같은 규칙). */
export const golferCardUrl = (tour: string, id: string, lang = "ko") =>
    withLang(`${ORIGIN}/og/golfer/${tour}/${encodeURIComponent(id)}.png`, lang === "en" ? "en" : "ko");
export const pbaCardUrl = (memCode: string, lang = "ko") =>
    withLang(`${ORIGIN}/og/pba-player/${encodeURIComponent(memCode)}.png`, lang);
