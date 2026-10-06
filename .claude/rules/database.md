---
paths:
  - "supabase/**/*"
  - "src/lib/supabase/**/*"
  - "src/features/**/queries.ts"
  - "src/features/**/actions.ts"
---
# Database
- Đọc DATA_MODEL.md và ACCESS_CONTROL.md.
- Mọi schema change có migration. Không sửa migration đã áp dụng trên môi trường dùng chung.
- FK, unique, check và index theo access pattern, không chỉ validate client.
- Seed chỉ dữ liệu demo. Không chứa mật khẩu hoặc danh tính thật.
- RLS mặc định từ chối nếu chưa có policy cho phép.
- Test quyền bằng client thường; không dùng service-role để chứng minh RLS hoạt động.
- Không tự chạy thao tác phá hủy ngoài local disposable environment được giao.
