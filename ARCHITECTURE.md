# Echo — Architecture

> KIT 바이브코딩 공모전 2026 출품작
> 최종 제출: 2026-04-13

---

## 1. 제품 개요

**Echo**는 학생이 AI를 가르치며 메타인지를 훈련하는 학습 플랫폼이다.
기존 AI 에듀테크의 "AI → 학생" 방향을 뒤집어, **"학생 → AI" 방향의 역전학습**을 제공한다.

### 핵심 가치 제안

- **역전학습 (Protégé Effect)**: 학생이 AI에게 설명하면서 스스로 개념을 깊이 이해함
- **오답 원인 분석**: 오답의 원인을 몇 년 전 선수개념까지 역추적
- **숨은 질문 탐지**: 질문하지 못하는 학생의 행동 신호를 자동 포착하여 교강사에게 전달

### 타겟 사용자

- 1차: 중고등 수학 학습자 (중2 ~ 고1 함수·방정식 범위)
- 부가: 교강사 (대시보드로 학생들의 오개념 분포 파악)

### 심사 기준 매핑

| 심사 기준 | 대응 전략 |
|---|---|
| 기술적 완성도 | 멀티 에이전트 + 지식 그래프 + 행동 분석 + 실시간 대시보드 풀스택 구현 |
| AI 활용 능력 | Claude Opus 4.6 기반 에이전트 3종, 역할별 프롬프트 분리, 구조화 출력 |
| 실무 접합성 | 학원·공교육·MOOC 적용 가능, B2B2C SaaS BM |
| 창의성 | 학생이 AI를 가르치는 역전학습 패러다임 + 오개념 원인 추적 |

---

## 2. 기술 스택

### Frontend (`web/`)

- **React 18** + **TypeScript**
- **Vite 6** (빌드 도구)
- **Tailwind CSS v4** (CSS-first 토큰 방식, `@theme` 디렉티브)
- **React Router v7** (페이지 라우팅)
- **React Flow** (지식 그래프 시각화 — 추후 도입)

### Backend (`api/`)

- **Cloudflare Workers** (엣지 런타임)
- **Hono** (라우터)
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude Opus 4.6 호출

### 인프라 (Cloudflare)

| 서비스 | 용도 |
|---|---|
| Pages | 프론트엔드 정적 호스팅 |
| Workers | API 엣지 실행 |
| D1 | 관계형 데이터 (SQLite) |
| R2 | 파일 저장 (학생 풀이 이미지, AI 리포트 PDF 등) |
| Vectorize | 학습 프로필 임베딩, 유사 학생 클러스터링 (추후) |

### AI

- **Claude Opus 4.6** (`claude-opus-4-6`) — 3개 에이전트 공통 모델
- 온도·시스템 프롬프트·도구 사용으로 역할 분리

### 개발 도구

- **Node.js 20+**
- **npm workspaces** (모노레포)
- **Wrangler 4.x** (Cloudflare CLI)
- **Playwright** (UI 검증용 스크린샷)

---

## 3. 시스템 아키텍처

### 전체 구조도

```
┌──────────────────────────────────────────────────────┐
│  Cloudflare Pages                                    │
│  React + Vite + Tailwind v4 + TypeScript             │
│  - 랜딩 / 학습 UI / 교강사 대시보드 / 그래프 뷰      │
└──────────────────┬───────────────────────────────────┘
                   │ fetch /api/*
┌──────────────────▼───────────────────────────────────┐
│  Cloudflare Worker (echo-api)                        │
│  Hono 라우터                                          │
│  - /api/chat        MirrorMind 대화                  │
│  - /api/diagnose    오개념 원인 역추적               │
│  - /api/signals     행동 신호 수집·번역              │
│  - /api/genealogy   지식 그래프 조회                 │
│  - /api/teacher     교강사 대시보드 데이터           │
└──┬──────────┬──────────┬──────────┬──────────────────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
┌─────┐  ┌────────┐  ┌──────────┐  ┌──────────────┐
│ D1  │  │   R2   │  │ Vectorize│  │ Claude API   │
│(SQL)│  │(files) │  │(embed.)  │  │ (3 agents)   │
└─────┘  └────────┘  └──────────┘  └──────────────┘
```

### 학습 파이프라인 (순차 처리)

```
[학생 학습 활동]
      │
      │ (행동 로그 업로드)
      ▼
[Agent 1: Whisper (숨은 질문 탐지기)]
 - 입력: 스크롤 패턴, 체류시간, 오답 이력
 - 출력: "학생이 하고 싶었던 질문"
      │
      │ (오답 누적 시)
      ▼
[Agent 2: Tracer (오답 원인 분석기)]
 - 입력: 오답 + 풀이 과정
 - 처리: 지식 DAG 역방향 BFS + Claude 추론
 - 출력: 오개념 원인 개념 ID
      │
      │ (치료 세션 시작)
      ▼
[Agent 3: MirrorMind (설명 학습 파트너)]
 - 입력: 학생 학습 프로필 + 대상 개념
 - 처리: 과거 오개념 페르소나를 재현하며 질문
 - 출력: 실시간 대화 + 이해도 게이지
      │
      ▼
[결과 저장 + 교강사 대시보드 갱신]
```

