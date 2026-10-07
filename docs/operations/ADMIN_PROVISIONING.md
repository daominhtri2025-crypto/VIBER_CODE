# Cấp và thu hồi quyền admin
Theo [ADR-003](../decisions/003-identity-and-roles.md): ứng dụng **không** có UI hay API gán role. Chỉ chủ database thực hiện bằng SQL. Mọi tài khoản mới mặc định là `student` (trigger `on_auth_user_created`).

## Điều kiện
- Người thực hiện có quyền chủ database: Supabase SQL Editor của project, hoặc `psql` vào DB local (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
- Người được cấp quyền đã tự đăng ký tài khoản bằng email.
- Ghi lại ai cấp, cho ai, lúc nào, lý do (sổ vận hành của nhóm; ứng dụng chưa có audit log — Q16).

## Cấp quyền admin
```sql
update public.user_roles
set role = 'admin', granted_at = now()
where user_id = (select id from auth.users where email = 'giaovien@example.com')
returning user_id, role, granted_at;
```
Kết quả phải trả về đúng **1 dòng**. Nếu trả về 0 dòng, email chưa đăng ký hoặc nhập sai.

## Thu hồi quyền admin
```sql
update public.user_roles
set role = 'student', granted_at = now()
where user_id = (select id from auth.users where email = 'giaovien@example.com')
returning user_id, role;
```

## Kiểm tra danh sách admin
```sql
select u.email, r.role, r.granted_at
from public.user_roles r
join auth.users u on u.id = r.user_id
where r.role = 'admin'
order by r.granted_at;
```

## Lưu ý
- Quyền có hiệu lực ở truy vấn kế tiếp (policy gọi `private.is_admin()` mỗi lần), không cần đăng nhập lại.
- Không sửa `raw_user_meta_data` để cấp quyền: trigger và policy bỏ qua metadata.
- Không dùng service-role/secret key trong trình duyệt hay ứng dụng để thay thế quy trình này.
