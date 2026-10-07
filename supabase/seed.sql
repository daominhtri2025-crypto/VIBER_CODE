-- TASK-004 · Dữ liệu DEMO cho phát triển local. Mọi tiêu đề gắn nhãn "[Demo]".
-- Không chứa danh tính hay mật khẩu; tài khoản demo tạo bằng `npm run db:seed-users`.
-- Thứ tự tôn trọng bất biến (DATA_MODEL §4): tạo draft → thêm nội dung → xuất bản bài → xuất bản khóa.
--
-- Độ phủ: bài preview; bài draft trong khóa published; khóa draft; bài tập gắn/không gắn bài học;
-- bài tập có/không có gợi ý 2; bài tập draft; lộ trình chứa khóa draft (bị ẩn với public).

-- ---------------------------------------------------------------------------
-- Khóa học
-- ---------------------------------------------------------------------------
insert into public.courses (id, slug, title, summary, objectives_md, requirements_md, language, level, is_featured, position) values
  ('c0000000-0000-4000-8000-000000000001', 'demo-scratch-co-ban',
   '[Demo] Scratch cơ bản: Làm quen khối lệnh',
   'Làm quen giao diện Scratch, điều khiển nhân vật bằng khối lệnh chuyển động, sự kiện và vòng lặp.',
   E'- Nhận biết các khu vực chính của Scratch.\n- Ghép khối lệnh để nhân vật di chuyển.\n- Dùng sự kiện và vòng lặp để tạo chuyển động lặp lại.',
   E'- Biết dùng chuột và bàn phím.\n- Không cần kinh nghiệm lập trình.',
   'scratch', 'beginner', true, 1),
  ('c0000000-0000-4000-8000-000000000002', 'demo-python-nhap-mon',
   '[Demo] Python nhập môn',
   'Viết chương trình Python đầu tiên: in ra màn hình, biến, câu lệnh điều kiện và vòng lặp.',
   E'- Viết và chạy chương trình in ra màn hình.\n- Dùng biến để lưu dữ liệu.\n- Dùng if và for để điều khiển chương trình.',
   E'- Đã làm quen máy tính.\n- Nên học trước khóa Scratch cơ bản.',
   'python', 'beginner', true, 2),
  ('c0000000-0000-4000-8000-000000000003', 'demo-python-nang-cao',
   '[Demo] Python nâng cao (bản nháp)',
   'Khóa đang soạn, chưa xuất bản.',
   '', '', 'python', 'intermediate', false, 3);

-- ---------------------------------------------------------------------------
-- Chương
-- ---------------------------------------------------------------------------
insert into public.chapters (id, course_id, title, position) values
  ('d0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', '[Demo] Làm quen Scratch', 1),
  ('d0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', '[Demo] Sự kiện và vòng lặp', 2),
  ('d0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000002', '[Demo] Bắt đầu với Python', 1),
  ('d0000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-000000000002', '[Demo] Điều kiện và vòng lặp', 2),
  ('d0000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000003', '[Demo] Hàm', 1);

-- ---------------------------------------------------------------------------
-- Bài học (tạo ở trạng thái draft)
-- ---------------------------------------------------------------------------
insert into public.lessons (id, chapter_id, slug, title, summary, is_preview, position) values
  ('e0000000-0000-4000-8000-000000000111', 'd0000000-0000-4000-8000-000000000011', 'demo-scratch-giao-dien',
   '[Demo] Giao diện Scratch', 'Sân khấu, nhân vật, khu khối lệnh và khu lập trình.', true, 1),
  ('e0000000-0000-4000-8000-000000000112', 'd0000000-0000-4000-8000-000000000011', 'demo-scratch-chuyen-dong',
   '[Demo] Khối lệnh chuyển động', 'Di chuyển và xoay nhân vật.', false, 2),
  ('e0000000-0000-4000-8000-000000000121', 'd0000000-0000-4000-8000-000000000012', 'demo-scratch-su-kien',
   '[Demo] Sự kiện bắt đầu', 'Bắt đầu chương trình khi bấm lá cờ xanh.', false, 1),
  ('e0000000-0000-4000-8000-000000000122', 'd0000000-0000-4000-8000-000000000012', 'demo-scratch-vong-lap',
   '[Demo] Vòng lặp lặp lại', 'Lặp lại một nhóm lệnh nhiều lần.', false, 2),
  ('e0000000-0000-4000-8000-000000000123', 'd0000000-0000-4000-8000-000000000012', 'demo-scratch-bien-nhap',
   '[Demo] Biến (bản nháp)', 'Bài đang soạn trong khóa đã xuất bản.', false, 3),
  ('e0000000-0000-4000-8000-000000000211', 'd0000000-0000-4000-8000-000000000021', 'demo-python-print',
   '[Demo] Hàm print', 'In chữ và số ra màn hình.', true, 1),
  ('e0000000-0000-4000-8000-000000000212', 'd0000000-0000-4000-8000-000000000021', 'demo-python-bien',
   '[Demo] Biến và kiểu dữ liệu', 'Lưu dữ liệu bằng biến; số và chuỗi.', false, 2),
  ('e0000000-0000-4000-8000-000000000221', 'd0000000-0000-4000-8000-000000000022', 'demo-python-if',
   '[Demo] Câu lệnh if', 'Chọn việc cần làm theo điều kiện.', false, 1),
  ('e0000000-0000-4000-8000-000000000222', 'd0000000-0000-4000-8000-000000000022', 'demo-python-for',
   '[Demo] Vòng lặp for', 'Lặp với range().', false, 2),
  ('e0000000-0000-4000-8000-000000000311', 'd0000000-0000-4000-8000-000000000031', 'demo-python-ham',
   '[Demo] Định nghĩa hàm', 'Bài trong khóa bản nháp.', false, 1);

