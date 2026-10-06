# Verification
- Task định nghĩa hành vi cần kiểm tra, không viết test chỉ lặp lại implementation.
- Unit: validation, tính tiến độ, logic thuần. Integration: query/mutation và RLS. E2E: luồng học và admin quan trọng.
- Auth/RLS cần case chưa login, chủ sở hữu, người khác, admin.
- Nếu chưa có Supabase local, ghi integration tests blocked; unit mock không thay thế.
- Không xóa test đang fail để đạt xanh; xác định regression hay vấn đề có sẵn.
- Báo lệnh chạy và kết quả thật, không ghi pass khi chưa thực thi.
