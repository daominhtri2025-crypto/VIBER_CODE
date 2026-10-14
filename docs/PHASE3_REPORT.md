# Báo cáo nghiệm thu Giai đoạn 3: Backend API, AI và nghiên cứu

**Ngày:** 14/10/2026
**Nguồn chuẩn:** `docs/PROJECT_HANDOFF.md` §7 GĐ3, cùng các quyết định chốt ngày 14/10/2026: xác thực lai, quota 30/100, giữ backup 30 ngày và phát lại lệnh xóa khi khôi phục.
**Môi trường kiểm thử:** Python 3.13.16, SQLite 3.45.1, FastAPI 0.115.6, pytest 8.3.3. Linux.
- **Chưa** gọi Claude API thật: không có API key, và môi trường không có mạng ra ngoài.
- **Chưa** gọi Google thật.
- Chưa chạy trên Windows.

## 1. Thay đổi quan trọng so với kế hoạch: nhà cung cấp AI

Khi đối chiếu điều khoản Gemini API (ngày 14/10/2026), tôi thấy có điều khoản cấm dùng API trong ứng dụng *"directed towards or is likely to be accessed by individuals under the age of 18"*. Ứng dụng này dành cho học sinh THCS (11–15 tuổi), nên **không đủ điều kiện dùng Gemini API**. Vertex AI có thể có điều khoản tương tự [chưa xác minh]. Sau khi báo, anh/chị đã chọn **chuyển sang Claude Haiku 5.5** (`claude-haiku-5-5`).

Anthropic cho phép tổ chức phục vụ người dưới 18 tuổi, kèm điều kiện ([hướng dẫn](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors)):

| Điều kiện | Cách hệ thống đáp ứng |
|---|---|
| Công bố cho người dùng biết họ đang trò chuyện với AI | Có, mỗi phản hồi do AI viết đều kèm trường `ai_disclosure`. Giao diện ở GĐ4 bắt buộc hiển thị. |
| Có biện pháp kỹ thuật bảo vệ trẻ em | Có. Prompt hệ thống quy định an toàn cho trẻ em. Bộ lọc đầu ra (output guard) chặn link, email, số điện thoại và các nội dung trái quy tắc. Học sinh có thể báo phản hồi sai, giáo viên xử lý. |
| Tuân thủ pháp luật về bảo vệ trẻ em và dữ liệu cá nhân | **Thuộc trách nhiệm nhà trường.** Cần đối chiếu với quy định về dữ liệu cá nhân của Việt Nam, bao gồm sự đồng ý của phụ huynh. [Cần xác minh văn bản pháp lý hiện hành] |

**Dữ liệu thực tế đối chiếu từ tài liệu chính thức ngày 14/10/2026:**
- **Endpoint:** `POST https://api.anthropic.com/v1/messages`.
- **Header:** `x-api-key` và `anthropic-version: 2023-06-01`.
- **Định dạng đầu ra:** `output_config.format` kiểu `json_schema`.
- **Giá Haiku 5.5:** 0,10 USD cho mỗi triệu token đầu vào, 0,50 USD cho mỗi triệu token đầu ra (áp dụng khi prompt tối đa 100.000 token).

## 2. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Tổng `pytest` | **887 passed** (Giai đoạn 2 có 819) |
| Test API mới | 68 test, chia 3 nhóm: xác thực và phân quyền; luồng học có AI; nghiên cứu, vận hành và adapter |
| Baseline gốc `tests.py` | 18/18 |
| Số endpoint | 60 thao tác. Đặc tả OpenAPI ở `docs/openapi.json` |
| Kiểm tra đột biến | Gỡ 4 lớp bảo vệ (chặn AI ở chế độ independent, output guard, kiểm tra `email_verified`, phát hiện dùng lại refresh token) → 8 test thất bại |
| Lint (`pyflakes`) | Sạch |

## 3. Thành phần đã triển khai