insert into public.lesson_contents (lesson_id, body_md) values
  ('e0000000-0000-4000-8000-000000000111', E'## Mục tiêu\nNhận biết sân khấu, nhân vật, khu khối lệnh và khu lập trình.\n\n## Giải thích\nScratch gồm **sân khấu** (nơi nhân vật hoạt động), **danh sách nhân vật**, **khu khối lệnh** (các khối màu theo nhóm) và **khu lập trình** (nơi kéo thả khối).\n\n## Thực hành\nMở Scratch, chọn nhân vật Mèo và tìm nhóm khối *Chuyển động*.\n\n## Bước tiếp\nBài sau: làm cho nhân vật di chuyển.'),
  ('e0000000-0000-4000-8000-000000000112', E'## Mục tiêu\nDùng khối *di chuyển* và *xoay* để điều khiển nhân vật.\n\n## Giải thích\nKhối `di chuyển (10) bước` đẩy nhân vật theo hướng đang nhìn; khối `xoay (15) độ` đổi hướng.\n\n## Thực hành\nGhép khối để Mèo đi 50 bước rồi xoay 90 độ.'),
  ('e0000000-0000-4000-8000-000000000121', E'## Mục tiêu\nBắt đầu chương trình bằng sự kiện.\n\n## Giải thích\nKhối `khi bấm vào lá cờ xanh` nằm ở đầu chương trình; các khối bên dưới chạy khi bấm cờ.\n\n## Thực hành\nĐặt khối sự kiện phía trên đoạn lệnh di chuyển ở bài trước.'),
  ('e0000000-0000-4000-8000-000000000122', E'## Mục tiêu\nDùng vòng lặp để không phải lặp lại khối lệnh.\n\n## Giải thích\nKhối `lặp lại (4)` chạy các khối bên trong 4 lần.\n\n## Thực hành\nLàm bài tập **Vẽ hình vuông**.'),
  ('e0000000-0000-4000-8000-000000000123', E'## Mục tiêu\n(Bản nháp) Làm quen với biến.'),
  ('e0000000-0000-4000-8000-000000000211', E'## Mục tiêu\nIn chữ và số ra màn hình.\n\n## Ví dụ\n```python\nprint("Xin chào!")\nprint(2 + 3)\n```\n\n## Thực hành\nIn ra tên của em.'),
  ('e0000000-0000-4000-8000-000000000212', E'## Mục tiêu\nLưu dữ liệu bằng biến.\n\n## Ví dụ\n```python\nten = "An"\ntuoi = 12\nprint(ten, tuoi)\n```\n\n## Thực hành\nLàm bài tập **Chào tên bạn**.'),
  ('e0000000-0000-4000-8000-000000000221', E'## Mục tiêu\nDùng `if` để chọn việc cần làm.\n\n## Ví dụ\n```python\ndiem = 8\nif diem >= 5:\n    print("Đạt")\nelse:\n    print("Chưa đạt")\n```'),
  ('e0000000-0000-4000-8000-000000000222', E'## Mục tiêu\nLặp với `for` và `range`.\n\n## Ví dụ\n```python\nfor i in range(1, 4):\n    print(i)\n```\n\n## Thực hành\nLàm bài tập **Tổng từ 1 đến n**.'),
  ('e0000000-0000-4000-8000-000000000311', E'## Mục tiêu\n(Bản nháp) Định nghĩa hàm với `def`.');

update public.lessons set status = 'published'
where id in (
  'e0000000-0000-4000-8000-000000000111', 'e0000000-0000-4000-8000-000000000112',
  'e0000000-0000-4000-8000-000000000121', 'e0000000-0000-4000-8000-000000000122',
  'e0000000-0000-4000-8000-000000000211', 'e0000000-0000-4000-8000-000000000212',
  'e0000000-0000-4000-8000-000000000221', 'e0000000-0000-4000-8000-000000000222'
);

