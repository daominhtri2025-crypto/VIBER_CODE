-- TASK-002 · Bất biến nội dung (DATA_MODEL §4; D10, D11).
-- Các hàm kiểm tra chạy security definer để đếm đủ hàng bất kể RLS của người gọi;
-- chỉ raise lỗi, không trả dữ liệu. Mã lỗi check_violation (23514) + thông điệp có tiền tố để
-- tầng server ánh xạ sang lỗi VALIDATION.

-- ---------------------------------------------------------------------------
-- Cấu trúc: không chuyển chương/bài sang khóa khác; bài tập gắn bài học cùng khóa.
-- ---------------------------------------------------------------------------
create function private.guard_chapter_course()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.course_id <> old.course_id then
    raise exception 'CHAPTER_COURSE_IMMUTABLE: không thể chuyển chương sang khóa khác'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_chapter_course before update of course_id on public.chapters
  for each row execute function private.guard_chapter_course();

create function private.guard_lesson_chapter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chapter_id <> old.chapter_id
     and (select course_id from public.chapters where id = new.chapter_id)
         is distinct from (select course_id from public.chapters where id = old.chapter_id) then
    raise exception 'LESSON_COURSE_IMMUTABLE: chỉ được chuyển bài sang chương cùng khóa'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_lesson_chapter before update of chapter_id on public.lessons
  for each row execute function private.guard_lesson_chapter();

create function private.guard_exercise_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_id is not null and not exists (
    select 1
    from public.lessons l
    join public.chapters ch on ch.id = l.chapter_id
    where l.id = new.lesson_id and ch.course_id = new.course_id
  ) then
    raise exception 'EXERCISE_LESSON_COURSE_MISMATCH: bài học phải thuộc cùng khóa với bài tập'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_exercise_lesson before insert or update of lesson_id, course_id on public.exercises
  for each row execute function private.guard_exercise_lesson();

-- ---------------------------------------------------------------------------
-- Publish khóa: phải có ít nhất một bài published.
-- ---------------------------------------------------------------------------
create function private.guard_course_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not exists (
       select 1
       from public.lessons l
       join public.chapters ch on ch.id = l.chapter_id
       where ch.course_id = new.id and l.status = 'published'
     ) then
    raise exception 'COURSE_PUBLISH_REQUIRES_LESSON: khóa cần ít nhất một bài đã xuất bản'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_course_publish before insert or update of status on public.courses
  for each row execute function private.guard_course_publish();

-- ---------------------------------------------------------------------------
-- Bài học: publish cần nội dung; không gỡ bài published cuối cùng của khóa published (D10).
-- ---------------------------------------------------------------------------
create function private.guard_lesson_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson_course uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'published'
     and not exists (
       select 1 from public.lesson_contents c
       where c.lesson_id = new.id and btrim(c.body_md) <> ''
     ) then
    raise exception 'LESSON_PUBLISH_REQUIRES_BODY: bài học cần nội dung trước khi xuất bản'
      using errcode = 'check_violation';
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.status = 'published'
     and (tg_op = 'DELETE' or new.status <> 'published') then
    select ch.course_id into lesson_course from public.chapters ch where ch.id = old.chapter_id;

    if exists (select 1 from public.courses c where c.id = lesson_course and c.status = 'published')
       and not exists (
         select 1
         from public.lessons l
         join public.chapters ch on ch.id = l.chapter_id
         where ch.course_id = lesson_course and l.status = 'published' and l.id <> old.id
       ) then
      raise exception 'LAST_PUBLISHED_LESSON: không thể gỡ bài đã xuất bản cuối cùng của khóa đang xuất bản'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_lesson_status before insert or update of status or delete on public.lessons
  for each row execute function private.guard_lesson_status();

create function private.guard_lesson_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.lesson_id else new.lesson_id end;
begin
  if exists (select 1 from public.lessons l where l.id = target and l.status = 'published')
     and (tg_op = 'DELETE' or btrim(new.body_md) = '') then
    raise exception 'LESSON_PUBLISH_REQUIRES_BODY: bài đã xuất bản phải có nội dung'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_lesson_content before update or delete on public.lesson_contents
  for each row execute function private.guard_lesson_content();

-- ---------------------------------------------------------------------------
-- Bài tập: publish cần đề, gợi ý 1 và lời giải (D11).
-- ---------------------------------------------------------------------------
create function private.exercise_is_complete(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.exercise_contents c
           where c.exercise_id = target and btrim(c.statement_md) <> '' and btrim(c.hint1_md) <> ''
         )
     and exists (
           select 1 from public.exercise_solutions s
           where s.exercise_id = target and btrim(s.solution_md) <> ''
         );
$$;

create function private.guard_exercise_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and not private.exercise_is_complete(new.id) then
    raise exception 'EXERCISE_PUBLISH_INCOMPLETE: bài tập cần đề, gợi ý 1 và lời giải trước khi xuất bản'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_exercise_publish before insert or update of status on public.exercises
  for each row execute function private.guard_exercise_publish();

create function private.guard_exercise_parts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.exercise_id else new.exercise_id end;
begin
  -- AFTER trigger: kiểm tra trạng thái sau thay đổi.
  if exists (select 1 from public.exercises e where e.id = target and e.status = 'published')
     and not private.exercise_is_complete(target) then
    raise exception 'EXERCISE_PUBLISH_INCOMPLETE: bài tập đã xuất bản phải có đề, gợi ý 1 và lời giải'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger guard_exercise_contents after update or delete on public.exercise_contents
  for each row execute function private.guard_exercise_parts();
create trigger guard_exercise_solutions after update or delete on public.exercise_solutions
  for each row execute function private.guard_exercise_parts();

revoke all on all functions in schema private from public;
