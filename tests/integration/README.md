# Integration tests
Kiểm thử query/mutation và RLS với Supabase local, bắt đầu từ TASK-002. Quy ước: file `*.test.ts`, dùng client thường của từng chủ thể (anon, student A, student B, admin); không dùng service-role để chứng minh RLS. Ca bắt buộc: `docs/architecture/ACCESS_CONTROL.md` §4.
