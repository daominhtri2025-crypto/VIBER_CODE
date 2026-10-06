-- TASK-002 (gộp phần schema của TASK-003) · Danh tính, role, dữ liệu học viên (ADR-003).

create type public.app_role as enum ('student', 'admin');

-- ---------------------------------------------------------------------------
-- Danh tính và vai trò
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (
    char_length(display_name) between 1 and 50 and display_name = btrim(display_name)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'student',
  granted_at timestamptz not null default now()
);

-- Tạo profile + role student khi đăng ký. Chỉ lấy display_name từ metadata (client kiểm soát);
-- mọi khóa khác, kể cả "role", bị bỏ qua.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 50);
begin
  requested_name := btrim(requested_name);
  if requested_name = '' then
    requested_name := 'Học viên';
  end if;

  insert into public.profiles (id, display_name) values (new.id, requested_name);
  insert into public.user_roles (user_id, role) values (new.id, 'student');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Dữ liệu học viên: xóa user → xóa dữ liệu của user; nội dung đã được tham chiếu → không xóa được.
-- ---------------------------------------------------------------------------
create table public.enrollments (
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index enrollments_course_id_idx on public.enrollments (course_id);

create table public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  last_viewed_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);
create index lesson_progress_user_last_viewed_idx on public.lesson_progress (user_id, last_viewed_at desc);
create index lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);

create table public.exercise_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  tried_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index exercise_attempts_exercise_id_idx on public.exercise_attempts (exercise_id);
