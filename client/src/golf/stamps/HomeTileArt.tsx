/**
 * 골프 홈 아래 줄 두 타일의 그림(2026-10-12 오너: "도장깨기 가이드나 골프 코스도 해당 우리가 만든 이미지 같이 들어가면 너무 좋을 거 같은데").
 *
 *   PassportTileArt  골프 여권 — 종이에 찍힌 잉크 도장 두 개
 *   ShelfTileArt     볼마커 장식장 — 볼마커 세 개
 *
 * 둘 다 **장식 그림**이다(누가 가진 것을 뜻하지 않는다): 도장에는 골프장 이름 대신 '골프 여권' · '도장깨기'라고 적고,
 * 볼마커는 목록의 그림을 제 색으로 놓는다. 내 진행은 그 위의 도장깨기 카드(StampHomeEntry)가 보여 준다.
 */
import { BOOK_ART, markerSrc } from "./bookArt";
import { InkStamp } from "./InkStamp";

export function PassportTileArt() {
    return (
        <div className="relative h-[112px] w-[136px]" aria-hidden data-testid="passport-tile-art">
            <span className="absolute left-0 top-1 -rotate-6 rounded-[12px] bg-[#F4EFE3] p-1.5 shadow-[0_6px_14px_rgba(0,0,0,0.45)]">
                <InkStamp name="골프 여권" ink={BOOK_ART.gangwon.ink} glyph="peaks" size={70} tilt={-4} />
            </span>
            <span className="absolute right-0 bottom-0 rotate-6 rounded-[12px] bg-[#F4EFE3] p-1.5 shadow-[0_6px_14px_rgba(0,0,0,0.45)]">
                <InkStamp name="도장깨기" ink={BOOK_ART.seohae.ink} glyph="sunsea" size={60} tilt={5} />
            </span>
        </div>
    );
}

export function ShelfTileArt() {
    const img = (bookId: string, size: number, style: React.CSSProperties) => (
        <img src={markerSrc(bookId)} alt="" width={size} height={size} draggable={false} decoding="async" loading="lazy" className="absolute" style={{ width: size, height: size, filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.5))", ...style }} />
    );
    return (
        <div className="relative h-[108px] w-[148px]" aria-hidden data-testid="shelf-tile-art">
            {img("seohae", 62, { left: 0, top: 28, transform: "rotate(-10deg)" })}
            {img("jeju", 62, { right: 0, top: 28, transform: "rotate(10deg)" })}
            {img("gangwon", 80, { left: "50%", top: 0, marginLeft: -40 })}
        </div>
    );
}