| Thành phần | File | Ghi chú |
|---|---|---|
| Cấu hình | `app/config.py`, `.env.example` | Mọi khóa bí mật chỉ nằm trong biến môi trường |
| Xác thực | `infrastructure/auth.py`, `application/auth_service.py` | Mật khẩu băm Argon2id. Access JWT HS256 sống 15 phút. Refresh token xoay vòng, phát hiện bị dùng lại. Khóa tài khoản sau 5 lần sai. Thông báo lỗi chung chung để không lộ tài khoản nào tồn tại. |
| Google | `GoogleIdTokenVerifier` | Kiểm tra chữ ký JWKS, `aud`, `iss`, `exp`, `email_verified`. Có danh sách domain cho phép, mặc định để trống. **Chỉ liên kết với tài khoản đã có, không tự tạo tài khoản mới.** |
| Interface TutorAI | `domain/tutor_ai.py` | Hợp đồng dữ liệu, JSON schema và bộ lọc đầu ra (`check_output`) |
| Adapter | `infrastructure/ai/claude.py`, `mock.py` | Claude gọi qua httpx, một lần duy nhất có giới hạn thời gian, không retry. Bản giả lập (mock) cho phép test xác định. |
| Lớp AI | `application/ai_feedback.py` | Gồm: quota, trần ngân sách, ngữ cảnh không chứa thông tin cá nhân, bộ lọc đầu ra, kiểm tra phiên đã đổi, fallback, sổ `ai_usage`. Chi tiết ở mục 4. |
| Prompt | `content/prompts/tutor-system-v1.md` | Có checksum, ràng buộc an toàn cho trẻ em, **chờ duyệt** |
| Nghiên cứu | `repositories/research.py` | Quản lý đợt, nhóm, người tham gia (mã giả danh tự sinh), đề kiểm tra kèm cửa sổ thời gian, công bố kết quả, hàng đợi chấm mù |
| Báo cáo | `repositories/reports.py` | Thời gian học thực từ `activity_events`, file CSV quá trình học |
| Phản hồi bị báo lỗi | `FeedbackReportRepository` | Học sinh báo một tin nhắn của chính mình. Giáo viên phụ trách lớp xử lý. |
| API | `app/api/` | 5 router. Lỗi trả về thống nhất 401/403/404/409/422. Lỗi khóa database trả 503 kèm `Retry-After`. |
| Idempotency | `api/deps.py` + bảng `request_results` | Gửi lại cùng `request_id` nhận đúng nội dung cũ, kể cả câu chữ do AI viết |
| Backup | `infrastructure/backup.py` + CLI | Mã hóa Fernet, giữ cuốn chiếu 30 ngày, khôi phục kèm chạy lại lệnh xóa |

## 4. Lớp AI: thứ tự xử lý (handoff §6.3–6.4)

1. SessionService ghi bước giải kèm phản hồi mẫu trước (commit). AI **không bao giờ** được gọi khi đang giữ khóa ghi database.
2. Kiểm tra điều kiện: AI đang bật; phiên không ở chế độ independent; phiên có cấu hình AI đã gắn từ lúc tạo; còn quota (30 lượt/phiên, 100 lượt/học sinh/ngày theo giờ Việt Nam); còn ngân sách trong ngày.
3. Ngữ cảnh gửi cho model gồm: đề bài do giáo viên soạn, phương trình nền do server tính, phương trình học sinh nhập **chỉ khi parser đã đọc được**, mã lỗi và trạng thái. **Không gửi** tên, ID hay phần giải thích tự do của học sinh. Có test chứng minh điều này.
4. Gọi model một lần. Nếu hết thời gian, lỗi kết nối (429/529/5xx) hoặc đầu ra hỏng, hệ thống dùng phản hồi mẫu.
5. Bộ lọc đầu ra từ chối khi:
   - mức gợi ý vượt mức chính sách cho phép;
   - có hơn một câu hỏi;
   - nội dung tiết lộ nghiệm;
   - AI khen "đúng rồi" trong khi MathChecker chấm sai, hoặc chê "sai" trong khi MathChecker chấm đúng;
   - có đường link, email hoặc số điện thoại;
   - nội dung quá dài.

   Khi bị từ chối, hệ thống dùng phản hồi mẫu.
6. Nếu phiên đã đổi version trong lúc chờ AI, câu trả lời của AI bị bỏ (`skipped_stale`).
7. Mọi quyết định đều ghi một dòng vào `ai_usage`, với `outcome` là một trong các giá trị: `ok`, `fallback_*`, `skipped_*`. Bảng này phục vụ kiểm soát chi phí và nghiên cứu.

**Sửa đổi khi test:** bộ lọc ban đầu chặn nhầm chính phản hồi mẫu của ta, vì câu "Hướng làm đúng, nhưng phép tính… chưa đúng" bị hiểu là lời khen. Tôi đã thu hẹp danh sách cụm từ được coi là "khẳng định đúng".

