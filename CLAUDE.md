# Coding Academy — Project Instructions
## Mục tiêu
Website học lập trình tiếng Việt cho học sinh tiểu học và THCS: Scratch và Python, bài học, bài tập, tiến độ và quản trị. Tham khảo cách tổ chức Bumbii/Udemy; sử dụng nội dung và thương hiệu riêng.

## Trước mỗi nhiệm vụ
1. Đọc docs/PROJECT_STATUS.md và docs/product/MVP_SCOPE.md.
2. Đọc task được giao, tài liệu và rules liên quan.
3. Khảo sát mã hiện có trước khi sửa; không ghi đè thay đổi của người dùng.
4. Nêu ngắn gọn kế hoạch và cách kiểm tra rồi thực hiện nhiệm vụ đã được giao.

## Nguồn quyết định
Yêu cầu hiện tại của người dùng xác định phạm vi được giao. Nếu nó thay đổi đặc tả, cập nhật tài liệu bị ảnh hưởng. ADR ghi quyết định kỹ thuật; task ghi nghiệm thu. Nếu tài liệu mâu thuẫn ở phạm vi, dữ liệu hoặc quyền, nêu mâu thuẫn và hỏi trước phần phụ thuộc. Tự giải quyết chi tiết nhỏ, dễ sửa và ghi giả định.

## Stack dự kiến
Next.js App Router, TypeScript strict, Tailwind CSS, Supabase PostgreSQL/Auth/Storage; npm. Kiểm tra tài liệu chính thức và version tương thích ở bootstrap, ghi vào ADR và lockfile. Không tự đổi stack hoặc thêm dịch vụ trả phí.

## Cấu trúc
src/app: route và layout. src/features: nghiệp vụ. src/components: UI dùng chung. src/lib: tích hợp/tiện ích. supabase/migrations: thay đổi schema. Chỉ tạo file/thư mục khi cần; không tạo abstraction dư thừa.

## Dữ liệu và bảo mật
- Validate input tại server, kiểm tra authentication/authorization mỗi mutation.
- RLS cho bảng ứng dụng; kiểm thử với anon, student A, student B và admin.
- Role admin không được tự sửa bằng profile metadata phía client.
- Secret và service-role key không vào bundle client, Git, log hoặc báo cáo.
- Khóa nháp và lời giải bị khóa không được gửi xuống client rồi chỉ ẩn bằng CSS.
- Public chỉ xem nội dung published; học viên chỉ ghi dữ liệu cá nhân cho phép.
- Dữ liệu demo được gắn nhãn, không tạo đánh giá/số liệu quảng bá giả.

## Giao diện
Tiếng Việt; responsive; form có label và lỗi rõ; hỗ trợ bàn phím; có loading/empty/error khi phù hợp. Mỗi bài liên kết mục tiêu, nội dung và thực hành. Không để nút giả hoặc placeholder được báo cáo là hoàn chỉnh.

## Làm việc
Triển khai từng task. Không tự triển khai chạy/chấm code, AI, thanh toán, lớp học hoặc marketplace. Không hỏi lại với thay đổi local thông thường trong task đã giao. Không tự deploy production, xóa dữ liệu thật, force-push, reset thay đổi người dùng hoặc chạy migration phá hủy.

## Kiểm tra và hoàn thành
Sau task 001, dùng npm run lint, npm run typecheck, npm run test, npm run build theo thay đổi. Chạy test hành vi quan trọng, đặc biệt truy cập bị từ chối. Không nói test pass nếu chưa chạy. Nếu môi trường thiếu, ghi phần blocked, không thay bằng mock rồi tuyên bố xong.
Cập nhật docs/PROJECT_STATUS.md: task, file chính, lệnh kiểm tra, kết quả, hạn chế, bước tiếp. Cập nhật đặc tả khi hành vi thay đổi. Báo cáo kết quả ngắn gọn bằng tiếng Việt.
