import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, type World } from "./helpers/fixtures";
import { anonClient, type Client } from "./helpers/supabase";

// Ma trận quyền: docs/architecture/ACCESS_CONTROL.md. Mọi khẳng định dùng client thường
// (anon / student / admin); service role chỉ dựng dữ liệu trong fixtures.

const RLS_DENIED = "42501";

let w: World;
let anon: Client;

beforeAll(async () => {
  w = await createWorld();
  anon = anonClient();
});

afterAll(async () => {
  await w?.cleanup();
});

describe("Khách (anon)", () => {
  it("P-1: không thấy khóa/bài draft hoặc archived", async () => {
    const { data: courses } = await anon
      .from("courses")
      .select("id")
      .in("id", [w.courses.courseDraft.id, w.courses.courseArchived.id]);
    expect(courses).toEqual([]);

    const { data: lessons } = await anon
      .from("lessons")
      .select("id")
      .in("id", [w.lessons.lessonDraft.id, w.lessons.lessonInArchived.id]);
    expect(lessons).toEqual([]);
  });

  it("thấy khóa, bài và bài tập published (metadata)", async () => {
    const { data: course } = await anon.from("courses").select("id").eq("id", w.courses.coursePub.id);
    expect(course).toHaveLength(1);
    const { data: lessons } = await anon
      .from("lessons")
      .select("id")
      .in("id", [w.lessons.lessonPreview.id, w.lessons.lessonPrivate.id]);
    expect(lessons).toHaveLength(2);
    const { data: exercises } = await anon
      .from("exercises")
      .select("id")
      .in("id", [w.exercises.exercisePub.id, w.exercises.exerciseDraft.id]);
    expect(exercises?.map((e) => e.id)).toEqual([w.exercises.exercisePub.id]);
  });

  it("P-2: không đọc được nội dung bài không preview", async () => {
    const { data } = await anon.from("lesson_contents").select("body_md").eq("lesson_id", w.lessons.lessonPrivate.id);
    expect(data).toEqual([]);
  });

  it("P-3: đọc được nội dung bài preview trong khóa published", async () => {
    const { data } = await anon.from("lesson_contents").select("body_md").eq("lesson_id", w.lessons.lessonPreview.id);
    expect(data).toEqual([{ body_md: "Nội dung preview" }]);
  });

  it("P-11: bài và bài tập published trong khóa draft bị ẩn, kể cả bài preview", async () => {
    const { data: lesson } = await anon.from("lessons").select("id").eq("id", w.lessons.lessonInDraftCourse.id);
    expect(lesson).toEqual([]);
    const { data: content } = await anon
      .from("lesson_contents")
      .select("lesson_id")
      .eq("lesson_id", w.lessons.lessonInDraftCourse.id);
    expect(content).toEqual([]);
    const { data: exercise } = await anon.from("exercises").select("id").eq("id", w.exercises.exerciseInDraftCourse.id);
    expect(exercise).toEqual([]);
  });

  it("chương chỉ hiện khi có bài published (chương chỉ có bài draft bị ẩn)", async () => {
    const { data } = await anon
      .from("chapters")
      .select("id")
      .in("id", [w.chapters.ch1.id, w.chapters.ch2.id, w.chapters.chDraft.id]);
    expect(data?.map((c) => c.id)).toEqual([w.chapters.ch1.id]);
  });

  it("không có quyền trên bảng private và dữ liệu cá nhân", async () => {
    for (const table of [
      "exercise_contents",
      "exercise_solutions",
      "profiles",
      "user_roles",
      "enrollments",
      "lesson_progress",
      "exercise_attempts",
    ] as const) {
      const { error } = await anon.from(table).select("*").limit(1);
      expect(error?.code, table).toBe(RLS_DENIED);
    }
  });

  it("không ghi được nội dung", async () => {
    const { error } = await anon
      .from("courses")
      .insert({ slug: w.slug("anon-insert"), title: "x", language: "python" });
    expect(error?.code).toBe(RLS_DENIED);
  });
});

