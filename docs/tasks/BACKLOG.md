# Backlog
Triển khai theo thứ tự; mỗi task có status riêng. PROJECT_STATUS là điểm tiếp tục phiên. Câu hỏi mở: [OPEN_QUESTIONS](../OPEN_QUESTIONS.md).

| Task | Nhiệm vụ | Phụ thuộc | Câu hỏi liên quan | Status |
|---|---|---|---|---|
| [000](000-review-spec.md) | Rà soát đặc tả | Không | — | done |
| [001](001-bootstrap.md) | Khởi tạo dự án | 000 | — | done |
| [002](002-schema-content.md) | Schema nội dung và RLS nội dung | 001 | Q03, Q04, Q12 | done |
| [003](003-schema-learner.md) | Schema học viên, role và RLS cá nhân | 002 | — | done (cùng 002) |
| [004](004-seed-and-types.md) | Seed demo, DB types và provision admin | 003 | — | done |
| [005](005-auth-signup-login.md) | Đăng ký, đăng nhập, đăng xuất | 003, 004 | Q01, Q02, Q08 | done |
| [006](006-auth-recovery.md) | Khôi phục mật khẩu | 005 | — | pending |
| [007](007-profile-guards.md) | Hồ sơ và bảo vệ route | 005 | — | pending |
| [008](008-layout-home.md) | Layout chung và trang chủ | 001, 004 | — | pending |
| [009](009-paths.md) | Lộ trình học (phụ thuộc Q03) | 008 | Q03 | pending |
| [010](010-catalog-course-detail.md) | Catalog và chi tiết khóa học | 008 | — | pending |
| [011](011-enrollment.md) | Đăng ký khóa học | 007, 010 | Q10 | pending |
| [012](012-lesson-page.md) | Trang học bài | 011 | Q07 | pending |
| [013](013-exercises-list-detail.md) | Danh sách và chi tiết bài tập, gợi ý | 011 | Q05 | pending |
| [014](014-exercise-solution.md) | Xác nhận đã thử và mở lời giải | 013 | — | pending |
| [015](015-lesson-progress.md) | Đánh dấu hoàn thành và ghi bài đã xem | 012 | — | pending |
| [016](016-dashboard-continue.md) | Dashboard và học tiếp | 015 | Q04 | pending |
| [017](017-admin-courses.md) | Quản trị khóa học và chương | 007, 004 | Q09 | pending |
| [018](018-admin-lessons.md) | Quản trị bài học | 017 | Q07, Q15 | pending |
| [019](019-admin-exercises.md) | Quản trị bài tập và lời giải | 018 | Q06, Q14 | pending |
| [020](020-admin-paths.md) | Quản trị lộ trình (phụ thuộc Q03) | 017, 009 | Q03 | pending |
| [021](021-admin-assets.md) | Upload ảnh cho bài học và đề bài | 018 | Q06 | pending |
| [022](022-acceptance.md) | Nghiệm thu MVP | 005–021 (trừ task bị bỏ theo Q03) | Q03 | pending |

## Giai đoạn
- **Nền tảng**: 000–004
- **Tài khoản**: 005–007
- **Học viên**: 008–016
- **Quản trị**: 017–021
- **Nghiệm thu**: 022

Task 009 và 020 bị bỏ nếu Q03 chọn suy ra lộ trình từ ngôn ngữ của khóa.
