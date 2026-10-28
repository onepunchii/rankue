/**
 * 쇼츠 스크립트용 DB 연결 — 읽기 전용.
 * created_at 같은 timestamp(시간대 없음)는 서버(Neon)가 UTC 로 적은 값이다. node-pg 는 이를 **실행하는 기계의 현지 시각**으로
 * 읽어서, 맥(KST)에서는 9시간 어긋났다(2026-10-29: 맥에서 만든 영상의 날짜가 틀림). UTC 로 읽게 고정한다.
 */
import pg from "pg";

pg.types.setTypeParser(1114, (s: string) => new Date(`${s.replace(" ", "T")}Z`));

export async function readOnlyDb(): Promise<pg.Client> {
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query("SET default_transaction_read_only = on");
    return db;
}
