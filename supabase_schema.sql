-- ============================================================
--  CG 스튜디오 · Supabase 초기 설정 SQL
--  Supabase 대시보드 → 왼쪽 "SQL Editor" → New query 에 붙여넣고 RUN 하세요.
--  (한 번만 실행하면 됩니다)
-- ============================================================

-- 1) 프로젝트(덱) 저장 테이블 : 방(room)별로 슬라이드 배열을 JSON으로 보관
create table if not exists public.projects (
  room       text primary key,
  data       jsonb not null default '{"slides":[]}',
  updated_at timestamptz not null default now()
);

-- 2) RLS(행 보안) 켜기 + 익명(anon) 읽기/쓰기 허용
--    (사내 도구 MVP 기준. 나중에 로그인 붙이면 정책을 좁히면 됩니다)
alter table public.projects enable row level security;

drop policy if exists "anon read projects"  on public.projects;
drop policy if exists "anon write projects" on public.projects;
drop policy if exists "anon update projects" on public.projects;

create policy "anon read projects"   on public.projects for select using (true);
create policy "anon write projects"  on public.projects for insert with check (true);
create policy "anon update projects" on public.projects for update using (true) with check (true);

-- 3) 이미지 저장용 Storage 버킷 'cg' (공개)
--    ※ 대시보드 Storage 에서 New bucket → 이름 cg, Public 체크 로 만들어도 됩니다.
insert into storage.buckets (id, name, public)
values ('cg','cg', true)
on conflict (id) do update set public = true;

-- 4) 버킷 정책 : 익명 업로드/조회 허용
drop policy if exists "cg public read"   on storage.objects;
drop policy if exists "cg anon upload"    on storage.objects;
drop policy if exists "cg anon update"    on storage.objects;

create policy "cg public read" on storage.objects
  for select using ( bucket_id = 'cg' );
create policy "cg anon upload" on storage.objects
  for insert with check ( bucket_id = 'cg' );
create policy "cg anon update" on storage.objects
  for update using ( bucket_id = 'cg' ) with check ( bucket_id = 'cg' );

-- 완료. (실시간 협업은 앱이 Realtime 채널 broadcast 로 처리하므로 추가 설정이 필요 없습니다.)
