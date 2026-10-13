# Báo cáo nghiệm thu Giai đoạn 2: MathChecker và quy trình sư phạm

**Ngày:** 13/10/2026
**Nguồn chuẩn:** `docs/PROJECT_HANDOFF.md` §7 GĐ2. Các quyết định D3, D5, D6, D7 và Q1–Q10 đã được chốt ngày 13/10/2026.
**Môi trường kiểm thử:** Python 3.13.16, SQLite 3.45.1, pytest 8.3.3, SymPy 1.13.3 (chỉ dùng trong test). Linux.
Chưa chạy trên Windows [cần xác minh trên máy đích].

## 1. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Tổng `pytest` | **819 passed** (Giai đoạn 1 có 98) |
| Test Toán (parser và checker) | 649. Trong đó 500 test sinh ngẫu nhiên, đối chiếu kết quả với SymPy |
| Test luồng học qua SessionService | 22 |
| Baseline gốc `tests.py` (gói v1, không sửa) | 18/18 |
| Nâng cấp DB demo gốc lên v4 qua CLI | Đạt, có backup |
| Kiểm tra đột biến | 4 đột biến trong service, checker và HintPolicy → 13 test thất bại. Tắt `secure_delete` → 1 test thất bại |
| Thời gian `check_step` | Khoảng 0,3 ms/lần. Số đo từ một lần chạy, không phải benchmark |
| Lint (`pyflakes`) | Sạch |

## 2. Dữ liệu thực nghiệm và suy luận

Phần **sự thật** là kết quả đo được bằng các lệnh ở mục 7:

- Toàn bộ 819 test đều đạt.
- Với 300 biểu thức và 200 phương trình sinh ngẫu nhiên, hệ số và tập nghiệm do parser tính trùng khớp với SymPy.
- Sau khi xóa dữ liệu theo quy trình D5, chuỗi giải thích của học sinh không còn nằm trong file `.db`/`-wal`. Khi tắt `secure_delete`, chuỗi đó **vẫn còn** trong file.

Phần **suy luận** là đánh giá kỹ thuật, chưa có thực nghiệm:

- Bộ chặn lộ đáp án (leak guard) chỉ là kiểm tra theo từ ngữ. Nó **không** chứng minh được rằng phản hồi an toàn tuyệt đối (Handoff §6.4).
- Chất lượng sư phạm của phản hồi mẫu và gợi ý **chưa được giáo viên đánh giá**.
- Ngưỡng của HintPolicy (2 lần sai, tối đa 3 mức gợi ý) là quyết định thiết kế, chưa được kiểm chứng trên học sinh thật.

## 3. Thành phần đã triển khai

| Lớp | File | Vai trò |
|---|---|---|
| Domain/Toán | `app/domain/math/ast.py` | AST, 7 mã lỗi, đánh giá tuyến tính chính xác bằng `Fraction` |
| | `app/domain/math/parser.py` | Parser whitelist, chuẩn hóa ký hiệu Việt Nam (Q1), giới hạn tài nguyên |
| | `app/domain/math/checker.py` | `MathChecker`: kiểm tra bước, kiểm tra hướng giải, thay nghiệm, kết luận, gợi ý chiến lược |
| Domain/Học tập | `app/domain/learning/state_machine.py` | Bảng chuyển trạng thái tường minh |
| | `app/domain/learning/hint_policy.py` | Chính sách gợi ý (Q8), là hàm thuần |
| | `app/domain/learning/leak_guard.py` | Chặn phản hồi nêu nghiệm |
| Application | `app/application/session_service.py` | Điều phối luồng học. Mỗi thao tác ghi trong một giao dịch nguyên tử, retry trả kết quả ổn định |
| Infrastructure | `app/infrastructure/content_store.py` | Nạp nội dung từ `content/`, kiểm tra checksum SHA-256 |
| | `repositories/erasure.py` | Xóa dữ liệu theo quy tắc hai người (D5/Q10) |
| | `repositories/sessions.py`, `hints.py` | Bổ sung tham số `transition_to`, `messages`, `record_interaction`, `complete_independent`, `find_similar_problem`, `scope` |
| Nội dung (chờ giáo viên duyệt) | `content/problems/p{1,2,3}@1.json` | Danh mục lựa chọn kiến thức và hướng giải (Q6) |
| | `content/feedback/templates-v1.json` | Phản hồi mẫu và gợi ý 3 mức |