describe("Đã đăng nhập, chưa đăng ký khóa (student B)", () => {
  it("vẫn đọc được bài preview (R01) nhưng không đọc được bài private", async () => {
    const { data } = await w.clients.asB
      .from("lesson_contents")
      .select("lesson_id")
      .in("lesson_id", [w.lessons.lessonPreview.id, w.lessons.lessonPrivate.id]);
    expect(data?.map((r) => r.lesson_id)).toEqual([w.lessons.lessonPreview.id]);
  });

  it("P-4: không đọc được đề/gợi ý bài tập", async () => {
    const { data } = await w.clients.asB
      .from("exercise_contents")
      .select("exercise_id")
      .eq("exercise_id", w.exercises.exercisePub.id);
    expect(data).toEqual([]);
  });

  it("không ghi được attempt hoặc tiến độ khi chưa đăng ký", async () => {
    const attempt = await w.clients.asB
      .from("exercise_attempts")
      .insert({ user_id: w.users.studentB.id, exercise_id: w.exercises.exercisePub.id });
    expect(attempt.error?.code).toBe(RLS_DENIED);
    const progress = await w.clients.asB
      .from("lesson_progress")
      .insert({ user_id: w.users.studentB.id, lesson_id: w.lessons.lessonPreview.id });
    expect(progress.error?.code).toBe(RLS_DENIED);
  });

  it("P-12: không tự đăng ký được khóa draft/archived", async () => {
    for (const courseId of [w.courses.courseDraft.id, w.courses.courseArchived.id]) {
      const { error } = await w.clients.asB
        .from("enrollments")
        .insert({ user_id: w.users.studentB.id, course_id: courseId });
      expect(error?.code).toBe(RLS_DENIED);
    }
  });

  it("P-9: không tự nâng role thành admin", async () => {
    const update = await w.clients.asB
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", w.users.studentB.id)
      .select();
    expect(update.error?.code).toBe(RLS_DENIED);
    const insert = await w.clients.asB.from("user_roles").insert({ user_id: w.users.studentB.id, role: "admin" });
    expect(insert.error?.code).toBe(RLS_DENIED);

    const { data } = await w.clients.asB.from("user_roles").select("role").eq("user_id", w.users.studentB.id);
    expect(data).toEqual([{ role: "student" }]);
  });

  it("P-13: không ghi được nội dung (thao tác admin)", async () => {
    const insert = await w.clients.asB
      .from("courses")
      .insert({ slug: w.slug("student-insert"), title: "x", language: "python" });
    expect(insert.error?.code).toBe(RLS_DENIED);

    const update = await w.clients.asB
      .from("courses")
      .update({ title: "bị sửa" })
      .eq("id", w.courses.coursePub.id)
      .select();
    expect(update.data ?? []).toEqual([]);

    const del = await w.clients.asB.from("lessons").delete().eq("id", w.lessons.lessonPreview.id).select();
    expect(del.data ?? []).toEqual([]);

    const { data } = await w.svc.from("courses").select("title").eq("id", w.courses.coursePub.id).single();
    expect(data?.title).toBe("[Test] pub");
  });

  it("tự đăng ký khóa published (idempotent theo khóa chính)", async () => {
    const first = await w.clients.asB
      .from("enrollments")
      .insert({ user_id: w.users.studentB.id, course_id: w.courses.coursePub.id })
      .select();
    expect(first.error).toBeNull();
    const second = await w.clients.asB
      .from("enrollments")
      .upsert(
        { user_id: w.users.studentB.id, course_id: w.courses.coursePub.id },
        { onConflict: "user_id,course_id", ignoreDuplicates: true },
      );
    expect(second.error).toBeNull();
    const { count } = await w.clients.asB
      .from("enrollments")
      .select("*", { count: "exact", head: true })
      .eq("course_id", w.courses.coursePub.id);
    expect(count).toBe(1);
    // Hoàn tác để các test khác coi B là "chưa đăng ký".
    await w.svc.from("enrollments").delete().eq("user_id", w.users.studentB.id);
  });
});

