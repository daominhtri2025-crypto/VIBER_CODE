import { describe, expect, it } from "vitest";
import { assertLocalUrl } from "../../scripts/supabase-status.mjs";
import { anonClient, serviceClient } from "./helpers/supabase";

// TASK-004 · Dữ liệu demo (supabase/seed.sql) được nạp khi `npm run db:reset`.
// Khẳng định về hiển thị dùng client anon; service role chỉ để đếm toàn bộ dữ liệu.

const SCRATCH = "demo-scratch-co-ban";
const PYTHON = "demo-python-nhap-mon";
const DRAFT = "demo-python-nang-cao";

describe("Seed demo", () => {
  it("nạp đủ khóa/chương/bài/bài tập và mọi tiêu đề có nhãn [Demo]", async () => {
    const svc = serviceClient();
    const { data: courses } = await svc.from("courses").select("slug, title, status").like("slug", "demo-%");
    expect(courses?.map((c) => c.slug).sort(), "Chưa nạp seed? Chạy npm run db:reset").toEqual(
      [DRAFT, PYTHON, SCRATCH].sort(),
    );
    for (const table of ["courses", "lessons", "exercises", "learning_paths"] as const) {
      const { data } = await svc.from(table).select("title").like("slug", "demo-%");
      expect(data?.length, table).toBeGreaterThan(0);
      for (const row of data ?? []) expect(row.title, table).toMatch(/^\[Demo\] /);
    }
    const { data: chapters } = await svc
      .from("chapters")
      .select("title, courses!inner(slug)")
      .like("courses.slug", "demo-%");
    expect(chapters).toHaveLength(5);
    for (const row of chapters ?? []) expect(row.title).toMatch(/^\[Demo\] /);
    const { count: lessons } = await svc.from("lessons").select("*", { count: "exact", head: true }).like("slug", "demo-%");
    expect(lessons).toBe(10);
    const { count: exercises } = await svc
      .from("exercises")
      .select("*", { count: "exact", head: true })
      .like("slug", "demo-%");
    expect(exercises).toBe(5);
  });

  it("khách chỉ thấy 2 khóa published, khóa bản nháp bị ẩn", async () => {
    const { data } = await anonClient().from("courses").select("slug").like("slug", "demo-%");
    expect(data?.map((c) => c.slug).sort()).toEqual([PYTHON, SCRATCH].sort());
  });

  it("mỗi khóa published có 2 chương × 2 bài published; bài nháp trong khóa published bị ẩn", async () => {
    const anon = anonClient();
    for (const slug of [SCRATCH, PYTHON]) {
      const { data } = await anon
        .from("courses")
        .select("slug, chapters(id, lessons(slug))")
        .eq("slug", slug)
        .single();
      expect(data?.chapters, slug).toHaveLength(2);
      for (const chapter of data?.chapters ?? []) expect(chapter.lessons, slug).toHaveLength(2);
    }
    const { data: draftLesson } = await anon.from("lessons").select("id").eq("slug", "demo-scratch-bien-nhap");
    expect(draftLesson).toEqual([]);
  });

  it("có bài preview đọc được bởi khách", async () => {
    const anon = anonClient();
    const { data } = await anon
      .from("lessons")
      .select("slug, lesson_contents(body_md)")
      .eq("is_preview", true)
      .like("slug", "demo-%");
    expect(data?.map((l) => l.slug).sort()).toEqual(["demo-python-print", "demo-scratch-giao-dien"]);
    for (const lesson of data ?? []) expect(lesson.lesson_contents?.body_md).toMatch(/Mục tiêu/);
  });

  it("bài tập phủ các trường hợp: gắn/không gắn bài học, có/không gợi ý 2, bản nháp", async () => {
    const svc = serviceClient();
    const { data } = await svc
      .from("exercises")
      .select("slug, lesson_id, status, exercise_contents(hint2_md)")
      .like("slug", "demo-%");
    const rows = data ?? [];
    expect(rows.some((r) => r.lesson_id !== null)).toBe(true);
    expect(rows.some((r) => r.lesson_id === null && r.status === "published")).toBe(true);
    expect(rows.some((r) => r.exercise_contents?.hint2_md)).toBe(true);
    expect(rows.some((r) => r.status === "published" && r.exercise_contents?.hint2_md === null)).toBe(true);
    expect(rows.some((r) => r.status === "draft")).toBe(true);

    const { data: publicRows } = await anonClient().from("exercises").select("slug").like("slug", "demo-%");
    expect(publicRows).toHaveLength(4);
  });

  it("lộ trình Python chỉ hiện khóa published với khách", async () => {
    const { data } = await anonClient()
      .from("path_courses")
      .select("position, courses(slug), learning_paths!inner(slug)")
      .eq("learning_paths.slug", "demo-lo-trinh-python");
    expect(data?.map((r) => r.courses?.slug)).toEqual([PYTHON]);
  });
});

describe("Bảo vệ thao tác chỉ dành cho local", () => {
  it("chấp nhận localhost, từ chối máy chủ khác", () => {
    expect(() => assertLocalUrl("http://127.0.0.1:54321")).not.toThrow();
    expect(() => assertLocalUrl("http://localhost:54321")).not.toThrow();
    expect(() => assertLocalUrl("https://abcd.supabase.co")).toThrow(/Từ chối/);
  });
});