## 5. Thay đổi schema: migration 0005

| Đối tượng | Mục đích |
|---|---|
| `users.email` (unique) | Email khai trước để liên kết Google |
| `user_credentials`, `user_identities`, `refresh_tokens` | Xác thực lai |
| `ai_config_activations` | Log kích hoạt cấu hình AI, chỉ được thêm, không sửa. `ai_configs` vẫn bất biến. Mỗi phiên học gắn cố định cấu hình đang kích hoạt lúc tạo. |
| `ai_usage` | Quota, ngân sách, nghiên cứu. **Bị xóa cùng học sinh** khi thực hiện lệnh xóa D5. |
| `request_results` | Kết quả HTTP cho idempotency (quyết định D2). Cũng bị xóa theo D5. |
| `assessment_schedules` | Thời điểm mở, đóng đề kiểm tra và công bố kết quả. Chỉ công bố được một lần. |

**Phát hiện khi test:** ban đầu tôi thêm cột trực tiếp vào bảng `assessments`. Việc này **làm hỏng 1 trong 18 test baseline**, vì gói v1 chèn dữ liệu vào bảng này theo vị trí cột. Tôi đã chuyển các cột đó sang bảng riêng 1:1. Bài học: không bao giờ `ADD COLUMN` vào bảng v1 mà mã cũ chèn dữ liệu theo vị trí.

## 6. Checklist nghiệm thu (Handoff §7, Giai đoạn 3)

| Tiêu chí | Đạt | Bằng chứng (test) |
|---|---|---|
| Học sinh A không đọc/sửa được phiên của B | ✅ | `test_student_cannot_read_other_students_session` |
| Giáo viên không xem được lớp khác; người nghiên cứu không xuất được đợt khác | ✅ | `test_teacher_of_other_class_sees_nothing`, `test_researcher_of_other_study_cannot_export` |
| Token hoặc body giả vai trò không nâng được quyền | ✅ | `test_forged_tokens_rejected` (5 kiểu: sai chữ ký, `alg=none`, sai loại token, hết hạn, không phải JWT), `test_body_cannot_smuggle_identity_or_verdict`, `test_role_gates` |
| API chế độ independent không gọi AI, không trả đúng/sai trước khi nộp | ✅ | `test_independent_mode_never_calls_ai` |
| Response cho học sinh không chứa lời giải hay gợi ý nội bộ | ✅ | `test_responses_never_expose_internal_content` |
| AI quá thời gian thì trả phản hồi dự phòng, không mất bước giải | ✅ | `test_ai_failure_falls_back_without_losing_the_step` (3 trường hợp) |
| File CSV dùng mã giả danh, không chứa định danh hay bảng ánh xạ | ✅ | `test_full_study_cycle_blind_grading_publication_and_export` |
| Chưa chấm đủ thì `total_score` là NULL | ✅ | Cùng test trên: ô điểm trống, không phải 0 |
| Bổ sung: quota, ngân sách, không gửi thông tin cá nhân, kiểm tra phiên đã đổi, idempotency có AI | ✅ | `test_session_quota_then_templates`, `test_budget_cap`, `test_no_pii_or_free_text_reaches_the_model`, `test_stale_ai_reply_discarded`, `test_retry_returns_identical_body_including_ai_text` |
| Bổ sung: xóa dữ liệu vẫn có hiệu lực sau khi khôi phục từ backup cũ | ✅ | `test_erasure_survives_restore_from_older_backup` |

## 7. Vận hành

```bash
cd api
python -m pip install -r requirements.txt            # runtime đã khóa phiên bản
cp .env.example .env                                  # điền JWT_SECRET, ANTHROPIC_API_KEY, BACKUP_KEY...
python -m app.infrastructure.sqlite.cli init --db data/app.db
python -m app.infrastructure.sqlite.cli migrate --db data/app.db
uvicorn app.api.main:app --host 127.0.0.1 --port 8000

# Hằng ngày (Windows Task Scheduler / cron):
python -m app.infrastructure.sqlite.cli backup-encrypted --db data/app.db
python -m app.infrastructure.sqlite.cli prune-backups
# Khôi phục (tự chạy lại các lệnh xóa đã thực hiện):
python -m app.infrastructure.sqlite.cli restore --from backups/app_YYYYMMDDTHHMMSSZ.db.enc --to data/restored.db
```

