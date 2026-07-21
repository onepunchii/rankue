import type { Dict } from "./index";

// 한국어 원문 사전 — 다른 언어 사전의 키 기준이자 폴백.
// 키 규칙: 화면.요소 (login.*, common.*)
export const ko: Dict = {
  "common.appName": "랭큐",
  "common.tagline": "스포츠 소셜 클럽",
  "common.poweredBy": "RANKUE 제공",
  "common.or": "또는",
  "common.loading": "불러오는 중…",

  "login.phonePlaceholder": "휴대폰 번호 입력",
  "login.pinPlaceholder": "PIN 번호",
  "login.phoneHint": "휴대폰 번호로 입장하세요",
  "login.pinHint": "비밀번호를 입력하여 본인을 확인하세요",
  "login.enter": "입장하기",
  "login.confirmEnter": "확인 및 입장",
  "login.forgotPin": "PIN을 잊으셨나요?",
  "login.checkingMember": "확인 중",
  "login.invalidPhone": "올바른 전화번호 11자리를 입력해주세요.",
  "login.invalidPhoneTitle": "전화번호 확인",
  "login.failed": "로그인에 실패했습니다. 다시 시도해주세요.",
  "login.failedTitle": "로그인 실패",

  "login.continueGoogle": "Google로 계속하기",
  "login.continueApple": "Apple로 계속하기",
  "login.socialHint": "간편하게 시작하고 전 세계 랭킹에 도전하세요",
  "login.phoneLoginLink": "한국 매장 회원이신가요? 전화번호로 로그인",
  "login.socialLoginLink": "Google / Apple로 계속하기",
  "login.socialFailed": "소셜 로그인에 실패했습니다. 다시 시도해주세요.",
};