-- ---------------------------------------------------------------------------
-- Bài tập (tạo draft, thêm đề/gợi ý/lời giải, rồi xuất bản)
-- ---------------------------------------------------------------------------
insert into public.exercises (id, course_id, lesson_id, slug, title, difficulty, position) values
  ('f0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000122', 'demo-scratch-ve-hinh-vuong', '[Demo] Vẽ hình vuông', 'beginner', 1),
  ('f0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001',
   null, 'demo-scratch-meo-chao', '[Demo] Mèo chào bạn', 'beginner', 2),
  ('f0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000212', 'demo-python-chao-ten', '[Demo] Chào tên bạn', 'beginner', 1),
  ('f0000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-000000000002',
   'e0000000-0000-4000-8000-000000000222', 'demo-python-tong-1-den-n', '[Demo] Tổng từ 1 đến n', 'intermediate', 2),
  ('f0000000-0000-4000-8000-000000000023', 'c0000000-0000-4000-8000-000000000002',
   null, 'demo-python-ban-nhap', '[Demo] Bài tập bản nháp', 'beginner', 3);

insert into public.exercise_contents (exercise_id, statement_md, hint1_md, hint2_md) values
  ('f0000000-0000-4000-8000-000000000011',
   E'Dùng bút vẽ và vòng lặp để Mèo vẽ một **hình vuông** cạnh 100 bước.',
   'Hình vuông có 4 cạnh bằng nhau và 4 góc vuông (90 độ).',
   'Trong khối `lặp lại (4)`: di chuyển 100 bước, rồi xoay 90 độ.'),
  ('f0000000-0000-4000-8000-000000000012',
   E'Khi bấm lá cờ xanh, Mèo nói "Xin chào!" trong 2 giây.',
   'Tìm khối nói trong nhóm *Hiển thị*.',
   null),
  ('f0000000-0000-4000-8000-000000000021',
   E'Tạo biến `ten` chứa tên của em rồi in ra: `Xin chào, <tên>!`.\n\nVí dụ: với `ten = "An"`, chương trình in `Xin chào, An!`.',
   'Dùng dấu `=` để gán giá trị cho biến.',
   'Có thể ghép chuỗi bằng f-string: `f"Xin chào, {ten}!"`.'),
  ('f0000000-0000-4000-8000-000000000022',
   E'Cho `n = 10`. Tính và in tổng `1 + 2 + ... + n`.',
   'Tạo biến `tong = 0` rồi cộng dần trong vòng lặp `for`.',
   null),
  ('f0000000-0000-4000-8000-000000000023', '', '', null);

insert into public.exercise_solutions (exercise_id, solution_md) values
  ('f0000000-0000-4000-8000-000000000011',
   E'1. `khi bấm vào lá cờ xanh`\n2. `đặt bút xuống`\n3. `lặp lại (4)`: `di chuyển (100) bước`, `xoay (90) độ`'),
  ('f0000000-0000-4000-8000-000000000012',
   E'1. `khi bấm vào lá cờ xanh`\n2. `nói (Xin chào!) trong (2) giây`'),
  ('f0000000-0000-4000-8000-000000000021',
   E'```python\nten = "An"\nprint(f"Xin chào, {ten}!")\n```'),
  ('f0000000-0000-4000-8000-000000000022',
   E'```python\nn = 10\ntong = 0\nfor i in range(1, n + 1):\n    tong = tong + i\nprint(tong)  # 55\n```'),
  ('f0000000-0000-4000-8000-000000000023', '');

update public.exercises set status = 'published'
where id in (
  'f0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000012',
  'f0000000-0000-4000-8000-000000000021', 'f0000000-0000-4000-8000-000000000022'
);

-- Xuất bản khóa sau khi đã có bài published (khóa 3 giữ draft).
update public.courses set status = 'published'
where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Lộ trình (Q03: giữ bảng)
-- ---------------------------------------------------------------------------
insert into public.learning_paths (id, slug, title, description, language, status, position) values
  ('a0000000-0000-4000-8000-000000000001', 'demo-lo-trinh-scratch', '[Demo] Lộ trình Scratch',
   'Dành cho học sinh tiểu học bắt đầu làm quen lập trình.', 'scratch', 'published', 1),
  ('a0000000-0000-4000-8000-000000000002', 'demo-lo-trinh-python', '[Demo] Lộ trình Python',
   'Dành cho học sinh THCS học ngôn ngữ lập trình văn bản.', 'python', 'published', 2);

insert into public.path_courses (path_id, course_id, position) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 1),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 1),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003', 2);