## 4. Đặc tả MathChecker (theo Q1–Q5, Q7)

### 4.1. Ký hiệu chấp nhận

| Loại | Chấp nhận | Từ chối |
|---|---|---|
| Thập phân | `0,5` | `2.5`: dấu chấm giữa hai chữ số → `PARSE_UNKNOWN`, **không** đọc thành 2 × 5 |
| Nhân | `* × · . ` và nhân ngầm `2x`, `3(x−1)`, `x(2)` | `x2`, `(x+1)2` |
| Chia | `/ : ÷`. Nhân ngầm cùng mức ưu tiên với nhân thường, tính từ trái sang: `1/2x = ½·x` | Mẫu số chứa x → `OUT_OF_SCOPE` |
| Ngoặc, dấu trừ | `() [] {}`, `- − – —` | |
| Ngoài phạm vi bậc nhất | | `x²`, `x^2`, `x·x`, `√`, `<`, chữ khác x → `OUT_OF_SCOPE` |
| Giới hạn tài nguyên | 200 ký tự, 120 token, lồng ngoặc sâu 25, 12 chữ số, kèm hạn thời gian 50 ms | Không dùng `eval` hay `sympify` ở runtime |

### 4.2. Ngữ nghĩa một bước giải

Mỗi thao tác được mô hình hóa như cùng một phép biến đổi áp lên cả hai vế. Một bước là **valid** khi giá trị tuyến tính của từng vế học sinh nhập khớp với từng vế kỳ vọng (cho phép đổi chỗ hai vế). Nghĩa là học sinh được làm **một thao tác cộng phần tính toán số học** trong cùng một bước, nhưng không được gộp hai thao tác (Q3, phương án cứng).

Thao tác hỗ trợ:
- `add_both_sides`, `subtract_both_sides`, `multiply_both_sides`, `divide_both_sides`: biến đổi cả hai vế.
- `transpose_term`: chuyển vế đổi dấu. Giá trị là hạng tử kèm dấu như ở vế nguồn, ví dụ `+5`, `-2x` (Q5).
- `expand`, `collect_like_terms`: biến đổi trong từng vế, không đổi giá trị của vế.

### 4.3. Thứ tự chẩn đoán lỗi (Q4)

Khi bước không hợp lệ, hệ thống xét lần lượt từ trên xuống:

| Thứ tự | Mã | Điều kiện |
|---|---|---|
| 1 | `SIGN_ERROR` | Kết quả khớp kỳ vọng sau khi **đảo dấu đúng một hạng tử** ở một vế, kể cả hạng tử trong ngoặc ở bất kỳ độ sâu nào. Hoặc học sinh làm thao tác ngược dấu ở cả hai vế. |
| 2 | `ARITHMETIC_ERROR` | Một vế đúng, vế kia sai. Phản hồi nói rõ vế nào. |
| 3 | `OPERATION_MISMATCH` | Phương trình vẫn tương đương nhưng không khớp thao tác đã khai (nhảy bước, khai sai tên thao tác, hạng tử không có trong phương trình). |
| 4 | `NON_EQUIVALENT` | Tập nghiệm bị thay đổi. |
| — | `DIVISION_BY_ZERO` | Chia cho 0, ở thao tác hoặc ngay trong biểu thức. Kết quả là `invalid`. |
| — | `PARSE_UNKNOWN`, `OUT_OF_SCOPE` | Kết quả là `unknown`, **không tính là sai**, và không làm hệ thống tự đề xuất gợi ý. |

**Hệ quả cần lưu ý:** trong ví dụ chuẩn §5.3 (`2x+5=17`, "trừ 5" → `2x=22`), bước này giờ là **`SIGN_ERROR`** (vì 22 = 17 + 5), không phải lỗi tính toán.

### 4.4. Kiểm tra nghiệm và kết luận (Q7)

