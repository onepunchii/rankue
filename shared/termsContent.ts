// 이용약관 본문 — /terms 페이지와 동의 시트의 '전문 보기'가 같은 원문을 쓴다.
//
// 한국어가 정본이고 영어는 번역본이다. 다른 언어(vi·tr·es)는 영어로 보여 준다(법률 문서라 기계 번역을 늘리지 않는다).
// shared 에 둔 이유: 나중에 server/prerender.ts 가 크롤러용 HTML 을 그릴 때 같은 원문을 쓸 수 있게(aboutContent 와 같은 패턴).
//
// ⚠️ 이 문서는 App Store 1.2 · Play UGC 심사 근거다. 아래 항목은 빠지면 안 된다(shared/terms.test.ts 가 지킨다):
//    무관용 원칙, 24시간 안 신고 검토, 콘텐츠 삭제·이용 정지, 신고·차단 방법, 계정 삭제, 문의 이메일, 대한민국 준거법.
// ⚠️ 권리·의무가 바뀌는 개정이면 shared/terms.ts 의 TERMS_VERSION·TERMS_MIN_VERSION 과 아래 시행일을 함께 올린다.
// 골프 기능은 비공개라(오너 결정) 서비스 설명에 넣지 않는다.

export type TermsLang = "ko" | "en";

/** 본문 한 덩어리 — 문자열은 문단, 문자열 배열은 글머리표 목록. */
export type TermsBlock = string | string[];

export interface TermsSection {
    title: string;
    body: TermsBlock[];
}

export interface TermsDoc {
    seoTitle: string;
    seoDescription: string;
    title: string;
    meta: string;
    intro: string;
    sections: TermsSection[];
    effective: string;
    /** 다른 언어로 바꾸는 버튼의 글자 */
    switchLabel: string;
    back: string;
    related: string;
    privacyLabel: string;
    accountDeleteLabel: string;
    supportLabel: string;
}

export const TERMS_CONTACT_EMAIL = "petudy@kakao.com";

/** 앱 언어 → 약관 언어. 한국어가 아니면 영어본. */
export function termsLang(locale: string | null | undefined): TermsLang {
    return locale === "ko" ? "ko" : "en";
}

