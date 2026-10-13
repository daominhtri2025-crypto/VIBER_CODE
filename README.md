# Trợ lý AI hỗ trợ học sinh THCS tự học Toán

Web app gợi mở từng bước (step-by-step scaffolding). MVP: phương trình bậc nhất một ẩn.
Stack: FastAPI + SQLite (backend), Next.js + TypeScript + Tailwind + KaTeX (frontend, giai đoạn 4).

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Database, migration, repository | **Hoàn thành** — xem `docs/PHASE1_REPORT.md` |
| 2 | MathChecker, LearningStateMachine, HintPolicy, phản hồi mẫu | Chưa bắt đầu |
| 3 | FastAPI, xác thực, TutorAI + fallback, nghiên cứu/export | Chưa bắt đầu |
| 4 | Giao diện Next.js, E2E | Chưa bắt đầu |

## Cấu trúc

```
api/app/domain/                      errors, enums (không phụ thuộc hạ tầng)
api/app/infrastructure/sqlite/       connection factory, migration runner, CLI
api/app/infrastructure/sqlite/repositories/   users, classes, content, assignments,
                                     sessions, hints, assessments, reports
api/tests/                           pytest (98 test)
database/math_tutor_db/              gói SQLite baseline v1 (giữ nguyên)
database/migrations/                 0002_phase1_integrity.sql
content/rubrics/                     rubric bất biến theo version + MANIFEST checksum
docs/                                PROJECT_HANDOFF.md, PHASE1_REPORT.md
```

## Chạy nhanh

```bash
cd api
python -m pip install -r requirements-dev.txt
python -m pytest
python -m app.infrastructure.sqlite.cli init --db data/app.db --demo
```

Trên Windows dùng `py -3.12 -m ...`. Không đặt file `.db` đang chạy trong thư mục public hay ổ mạng.
