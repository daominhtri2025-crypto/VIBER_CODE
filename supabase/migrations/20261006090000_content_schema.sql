-- TASK-002 · Schema nội dung (DATA_MODEL §1–2, ADR-002).
-- Metadata public và nội dung private nằm ở bảng riêng để RLS thực thi theo hàng.

create schema if not exists private;
comment on schema private is 'Hàm nội bộ dùng cho policy/trigger; không expose qua Data API.';

-- ---------------------------------------------------------------------------
-- Kiểu liệt kê
-- ---------------------------------------------------------------------------
create type public.learning_language as enum ('scratch', 'python');
create type public.skill_level as enum ('beginner', 'intermediate', 'advanced');
create type public.content_status as enum ('draft', 'published', 'archived');

-- ---------------------------------------------------------------------------
-- Tiện ích chung
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Slug: chữ thường ASCII, số, dấu '-', 3–80 ký tự.
create domain public.slug as text
  check (char_length(value) between 3 and 80 and value ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ---------------------------------------------------------------------------
-- Khóa học, chương, bài học
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 300),
  objectives_md text not null default '',
  requirements_md text not null default '',
  cover_image_path text,
  language public.learning_language not null,
  level public.skill_level not null default 'beginner',
  status public.content_status not null default 'draft',
  is_featured boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_status_language_idx on public.courses (status, language);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapters_course_position_key unique (course_id, position) deferrable initially immediate
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  slug public.slug not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 300),
  is_preview boolean not null default false,
  status public.content_status not null default 'draft',
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_chapter_position_key unique (chapter_id, position) deferrable initially immediate
);

create table public.lesson_contents (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  body_md text not null default '',
  -- Q07 (mặc định): chỉ nhận URL nhúng youtube-nocookie dạng chuẩn hóa.
  video_url text check (
    video_url is null
    or video_url ~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}$'
  ),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bài tập
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  slug public.slug not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  difficulty public.skill_level not null default 'beginner',
  status public.content_status not null default 'draft',
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_course_position_key unique (course_id, position) deferrable initially immediate
);
create index exercises_lesson_id_idx on public.exercises (lesson_id);

create table public.exercise_contents (
  exercise_id uuid primary key references public.exercises (id) on delete cascade,
  statement_md text not null default '',
  hint1_md text not null default '',
  hint2_md text,
  updated_at timestamptz not null default now()
);

create table public.exercise_solutions (
  exercise_id uuid primary key references public.exercises (id) on delete cascade,
  -- Q06 (mặc định): lời giải MVP chỉ văn bản/mã.
  solution_md text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lộ trình (Q03: giữ bảng theo yêu cầu 06/10/2026)
-- ---------------------------------------------------------------------------
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  slug public.slug not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '',
  language public.learning_language not null,
  status public.content_status not null default 'draft',
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.path_courses (
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  position integer not null check (position >= 0),
  primary key (path_id, course_id),
  constraint path_courses_path_position_key unique (path_id, position) deferrable initially immediate
);
create index path_courses_course_id_idx on public.path_courses (course_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.courses
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.chapters
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.lessons
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.lesson_contents
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.exercises
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.exercise_contents
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.exercise_solutions
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.learning_paths
  for each row execute function private.set_updated_at();
