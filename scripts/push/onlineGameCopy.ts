/**
 * 온라인게임 오픈 알림 문구와 회원 언어 판별(순수 모듈 — 불러오기만 해도 아무 일도 하지 않는다).
 * 언어: 회원 country(직접 설정) → 프로필 countryCode(가입 IP) → 전화(010·+82 = ko) → 소셜 가입(kakao/naver) = ko → 그 밖엔 en.
 */
export type Lang = "ko" | "en" | "es" | "tr" | "vi";

export const COPY: Record<Lang, { title: string; body: string }> = {
  ko: { title: "그랜드 오픈! 온라인게임 당구", body: "친구끼리 지금 바로 즐기세요. 코드 하나면 3쿠션·4구 대전이 열려요. 혼자 연습도, 멀티방에서 누구와도 대전도 됩니다. 홈에서 온라인게임을 눌러 시작하세요." },
  en: { title: "Grand opening! Online billiards game", body: "Play with your friends right now. One code opens a 3-cushion or 4-ball match. Practice solo or take on anyone in the multi rooms. Tap Online game on the home screen." },
  es: { title: "¡Gran apertura! Juego de billar en línea", body: "Juega con tus amigos ahora mismo. Con un código abres una partida de 3 bandas o 4 bolas. Practica solo o reta a cualquiera en las salas. Toca Juego en línea en el inicio." },
  tr: { title: "Büyük açılış! Çevrimiçi bilardo oyunu", body: "Arkadaşlarınla hemen oyna. Tek bir kodla 3 bant ya da 4 top maçı açılır. Tek başına antrenman yap ya da odalarda herkesle oyna. Ana ekranda Çevrimiçi oyun'a dokun." },
  vi: { title: "Khai trương! Trò chơi bi-a trực tuyến", body: "Chơi cùng bạn bè ngay bây giờ. Chỉ một mã là mở được trận 3 băng hoặc 4 bi. Luyện tập một mình hoặc đấu với bất kỳ ai trong phòng. Nhấn Trò chơi trực tuyến ở màn hình chính." },
};
const ES = new Set(["MX", "ES", "CO", "AR", "PE", "CL", "VE", "EC", "GT", "DO", "PA", "UY", "BO", "PY", "HN", "SV", "NI", "CU", "PR", "CR"]);
export function langFor(m: { country: string | null; countryCode: string | null; phone: string }): Lang {
  const cc = (m.country || m.countryCode || "").toUpperCase();
  if (cc === "KR") return "ko";
  if (ES.has(cc)) return "es";
  if (cc === "TR") return "tr";
  if (cc === "VN") return "vi";
  if (cc) return "en";
  const ph = m.phone || "";
  if (/^(\+?82|010)/.test(ph)) return "ko";
  if (/kakao|naver/i.test(ph)) return "ko";
  return "en";
}
for (const [k, v] of Object.entries(COPY)) { if (v.title.length > 60 || v.body.length > 200) throw new Error(`${k} 길이 초과 ${v.title.length}/${v.body.length}`); }
