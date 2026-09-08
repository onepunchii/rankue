/** 진입 화면 옵션 버튼의 아이콘(2026-09-08 오너: "각각 svg 도 들어가고 버튼형으로"). 24 px, 선 1.8, currentColor — 공 색·그라데이션 없음. */
import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            {children}
        </svg>
    );
}

/** 연습: 큐볼 + 큐 */
export function PracticeIcon() {
    return (
        <Icon>
            <circle cx="15.5" cy="14.5" r="4.5" />
            <path d="M3 21l8-8" />
            <circle cx="14" cy="13" r="0.9" fill="currentColor" stroke="none" />
        </Icon>
    );
}
/** 드릴: 과녁 */
export function DrillIcon() {
    return (
        <Icon>
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </Icon>
    );
}
/** 길 찾기: 쿠션을 도는 점선 길 */
export function PathIcon() {
    return (
        <Icon>
            <path d="M5 18l6-7 8 3-6-9" strokeDasharray="2.6 2.6" />
            <circle cx="5" cy="18" r="2.2" />
            <circle cx="13" cy="5" r="1.8" />
        </Icon>
    );
}
/** 친구 초대: 사람 + 더하기 */
export function InviteIcon() {
    return (
        <Icon>
            <circle cx="10" cy="8" r="3.5" />
            <path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
            <path d="M18.5 6.5v6M15.5 9.5h6" />
        </Icon>
    );
}
/** 코드로 참가: 키패드 */
export function CodeIcon() {
    return (
        <Icon>
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="M9 8.5h.01M15 8.5h.01M9 12h.01M15 12h.01M9 15.5h.01M15 15.5h.01" strokeWidth="2.6" />
        </Icon>
    );
}
/** 멀티방: 문 */
export function RoomsIcon() {
    return (
        <Icon>
            <path d="M5 21V4a1 1 0 0 1 1-1h9v18" />
            <path d="M15 3l4 2v16l-4 0" />
            <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
            <path d="M3 21h18" />
        </Icon>
    );
}
/** 랭킹: 단상 */
export function RankIcon() {
    return (
        <Icon>
            <path d="M3 20h18" />
            <path d="M6 20v-6h4v6M10 20V8h4v12M14 20v-9h4v9" />
        </Icon>
    );
}