Kích hoạt AI:
1. Đặt `AI_ENABLED=true` và `ANTHROPIC_API_KEY` (key trả phí).
2. Gọi `POST /api/v1/admin/ai-configs` với `{"provider":"anthropic","model_name":"claude-haiku-5-5","prompt_version":"tutor-system-v1","parameters":{"max_output_tokens":300,"price_input_per_mtok":0.10,"price_output_per_mtok":0.50}}`.
3. Gọi `/activate` cho cấu hình vừa tạo.

**Lưu ý vận hành:**
- `BACKUP_KEY` và `ERASURE_LEDGER_PATH` phải nằm **ngoài** thư mục backup.
- Mất `BACKUP_KEY` đồng nghĩa mất mọi bản backup.

## 8. Quyết định phát sinh (cần anh/chị xác nhận)

| # | Quyết định | Lập luận |
|---|---|---|
| F1 | `POST /sessions` bắt buộc có `assignment_id` | Tránh việc học sinh tự mở bài thuộc đề kiểm tra để luyện trước. Phiên luyện độc lập do hệ thống tự tạo. |
| F2 | Phiên học tự gắn vào một đợt nghiên cứu **chỉ khi** học sinh đang tham gia đúng một đợt còn hiệu lực | Liên kết rõ ràng, không đoán (§5.6 bước 8) |
| F3 | Giáo viên chỉ được tạo tài khoản **học sinh**. Admin tạo được mọi loại tài khoản. | Đúng phạm vi vai trò |
| F4 | AI chỉ viết lại câu chữ cho phản hồi bước giải, gợi ý và kiểm tra nghiệm. Hai bước nhận diện kiến thức và lập kế hoạch giữ phản hồi mẫu. | Giảm chi phí. Đó là các câu hỏi trắc nghiệm, phản hồi mẫu đã đủ. |
| F5 | Gợi ý do AI diễn đạt lại được lưu trong `messages`. Còn `hint_events.content` vẫn lưu bản phản hồi mẫu. | Thống kê gợi ý ổn định, dùng được cho nghiên cứu. Bản AI vẫn tra lại được. |
| F6 | Thời gian học thực: bỏ khoảng tạm dừng (pause→resume) và khoảng nghỉ trên 5 phút | Quy tắc tường minh theo §9.1. Ngưỡng 5 phút có thể chỉnh. |
| F7 | Hàng đợi chấm chỉ hiển thị mã tham gia, không hiển thị nhóm | Chấm mù khi khả thi (§5.6 bước 5) |

## 9. Rủi ro và phần còn lại

- **Chưa kiểm thử với Claude API thật.** Adapter mới chỉ được kiểm bằng `httpx.MockTransport` theo đúng hợp đồng trong tài liệu chính thức. Cần chạy smoke test có key thật trước khi thí điểm.
- Cần kiểm tra chất lượng câu chữ AI viết trên một bộ hội thoại mẫu do giáo viên duyệt (§8 Handoff). Kết quả test hiện nay chưa nói lên chất lượng sư phạm của phản hồi.
- Chưa có giới hạn tần suất gọi (rate limit) theo IP cho `/auth/login`. Hiện chỉ khóa theo tài khoản. Nên đặt reverse proxy có rate limit khi triển khai.
- Bộ lọc đầu ra chỉ kiểm tra theo từ ngữ, nên vẫn cần cơ chế báo lỗi phản hồi (đã có) cùng giáo viên giám sát.
- Prompt, phản hồi mẫu, danh mục lựa chọn và rubric đều **chờ giáo viên duyệt**.
- Phần pháp lý về dữ liệu của trẻ vị thành niên và sự đồng ý của phụ huynh do nhà trường chịu trách nhiệm (mục 1).

## 10. Câu hỏi trước Giai đoạn 4

1. Anh/chị xác nhận F1–F7 không?
2. **Giao diện:** giữ Next.js App Router + TypeScript + Tailwind + KaTeX như Handoff? Có cần nhận diện thương hiệu (logo, màu) của FPT Polytechnic hoặc Minh Trí Academy không?
3. **Cách nhập phương trình cho học sinh:** ô văn bản kèm bàn phím ký hiệu ảo (`× : ( ) x`) và xem trước bằng KaTeX, hay một trình soạn công thức trực quan?
4. **Triển khai thí điểm:** chạy trên máy chủ của trường, máy cá nhân hay dịch vụ cloud? Điều này quyết định cách đóng gói (Docker hoặc dịch vụ Windows).
