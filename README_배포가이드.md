# CG 스튜디오 — 배포 가이드 (무료 계정으로 실제 사이트 만들기)

한경글로벌TV · 머니플러스 CG 스튜디오를 **인터넷 주소가 있는 실제 사이트**로 올리는 방법입니다.
따라 하면 팀원 누구나 링크로 들어와 **실시간으로 같이 배치·수정하고, 의뢰판에 CG를 요청하면 Claude가 우리 킷 규격으로 그려 덱에 꽂아주고, 송출**까지 됩니다.

전체 30~40분이면 끝납니다. 순서대로만 하시면 됩니다.

---

## 0. 준비물 (무료)

세 가지 계정만 만들면 됩니다. 카드 등록 없이 무료입니다.

1. **GitHub** — 코드를 올려두는 곳 (https://github.com)
2. **Vercel** — 사이트를 인터넷에 띄우는 곳 (https://vercel.com) — GitHub로 로그인 가능
3. **Supabase** — 실시간 협업 + 저장 담당 (https://supabase.com) — GitHub로 로그인 가능
4. **Claude API 키** — 의뢰판의 AI 생성용 (https://console.anthropic.com) — 이건 사용량만큼 소액 과금(선불 충전식)

> 지금 이 폴더(`cg-site`)를 그대로 압축해서 드렸습니다. 아래 단계에서 이 폴더를 통째로 올립니다.

---

## 1. Supabase 만들기 (실시간·저장)

1. https://supabase.com 접속 → **Start your project** → GitHub로 로그인
2. **New project** 클릭
   - Organization: 아무거나 (없으면 자동 생성)
   - Name: `cg-studio`
   - Database Password: 아무 비밀번호나 (적어두기)
   - Region: **Northeast Asia (Seoul)** 선택 (빠릅니다)
   - **Create new project** → 1~2분 기다립니다
3. 프로젝트가 생기면 왼쪽 메뉴 **SQL Editor** → **New query**
   - 드린 파일 `supabase_schema.sql` 내용을 전부 복사해 붙여넣고 오른쪽 **Run** ▶
   - "Success" 나오면 완료 (테이블 + 이미지 저장소 + 권한이 한 번에 만들어집니다)
4. 왼쪽 **Project Settings**(톱니바퀴) → **API** 메뉴에서 아래 두 값을 복사해 둡니다:
   - **Project URL** — 예) `https://abcdxyz.supabase.co`
   - **anon public** 키 — 아주 긴 문자열 (`eyJ...`로 시작)

> 이 두 값은 "공개용"이라 사이트에 넣어도 안전합니다.

---

## 2. config.js 에 값 채우기

드린 폴더의 **`config.js`** 파일을 메모장/텍스트편집기로 열고, 1번에서 복사한 두 값을 넣습니다:

```js
window.CG_CONFIG = {
  SUPABASE_URL:  "https://abcdxyz.supabase.co",   // ← 여기에 Project URL
  SUPABASE_ANON: "eyJhbGciOiJI......"              // ← 여기에 anon public 키
};
```

저장하면 끝. (Claude 키는 절대 여기 넣지 않습니다 — 3-D에서 따로 넣습니다.)

---

## 3. Vercel에 올려서 사이트 띄우기

### A. GitHub에 폴더 올리기
1. https://github.com → 로그인 → 우측 상단 **＋** → **New repository**
2. Repository name: `cg-studio` → **Private** 선택 → **Create repository**
3. 만들어진 페이지에서 **uploading an existing file** 링크 클릭
4. 드린 `cg-site` 폴더 **안의 파일 전체**(index.html, app.js, kit-render.js, config.js, api 폴더 등)를 드래그해 올리고 **Commit changes**

### B. Vercel에 연결
1. https://vercel.com → **Sign up** → **Continue with GitHub**
2. **Add New… → Project** → 방금 만든 `cg-studio` 저장소 **Import**
3. 설정은 건드릴 것 없이 (Framework Preset: **Other** 그대로) → **Deploy**
4. 1분쯤 뒤 배포 완료 → `https://cg-studio-xxxx.vercel.app` 같은 주소가 나옵니다

### C. (아직 열지 마세요) Claude 키 넣기
1. Vercel 프로젝트 화면 상단 **Settings** → 왼쪽 **Environment Variables**
2. 아래 한 개를 추가:
   - Name: `ANTHROPIC_API_KEY`
   - Value: (Anthropic 콘솔에서 발급한 `sk-ant-...` 키)
   - **Save**
3. (선택) 모델을 바꾸고 싶으면 `CLAUDE_MODEL` 도 추가 (기본값 `claude-3-5-sonnet-latest`)

### D. Claude API 키 발급 (아직 없다면)
1. https://console.anthropic.com → 로그인
2. **Settings → Billing** 에서 소액(예: $5) 충전
3. **API Keys → Create Key** → 생성된 `sk-ant-...` 를 위 3-C 에 붙여넣기

### E. 다시 배포 (환경변수 반영)
- Vercel 프로젝트 **Deployments** 탭 → 맨 위 배포 오른쪽 **⋯ → Redeploy** → **Redeploy**
- 이걸 해야 방금 넣은 Claude 키가 적용됩니다.

---

## 4. 다 됐습니다 — 써보기

- 배포된 주소(`https://cg-studio-xxxx.vercel.app`)를 엽니다.
- 좌상단 태그가 **로컬**이 아니라 **클라우드** 로 뜨면 성공입니다.
- 상단 **🔗 초대링크** 를 눌러 팀원에게 보내면, 같이 들어와 **실시간으로** 슬라이드를 옮기고 커서가 보이고 의뢰판을 공유합니다.
- 오른쪽 **의뢰판**에 "SK하이닉스 최근 4분기 매출·영업이익 그룹막대" 처럼 적고 **의뢰 보내기 → 🤖 AI 생성** → Claude가 킷 규격 CG를 그려 덱에 꽂습니다. 이미지·파일 첨부도 됩니다(원본을 얹지 않고 내용만 재작도).
- **▶ 송출** 로 전체화면 발표, **📄 PPT / 🖼 이미지** 로 내보내기.

### 방(room) 나누기
- 주소 뒤에 `?room=이름` 을 붙이면 팀/프로그램별로 방이 갈립니다.
  예) `.../?room=today0808` — 같은 방에 들어온 사람끼리만 협업/저장됩니다. (기본 방: `moneyplus`)

---

## 자주 묻는 것

**Q. 좌상단이 계속 "로컬"이에요.**
→ `config.js` 의 두 값이 비었거나 오타입니다. 값 확인 후 GitHub에 다시 올리면(파일 교체) Vercel이 자동 재배포합니다.

**Q. AI 생성을 눌렀는데 안 만들어져요(또는 안내용 카드만 나와요).**
→ ① Vercel에 `ANTHROPIC_API_KEY` 를 넣고 **Redeploy** 했는지, ② Anthropic 콘솔에 잔액이 있는지 확인하세요. 키가 없어도 사이트는 "데모 카드"로 동작하니 협업/송출 테스트는 가능합니다.

**Q. 폰트가 방송 서체(G마켓)가 아니에요.**
→ 인터넷이 되면 자동으로 G마켓 산스 웹폰트를 불러옵니다. 사내망에서 차단되면 시스템 기본서체로 대체됩니다(레이아웃은 동일).

**Q. 최고 화질 방송용 마스터는요?**
→ 지금처럼 저(Claude)와의 대화로 요청하시면 `render_cg.js` 킷으로 **PPTX 원본(픽셀 단위 정밀)**을 만들어 드립니다. 사이트의 AI 생성은 **현장에서 빠르게** 킷 룩으로 뽑는 용도라, 두 경로를 함께 쓰시면 됩니다(합의한 A안).

---

## 폴더 구성 (참고)

```
cg-site/
├─ index.html          화면(UI)
├─ app.js              협업·의뢰판·송출·내보내기 로직 (Supabase 연결)
├─ kit-render.js       방송 킷 규격 CG 렌더러 (남색헤더/흰카드/티커 안전지대/G마켓)
├─ config.js           ← 여기에 Supabase URL/anon 키 (2단계)
├─ api/
│   └─ generate.js     Claude 프록시(서버) — 킷 규격 CG 스펙 생성
├─ supabase_schema.sql Supabase 초기 설정 SQL (1단계)
├─ vercel.json         배포 설정
└─ package.json
```