describe("Đã đăng ký khóa (student A)", () => {
  it("đọc được nội dung bài private và đề bài tập của khóa đã đăng ký", async () => {
    const { data: body } = await w.clients.asA
      .from("lesson_contents")
      .select("body_md")
      .eq("lesson_id", w.lessons.lessonPrivate.id);
    expect(body).toEqual([{ body_md: "Nội dung private" }]);
    const { data: content } = await w.clients.asA
      .from("exercise_contents")
      .select("statement_md, hint1_md, hint2_md")
      .eq("exercise_id", w.exercises.exercisePub.id);
    expect(content).toEqual([{ statement_md: "Đề ex-pub", hint1_md: "Gợi ý 1", hint2_md: "Gợi ý 2" }]);
  });

  it("không đọc được bài draft và bài tập draft dù đã đăng ký", async () => {
    const { data: lesson } = await w.clients.asA
      .from("lesson_contents")
      .select("lesson_id")
      .eq("lesson_id", w.lessons.lessonDraft.id);
    expect(lesson).toEqual([]);
    const { data: exercise } = await w.clients.asA
      .from("exercise_contents")
      .select("exercise_id")
      .eq("exercise_id", w.exercises.exerciseDraft.id);
    expect(exercise).toEqual([]);
  });

  it("P-5 → P-6: lời giải bị khóa cho tới khi ghi attempt, sau đó mở được", async () => {
    const before = await w.clients.asA
      .from("exercise_solutions")
      .select("solution_md")
      .eq("exercise_id", w.exercises.exercisePub.id);
    expect(before.data).toEqual([]);

    const attempt = await w.clients.asA
      .from("exercise_attempts")
      .insert({ user_id: w.users.studentA.id, exercise_id: w.exercises.exercisePub.id });
    expect(attempt.error).toBeNull();

    const after = await w.clients.asA
      .from("exercise_solutions")
      .select("solution_md")
      .eq("exercise_id", w.exercises.exercisePub.id);
    expect(after.data).toEqual([{ solution_md: "Lời giải ex-pub" }]);
  });

  it("ghi và cập nhật tiến độ của mình cho bài live", async () => {
    const insert = await w.clients.asA
      .from("lesson_progress")
      .insert({ user_id: w.users.studentA.id, lesson_id: w.lessons.lessonPrivate.id });
    expect(insert.error).toBeNull();
    const update = await w.clients.asA
      .from("lesson_progress")
      .update({ completed_at: new Date().toISOString() })
      .eq("user_id", w.users.studentA.id)
      .eq("lesson_id", w.lessons.lessonPrivate.id)
      .select("completed_at");
    expect(update.data).toHaveLength(1);
    // Bỏ đánh dấu hoàn thành (R02).
    const reset = await w.clients.asA
      .from("lesson_progress")
      .update({ completed_at: null })
      .eq("lesson_id", w.lessons.lessonPrivate.id)
      .select("completed_at");
    expect(reset.data).toEqual([{ completed_at: null }]);
  });

  it("P-14: không ghi được tiến độ cho bài draft", async () => {
    const { error } = await w.clients.asA
      .from("lesson_progress")
      .insert({ user_id: w.users.studentA.id, lesson_id: w.lessons.lessonDraft.id });
    expect(error?.code).toBe(RLS_DENIED);
  });

  it("không xóa được dữ liệu học viên và không sửa được tried_at", async () => {
    const del = await w.clients.asA.from("enrollments").delete().eq("user_id", w.users.studentA.id).select();
    expect(del.error?.code).toBe(RLS_DENIED);
    const update = await w.clients.asA
      .from("exercise_attempts")
      .update({ tried_at: "2000-01-01T00:00:00Z" })
      .eq("user_id", w.users.studentA.id);
    expect(update.error?.code).toBe(RLS_DENIED);
  });
});

