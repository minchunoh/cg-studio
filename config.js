/* ============================================================
   config.js — 배포 설정 (한경글로벌TV CG 스튜디오)
   · 아래 두 값이 채워져 있으면 "클라우드 모드"(실시간 협업 + 저장)로 동작합니다.
   · anon/publishable 키는 공개용이라 노출돼도 안전합니다.
   · ★ Claude API 키(sk-ant-)는 절대 여기 넣지 마세요 — Vercel 환경변수(ANTHROPIC_API_KEY)로만.
   ============================================================ */
window.CG_CONFIG = {
  SUPABASE_URL:  "https://lyqodvfvkrpltlcxnpgm.supabase.co",
  SUPABASE_ANON: "sb_publishable_FhI3qo8aPTtU6LiiThtOEQ_ZKlxSNmV"
};
