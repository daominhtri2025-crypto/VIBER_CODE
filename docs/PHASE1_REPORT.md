# Báo cáo nghiệm thu Giai đoạn 1: Database và Repository

**Ngày:** 13/10/2026
**Nguồn chuẩn:** `docs/PROJECT_HANDOFF.md` (Handoff v1.0)
**Môi trường kiểm thử:** Python 3.13.16, SQLite 3.45.1, pytest 8.3.3, Linux.
Chưa chạy trên Windows [cần xác minh trên máy đích].

## 1. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Baseline gói SQLite (`tests.py`, chưa sửa) trên DB v1 | **18/18 đạt** |
| Cùng 18 test baseline trên DB đã nâng lên v2 | **18/18 đạt** |
| Test mới (connection, migration, repository, khóa nghiệp vụ, báo cáo, rubric) | **80/80 đạt** |
| Tổng `pytest` | **98 passed** |
| Kiểm tra đột biến | Vô hiệu 3 trigger của migration 0002 thì 7 test thất bại. Test không rỗng. |
| Lint (`pyflakes`) | Sạch |

## 2. Dữ liệu thực nghiệm và suy luận

Phần **sự thật** là kết quả đo được bằng lệnh ở mục 6:

- Baseline 18/18 đạt.
- Toàn bộ 98 test đạt.
- Migration DB demo gốc từ v1 lên v2: `integrity_check=ok`, `foreign_key_check` rỗng.
- Số dòng mọi bảng giữ nguyên, nội dung `solution_steps`, `hint_events`, `item_responses` giữ nguyên, các view `assessment_totals` và `session_summary` cho kết quả giống hệt trước migration.

Phần **suy luận** là đánh giá kỹ thuật, chưa có thực nghiệm:

- Trigger tầng DB cùng kiểm tra ở repository tạo phòng thủ hai lớp.
- Trigger **không** chống được người có quyền đọc ghi trực tiếp file `.db`.
- Hiệu năng chưa được đo, vì dữ liệu demo rất nhỏ.

## 3. File thay đổi

Gói `database/math_tutor_db/` **giữ nguyên**: không sửa schema, seed hay test.

| File | Vai trò |
|---|---|
| `api/app/domain/errors.py` | Phân loại lỗi để ánh xạ HTTP (404/403/409/422) |
| `api/app/domain/constants.py` | Enum khớp CHECK của schema |
| `api/app/infrastructure/sqlite/connection.py` | Connection factory: FK được xác minh, busy_timeout, WAL, `transaction()` dùng BEGIN IMMEDIATE, backup API, health check |
| `api/app/infrastructure/sqlite/migrations.py` | Migration runner: backup trước, all-or-nothing, kiểm tra integrity/FK trước COMMIT, checksum, từ chối DB mới hơn mã |
| `api/app/infrastructure/sqlite/cli.py` | `init`, `migrate`, `status`, `check`, `backup` |
| `api/app/infrastructure/sqlite/repositories/*.py` | 8 repository: users, classes, content, assignments, sessions, hints, assessments, reports |
| `database/migrations/0002_phase1_integrity.sql` | Migration v2 |
| `content/rubrics/explanation-rubric-v1.json` và `MANIFEST.json` | Rubric giải thích, checksum SHA-256 |
| `api/tests/*.py` | 98 test |
| `CLAUDE.md`, `README.md`, `.gitattributes`, `.gitignore`, `api/pyproject.toml` | Tài liệu và cấu hình |

## 4. Thay đổi schema (migration 0002)

Migration chỉ dùng thao tác bổ sung: ADD COLUMN, CREATE và một lần DROP/CREATE trigger. Không rebuild bảng.

| Đối tượng | Thay đổi | Lý do |
|---|---|---|
| `schema_migrations` | Thêm cột `name`, `checksum` | Phát hiện sửa migration đã áp dụng |
| `learning_sessions` | Thêm cột `parent_session_id` (FK), `study_id` (FK) và 2 index | §4.6 bullet 1: liên kết phiên luyện độc lập và đợt nghiên cứu |
| Trigger `check_session_lineage` | Mới | Phiên con phải cùng học sinh, mode independent, khác bài; phiên cha ở INDEPENDENT_PRACTICE hoặc COMPLETED; kế thừa study_id; học sinh phải thuộc đợt |
| Trigger `freeze_session_identity` | Tạo lại, bao gồm 2 cột mới | Danh tính phiên bất biến |
| `hint_events` | Thêm cột `request_id` và UNIQUE một phần `(session_id, request_id)` | §4.6 bullet 4: retry không đếm gợi ý hai lần |
| `audit_log` (bảng mới, thứ 27) | Chỉ được thêm, không UPDATE/DELETE | §4.6 bullet 3, phần audit |
| `lock_assessment_items_insert/delete`, `freeze_assessment_rubric` | Mới | §4.6 bullet 5: khóa đề khi đã có lượt làm |
| `freeze_attempt_identity/submission/delete` | Mới | Lỗ hổng phát hiện khi rà baseline: có thể mở lại hoặc xóa bài đã nộp |
| `response_insert_lifecycle`, `response_identity_freeze`, `response_content_freeze`, `response_grade_lifecycle`, `response_delete_lock` | Mới | Lỗ hổng phát hiện khi rà baseline: sửa bài sau khi nộp, chấm trước khi nộp, người chấm ngoài đợt |

