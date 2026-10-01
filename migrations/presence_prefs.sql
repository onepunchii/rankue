-- 친구·크루 접속 알림 설정(2026-10-01) — 받기(receive)·보내기(share), 둘 다 기본 켜짐. 행이 없으면 둘 다 켜짐으로 본다. 덧붙이기만 한다.
CREATE TABLE IF NOT EXISTS hiq_presence_prefs (
    member_id uuid PRIMARY KEY REFERENCES hiq_members(id),
    share boolean NOT NULL DEFAULT true,
    receive boolean NOT NULL DEFAULT true,
    updated_at timestamp NOT NULL DEFAULT now()
);