describe("Tách biệt giữa người dùng", () => {
  it("P-7: B không đọc/sửa được tiến độ của A", async () => {
    await w.svc
      .from("lesson_progress")
      .upsert({ user_id: w.users.studentA.id, lesson_id: w.lessons.lessonPreview.id });
    const read = await w.clients.asB.from("lesson_progress").select("*").eq("user_id", w.users.studentA.id);
    expect(read.data).toEqual([]);
    const update = await w.clients.asB
      .from("lesson_progress")
      .update({ completed_at: new Date().toISOString() })
      .eq("user_id", w.users.studentA.id)
      .select();
    expect(update.data ?? []).toEqual([]);
  });

  it("P-7 (admin): admin không đọc được tiến độ/đăng ký của học viên (Q09 mặc định)", async () => {
    const progress = await w.clients.asAdmin.from("lesson_progress").select("*").eq("user_id", w.users.studentA.id);
    expect(progress.data).toEqual([]);
    const enrollments = await w.clients.asAdmin.from("enrollments").select("*").eq("user_id", w.users.studentA.id);
    expect(enrollments.data).toEqual([]);
    const profiles = await w.clients.asAdmin.from("profiles").select("*").eq("id", w.users.studentA.id);
    expect(profiles.data).toEqual([]);
  });

  it("P-8: A không ghi được attempt/tiến độ/đăng ký mang user_id của B", async () => {
    const attempt = await w.clients.asA
      .from("exercise_attempts")
      .insert({ user_id: w.users.studentB.id, exercise_id: w.exercises.exercisePub.id });
    expect(attempt.error?.code).toBe(RLS_DENIED);
    const progress = await w.clients.asA
      .from("lesson_progress")
      .insert({ user_id: w.users.studentB.id, lesson_id: w.lessons.lessonPreview.id });
    expect(progress.error?.code).toBe(RLS_DENIED);
    const enrollment = await w.clients.asA
      .from("enrollments")
      .insert({ user_id: w.users.studentB.id, course_id: w.courses.coursePub.id });
    expect(enrollment.error?.code).toBe(RLS_DENIED);
  });

  it("P-15: B không sửa được display_name của A; sửa được của mình", async () => {
    const other = await w.clients.asB
      .from("profiles")
      .update({ display_name: "Bị sửa" })
      .eq("id", w.users.studentA.id)
      .select();
    expect(other.data ?? []).toEqual([]);
    const own = await w.clients.asB
      .from("profiles")
      .update({ display_name: "[Test] B mới" })
      .eq("id", w.users.studentB.id)
      .select("display_name");
    expect(own.data).toEqual([{ display_name: "[Test] B mới" }]);
  });

  it("học viên chỉ sửa được cột display_name trên profile", async () => {
    const { error } = await w.clients.asB
      .from("profiles")
      .update({ created_at: "2000-01-01T00:00:00Z" })
      .eq("id", w.users.studentB.id);
    expect(error?.code).toBe(RLS_DENIED);
  });
});

describe("Đăng ký tài khoản", () => {
  it("P-10: metadata role=admin bị bỏ qua; luôn tạo profile + role student", async () => {
    const client = anonClient();
    const email = `signup-${w.tag}@example.test`;
    const { data, error } = await client.auth.signUp({
      email,
      password: w.password,
      options: { data: { role: "admin", display_name: "  Bé Na  " } },
    });
    expect(error).toBeNull();
    const userId = data.user?.id;
    expect(userId).toBeDefined();
    try {
      const role = await client.from("user_roles").select("role").eq("user_id", userId!);
      expect(role.data).toEqual([{ role: "student" }]);
      const profile = await client.from("profiles").select("display_name").eq("id", userId!);
      expect(profile.data).toEqual([{ display_name: "Bé Na" }]);
    } finally {
      await w.svc.auth.admin.deleteUser(userId!);
    }
  });
});

describe("Admin", () => {
  it("đọc được toàn bộ nội dung, kể cả draft, archived và lời giải", async () => {
    const { data: courses } = await w.clients.asAdmin
      .from("courses")
      .select("id")
      .in("id", [w.courses.coursePub.id, w.courses.courseDraft.id, w.courses.courseArchived.id]);
    expect(courses).toHaveLength(3);
    const { data: solution } = await w.clients.asAdmin
      .from("exercise_solutions")
      .select("solution_md")
      .eq("exercise_id", w.exercises.exerciseDraft.id);
    expect(solution).toEqual([{ solution_md: "Lời giải ex-draft" }]);
  });

  it("CRUD nội dung qua RLS", async () => {
    const created = await w.clients.asAdmin
      .from("courses")
      .insert({ slug: w.slug("admin-crud"), title: "[Test] admin", language: "python" })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    const updated = await w.clients.asAdmin
      .from("courses")
      .update({ summary: "Tóm tắt" })
      .eq("id", created.data!.id)
      .select("summary");
    expect(updated.data).toEqual([{ summary: "Tóm tắt" }]);
    const deleted = await w.clients.asAdmin.from("courses").delete().eq("id", created.data!.id).select("id");
    expect(deleted.data).toHaveLength(1);
  });

  it("không ghi được user_roles qua API (kể cả admin)", async () => {
    const { error } = await w.clients.asAdmin
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", w.users.studentB.id);
    expect(error?.code).toBe(RLS_DENIED);
  });
});