- **Bài có một nghiệm:** học sinh viết phép thay số, ví dụ `2·6+5=17`. Hệ thống kiểm tra:
  - giá trị mỗi vế bằng giá trị của vế tương ứng trong đề gốc khi thay x bằng nghiệm học sinh đã tìm;
  - phép thay không còn chữ x;
  - **có hiện số đã thay**. Vì vậy chỉ viết `17=17` bị từ chối.
- **Bài vô nghiệm hoặc vô số nghiệm:** học sinh phải biến đổi tới dạng rút gọn không còn x (`c = d`, `0x = c`), rồi chọn kết luận `no_solution` hoặc `infinite_solutions`.

## 5. Quy trình sư phạm

### 5.1. State machine

| Mode | Đường đi |
|---|---|
| `guided` | READ_PROBLEM → IDENTIFY_KNOWLEDGE → PROPOSE_PLAN → SOLVE_STEP → VERIFY_RESULT → INDEPENDENT_PRACTICE → COMPLETED |
| `practice` | Bắt đầu từ SOLVE_STEP, sau đó giống guided |
| `independent` | SOLVE_STEP → COMPLETED, chỉ khi học sinh nộp bài. **Đạt dạng nghiệm cuối không làm đổi trạng thái**, vì nếu đổi thì vô tình báo cho học sinh biết mình đã đúng. |

Mọi chuyển trạng thái đều do server suy ra từ kết quả của MathChecker hoặc từ danh mục nội dung. Không có API nào cho client đặt trạng thái.

### 5.2. HintPolicy (Q8)

- **Phạm vi tính gợi ý:** mỗi bước giải là một phạm vi riêng, xác định bởi bước valid gần nhất (`SOLVE_STEP:<id>`), hoặc mỗi giai đoạn (`IDENTIFY_KNOWLEDGE`, `PROPOSE_PLAN`, `VERIFY_RESULT`). Phạm vi được lưu ở cột mới `hint_events.scope` (migration 0004).
- **Học sinh xin gợi ý:** mỗi lần xin tăng 1 mức, tối đa mức 3. Xin thêm sau mức 3 thì bị từ chối và gắn cờ `needs_teacher`.
- **Hệ thống tự đề xuất:** sau 2 lần sai liên tiếp kể từ gợi ý gần nhất, ghi với `trigger=system_offer`.
- **Sau mức 3:** sai thêm 1 lần thì gắn cờ `needs_teacher` và ngừng đề xuất.
- **Nội dung gợi ý:**
  - Ở bước đầu tiên: dùng 3 gợi ý giáo viên đã soạn trong `problem_versions.hints`.
  - Ở các bước sau: dùng gợi ý theo chiến lược. `MathChecker.suggest_next` xác định chiến lược, ví dụ bỏ ngoặc, thu gọn, chuyển hạng tử chứa x, chuyển hằng số, chia cho hệ số. Gợi ý **không bao giờ tính hộ kết quả**.

### 5.3. Hai giai đoạn nhận diện kiến thức và lập kế hoạch (Q6)

- Học sinh chọn trong danh mục do giáo viên soạn ở `content/problems/`. Client chỉ nhận `id` và `label`, không nhận cờ đúng/sai.
- **Hướng giải được chấp nhận** khi cả hai điều kiện đúng: giáo viên đánh dấu `acceptable` **và** MathChecker xác nhận thao tác áp dụng được lên đề. Test cũng kiểm tra rằng danh mục và MathChecker không mâu thuẫn nhau.
- **Sau 3 lần chọn sai:** hệ thống chuyển tiếp kèm hỗ trợ. Hệ thống nêu kiến thức hoặc hướng giải đúng, nhưng không nêu nghiệm. *(Quyết định thiết kế mới, xem mục 9.)*

### 5.4. Retry, giao dịch và chế độ độc lập

