import { Stamp } from "@/golf/hooks/usePassportData";
import { Link, useLocation } from "wouter";
import { slotForStamp } from "@shared/golfStampBooks";
import { BOOK_ART, PLAIN_STAMP } from "@/golf/stamps/bookArt";
import { InkStamp } from "@/golf/stamps/InkStamp";
import { StampPaper, bookPath } from "@/golf/stamps/StampParts";
import { stampLabel } from "@/golf/stamps/stampLabel";

/**
 * 2026-10-12: 도장을 도장첩과 같은 **잉크 도장(종이 위)**으로 바꿨다(오너: "도장깨기 가이드나 골프 코스도 해당 우리가 만든 이미지 같이 들어가면").
 * 도장첩의 골프장은 그 권의 색 · 무늬 · 칸 이름으로 찍히고 누르면 그 권으로 간다. 도장첩 밖의 골프장은 먹색 깃대 도장.
 * 예전 도장은 글자가 6~10px 이었다 — 이제 이름 · 타수는 도장 아래에 12px 이상으로 적는다.
 *
 * 도장 보기. 인증 도장(현장 인증 + 이 규칙 전 옛 기록)은 지금까지처럼, 현장 인증 없이 적은 골프장은 그 뒤에
 * 흐린 '기록 도장'으로(2026-09-30 오너 결정 — 점수·평균은 남고 도장만 흐리다. 정복·지역·Elite 60 에는 안 센다).
 */
export const StampList = ({ stamps, records = [] }: { stamps: Stamp[]; records?: Stamp[] }) => {
    const [, setLocation] = useLocation();
    // 예전엔 비어 있으면 가짜 '88 CC' 도장을 보여 줬다. 비었으면 비었다고, 어떻게 받는지 말한다.
    if (stamps.length === 0 && records.length === 0) {
        return (
            <div className="py-14 px-6 text-center rounded-3xl border border-dashed border-[#FFFFFF1A] bg-[#FFFFFF05] mb-8">
                <p className="text-[16px] font-semibold text-[#FFFFFFCC]">아직 찍힌 도장이 없어요</p>
                <p className="mt-2 text-[13px] leading-relaxed text-[#FFFFFF80] break-keep">
                    골프장에서 랭큐매치로 18홀을 끝까지 적고 라운드를 끝내면, 그 골프장 도장이 여기 찍혀요. 같은 곳은 한 번만 찍혀요.
                </p>
                <button
                    onClick={() => setLocation('/golf/game/new?mode=match')}
                    className="mt-6 h-11 px-6 rounded-full bg-[#64DD17] text-[#051907] text-[14px] font-semibold"
                >
                    라운드 시작
                </button>
            </div>
        );
    }
    return (
        <>
        {stamps.length === 0 && (
            <p className="mb-4 px-2 text-[13px] text-[#FFFFFF8C] break-keep">아직 현장 인증 도장이 없어요. 골프장에서 라운드를 적으면 또렷한 도장이 찍혀요.</p>
        )}
        {stamps.length > 0 && (
            <StampPaper className="px-2.5 pt-4 pb-3.5">
                <div className="grid grid-cols-3 gap-x-1 gap-y-3.5" data-testid="passport-stamps">
                    {stamps.map((stamp, i) => <PassportStamp key={stamp.id} stamp={stamp} tilt={TILT[i % TILT.length]} />)}
                </div>
            </StampPaper>
        )}
        {records.length > 0 && <RecordStamps records={records} />}
        </>
    );
};

/** 손으로 찍은 것처럼 칸마다 조금씩 다른 기울기(도) */
const TILT = [-5, 4, -2, 6, -4, 3, -6, 5, -3, 2];

/**
 * 도장 한 개(종이 위). 도장첩의 골프장이면 그 권의 색 · 무늬 · 칸 이름, 아니면 먹색 깃대 도장에 꼬리를 뗀 이름.
 * ⚠️ 종이 위라 글자색도 리터럴 — 골프 테마가 `.text-black/*` 를 밝게 뒤집는다.
 */
function PassportStamp({ stamp, tilt, faded = false }: { stamp: Stamp; tilt: number; faded?: boolean }) {
    const at = slotForStamp(stamp);
    const art = (at && BOOK_ART[at.book.id]) || PLAIN_STAMP;
    const name = at ? at.slot.name : stampLabel(stamp.name);
    const inner = (
        <>
            <div className="w-full max-w-[112px] px-0.5">
                {/* 여권의 날짜 글자는 끝에 점이 붙어 온다("2026.03.21.") — 도장에는 떼고 찍는다 */}
                <InkStamp name={name} date={stamp.date.replace(/\.$/, "")} ink={art.ink} glyph={art.glyph} state={faded ? "faded" : "on"} tilt={faded ? 0 : tilt} />
            </div>
            <span className="text-[12.5px] leading-tight break-keep" style={{ color: faded ? "#5C5444" : "#1F1C16", fontWeight: faded ? 400 : 600 }}>{name}</span>
            <span className="text-[12px] tabular-nums text-[#6B6456]">
                {faded ? "미인증" : stamp.score != null ? `베스트 ${stamp.score}` : stamp.region}
                {stamp.rounds > 1 && ` · ${stamp.rounds}회`}
            </span>
            {at && !faded && <span className="text-[12px]" style={{ color: art.ink }}>{at.book.name} 도장첩</span>}
        </>
    );
    const cls = "flex flex-col items-center gap-1 text-center";
    return at
        ? <Link href={bookPath(at.book.id)} className={`${cls} active:opacity-70`} data-testid="passport-stamp" data-book={at.book.id}>{inner}</Link>
        : <div className={cls} data-testid="passport-stamp" data-book="">{inner}</div>;
}

/**
 * 미인증 — 현장 인증 없이 적은 골프장. 같은 종이 위에 흐린 도장으로. 누를 것도, 빛나는 것도 없다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
function RecordStamps({ records }: { records: Stamp[] }) {
    return (
        <section className="mt-6 mb-2" aria-label="미인증">
            <div className="px-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-[#FFFFFF99]">미인증 <span className="text-[#FFFFFF59] tabular-nums">{records.length}</span></h3>
                <span className="text-[12px] text-[#FFFFFF59]">정복 수에 안 들어가요</span>
            </div>
            <p className="mt-1 px-2 text-[12.5px] leading-relaxed text-[#FFFFFF73] break-keep">
                현장 인증 없이 적은 라운드예요. 점수·평균은 그대로 남고, 그 골프장에서 다시 치면 또렷한 도장이 돼요.
            </p>
            <StampPaper className="mt-3 px-2.5 pt-4 pb-3.5">
                <div className="grid grid-cols-3 gap-x-1 gap-y-3.5" data-testid="passport-records">
                    {records.map((stamp) => <PassportStamp key={stamp.id} stamp={stamp} tilt={0} faded />)}
                </div>
            </StampPaper>
        </section>
    );
}
