# Dữ liệu và tài khoản demo (chỉ local)
> Chỉ dùng cho Supabase local. Script `npm run db:seed-users` từ chối chạy nếu API không trỏ tới `localhost`/`127.0.0.1`. Không dùng các mật khẩu này ở môi trường khác.

## Thiết lập
```bash
npm run db:start
npm run db:setup     # = db:reset (migration + supabase/seed.sql) → db:seed-users → db:env
```

## Tài khoản
Mật khẩu chung: `DemoLocal-2026!`

| Email | Role | Trạng thái |
|---|---|---|
| hocvien.a@demo.example.test | student | Đã đăng ký khóa Scratch; đã xem 2 bài, hoàn thành bài 1 |
| hocvien.b@demo.example.test | student | Chưa đăng ký khóa nào |
| quantri@demo.example.test | admin | Provision theo [ADMIN_PROVISIONING](ADMIN_PROVISIONING.md) |

Domain `example.test` là tên miền dành riêng cho kiểm thử, không nhận email thật. Email local (xác thực, khôi phục mật khẩu) xem ở Mailpit: http://127.0.0.1:54324.

## Nội dung demo (`supabase/seed.sql`)
| Khóa | Trạng thái | Nội dung |
|---|---|---|
| `demo-scratch-co-ban` | published, nổi bật | 2 chương × 2 bài published (bài 1 preview) + 1 bài draft; 2 bài tập (1 gắn bài học có gợi ý 2; 1 không gắn bài học, không có gợi ý 2) |
| `demo-python-nhap-mon` | published, nổi bật | 2 chương × 2 bài published (bài 1 preview); 2 bài tập published + 1 bài tập draft |
| `demo-python-nang-cao` | draft | 1 chương, 1 bài draft — ẩn với public |

Lộ trình: `demo-lo-trinh-scratch`, `demo-lo-trinh-python` (lộ trình Python chứa khóa draft để kiểm tra việc ẩn).

UUID cố định theo tiền tố: khóa `c000…`, chương `d000…`, bài `e000…`, bài tập `f000…`, lộ trình `a000…`.
