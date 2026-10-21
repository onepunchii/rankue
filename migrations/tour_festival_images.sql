-- 전국 축제의 사진 더 보기(2026-10-21) — 한국관광공사 TourAPI detailImage2 의 사진들(공공누리 제1 · 3유형만). 규칙은 shared/festivals festivalImagesFromTour.
-- 더하기만 한다(칸 둘). 배포 **전에** 먼저 돌린다. 제3유형은 자르거나 고치지 않는다 — 주소만 저장하고 화면은 원본 비율로 그린다.
-- 되돌릴 때: alter table tour_festivals drop column images; alter table tour_festivals drop column images_at;
alter table tour_festivals add column if not exists images jsonb;
alter table tour_festivals add column if not exists images_at timestamp;
