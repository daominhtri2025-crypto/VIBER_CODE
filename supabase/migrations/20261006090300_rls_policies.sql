-- TASK-002 · Phân quyền (ACCESS_CONTROL §1, ADR-002, ADR-003).
-- Nguyên tắc: RLS bật trên mọi bảng; grant tường minh theo bảng/cột (phòng thủ nhiều lớp);
-- hàm kiểm tra nằm trong schema private (không expose qua Data API), security definer,
-- chỉ trả boolean/uuid để policy không phụ thuộc RLS lồng nhau.

-- ---------------------------------------------------------------------------
-- Hàm kiểm tra quyền
-- ---------------------------------------------------------------------------
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  );
$$;

create function private.course_is_live(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.courses c where c.id = target and c.status = 'published');
$$;

create function private.lesson_course_id(target uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ch.course_id
  from public.lessons l
  join public.chapters ch on ch.id = l.chapter_id
  where l.id = target;
$$;

create function private.lesson_is_live(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons l
    join public.chapters ch on ch.id = l.chapter_id
    join public.courses c on c.id = ch.course_id
    where l.id = target and l.status = 'published' and c.status = 'published'
  );
$$;

create function private.exercise_course_id(target uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.course_id from public.exercises e where e.id = target;
$$;

create function private.exercise_is_live(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exercises e
    join public.courses c on c.id = e.course_id
    where e.id = target and e.status = 'published' and c.status = 'published'
  );
$$;

create function private.is_enrolled(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments en
    where en.user_id = (select auth.uid()) and en.course_id = target_course
  );
$$;

create function private.can_read_lesson_content(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.lesson_is_live(target)
     and (
       exists (select 1 from public.lessons l where l.id = target and l.is_preview)
       or private.is_enrolled(private.lesson_course_id(target))
     );
$$;

create function private.has_attempt(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exercise_attempts a
    where a.user_id = (select auth.uid()) and a.exercise_id = target
  );
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to anon, authenticated;
grant execute on function
  private.course_is_live(uuid),
  private.lesson_is_live(uuid),
  private.exercise_is_live(uuid),
  private.can_read_lesson_content(uuid)
to anon, authenticated;
grant execute on function
  private.is_admin(),
  private.lesson_course_id(uuid),
  private.exercise_course_id(uuid),
  private.is_enrolled(uuid),
  private.has_attempt(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Bật RLS và đặt lại grant: mặc định từ chối, chỉ mở những gì ma trận cho phép.
-- ---------------------------------------------------------------------------
alter table public.courses enable row level security;
alter table public.chapters enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_contents enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_contents enable row level security;
alter table public.exercise_solutions enable row level security;
alter table public.learning_paths enable row level security;
alter table public.path_courses enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.exercise_attempts enable row level security;

revoke all on
  public.courses, public.chapters, public.lessons, public.lesson_contents,
  public.exercises, public.exercise_contents, public.exercise_solutions,
  public.learning_paths, public.path_courses,
  public.profiles, public.user_roles,
  public.enrollments, public.lesson_progress, public.exercise_attempts
from anon, authenticated;

-- Nội dung có phần public: anon và authenticated đọc; chỉ authenticated (admin qua policy) ghi.
grant select on
  public.courses, public.chapters, public.lessons, public.lesson_contents,
  public.exercises, public.learning_paths, public.path_courses
to anon, authenticated;
grant select on public.exercise_contents, public.exercise_solutions to authenticated;
grant insert, update, delete on
  public.courses, public.chapters, public.lessons, public.lesson_contents,
  public.exercises, public.exercise_contents, public.exercise_solutions,
  public.learning_paths, public.path_courses
to authenticated;

-- Dữ liệu cá nhân: chỉ authenticated, chỉ các cột được phép ghi.
grant select on public.profiles, public.user_roles, public.enrollments,
  public.lesson_progress, public.exercise_attempts to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert (user_id, course_id) on public.enrollments to authenticated;
grant insert (user_id, lesson_id, last_viewed_at, completed_at),
      update (last_viewed_at, completed_at) on public.lesson_progress to authenticated;
grant insert (user_id, exercise_id) on public.exercise_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- Policy: nội dung
-- ---------------------------------------------------------------------------
-- courses: đọc khóa đã xuất bản
create policy courses_select_published on public.courses
  for select to anon, authenticated
  using (status = 'published');
-- courses: admin toàn quyền
create policy courses_admin_all on public.courses
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- learning_paths: đọc lộ trình đã xuất bản
create policy learning_paths_select_published on public.learning_paths
  for select to anon, authenticated
  using (status = 'published');
-- learning_paths: admin toàn quyền
create policy learning_paths_admin_all on public.learning_paths
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- path_courses: đọc khi lộ trình và khóa đều đã xuất bản
create policy path_courses_select_published on public.path_courses
  for select to anon, authenticated
  using (
    private.course_is_live(course_id)
    and exists (select 1 from public.learning_paths p where p.id = path_courses.path_id and p.status = 'published')
  );
-- path_courses: admin toàn quyền
create policy path_courses_admin_all on public.path_courses
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Chương hiển thị khi khóa live và có ít nhất một bài live (DATA_MODEL §3).
-- chapters: đọc chương có bài đã xuất bản
create policy chapters_select_with_live_lesson on public.chapters
  for select to anon, authenticated
  using (
    private.course_is_live(course_id)
    and exists (select 1 from public.lessons l where l.chapter_id = chapters.id and l.status = 'published')
  );
-- chapters: admin toàn quyền
create policy chapters_admin_all on public.chapters
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- lessons: đọc metadata bài live
create policy lessons_select_live on public.lessons
  for select to anon, authenticated
  using (private.lesson_is_live(id));
-- lessons: admin toàn quyền
create policy lessons_admin_all on public.lessons
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- lesson_contents: preview hoặc đã đăng ký khóa
create policy lesson_contents_select_preview_or_enrolled on public.lesson_contents
  for select to anon, authenticated
  using (private.can_read_lesson_content(lesson_id));
-- lesson_contents: admin toàn quyền
create policy lesson_contents_admin_all on public.lesson_contents
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- exercises: đọc metadata bài tập live
create policy exercises_select_live on public.exercises
  for select to anon, authenticated
  using (private.exercise_is_live(id));
-- exercises: admin toàn quyền
create policy exercises_admin_all on public.exercises
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- exercise_contents: học viên đã đăng ký khóa
create policy exercise_contents_select_enrolled on public.exercise_contents
  for select to authenticated
  using (
    private.exercise_is_live(exercise_id)
    and private.is_enrolled(private.exercise_course_id(exercise_id))
  );
-- exercise_contents: admin toàn quyền
create policy exercise_contents_admin_all on public.exercise_contents
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- exercise_solutions: đã đăng ký và đã xác nhận thử giải
create policy exercise_solutions_select_enrolled_attempted on public.exercise_solutions
  for select to authenticated
  using (
    private.exercise_is_live(exercise_id)
    and private.is_enrolled(private.exercise_course_id(exercise_id))
    and private.has_attempt(exercise_id)
  );
-- exercise_solutions: admin toàn quyền
create policy exercise_solutions_admin_all on public.exercise_solutions
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Policy: dữ liệu cá nhân (Q09 mặc định: admin không đọc dữ liệu của người khác)
-- ---------------------------------------------------------------------------
-- profiles: đọc hồ sơ của mình
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
-- profiles: sửa hồ sơ của mình
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles: đọc role của mình
create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- enrollments: đọc đăng ký của mình
create policy enrollments_select_own on public.enrollments
  for select to authenticated
  using (user_id = (select auth.uid()));
-- enrollments: tự đăng ký khóa đã xuất bản
create policy enrollments_insert_own_live_course on public.enrollments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.course_is_live(course_id));

-- lesson_progress: đọc tiến độ của mình
create policy lesson_progress_select_own on public.lesson_progress
  for select to authenticated
  using (user_id = (select auth.uid()));
-- lesson_progress: ghi tiến độ bài live của khóa đã đăng ký
create policy lesson_progress_insert_own_enrolled on public.lesson_progress
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.lesson_is_live(lesson_id)
    and private.is_enrolled(private.lesson_course_id(lesson_id))
  );
-- lesson_progress: cập nhật tiến độ bài live của khóa đã đăng ký
create policy lesson_progress_update_own_enrolled on public.lesson_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and private.lesson_is_live(lesson_id)
    and private.is_enrolled(private.lesson_course_id(lesson_id))
  );

-- exercise_attempts: đọc lần thử của mình
create policy exercise_attempts_select_own on public.exercise_attempts
  for select to authenticated
  using (user_id = (select auth.uid()));
-- exercise_attempts: ghi lần thử bài tập live của khóa đã đăng ký
create policy exercise_attempts_insert_own_enrolled on public.exercise_attempts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.exercise_is_live(exercise_id)
    and private.is_enrolled(private.exercise_course_id(exercise_id))
  );