---

## 4. 디렉토리 구조

```
KIT_hackathon/
├── package.json                    # npm workspaces 루트
├── tsconfig.base.json              # 공통 TS 설정
├── ARCHITECTURE.md                 # 본 문서
├── README.md
├── CLAUDE.md                       # 코드 스타일 규칙
│
├── web/                            # 프론트엔드 (Cloudflare Pages)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── Landing.tsx         # 랜딩 페이지
│       │   ├── Learn.tsx           # 학생 학습 화면 (MirrorMind 채팅)
│       │   ├── Genealogy.tsx       # 오개념 원인 그래프
│       │   └── Teacher.tsx         # 교강사 대시보드
│       ├── components/
│       │   ├── Navbar.tsx
│       │   ├── Logo.tsx
│       │   ├── Hero.tsx
│       │   ├── Layers.tsx          # How-it-works 섹션
│       │   ├── MirrorChat.tsx      # 역전학습 채팅 UI
│       │   ├── UnderstandingBar.tsx # 이해도 게이지
│       │   └── ConceptGraph.tsx    # React Flow 래퍼
│       ├── lib/
│       │   └── api.ts              # fetch 래퍼
│       └── styles/
│           └── global.css          # Tailwind v4 @theme 정의
│
├── api/                            # 백엔드 (Cloudflare Worker)
│   ├── package.json
│   ├── wrangler.toml               # Worker·D1·R2 바인딩
│   ├── tsconfig.json
│   ├── .dev.vars.example
│   ├── migrations/
│   │   └── 0001_init.sql           # D1 스키마
│   └── src/
│       ├── index.ts                # Hono 라우터 엔트리
│       ├── routes/
│       │   ├── chat.ts             # MirrorMind 대화 API
│       │   ├── diagnose.ts         # 원인 역추적 API
│       │   ├── signals.ts          # 행동 신호 API
│       │   ├── genealogy.ts        # 그래프 조회 API
│       │   └── teacher.ts          # 대시보드 API
│       ├── agents/
│       │   ├── mirrorMind.ts       # MirrorMind 프롬프트·로직
│       │   ├── tracer.ts           # Tracer 원인 분석 프롬프트·로직
│       │   └── whisper.ts          # Whisper 숨은 질문 탐지 프롬프트·로직
│       ├── db/
│       │   ├── queries.ts          # D1 쿼리 헬퍼
│       │   └── types.ts            # 테이블 타입 정의
│       └── lib/
│           └── claude.ts           # Anthropic SDK 래퍼
│
└── seed/                           # 시드 데이터 (추후 추가)
    ├── package.json
    ├── math-middle-high.json       # 중고등 수학 지식 그래프
    └── scripts/
        └── load.ts                 # D1에 시드 데이터 로드
```

---

## 5. 데이터 모델 (D1 스키마)

### 5.1 사용자 & 인증

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('student', 'teacher', 'admin')),
  created_at INTEGER DEFAULT (unixepoch())
);
```

### 5.2 지식 그래프 (DAG)

```sql
CREATE TABLE concepts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- 예: "일차함수의 그래프"
  subject TEXT NOT NULL,           -- 예: "수학"
  grade TEXT NOT NULL,             -- 예: "중2"
  description TEXT,
  common_misconceptions TEXT       -- JSON 배열
);

CREATE TABLE concept_edges (
  parent_id TEXT NOT NULL,         -- 선수 개념
  child_id TEXT NOT NULL,          -- 후속 개념
  weight REAL DEFAULT 1.0,         -- 의존 강도
  PRIMARY KEY (parent_id, child_id),
  FOREIGN KEY (parent_id) REFERENCES concepts(id),
  FOREIGN KEY (child_id) REFERENCES concepts(id)
);

CREATE INDEX idx_edges_child ON concept_edges(child_id);
CREATE INDEX idx_edges_parent ON concept_edges(parent_id);
```

### 5.3 학습 기록

```sql
CREATE TABLE solutions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  problem TEXT NOT NULL,
  student_answer TEXT,
  correct_answer TEXT,
  is_correct INTEGER,              -- 0/1
  reasoning_trace TEXT,            -- 풀이 사고 과정 (CoT)
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);