- Mỗi thao tác ghi bước giải hoặc câu trả lời, thông điệp phản hồi và chuyển trạng thái trong **một giao dịch**, với một lần tăng version.
- Retry cùng `request_id` trả lại **phản hồi y hệt**, kể cả gợi ý hệ thống đã đề xuất. Lý do: phản hồi mẫu là xác định, và gợi ý đề xuất được lưu với `request_id` dạng `<id>:offer`. Nhờ vậy chưa cần bảng `request_results` cho tới khi tích hợp AI ở Giai đoạn 3.
- **Chế độ independent:** không trả `math_status`, `error_code`, phản hồi hay gợi ý. Mọi kết quả vẫn được lưu đầy đủ để phục vụ nghiên cứu. Khi nộp bài: phiên con và phiên cha cùng chuyển sang COMPLETED, rồi mới trả tóm tắt.
- **Bài tương tự (Q9):** tự chọn bài đã duyệt, cùng chủ đề và cùng độ khó, học sinh chưa làm. Cách chọn là cố định (`problem_id` nhỏ nhất), để mọi học sinh nhận cùng một bài chuyển giao và số liệu so sánh được với nhau.

## 6. Thay đổi schema

| Migration | Nội dung |
|---|---|
| **0003_data_erasure** | Bảng `erasure_requests`: CHECK người duyệt khác người yêu cầu, mỗi học sinh chỉ có một yêu cầu đang mở, luồng trạng thái do trigger kiểm soát, không được xóa bản ghi yêu cầu. Tạo lại 2 trigger khóa xóa của 0002, chỉ mở khóa khi đang có yêu cầu ở trạng thái `executing`. |
| **0004_hint_scope** | Thêm cột `hint_events.scope` và index |

Sau hai migration, schema có 28 bảng. Nâng cấp DB demo gốc từ v1 lên v4: lịch sử và điểm được giữ nguyên (test so sánh từng dòng).

**D5, xóa dữ liệu:**
- **Phạm vi xóa:** hint, bước giải, thông điệp, báo lỗi phản hồi, sự kiện hoạt động, phiên học, bài làm, lượt làm, `study_participants`.
- **Phần được giữ lại:**
  - tài khoản `users` và lớp học;
  - `audit_log`, chỉ chứa ID và số lượng bản ghi đã xóa.
- **Bảo đảm dữ liệu biến mất khỏi file:** xóa với `secure_delete=ON`, sau đó checkpoint WAL.

**D6:** người chấm chỉ cần vai trò `researcher` và có tên trong đợt. Không cần vai trò `teacher`.

## 7. Lệnh chạy

```bash
cd api
python -m pip install -r requirements-dev.txt            # pytest==8.3.3, sympy==1.13.3 (chỉ dùng cho test)
python -m pytest                                         # 819 passed
python -m app.infrastructure.sqlite.cli migrate --db path/to/existing.db   # tự backup trước
```

## 8. Checklist nghiệm thu (Handoff §7, Giai đoạn 2)

| Tiêu chí | Đạt | Bằng chứng (test) |
|---|---|---|
| Cách giải khác đúng được chấp nhận | ✅ | `test_alternative_valid_path_accepted`, `test_alternative_valid_path_is_accepted` |
| Trừ 5 nhưng nhập 2x=22 bị nhận diện đúng loại lỗi | ✅ | Kết quả `SIGN_ERROR`: `test_handoff_example_end_to_end`, `test_step_classification` |
| Không chia 0; không thực thi mã từ input | ✅ | Các ca `DIVISION_BY_ZERO`, `test_code_injection_is_never_executed`, `test_resource_limits` |
| unknown không bị tính là sai | ✅ | `test_unknown_never_reported_as_invalid`, `test_unknown_input_is_not_a_failure_and_never_offers_hints`, `test_unknown_is_not_a_failure` |
| Vô nghiệm/vô số nghiệm xử lý đúng | ✅ | `test_x_free_conclusions`, `test_x_free_forms`, `test_conclusion` |
| Không chuyển state chỉ vì AI/client yêu cầu | ✅ | `test_client_cannot_skip_states`, `test_forbidden_transitions`, `test_independent_mode_hides_correctness_and_blocks_hints` |
| Hoàn thành luồng học bằng phản hồi mẫu, không tiết lộ nghiệm | ✅ | `test_handoff_example_end_to_end`, `test_no_reply_reveals_the_answer_before_student_writes_it`, `test_templates_never_leak_solution` |
| Bổ sung: retry ổn định, xóa dữ liệu theo quy tắc hai người | ✅ | `test_step_retry_returns_identical_reply`, `test_erasure.py` (11 test) |

