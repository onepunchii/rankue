import { describe, it, expect } from "vitest";
import { stripImageMetadata, detectImageKind } from "./imageMeta";

// 작은 합성 파일로 컨테이너 조각 처리만 본다(픽셀 디코딩은 안 한다 — 들어내는 쪽이 픽셀을 건드리지 않으니까).
const u32le = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u32be = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u16be = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };

function webpChunk(fourcc: string, payload: Buffer) {
    const pad = payload.length & 1 ? Buffer.from([0]) : Buffer.alloc(0);
    return Buffer.concat([Buffer.from(fourcc, "ascii"), u32le(payload.length), payload, pad]);
}
function webp(chunks: Buffer[]) {
    const body = Buffer.concat(chunks);
    return Buffer.concat([Buffer.from("RIFF"), u32le(4 + body.length), Buffer.from("WEBP"), body]);
}
const GPS = Buffer.from("GPSLatitude 37.5665 N");

describe("WebP", () => {
    it("EXIF·XMP 조각을 빼고 VP8X 표시 비트를 끈다, 그림 조각은 그대로", () => {
        const vp8x = Buffer.alloc(10); vp8x[0] = 0x08 | 0x04 | 0x10; // EXIF + XMP + 알파
        const vp8 = Buffer.from([1, 2, 3, 4, 5]); // 홀수 길이 — 채움 바이트
        const src = webp([webpChunk("VP8X", vp8x), webpChunk("VP8 ", vp8), webpChunk("EXIF", GPS), webpChunk("XMP ", Buffer.from("<x/>"))]);
        const out = stripImageMetadata(src);
        expect(out.type).toBe("webp");
        expect(out.removed).toBe(2);
        expect(out.buffer.includes(GPS)).toBe(false);
        expect(out.buffer.toString("ascii", 0, 4)).toBe("RIFF");
        expect(out.buffer.readUInt32LE(4)).toBe(out.buffer.length - 8);
        expect(out.buffer[20] & 0x0c).toBe(0); // VP8X 첫 바이트(12 + 8)
        expect(out.buffer[20] & 0x10).toBe(0x10); // 알파 표시는 남는다
        expect(out.buffer.includes(vp8)).toBe(true);
    });
    it("메타가 없는 캔버스 출력은 바이트 그대로", () => {
        const src = webp([webpChunk("VP8 ", Buffer.from([9, 9, 9, 9]))]);
        const out = stripImageMetadata(src);
        expect(out.removed).toBe(0);
        expect(out.buffer.equals(src)).toBe(true);
    });
});

describe("JPEG", () => {
    const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), u16be(payload.length + 2), payload]);
    it("APP1(EXIF)·COM·꼬리 보조 사진을 빼고 JFIF·ICC·압축 데이터는 둔다", () => {
        const jfif = seg(0xe0, Buffer.from("JFIF\0"));
        const icc = seg(0xe2, Buffer.from("ICC_PROFILE\0"));
        const exif = seg(0xe1, Buffer.concat([Buffer.from("Exif\0\0"), GPS]));
        const com = seg(0xfe, Buffer.from("hello"));
        const dqt = seg(0xdb, Buffer.alloc(5, 1));
        const sos = seg(0xda, Buffer.alloc(3, 2));
        const scan = Buffer.from([0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33]); // 채움·RST 포함
        const trailer = Buffer.concat([Buffer.from([0xff, 0xd8]), exif, Buffer.from([0xff, 0xd9])]); // 덧붙은 보조 사진
        const src = Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, exif, icc, com, dqt, sos, scan, Buffer.from([0xff, 0xd9]), trailer]);
        const out = stripImageMetadata(src);
        expect(out.type).toBe("jpeg");
        expect(out.buffer.includes(GPS)).toBe(false);
        expect(out.buffer.includes(Buffer.from("hello"))).toBe(false);
        expect(out.buffer.includes(jfif)).toBe(true);
        expect(out.buffer.includes(icc)).toBe(true);
        expect(out.buffer.includes(Buffer.concat([sos, scan, Buffer.from([0xff, 0xd9])]))).toBe(true);
        expect(out.buffer.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    });
    it("프로그레시브(SOS 여러 번) 사이의 표지도 읽는다", () => {
        const sos = seg(0xda, Buffer.alloc(3, 2));
        const exif = seg(0xe1, GPS);
        const src = Buffer.concat([Buffer.from([0xff, 0xd8]), sos, Buffer.from([1, 2]), seg(0xc4, Buffer.alloc(4)), exif, sos, Buffer.from([3]), Buffer.from([0xff, 0xd9])]);
        const out = stripImageMetadata(src);
        expect(out.buffer.includes(GPS)).toBe(false);
        expect(out.removed).toBe(1);
    });
});

describe("PNG", () => {
    const chunk = (type: string, data: Buffer) => Buffer.concat([u32be(data.length), Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
    it("eXIf·tEXt 를 빼고 IHDR·IDAT·IEND 는 둔다", () => {
        const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const ihdr = chunk("IHDR", Buffer.alloc(13));
        const idat = chunk("IDAT", Buffer.from([7, 7, 7]));
        const src = Buffer.concat([sig, ihdr, chunk("eXIf", GPS), chunk("tEXt", Buffer.from("Comment\0hi")), idat, chunk("IEND", Buffer.alloc(0))]);
        const out = stripImageMetadata(src);
        expect(out.type).toBe("png");
        expect(out.removed).toBe(2);
        expect(out.buffer.includes(GPS)).toBe(false);
        expect(out.buffer.includes(idat)).toBe(true);
    });
});

describe("모르는 것·깨진 것", () => {
    it("형식을 모르면 type null 로 원본", () => {
        const src = Buffer.from("not an image");
        expect(detectImageKind(src)).toBeNull();
        const out = stripImageMetadata(src);
        expect(out.type).toBeNull();
        expect(out.buffer).toBe(src);
    });
    it("조각 길이가 파일을 넘으면 type null", () => {
        const src = Buffer.concat([Buffer.from("RIFF"), u32le(100), Buffer.from("WEBP"), Buffer.from("VP8 "), u32le(999)]);
        expect(stripImageMetadata(src).type).toBeNull();
    });
});
