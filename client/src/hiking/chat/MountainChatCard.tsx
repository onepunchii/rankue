/**
 * 채팅의 '산' 카드(2026-10-13) — 산악회 방에 올라온 산 한 곳. 공용 카드 화면(components/hiq/chat/ChatCard)이 산 카드일 때만 불러 온다(lazy).
 *
 * 카드의 글은 서버가 산 표에서 읽어 채운 것이다(shared/hikingChat buildMountainCard) — 여기서는 받은 것을 그리기만 한다.
 * 위는 그 권역의 표지 그림 띠(100대 명산이면 그 산의 와펜을 얹는다), 아래는 이름 · "1,708m · 강원 양양군" · "코스 3개 · 4.2~11km"(코스가 있을 때만)
 * · '산 정보 보기'(산의 공개 화면으로 간다). 받은 값의 꼴이 어긋나면 서버의 요약 한 줄("산 · 설악산")만 보인다.
 * 폭은 228px 로 고정한다 — 폭 360 의 화면에서 남의 글 줄(여백 16 + 사진 32 + 틈 8 + 카드 + 틈 6 + 시각 50쯤)에 들어가는 값으로 셈했다
 * (화면으로 찍어 보지는 못했다). 그림 띠의 높이도 고정이라 그림이 늦게 와도 대화가 밀리지 않는다.
 * 누른 것의 기록에는 구역 이름만 남긴다(data-track-as).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지. 글자 그림(이모지)을 쓰지 않는다. 그림은 장식이라 alt 를 비운다.
 */
import { Link } from "wouter";
import { hikingMountainPath } from "@shared/hikingMountains";
import { MOUNTAIN_CARD_COPY as COPY, mountainCardCourses, mountainCardFacts, readMountainCard } from "@shared/hikingChat";
import { hikingCover } from "../theme";
import { MountainPatch } from "../stamps/MountainPatch";

const Chip = ({ children }: { children: string }) => <span className="rounded-full bg-[#0B1F26CC] px-2 py-1 text-[12px] font-medium leading-none text-[#F6D9A8]">{children}</span>;

export function MountainChatCard({ md, summary }: { md: unknown; summary: string }) {
    const card = readMountainCard(md);
    if (!card) {
        return (
            <div className="max-w-full rounded-2xl bg-[#0E2A33] px-3.5 py-3 text-[14px] font-medium text-[#F4EFE3] whitespace-pre-wrap break-words" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="chat-card-mountain" data-track-as="hiking-chat-mountain-card">
                {summary}
            </div>
        );
    }
    const facts = mountainCardFacts(card);
    const courses = mountainCardCourses(card);
    return (
        <div
            className="block w-[228px] max-w-full select-none overflow-hidden rounded-2xl bg-[#0E2A33] text-left text-[#F4EFE3]" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }}
            data-testid="chat-card-mountain" data-track-as="hiking-chat-mountain-card" data-slug={card.slug}
        >
            <div className="relative h-[76px] bg-[#1F5560]">
                <img src={hikingCover(card.region)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0E2A3300 30%,#0E2A33 100%)" }} aria-hidden />
                <span className="absolute left-3 top-3 flex items-center gap-1.5">
                    <Chip>{COPY.badge}</Chip>
                    {card.kfs100 && <Chip>{COPY.kfs100}</Chip>}
                </span>
                {/* 100대 명산은 그 산의 와펜을 얹는다(받을 수 있는 것을 제 색으로 — preview) */}
                {card.kfs100 && card.mountainId && <span className="absolute right-3 top-2.5"><MountainPatch id={card.mountainId} region={card.region} size={46} earned={false} preview /></span>}
            </div>
            <div className="px-3.5 pb-3.5 pt-1.5">
                <p className="truncate text-[16px] font-semibold leading-tight tracking-tight" data-testid="chat-card-mountain-name">{card.name}</p>
                {facts && <p className="mt-1 truncate text-[13px] tabular-nums leading-tight text-[#F4EFE3B3]">{facts}</p>}
                {courses && <p className="mt-1 truncate text-[13px] tabular-nums leading-tight text-[#F4EFE399]">{courses}</p>}
                <Link
                    href={hikingMountainPath(card.slug)} data-testid="chat-card-mountain-open"
                    className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[#F28C6A] text-[14px] font-semibold text-[#0B1F26] outline-none focus-visible:ring-2 focus-visible:ring-[#F6D9A8] active:opacity-80"
                >
                    {COPY.open}
                </Link>
            </div>
        </div>
    );
}