**Hệ quả:** schema có **27 bảng** (26 bảng v1 cộng `audit_log`). Bảng mới được tạo công khai qua migration có version, không phải "bảng ngầm".

## 5. Quyết định kỹ thuật cần anh/chị xác nhận

| # | Quyết định | Lập luận và đánh đổi |
|---|---|---|
| D1 | DB mới được tạo bằng baseline v1 cộng seed, rồi migrate lên bản mới nhất | Giữ v1 làm nguồn duy nhất. Mọi DB đều đi qua cùng đường nâng cấp, nên test bảo toàn có ý nghĩa |
| D2 | `request_results` (phát lại response HTTP/AI) **để sang GĐ3** | Đã thống nhất. Hiện retry trả lại *bản ghi* step/hint cũ, chưa trả lại *nội dung phản hồi AI* |
| D3 | Gợi ý **không** tăng `session.version` | Gợi ý không đổi phương trình nền. Nếu tăng version, mỗi lần xin gợi ý sẽ khiến lần nộp bước đang soạn bị 409 |
| D4 | Retry gợi ý: bản ghi commit đầu tiên được giữ. Khác trigger, step hoặc level thì trả 409 | Service phải gọi `get_by_request` trước khi HintPolicy tính level, để retry không bị nâng mức |
| D5 | **Không** chặn DELETE `solution_steps`/`hint_events` ở tầng DB. Repository không có hàm xóa. `audit_log.actor_id` không có FK | Đạo đức nghiên cứu: người tham gia rút khỏi đợt phải xóa được dữ liệu. Việc xóa sẽ là thủ tục quản trị có kiểm soát (chưa viết) |
| D6 | Chính sách chấm: người chấm phải có cả vai trò **teacher** và **researcher** (repository kiểm tra), và có trong `study_researchers` (repository và trigger cùng kiểm tra) | Theo §2.2. `researcher-demo` (chỉ có vai trò researcher) bị từ chối chấm |
| D7 | Mặc định `max_attempts=1`. Nộp bài yêu cầu mọi item có lời giải không rỗng | Có thể cấu hình theo đề ở GĐ3 |
| D8 | `submit_step` kiểm tra `previous_equation` trùng phương trình nền do server tính, ngoài kiểm tra version | Phòng thủ khi MathChecker kiểm tra trên phương trình nền đã cũ |
| D9 | Thứ tự kiểm tra: idempotency trước, rồi state/version | Client mất response và retry với version cũ vẫn nhận lại step cũ, không bị 409 (giữ hành vi baseline) |
| D10 | Bước `invalid` mới bắt buộc có `error_code`. Bước `valid` không được có `error_code` | Phục vụ phân tích lỗi sư phạm. Dữ liệu seed cũ (`step-1` không có error_code) vẫn giữ nguyên |
| D11 | Trạng thái duyệt rubric nằm trong `MANIFEST.json`, không nằm trong file rubric | Việc duyệt không làm đổi checksum nội dung |
| D12 | Yêu cầu Python ≥ 3.11 (dùng `StrEnum`), dự án chốt 3.12 | Handoff ghi ≥ 3.10. Đây là thay đổi có chủ ý |

## 6. Lệnh chạy

```bash
cd api
python -m pip install -r requirements-dev.txt                  # pytest==8.3.3; runtime chỉ dùng thư viện chuẩn
python -m pytest                                               # 98 passed
(cd ../database/math_tutor_db && python tests.py)              # baseline gốc 18/18
python -m app.infrastructure.sqlite.cli init    --db data/app.db --demo
python -m app.infrastructure.sqlite.cli migrate --db path/to/existing.db   # tự backup vào ./backups/
python -m app.infrastructure.sqlite.cli status  --db data/app.db
python -m app.infrastructure.sqlite.cli check   --db data/app.db
python -m app.infrastructure.sqlite.cli backup  --db data/app.db --out backups/manual.db
```

