/**
 * 업로드 이미지에서 메타데이터(EXIF·XMP·IPTC·글 조각)를 걷어낸다(2026-09-30, 라운드 사진 공개와 함께).
 *
 * 화면은 캔버스로 다시 그려 올리므로(client/src/lib/imageUtils.ts) EXIF 가 원래 안 남는다. 그런데 업로드 API
 * (POST /api/hiq/upload)는 누구나 직접 부를 수 있어서, 캔버스를 거치지 않은 사진이 그대로 들어오면 GPS 좌표가
 * 공개 골프장 페이지까지 따라 나간다(UGC 심사 요건: "사진 업로드 파이프에서 EXIF 전량 제거").
 * sharp 가 없어 다시 인코딩하지 않고 **컨테이너 조각만 들어낸다** — 픽셀 데이터는 한 바이트도 안 건드린다.
 *
 *  - WebP: EXIF·XMP 조각을 빼고, VP8X 머리의 EXIF·XMP 표시 비트를 끈다.
 *  - JPEG: APP1(EXIF·XMP)·APP3~13(IPTC 등)·APP15·주석(COM)을 뺀다. APP0(JFIF)·APP2(ICC 색 프로필)·APP14(Adobe 색 변환)는 둔다.
 *  - PNG: eXIf·tEXt·zTXt·iTXt·tIME 조각을 뺀다.
 * 모르는 형식이거나 구조가 깨졌으면 type=null 로 원본을 돌려준다(부르는 쪽이 받을지 정한다).
 */

export type ImageKind = "webp" | "jpeg" | "png";
export interface StripResult {
    buffer: Buffer;
    type: ImageKind | null;
    /** 들어낸 조각 수 */
    removed: number;
}

export const IMAGE_CONTENT_TYPE: Record<ImageKind, string> = { webp: "image/webp", jpeg: "image/jpeg", png: "image/png" };
export const IMAGE_EXT: Record<ImageKind, string> = { webp: "webp", jpeg: "jpg", png: "png" };

export function detectImageKind(b: Buffer): ImageKind | null {
    if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
    if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return "png";
    return null;
}

export function stripImageMetadata(input: Buffer): StripResult {
    const kind = detectImageKind(input);
    try {
        if (kind === "webp") return { ...stripWebp(input), type: kind };
        if (kind === "jpeg") return { ...stripJpeg(input), type: kind };
        if (kind === "png") return { ...stripPng(input), type: kind };
    } catch {
        // 구조가 깨진 파일 — 아래에서 '모름'으로 돌려준다
    }
    return { buffer: input, type: null, removed: 0 };
}

const WEBP_DROP = new Set(["EXIF", "XMP "]);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function stripWebp(b: Buffer): { buffer: Buffer; removed: number } {
    const riffEnd = Math.min(b.length, 8 + b.readUInt32LE(4));
    const parts: Buffer[] = [];
    let removed = 0;
    let off = 12;
    while (off + 8 <= riffEnd) {
        const fourcc = b.toString("ascii", off, off + 4);
        const size = b.readUInt32LE(off + 4);
        const end = off + 8 + size + (size & 1); // 조각은 짝수 길이로 채운다
        if (end > b.length) throw new Error("webp chunk overflow");
        if (WEBP_DROP.has(fourcc)) {
            removed++;
        } else if (fourcc === "VP8X" && size >= 1) {
            const chunk = Buffer.from(b.subarray(off, end));
            chunk[8] &= ~(VP8X_EXIF | VP8X_XMP);
            parts.push(chunk);
        } else {
            parts.push(b.subarray(off, end));
        }
        off = end;
    }
    if (off !== riffEnd) throw new Error("webp trailing bytes");
    const body = Buffer.concat(parts);
    const head = Buffer.alloc(12);
    head.write("RIFF", 0, "ascii");
    head.writeUInt32LE(4 + body.length, 4);
    head.write("WEBP", 8, "ascii");
    return { buffer: Buffer.concat([head, body]), removed };
}

/** 지울 JPEG 표지: APP1(EXIF·XMP) · APP3~APP13(IPTC·기타) · APP15 · COM */
const dropJpegMarker = (m: number) => m === 0xe1 || (m >= 0xe3 && m <= 0xed) || m === 0xef || m === 0xfe;

function stripJpeg(b: Buffer): { buffer: Buffer; removed: number } {
    const parts: Buffer[] = [b.subarray(0, 2)]; // SOI
    let removed = 0;
    let off = 2;
    while (off < b.length) {
        if (b[off] !== 0xff) throw new Error("jpeg marker expected");
        let m = off + 1;
        while (m < b.length && b[m] === 0xff) m++; // 채움 바이트
        if (m >= b.length) throw new Error("jpeg truncated");
        const marker = b[m];
        // 길이 없는 표지(RST·TEM)
        if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { parts.push(b.subarray(off, m + 1)); off = m + 1; continue; }
        // EOI — 뒤에 붙은 것(휴대폰이 덧붙이는 보조 사진·트레일러. 거기에도 EXIF·GPS 가 들어 있다)은 버린다
        if (marker === 0xd9) {
            parts.push(Buffer.from([0xff, 0xd9]));
            if (m + 1 < b.length) removed++;
            return { buffer: Buffer.concat(parts), removed };
        }
        if (m + 3 > b.length) throw new Error("jpeg truncated");
        const len = b.readUInt16BE(m + 1);
        const end = m + 1 + len;
        if (len < 2 || end > b.length) throw new Error("jpeg segment overflow");
        if (marker === 0xda) {
            // SOS 머리 + 압축 데이터. 데이터 안의 FF 는 FF00(채움)·RST 뿐이라 그 밖의 FF xx 가 다음 표지다
            // (프로그레시브 JPEG 은 SOS 가 여러 번 나온다 — 그래서 끝까지 통째로 넘기지 않고 다음 표지에서 다시 읽는다).
            let p = end;
            while (p < b.length) {
                if (b[p] === 0xff && p + 1 < b.length) {
                    const n = b[p + 1];
                    if (n === 0x00 || (n >= 0xd0 && n <= 0xd7)) { p += 2; continue; }
                    break;
                }
                p++;
            }
            parts.push(b.subarray(off, p));
            off = p;
            continue;
        }
        if (dropJpegMarker(marker)) removed++;
        else parts.push(b.subarray(off, end));
        off = end;
    }
    // EOI 없이 끝난 파일 — 있는 그대로(메타 조각만 뺀 것) 돌려준다
    return { buffer: Buffer.concat(parts), removed };
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(b: Buffer): { buffer: Buffer; removed: number } {
    const parts: Buffer[] = [b.subarray(0, 8)];
    let removed = 0;
    let off = 8;
    while (off + 12 <= b.length) {
        const len = b.readUInt32BE(off);
        const type = b.toString("ascii", off + 4, off + 8);
        const end = off + 12 + len;
        if (end > b.length) throw new Error("png chunk overflow");
        if (PNG_DROP.has(type)) removed++;
        else parts.push(b.subarray(off, end));
        off = end;
        if (type === "IEND") break;
    }
    return { buffer: Buffer.concat(parts), removed };
}
