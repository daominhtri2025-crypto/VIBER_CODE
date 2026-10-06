import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, type World } from "./helpers/fixtures";
import { anonClient } from "./helpers/supabase";

// Tính toàn vẹn dữ liệu (DATA_MODEL §1–4). Ràng buộc DB độc lập với RLS nên dùng client admin
// đã đăng nhập (đi qua RLS như thao tác quản trị thật); service role chỉ dựng dữ liệu.

const UNIQUE = "23505";
const CHECK = "23514";
const FOREIGN_KEY = "23503";

let w: World;

beforeAll(async () => {
  w = await createWorld();
});

afterAll(async () => {
  await w?.cleanup();
});

describe("Kết nối", () => {
  it("Data API phản hồi với publishable key", async () => {
    const { error, status } = await anonClient().from("courses").select("id").limit(1);
    expect(error).toBeNull();
    expect(status).toBe(200);
  });

  it("schema private không được expose qua Data API", async () => {
    const { error } = await anonClient().rpc("is_admin" as never);
    expect(error).not.toBeNull();
  });
});

describe("Ràng buộc cột và khóa", () => {
  it("slug phải là chữ thường ASCII, số và dấu '-'", async () => {
    for (const slug of ["Khoa-Hoc", "khóa-học", "ab", "a--b", "-abc"]) {
      const { error } = await w.clients.asAdmin.from("courses").insert({ slug, title: "x", language: "python" });
      expect(error?.code, slug).toBe(CHECK);
    }
  });

  it("slug khóa học là duy nhất", async () => {
    const { error } = await w.clients.asAdmin
      .from("courses")
      .insert({ slug: w.courses.coursePub.slug, title: "x", language: "scratch" });
    expect(error?.code).toBe(UNIQUE);
  });

  it("vị trí chương trong khóa là duy nhất", async () => {
    const { error } = await w.clients.asAdmin
      .from("chapters")
      .insert({ course_id: w.courses.coursePub.id, title: "x", position: 1 });
    expect(error?.code).toBe(UNIQUE);
  });

  it("video_url chỉ nhận URL nhúng youtube-nocookie (Q07)", async () => {
    const bad = await w.clients.asAdmin
      .from("lesson_contents")
      .update({ video_url: "https://evil.example/embed/abc" })
      .eq("lesson_id", w.lessons.lessonDraft.id);
    expect(bad.error?.code).toBe(CHECK);
    const good = await w.clients.asAdmin
      .from("lesson_contents")
      .update({ video_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" })
      .eq("lesson_id", w.lessons.lessonDraft.id)
      .select("video_url");
    expect(good.error).toBeNull();
  });

  it("display_name: 1–50 ký tự, không có khoảng trắng đầu/cuối", async () => {
    for (const display_name of ["", " A", "x".repeat(51)]) {
      const { error } = await w.clients.asB
        .from("profiles")
        .update({ display_name })
        .eq("id", w.users.studentB.id);
      expect(error?.code, JSON.stringify(display_name)).toBe(CHECK);
    }
  });
});

describe("Ràng buộc cấu trúc", () => {
  it("bài tập chỉ gắn được bài học cùng khóa", async () => {
    const { error } = await w.clients.asAdmin.from("exercises").insert({
      course_id: w.courses.courseDraft.id,
      lesson_id: w.lessons.lessonPrivate.id,
      slug: w.slug("cross-course"),
      title: "x",
      position: 9,
    });
    expect(error?.code).toBe(CHECK);
    expect(error?.message).toMatch(/EXERCISE_LESSON_COURSE_MISMATCH/);
  });

  it("không chuyển được chương sang khóa khác", async () => {
    const { error } = await w.clients.asAdmin
      .from("chapters")
      .update({ course_id: w.courses.courseDraft.id })
      .eq("id", w.chapters.ch2.id);
    expect(error?.message).toMatch(/CHAPTER_COURSE_IMMUTABLE/);
  });

  it("không chuyển được bài sang chương của khóa khác", async () => {
    const { error } = await w.clients.asAdmin
      .from("lessons")
      .update({ chapter_id: w.chapters.chDraft.id })
      .eq("id", w.lessons.lessonDraft.id);
    expect(error?.message).toMatch(/LESSON_COURSE_IMMUTABLE/);
  });
});

describe("Bất biến xuất bản", () => {
  it("bài học cần nội dung trước khi xuất bản", async () => {
    const created = await w.clients.asAdmin
      .from("lessons")
      .insert({ chapter_id: w.chapters.ch2.id, slug: w.slug("no-body"), title: "x", position: 5 })
      .select("id")
      .single();
    const { error } = await w.clients.asAdmin
      .from("lessons")
      .update({ status: "published" })
      .eq("id", created.data!.id);
    expect(error?.message).toMatch(/LESSON_PUBLISH_REQUIRES_BODY/);
  });

  it("không xóa trắng nội dung của bài đã xuất bản", async () => {
    const { error } = await w.clients.asAdmin
      .from("lesson_contents")
      .update({ body_md: "   " })
      .eq("lesson_id", w.lessons.lessonPrivate.id);
    expect(error?.message).toMatch(/LESSON_PUBLISH_REQUIRES_BODY/);
  });

  it("khóa cần ít nhất một bài published trước khi xuất bản", async () => {
    const created = await w.clients.asAdmin
      .from("courses")
      .insert({ slug: w.slug("empty"), title: "x", language: "python" })
      .select("id")
      .single();
    const { error } = await w.clients.asAdmin
      .from("courses")
      .update({ status: "published" })
      .eq("id", created.data!.id);
    expect(error?.message).toMatch(/COURSE_PUBLISH_REQUIRES_LESSON/);
  });

  it("D10: không gỡ được bài published cuối cùng của khóa đang published", async () => {
    // Khóa archived chỉ có một bài: đưa về published để kiểm tra.
    await w.svc.from("courses").update({ status: "published" }).eq("id", w.courses.courseArchived.id);
    const unpublish = await w.clients.asAdmin
      .from("lessons")
      .update({ status: "draft" })
      .eq("id", w.lessons.lessonInArchived.id);
    expect(unpublish.error?.message).toMatch(/LAST_PUBLISHED_LESSON/);

    // Còn bài published khác thì được gỡ.
    const ok = await w.clients.asAdmin
      .from("lessons")
      .update({ status: "draft" })
      .eq("id", w.lessons.lessonPreview.id)
      .select("status");
    expect(ok.data).toEqual([{ status: "draft" }]);
    await w.svc.from("lessons").update({ status: "published" }).eq("id", w.lessons.lessonPreview.id);
    await w.svc.from("courses").update({ status: "archived" }).eq("id", w.courses.courseArchived.id);
  });

  it("D11: bài tập cần đề, gợi ý 1 và lời giải; không xóa trắng khi đã xuất bản", async () => {
    const created = await w.clients.asAdmin
      .from("exercises")
      .insert({ course_id: w.courses.coursePub.id, slug: w.slug("incomplete"), title: "x", position: 7 })
      .select("id")
      .single();
    await w.clients.asAdmin
      .from("exercise_contents")
      .insert({ exercise_id: created.data!.id, statement_md: "Đề", hint1_md: "Gợi ý" });
    const publish = await w.clients.asAdmin
      .from("exercises")
      .update({ status: "published" })
      .eq("id", created.data!.id);
    expect(publish.error?.message).toMatch(/EXERCISE_PUBLISH_INCOMPLETE/);

    const blankSolution = await w.clients.asAdmin
      .from("exercise_solutions")
      .update({ solution_md: "" })
      .eq("exercise_id", w.exercises.exercisePub.id);
    expect(blankSolution.error?.message).toMatch(/EXERCISE_PUBLISH_INCOMPLETE/);
  });
});

describe("Xóa nội dung đã được tham chiếu", () => {
  it("không xóa được bài đã có tiến độ học viên", async () => {
    await w.svc.from("lesson_progress").insert({ user_id: w.users.studentA.id, lesson_id: w.lessons.lessonDraft.id });
    const { error } = await w.clients.asAdmin.from("lessons").delete().eq("id", w.lessons.lessonDraft.id);
    expect(error?.code).toBe(FOREIGN_KEY);
  });

  it("không xóa được khóa đã có học viên đăng ký", async () => {
    await w.svc.from("courses").update({ status: "draft" }).eq("id", w.courses.coursePub.id);
    const { error } = await w.clients.asAdmin.from("courses").delete().eq("id", w.courses.coursePub.id);
    expect(error?.code).toBe(FOREIGN_KEY);
  });

  it("xóa tài khoản xóa dữ liệu học viên của tài khoản đó", async () => {
    const { data: user } = await w.svc.auth.admin.createUser({
      email: `delete-me-${w.tag}@example.test`,
      password: w.password,
      email_confirm: true,
    });
    const userId = user.user!.id;
    await w.svc.from("enrollments").insert({ user_id: userId, course_id: w.courses.courseDraft.id });
    await w.svc.auth.admin.deleteUser(userId);
    const remaining = await w.svc.from("enrollments").select("*").eq("user_id", userId);
    expect(remaining.data).toEqual([]);
    const profile = await w.svc.from("profiles").select("*").eq("id", userId);
    expect(profile.data).toEqual([]);
  });
});
