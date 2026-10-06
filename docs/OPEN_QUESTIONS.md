# Câu hỏi cần chốt
Cập nhật: 06/10/2026 (TASK-000). Mỗi câu có **đề xuất mặc định**; nếu chưa chốt, các task dùng mặc định và ghi giả định. Khi chốt: ghi ngày, quyết định, cập nhật tài liệu liên quan và đổi trạng thái.

| ID | Câu hỏi | Đề xuất mặc định | Ảnh hưởng | Hạn chốt | Trạng thái |
|---|---|---|---|---|---|
| Q01 | Cơ chế đồng ý của cha mẹ/người giám hộ khi trẻ em tạo tài khoản; chính sách riêng tư phù hợp pháp luật Việt Nam về bảo vệ dữ liệu cá nhân | Local: không thu thập thêm dữ liệu, ghi hạn chế. Trước khi public: xin ý kiến pháp lý về Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân 2025 [Cần bổ sung nguồn — văn bản chính thức và điều khoản áp dụng cần được chuyên gia pháp lý xác minh] | Form đăng ký (005), trang chính sách, phát hành | Trước public; nên trước 005 | Mở |
| Q02 | Ai tạo tài khoản: học sinh tự đăng ký bằng email riêng, phụ huynh đăng ký thay, hay giáo viên tạo hàng loạt? | Tự đăng ký bằng email (của học sinh hoặc phụ huynh) | 005, 007; có thể phát sinh role phụ huynh (ngoài MVP) | Trước 005 | Mở |
| Q03 | Giữ thực thể "lộ trình" (`learning_paths`) hay suy ra lộ trình từ `courses.language` + `position`? | Khuyến nghị **bỏ bảng path** trong MVP; `/paths/scratch`, `/paths/python` lấy khóa theo ngôn ngữ. Baseline hiện vẫn giữ để chờ chốt | DATA_MODEL, 002, 009, 020 | Trước 002 | Mở |
| Q04 | Khóa archived: học viên đã enroll có tiếp tục học không? | Không; ẩn với mọi chủ thể trừ admin, giữ tiến độ, hiện lại khi publish | RLS (002), dashboard (016) | Trước 002 | Mở |
| Q05 | Số mức gợi ý và gợi ý có cần bảo vệ như lời giải không? | 2 mức cố định (`hint2` tùy chọn); gợi ý gửi cùng đề cho học viên đã enroll; không ghi log xem gợi ý | 002, 013 | Trước 013 | Mở |
| Q06 | Trình bày bài tập/lời giải Scratch: ảnh khối lệnh, nhúng dự án scratch.mit.edu, hay văn bản? | Đề có thể dùng ảnh (bucket public); lời giải MVP chỉ văn bản/mã, không có ảnh; nhúng dự án Scratch để sau | 019, 021 | Trước 019 | Mở |
| Q07 | Allowlist nhà cung cấp video | Chỉ YouTube dạng nhúng `youtube-nocookie.com`; kiểm tra điều khoản sử dụng với người dùng là trẻ em [Cần bổ sung nguồn] | 012, 018, CSP | Trước 012 | Mở |
| Q08 | Bắt buộc xác thực email khi đăng ký? Dịch vụ gửi email production? | Bắt buộc ở production; local dùng mail catcher của Supabase CLI; SMTP production chốt khi phát hành | 005, 006 | Trước 005 | Mở |
| Q09 | Admin có cần xem tiến độ/danh sách học viên theo từng cá nhân? | Không trong MVP (tối thiểu hóa dữ liệu trẻ em); `/admin` chỉ đếm nội dung theo trạng thái | ACCESS_CONTROL, 017 | Trước 017 | Mở |
| Q10 | Cho phép học viên hủy đăng ký khóa? | Không trong MVP | 011 | Trước 011 | Mở |
| Q11 | Tên thương hiệu, tên miền, hosting, chính sách riêng tư/điều khoản | Tên tạm "Coding Academy"; chưa deploy | Phát hành | Trước public | Mở |
| Q12 | Môi trường DB phát triển: Supabase CLI local (cần Docker) hay project Supabase dev trên cloud? | Supabase CLI local; nếu không có Docker, integration test ghi blocked | 001–004, mọi integration test | Trước 002 | Mở |
| Q13 | Quyền sử dụng học liệu, ảnh khối lệnh Scratch, tên/logo Scratch | Học liệu tự biên soạn; dùng tên "Scratch" để mô tả, không dùng logo cho tới khi đối chiếu hướng dẫn thương hiệu của Scratch Foundation [Cần bổ sung nguồn] | Nội dung, UI | Trước public | Mở |
| Q14 | Publish bài tập có bắt buộc lời giải và gợi ý 1? | Có (D11) | 019 | Trước 019 | Mở |
| Q15 | Unpublish bài cuối cùng của khóa published: chặn hay tự chuyển khóa về draft? | Chặn, yêu cầu admin chuyển khóa về draft trước (D10) | 018 | Trước 018 | Mở |

## Câu hỏi đã chốt
(Chưa có.)
