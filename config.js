/* ============================================================
   config.js — 배포 설정
   · 이 파일을 열어 아래 두 값을 여러분의 Supabase 프로젝트 값으로 바꾸면
     "클라우드 모드"(여러 명 실시간 협업 + 저장)로 켜집니다.
   · 비워두면(현재 상태) "로컬 모드"로 동작합니다
     (같은 브라우저의 다른 탭끼리만 협업 — 배포 전 테스트용).
   · 여기 들어가는 anon 키는 "공개용" 키라 프론트에 노출돼도 안전합니다.
     ★ Claude API 키는 절대 여기 넣지 마세요 — 그건 Vercel 환경변수(ANTHROPIC_API_KEY)로만 넣습니다.
   ============================================================ */
window.CG_CONFIG = {
  SUPABASE_URL:  https://lyqodvfvkrpltlcxnpgm.supabase.co/rest/v1/
  SUPABASE_ANON: sb_publishable_FhI3qo8aPTtU6LiiThtOEQ_ZKlxSNmV
};