## 7. Checklist nghiệm thu (Handoff §7, Giai đoạn 1)

| Tiêu chí | Đạt | Bằng chứng (test) |
|---|---|---|
| integrity_check=ok, foreign_key_check rỗng | ✅ | `test_health_check_ok`, `test_migrating_shipped_v1_preserves_history_and_scores` |
| Chạy lại cùng request không tăng số bước | ✅ | `test_retry_same_request_does_not_add_step`, `test_retry_after_success_with_stale_version_still_replays`, `test_hint_retry_counts_once` |
| Conflict version không ghi một phần | ✅ | `test_version_conflict_writes_nothing`, `test_concurrent_writers_second_one_conflicts`, `test_constraint_failure_rolls_back_whole_transaction` |
| Hint độc lập bị chặn; approved version không sửa được | ✅ | `test_hint_blocked_in_independent_session` (cả repository lẫn trigger), `test_hint_blocked_after_guided_phase`, `test_version_lifecycle_and_student_view` |
| Nâng migration từ dữ liệu cũ giữ nguyên lịch sử và điểm | ✅ | `test_migrating_shipped_v1_preserves_history_and_scores` (so sánh từng dòng) |
| Không ghi đè DB đang có; backup và restore kiểm tra được | ✅ | `test_init_never_overwrites`, `test_backup_refuses_overwrite`, `test_backup_is_restorable_v1`, `test_failing_migration_rolls_back_completely` |
| Khóa nội dung assessment; không sửa bài đã nộp ngoài chấm điểm | ✅ | `test_items_locked_once_attempts_exist`, `test_submit_requires_answers_then_freezes_content`, `test_cannot_grade_before_submission` |
| Migration runner | ✅ | Toàn bộ nhóm `test_connection_and_migrations.py` |

## 8. Phát hiện phản biện về baseline

1. Gói v1 cho phép **sửa nội dung bài làm sau khi nộp**, **chấm trước khi nộp** và **xóa hoặc mở lại lượt làm đã nộp**. Đã khắc phục trong 0002.
2. Test baseline `test_wrong_assessment_item` dùng một lượt làm *đã nộp*. Trên v2, test này vẫn đạt, nhưng do trigger khóa mới chứ không phải do FK. Tôi đã bổ sung `test_cross_assessment_item_still_rejected_by_fk` trên lượt làm chưa nộp để xác nhận FK vẫn hoạt động.
3. `init_db.py` gốc gọi `sqlite3.connect` trước khi kiểm tra đường dẫn, nên nếu gõ sai tên file sẽ tạo DB rỗng. `connect()` mới mặc định `must_exist=True`.
4. Repository gốc không tăng version khi đổi state. Tôi đã thêm `transition_state` có tăng version và ghi audit.

## 9. Phần còn thiếu và rủi ro (chuyển sang GĐ2/GĐ3)

- **Trình tự** chuyển trạng thái chưa được kiểm tra; đây là việc của LearningStateMachine ở GĐ2. Repository chỉ chặn tên state sai, COMPLETED là trạng thái kết thúc, và các state guided trong phiên independent.
- Tính thời gian học từ `activity_events` (quy tắc khoảng nghỉ) chưa làm, để GĐ3.
- `request_results` và quyền `study_researchers` cho thao tác tuyển và chia nhóm qua API, để GĐ3.
- Thủ tục xóa dữ liệu khi người tham gia rút khỏi đợt (xem D5) chưa viết. [Cần quyết định chính sách đạo đức nghiên cứu]
- Nội dung rubric v1 lấy từ §9.2, **đang chờ giáo viên duyệt**.
- Chưa kiểm thử trên Windows. `.gitattributes` buộc dùng LF cho `.sql` và `content/` để checksum không đổi do autocrlf.

## 10. Câu hỏi trước khi vào Giai đoạn 2

1. Anh/chị đồng ý các quyết định D3, D5, D6 và D7 không?
2. Danh mục `error_code` của MathChecker: dùng 6 mã ở §7 GĐ2 (`PARSE_UNKNOWN`, `ARITHMETIC_ERROR`, `NON_EQUIVALENT`, `OPERATION_MISMATCH`, `DIVISION_BY_ZERO`, `OUT_OF_SCOPE`), hay bổ sung mã như `SIGN_ERROR` (sai dấu khi chuyển vế), vốn rất phổ biến ở lớp 8 và có giá trị phân tích sư phạm?
3. Tập `operation` cho phép: chỉ `add_both_sides`, `subtract_both_sides`, `multiply_both_sides`, `divide_both_sides`, `expand`, `collect_like_terms`, hay cho phép thêm "chuyển vế đổi dấu" như một thao tác riêng?