export const TERMS_CONTENT: Record<TermsLang, TermsDoc> = {
    ko: {
        seoTitle: "이용약관 · 랭큐(RANKUE)",
        seoDescription:
            "랭큐(RANKUE) 이용약관 — 서비스 내용, 금지 행위, 불쾌한 콘텐츠·악성 사용자 무관용 원칙, 24시간 신고 처리, 차단, 계정 삭제, 문의.",
        title: "랭큐 이용약관",
        meta: "랭큐(RANKUE) · 운영: 제이에이치스퀘어",
        intro:
            "이 약관은 제이에이치스퀘어(이하 “회사”)가 제공하는 랭큐(RANKUE) 앱과 웹사이트(이하 “서비스”)를 이용하는 조건과 절차, 회사와 이용자의 권리와 의무를 정합니다. 서비스에 가입하거나 글·댓글·사진·채팅을 올리기 전에 이 약관에 동의해야 합니다.",
        sections: [
            {
                title: "1. 서비스 내용",
                body: [
                    "랭큐는 당구 경기를 기록하고 함께 즐기기 위한 서비스입니다. 주요 기능은 다음과 같습니다.",
                    [
                        "당구 점수판 — 경기 점수와 이닝을 기록하고 전적을 자동으로 저장",
                        "경기 기록, 통계, 랭킹",
                        "크루(동호회) — 게시판, 사진첩, 채팅, 정모와 대회 운영",
                        "커뮤니티 게시판 — 자랑, 질문, 매장 소식, 레슨",
                        "당구장 찾기와 매장 정보, 매장 운영자를 위한 매장 관리 기능",
                    ],
                    "회사는 서비스를 개선하기 위해 기능을 바꿀 수 있으며, 중요한 변경은 서비스 안에서 미리 알립니다.",
                ],
            },
            {
                title: "2. 가입과 계정",
                body: [
                    [
                        "휴대폰 번호 또는 구글·애플 계정으로 가입할 수 있습니다.",
                        "만 14세 미만은 가입할 수 없습니다.",
                        "다른 사람의 정보로 가입하거나, 계정을 빌려주거나 팔 수 없습니다.",
                        "계정과 비밀번호(PIN)를 관리할 책임은 이용자에게 있습니다. 도용이 의심되면 바로 알려 주세요.",
                        "개인정보는 개인정보처리방침(/privacy)에 따라 처리합니다.",
                    ],
                ],
            },
            {
                title: "3. 금지 행위",
                body: [
                    "이용자는 서비스에서 다음 행위를 해서는 안 됩니다.",
                    [
                        "욕설, 비방, 괴롭힘, 혐오·차별 표현",
                        "음란하거나 폭력적인 콘텐츠, 다른 사람에게 불쾌감을 주는 사진",
                        "금전을 건 내기(도박)를 권하거나, 알선하거나, 정산하는 행위",
                        "물품 거래, 광고, 홍보, 같은 글을 반복해서 올리는 행위(도배)",
                        "다른 사람의 전화번호·주소 같은 개인정보를 올리는 행위",
                        "다른 사람이나 매장을 사칭하는 행위",
                        "다른 사람의 저작권·초상권 등 권리를 침해하는 행위",
                        "경기 기록을 거짓으로 입력하거나 순위를 조작하는 행위",
                        "서비스를 해킹하거나 자동화 수단으로 방해하는 행위",
                        "그 밖에 법령을 위반하는 행위",
                    ],
                ],
            },
            {
                title: "4. 불쾌한 콘텐츠와 악성 사용자에 대한 무관용 원칙",
                body: [
                    "랭큐는 불쾌한 콘텐츠와 악성 사용자를 용납하지 않습니다(무관용 원칙). 3조의 금지 행위에 해당하는 콘텐츠는 확인하는 즉시 삭제하고, 이를 올린 이용자는 사전 통지 없이 이용을 정지하거나 영구적으로 이용을 제한할 수 있습니다.",
                    "위반이 심각하거나 반복되면 계정을 해지하며, 법령 위반이 의심되면 관계 기관에 알릴 수 있습니다.",
                ],
            },
            {
                title: "5. 게시물 관리와 신고 처리",
                body: [
                    [
                        "금전 내기·욕설·거래와 관련된 표현은 올리기 전에 자동으로 걸러지고, 전화번호와 오픈채팅 링크는 자동으로 가려집니다.",
                        "커뮤니티 글·댓글, 크루 게시글·댓글·사진·채팅, 크루 회원 프로필의 ⋯ 메뉴에서 신고할 수 있습니다. 그 밖의 콘텐츠(크루 소개·투표·정모·대회 등)는 작성자의 크루 회원 프로필에서 신고하거나 " + TERMS_CONTACT_EMAIL + " 로 알려 주세요. 신고한 사실은 상대에게 알려지지 않습니다.",
                        "회사는 접수된 신고를 24시간 안에 검토합니다. 위반이 확인되면 해당 콘텐츠를 삭제하고, 작성자의 계정을 정지해 로그인과 게시를 막을 수 있습니다.",
                        "커뮤니티 글과 댓글은 서로 다른 이용자 3명이 신고하면 검토 전이라도 자동으로 가려집니다.",
                        "조치에 이의가 있으면 이의제기 버튼이나 이메일로 알려 주세요. 다시 검토한 뒤 결과를 반영합니다.",
                    ],
                ],
            },
            {
                title: "6. 차단",
                body: [
                    [
                        "커뮤니티 글·댓글, 크루 게시글·댓글·사진·채팅이나 크루 회원 프로필의 ⋯ 메뉴에서 ‘차단하기’를 누르면, 그 사용자가 쓴 글·댓글·사진·채팅이 더 이상 보이지 않고 그 사용자 때문에 오는 채팅·댓글·모임 알림도 받지 않습니다.",
                        "차단한 사용자는 설정 → 차단한 사용자에서 언제든 해제할 수 있습니다.",
                    ],
                ],
            },
            {
                title: "7. 게시물의 권리와 책임",
                body: [
                    [
                        "이용자가 올린 게시물의 저작권은 작성자에게 있습니다.",
                        "회사는 게시물을 서비스 안에서 보여 주는 데 필요한 범위에서만 이용합니다.",
                        "게시물 때문에 생긴 법적 책임은 작성자에게 있습니다.",
                    ],
                ],
            },
            {
                title: "8. 서비스의 변경과 중단",
                body: [
                    "회사는 설비 점검, 장애, 천재지변처럼 부득이한 경우 서비스를 잠시 멈출 수 있습니다. 서비스를 종료할 때는 30일 전에 서비스 안에서 알립니다.",
                ],
            },
            {
                title: "9. 계정 삭제(탈퇴)",
                body: [
                    [
                        "앱의 전체 메뉴 → 계정 삭제에서 언제든 직접 탈퇴할 수 있으며, 계정과 개인정보는 즉시 영구 삭제됩니다.",
                        "앱을 쓸 수 없으면 이메일(petudy@kakao.com)로 요청할 수 있습니다. 자세한 절차는 계정 삭제 안내(/account-delete)에 있습니다.",
                        "법령에 따라 보관해야 하는 정보는 정해진 기간 동안만 분리해 보관한 뒤 파기합니다.",
                    ],
                ],
            },
            {
                title: "10. 책임의 제한",
                body: [
                    [
                        "이용자끼리의 분쟁(경기, 모임 등)에 회사는 개입할 의무가 없으며, 회사에 고의나 중대한 과실이 없는 한 책임지지 않습니다.",
                        "매장 정보는 공개된 자료와 매장이 제공한 내용을 바탕으로 하며, 실제와 다를 수 있습니다.",
                        "천재지변처럼 회사가 통제할 수 없는 사유로 생긴 손해는 책임지지 않습니다.",
                    ],
                ],
            },
            {
                title: "11. 약관의 변경",
                body: [
                    "약관을 바꿀 때는 시행일 7일 전(이용자에게 불리한 변경은 30일 전)부터 서비스 안에 알립니다. 중요한 변경은 다음에 글을 올릴 때 다시 동의를 받습니다.",
                ],
            },
            {
                title: "12. 준거법과 관할",
                body: [
                    "이 약관은 대한민국 법률에 따라 해석되며, 서비스 이용과 관련한 분쟁은 민사소송법에 따른 관할 법원에서 해결합니다.",
                ],
            },
            {
                title: "13. 문의",
                body: [
                    [
                        "이메일: petudy@kakao.com",
                        "앱 안: 전체 메뉴 → 건의함",
                        "운영: 제이에이치스퀘어",
                    ],
                ],
            },
        ],
        effective: "시행일: 2026년 9월 11일",
        switchLabel: "English",
        back: "뒤로",
        related: "관련 문서",
        privacyLabel: "개인정보처리방침",
        accountDeleteLabel: "계정 삭제 안내",
        supportLabel: "고객지원",
    },
    en: {
        seoTitle: "Terms of Use · RANKUE",
        seoDescription:
            "RANKUE Terms of Use — service description, prohibited conduct, zero tolerance for objectionable content and abusive users, 24-hour report review, blocking, account deletion, contact.",
        title: "RANKUE Terms of Use",
        meta: "RANKUE · Operated by JH Square",
        intro:
            "These Terms set out the conditions for using the RANKUE app and website (the “Service”) provided by JH Square (the “Company”), and the rights and obligations of the Company and its users. You must agree to these Terms before signing up or posting any posts, comments, photos or chat messages. The Korean version is the governing text; this English version is a translation.",
        sections: [
            {
                title: "1. The Service",
                body: [
                    "RANKUE is a service for recording billiards games and enjoying them together. Its main features are:",
                    [
                        "Billiards scoreboard — record scores and innings; results are saved automatically",
                        "Game history, statistics and rankings",
                        "Crews (clubs) — board, photo album, chat, meetups and tournaments",
                        "Community boards — highlights, questions, venue news, lessons",
                        "Billiard hall finder, venue information and management tools for venue owners",
                    ],
                    "The Company may change features to improve the Service and will announce important changes in the Service in advance.",
                ],
            },
            {
                title: "2. Accounts",
                body: [
                    [
                        "You can sign up with a phone number or a Google or Apple account.",
                        "You must be at least 14 years old to sign up.",
                        "You may not sign up with someone else's information, or lend or sell your account.",
                        "You are responsible for keeping your account and PIN secure. Tell us right away if you suspect misuse.",
                        "Personal data is handled under our Privacy Policy (/privacy).",
                    ],
                ],
            },
            {
                title: "3. Prohibited conduct",
                body: [
                    "You must not do any of the following in the Service:",
                    [
                        "Profanity, insults, harassment, hate speech or discrimination",
                        "Sexual or violent content, or photos that are offensive to others",
                        "Encouraging, arranging or settling bets for money (gambling)",
                        "Selling goods, advertising, promotion, or repeatedly posting the same content (spam)",
                        "Posting other people's personal data such as phone numbers or addresses",
                        "Impersonating another person or venue",
                        "Infringing copyrights, portrait rights or other rights of others",
                        "Entering false game records or manipulating rankings",
                        "Hacking the Service or disrupting it with automated means",
                        "Any other conduct that violates the law",
                    ],
                ],
            },
            {
                title: "4. Zero tolerance for objectionable content and abusive users",
                body: [
                    "RANKUE has zero tolerance for objectionable content and abusive users. Content that falls under Section 3 is removed as soon as it is confirmed, and the user who posted it may be suspended or permanently banned without prior notice.",
                    "Serious or repeated violations lead to account termination, and suspected illegal activity may be reported to the authorities.",
                ],
            },
            {
                title: "5. Content moderation and reports",
                body: [
                    [
                        "Expressions related to betting for money, profanity or trading are filtered before posting, and phone numbers and open-chat links are masked automatically.",
                        "You can report community posts and comments, crew posts, comments, photos and chat messages, and crew member profiles from their ⋯ menu. For other content (crew descriptions, polls, meetups, tournaments and so on), report the author from their crew member profile or email " + TERMS_CONTACT_EMAIL + ". The other user is not told who reported them.",
                        "The Company reviews every report within 24 hours. If a violation is confirmed, the content is removed and the author's account may be suspended, which blocks signing in and posting.",
                        "Community posts and comments reported by three different users are hidden automatically, even before review.",
                        "If you disagree with an action, use the appeal button or email us. We will review it again and apply the result.",
                    ],
                ],
            },
            {
                title: "6. Blocking",
                body: [
                    [
                        "Tap “Block” in the ⋯ menu of a community post or comment, a crew post, comment, photo or chat message, or a crew member profile. You will no longer see that user's posts, comments, photos or chat messages, or get chat, comment and meetup notifications caused by them.",
                        "You can unblock users at any time in Settings → Blocked users.",
                    ],
                ],
            },
            {
                title: "7. Your content",
                body: [
                    [
                        "You keep the copyright to what you post.",
                        "The Company uses your content only as needed to display it within the Service.",
                        "You are legally responsible for the content you post.",
                    ],
                ],
            },
            {
                title: "8. Changes to and suspension of the Service",
                body: [
                    "The Company may pause the Service temporarily for maintenance, outages, natural disasters or similar unavoidable reasons. If the Service is discontinued, we will announce it in the Service 30 days in advance.",
                ],
            },
            {
                title: "9. Deleting your account",
                body: [
                    [
                        "You can delete your account at any time from Menu → Delete account in the app. Your account and personal data are permanently deleted immediately.",
                        "If you cannot use the app, email us at petudy@kakao.com. See the account deletion guide (/account-delete) for details.",
                        "Data that the law requires us to keep is stored separately only for the required period and then destroyed.",
                    ],
                ],
            },
            {
                title: "10. Limitation of liability",
                body: [
                    [
                        "The Company is not obliged to intervene in disputes between users (games, meetups and so on) and is not liable for them unless it acted intentionally or with gross negligence.",
                        "Venue information is based on public data and information provided by venues, and may differ from reality.",
                        "The Company is not liable for damage caused by events beyond its control, such as natural disasters.",
                    ],
                ],
            },
            {
                title: "11. Changes to these Terms",
                body: [
                    "We announce changes in the Service 7 days before they take effect (30 days for changes unfavorable to users). For important changes, we ask for your agreement again the next time you post.",
                ],
            },
            {
                title: "12. Governing law and jurisdiction",
                body: [
                    "These Terms are governed by the laws of the Republic of Korea. Disputes related to the Service are resolved by the competent court under the Korean Civil Procedure Act.",
                ],
            },
            {
                title: "13. Contact",
                body: [
                    [
                        "Email: petudy@kakao.com",
                        "In the app: Menu → Suggestion box",
                        "Operator: JH Square",
                    ],
                ],
            },
        ],
        effective: "Effective date: September 11, 2026",
        switchLabel: "한국어",
        back: "Back",
        related: "Related documents",
        privacyLabel: "Privacy Policy",
        accountDeleteLabel: "Account deletion",
        supportLabel: "Support",
    },
};
