# Trợ lý AI hỗ trợ học sinh THCS tự học Toán

Web app gợi mở từng bước (step-by-step scaffolding). MVP: phương trình bậc nhất một ẩn.
Stack: FastAPI + SQLite (backend), Claude Haiku 5.5 (AI, tùy chọn), Next.js + TypeScript + Tailwind + KaTeX (frontend, giai đoạn 4).

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Database, migration, repository | **Hoàn thành** — xem `docs/PHASE1_REPORT.md` |
| 2 | MathChecker, LearningStateMachine, HintPolicy, phản hồi mẫu, xóa dữ liệu D5 | **Hoàn thành** — xem `docs/PHASE2_REPORT.md` |
| 3 | FastAPI (60 endpoint), xác thực lai JWT + Google, TutorAI (Claude Haiku 5.5) + guard/quota/fallback, nghiên cứu/export, backup mã hóa | **Hoàn thành** — xem `docs/PHASE3_REPORT.md` |
| 4 | Giao diện Next.js, E2E | Chưa bắt đầu |

## Cấu trúc

```
api/app/domain/                      errors, enums; math/ (parser, MathChecker); learning/ (state machine, HintPolicy, leak guard)
api/app/application/                 SessionService, AIFeedbackService, AuthService
api/app/api/                         FastAPI: routers auth/student/teacher/research/admin, idempotency
api/app/infrastructure/sqlite/       connection factory, migration runner, CLI
api/app/infrastructure/sqlite/repositories/   users, classes, content, assignments,
                                     sessions, hints, assessments, reports
api/tests/                           pytest (887 test)
database/math_tutor_db/              gói SQLite baseline v1 (giữ nguyên)
database/migrations/                 0002 integrity, 0003 erasure, 0004 hint scope, 0005 auth/AI/idempotency
content/                             rubrics/, problems/, feedback/, prompts/ — bất biến theo version, MANIFEST checksum
docs/                                PROJECT_HANDOFF.md, PHASE1–3_REPORT.md, openapi.json
```

## Chạy nhanh

```bash
cd api
python -m pip install -r requirements-dev.txt
python -m pytest
cp .env.example .env   # điền JWT_SECRET...
uvicorn app.api.main:app --port 8000
python -m app.infrastructure.sqlite.cli init --db data/app.db --demo
```

Trên Windows dùng `py -3.12 -m ...`. Không đặt file `.db` đang chạy trong thư mục public hay ổ mạng.