CREATE INDEX idx_solutions_student ON solutions(student_id);
CREATE INDEX idx_solutions_concept ON solutions(concept_id);
```

### 5.4 탐지된 오개념

```sql
CREATE TABLE misconceptions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  root_concept_id TEXT NOT NULL,     -- 오개념 원인 개념
  symptom_concept_id TEXT NOT NULL,  -- 증상 발현 개념
  description TEXT,
  confidence REAL,                   -- 0-1
  resolved INTEGER DEFAULT 0,
  detected_at INTEGER DEFAULT (unixepoch())
);
```

### 5.5 역전학습 세션

```sql
CREATE TABLE mirror_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  target_concept_id TEXT NOT NULL,
  mirror_persona TEXT,               -- JSON: AI가 연기할 페르소나 스펙
  understanding_level REAL DEFAULT 0, -- 0-100
  completed INTEGER DEFAULT 0,
  started_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE mirror_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT CHECK(role IN ('student', 'mirror')),
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (session_id) REFERENCES mirror_sessions(id)
);
```

### 5.6 행동 신호

```sql
CREATE TABLE behavior_signals (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  signal_type TEXT,                -- scroll_back | long_dwell | delete_typing | ...
  context TEXT,                    -- JSON
  concept_id TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE translated_questions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  inferred_question TEXT NOT NULL,
  confidence REAL,
  confirmed INTEGER,               -- 학생 확인 여부
  sent_to_teacher INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## 6. API 설계

### 6.1 엔드포인트 일람

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/chat/sessions` | 역전학습 세션 생성 |
| POST | `/api/chat/sessions/:id/messages` | 세션에 메시지 전송 (SSE 스트리밍) |
| GET  | `/api/chat/sessions/:id` | 세션 조회 (이해도 포함) |
| POST | `/api/diagnose` | 오답 제출 → 원인 역추적 |
| GET  | `/api/misconceptions/:studentId` | 학생의 오개념 목록 |
| POST | `/api/signals` | 행동 신호 기록 |
| POST | `/api/signals/translate` | 신호 → 질문 번역 |
| GET  | `/api/genealogy/:conceptId` | 개념 주변 그래프 조회 |
| GET  | `/api/teacher/heatmap` | 반별 오개념 히트맵 |

### 6.2 주요 요청·응답 예시

**POST `/api/chat/sessions/:id/messages`** (SSE)

```ts
// Request
{ "content": "일차함수의 기울기는 y값의 변화량이야" }

// Response (stream)
event: token
data: { "delta": "어" }

event: understanding
data: { "level": 42 }

event: done
data: { "message_id": "msg_..." }
```

**POST `/api/diagnose`**

```ts
// Request
{
  "student_id": "u_123",
  "concept_id": "c_linear_graph",
  "wrong_answer": "기울기 = y/x",
  "reasoning": "y값 나누기 x값이면 될 줄 알았어요"
}

// Response
{
  "root_concept_id": "c_ratio_middle1",
  "path": ["c_linear_graph", "c_slope", "c_ratio_middle1"],
  "description": "비례 개념에서 '변화량'과 '값 자체'를 혼동함",
  "confidence": 0.87
}
```

---

## 7. AI 에이전트 설계

### 7.1 Agent 1: Whisper (숨은 질문 탐지기)

**역할**: 학생의 미세 행동 로그 → "하고 싶었던 질문" 자연어 생성

**입력**:
- 최근 행동 이벤트 (스크롤백, 긴 체류, 삭제·재입력, 오답 패턴)
- 현재 학습 중인 개념 컨텍스트

**프롬프트 전략**:
- 시스템: "너는 학생의 행동 로그를 분석해 암묵적 질문을 추론한다"
- Few-shot: 신호 → 질문 매핑 예시 3~5개
- 출력: JSON `{ question, confidence, reasoning }`

**호출 시점**: 학생 체류 시간 임계치 초과 시 + 오답 직후

### 7.2 Agent 2: Tracer (오답 원인 분석기)

**역할**: 오답과 풀이 과정 → 오개념 원인 개념 탐지

**입력**:
- 오답 문제, 학생 답, 정답, 풀이 흐름
- 개념 그래프 스냅샷 (해당 개념의 선수 개념 트리)

**처리**:
1. DAG 역방향 BFS로 선수 개념 후보 추출
2. Claude에게 후보군 중 어느 개념에서 오개념이 시작됐는지 추론 요청
3. 신뢰도 0.7 이상인 경우에만 `misconceptions` 테이블 기록

**출력**: `{ root_concept_id, path[], description, confidence }`

### 7.3 Agent 3: MirrorMind (설명 학습 파트너)

**역할**: 과거 오개념 페르소나를 재현하며 학생에게 질문·의문을 제기

**입력**:
- 학생 학습 프로필 (과거 오답·오개념·표현 습관)
- 대상 학습 개념
- 대화 히스토리

**프롬프트 전략**:
- 시스템: "너는 이 학생이 3개월 전 가졌던 오개념을 그대로 가진 후배다. 답을 주지 말고, 이해가 안 되는 척하며 질문하라"
- 페르소나 스펙을 동적 주입 (학생별 학습 프로필 기반)
- 매 턴 이해도 평가: `{ reply, understanding_delta }` 형식으로 구조화 출력

**이해도 게이지 계산**:
- 학생 설명의 **정확성·깊이·사례 제시 여부**를 Claude가 0~5 점수로 평가
- 누적 점수 → 0~100 게이지로 변환
- 80 이상 도달 시 세션 완료

---

## 8. 프론트엔드 구조

### 8.1 페이지 구성

| 경로 | 페이지 | 역할 |
|---|---|---|
| `/` | Landing | 제품 소개 (Hero + Layers + Research + CTA) |
| `/learn` | Learn | 학생 학습 화면 (MirrorChat + 이해도 바) |
| `/genealogy/:id` | Genealogy | 오개념 원인 그래프 (React Flow) |
| `/teacher` | Teacher | 교강사 대시보드 (히트맵 + 번역된 질문) |

### 8.2 디자인 시스템

**Tokens** (`web/src/styles/global.css`, `@theme` 디렉티브):

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-ink` | `#0A0A0A` | 주요 텍스트, 버튼 |
| `--color-paper` | `#FAFAF7` | 배경 |
| `--color-clay` | `#8B6F47` | 악센트 (앰버) |
| `--color-grain` | `#E8E6DF` | 보더, 구분선 |
| `--font-display` | Instrument Serif | 로고·헤드라인 |
| `--font-sans` | Inter | 본문 |
| `--font-mono` | JetBrains Mono | 코드·레이블 |

**톤**: 화이트 + 아카데믹, Notion/Superhuman 계열 프리미엄 에듀테크

---

## 9. 배포

### 9.1 환경 변수

```
# api/.dev.vars (로컬)
ANTHROPIC_API_KEY=sk-ant-...

# 프로덕션 (wrangler secret put)
wrangler secret put ANTHROPIC_API_KEY
```

### 9.2 배포 명령

```bash
# Worker API
npm run deploy:api
# → echo-api.<account>.workers.dev

# Pages 프론트
npm run deploy:web
# → echo-web.pages.dev
```

### 9.3 D1 세팅

```bash
# DB 생성 (최초 1회)
wrangler d1 create echo-db
# → wrangler.toml의 database_id 업데이트

# 마이그레이션
npm run db:migrate:remote

# 시드 로드
npm run db:seed:remote
```

---

## 10. 개발 로드맵 (2026-04-06 ~ 04-13)

| 단계 | 내용 | 상태 |
|---|---|---|
| 스캐폴딩 | 모노레포 + Cloudflare 바인딩 + 디자인 토큰 | 진행 중 |
| 랜딩 UI | Hero, Layers, Research, CTA, Footer | 부분 완료 |
| D1 스키마 | 마이그레이션 + 테이블 생성 | 예정 |
| 시드 데이터 | 중2~고1 수학 개념 30~50개 + DAG | 예정 |
| API 라우터 | Hono + Claude 클라이언트 | 예정 |
| MirrorMind | 프롬프트·세션·이해도 게이지·채팅 UI | 예정 |
| Tracer | 역추적 알고리즘 + 원인 그래프 시각화 | 예정 |
| Whisper | 행동 신호 수집·분석 | 선택 |
| 교강사 대시보드 | 오개념 히트맵 + 질문 리스트 | 예정 |
| 배포 | Pages + Workers 프로덕션 | 예정 |
| AI 리포트 | 공모전 제출용 PDF 작성 | 예정 |

---

## 11. 위험 요소 및 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| Claude API 레이턴시 | 채팅 UX 저하 | SSE 스트리밍 + 로딩 상태 세분화 |
| 학습 프로필 데이터 부족 (MVP) | MirrorMind 품질 저하 | 시연용 하드코딩 페르소나 준비 |
| 지식 그래프 구축 비용 | 개발 지연 | 중2~고1 좁은 범위로 한정, JSON 시드 |
| Cloudflare 무료 티어 제한 | 시연 중 장애 | 요청 캐싱, 지연 응답 준비 |
| API Key 노출 | 탈락 사유 | `.dev.vars` / `wrangler secret` 분리, `.gitignore` 강제 |

---

## 12. 제출 체크리스트

- [ ] GitHub public 저장소 (API Key 노출 없음)
- [ ] Cloudflare Pages 라이브 URL
- [ ] AI 리포트 PDF
- [ ] 개인정보 동의서 + 참가 각서 PDF
- [ ] 제출 기한(2026-04-13) 이후 커밋 없음