## 9. Quyết định phát sinh khi triển khai (cần anh/chị xác nhận)

| # | Quyết định | Lập luận |
|---|---|---|
| E1 | `2.5` bị từ chối là không rõ nghĩa, không đọc thành 2 × 5 | Đúng tinh thần "dấu `.` chỉ là phép nhân", nhưng tránh chấm sai âm thầm khi học sinh quen viết thập phân bằng dấu chấm |
| E2 | `1/2x = ½·x` | Đúng cách viết thường gặp của học sinh THCS. Nếu muốn hiểu là `1/(2x)` thì nó thành ngoài phạm vi |
| E3 | Mode `practice` bắt đầu từ SOLVE_STEP, vẫn có gợi ý | Handoff chưa định nghĩa khác biệt giữa guided và practice |
| E4 | Knowledge/plan: sai 3 lần thì chuyển tiếp kèm hỗ trợ | Cụ thể hóa điều kiện "đã được hỗ trợ" trong §5.1. Tránh học sinh bị kẹt ở bước siêu nhận thức |
| E5 | Kết quả bước thay nghiệm và bước kết luận được lưu trong `solution_steps` với `operation` = `verify_substitution` / `conclude`, không bao giờ trở thành phương trình nền | Giữ toàn bộ lịch sử lần thử ở một bảng, có idempotency sẵn |
| E6 | `messages.content` dùng khuôn JSON `{"v":1,"text","meta"}`. Dòng cũ dạng văn bản thường vẫn đọc được | Lưu vết tương tác có cấu trúc cho HintPolicy và dashboard. Không cần bảng mới |
| E7 | Cờ `needs_teacher` được lưu thành một thông điệp `kind=flag` | Dashboard giáo viên ở Giai đoạn 3 sẽ đọc cờ này |
| E8 | Xóa dữ liệu (D5) dùng `secure_delete` và checkpoint WAL | Test cho thấy nếu không làm vậy, văn bản đã xóa **vẫn còn trong file DB** |

## 10. Rủi ro và phần còn lại

- **Bản backup trước thời điểm xóa vẫn chứa dữ liệu.** Cần chính sách giữ backup có thời hạn, hoặc xóa cả trên backup. [Cần quyết định chính sách đạo đức nghiên cứu]
- Danh mục `content/problems`, `content/feedback` và rubric đều ở trạng thái **pending_teacher_approval**.
- Leak guard chỉ kiểm tra theo từ ngữ. Ở Giai đoạn 3, đầu ra AI cần thêm lớp kiểm tra so khớp với MathChecker, kèm phương án dự phòng (fallback).
- Có hai chỗ ghi vào database bằng hai giao dịch riêng, chấp nhận được vì đều idempotent:
  - Ghi bước giải, rồi ghi gợi ý hệ thống tự đề xuất. Nếu crash giữa hai lần ghi, gợi ý đó bị bỏ qua, không bị nhân đôi.
  - Xác nhận nghiệm, rồi tạo phiên luyện độc lập. `ensure_independent_practice` có thể gọi lại để tạo phiên con.
- Ở chế độ independent, học sinh chưa có thao tác "kết luận vô nghiệm" riêng. Hiện hệ thống đánh giá qua dạng cuối cùng của các bước giải. Bài tương tự trong seed đều có một nghiệm.
- Hiệu năng chưa được đo dưới tải đồng thời.

## 11. Câu hỏi trước khi vào Giai đoạn 3

1. Anh/chị xác nhận E1–E8 không?
2. **Xác thực:** dùng JWT tự quản (FastAPI phát token, mật khẩu băm bằng Argon2) hay nhà cung cấp ngoài (Google/FPT SSO), chỉ ánh xạ sang `auth_subject`?
3. **Nhà cung cấp AI ở Giai đoạn 3:** Anthropic Claude hay nhà cung cấp khác? Có giới hạn chi phí hoặc số lượt gọi trên mỗi học sinh không?
4. **Thời gian lưu backup**, liên quan đến việc xóa dữ liệu (D5).
