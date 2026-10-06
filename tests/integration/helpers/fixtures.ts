import { randomUUID } from "node:crypto";
import { must, serviceClient, signedInClient, type Client } from "./supabase";

const PASSWORD = "local-test-only-Password1";

export type World = Awaited<ReturnType<typeof createWorld>>;

/**
 * Dựng bộ dữ liệu kiểm thử độc lập cho một file test (hậu tố ngẫu nhiên, tự dọn).
 * - coursePub (published): chương 1 có bài preview, bài private, bài draft; chương 2 chỉ có bài draft;
 *   bài tập published (đủ đề/gợi ý/lời giải) và bài tập draft.
 * - courseDraft (draft): có bài published và bài tập published bên trong (P-11).
 * - courseArchived (archived).
 * - studentA đã đăng ký coursePub; studentB chưa đăng ký khóa nào; admin.
 */
export async function createWorld() {
  const svc = serviceClient();
  const tag = randomUUID().slice(0, 8);
  const slug = (name: string) => `t-${tag}-${name}`;

  const createUser = async (name: string) => {
    const email = `${name}-${tag}@example.test`;
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `[Test] ${name}` },
    });
    if (error || !data.user) throw new Error(`createUser ${name}: ${error?.message}`);
    return { id: data.user.id, email };
  };

  const [studentA, studentB, admin] = await Promise.all([
    createUser("student-a"),
    createUser("student-b"),
    createUser("admin"),
  ]);
  // Provision admin: tương đương câu lệnh SQL của chủ database (ADR-003).
  must(
    await svc.from("user_roles").update({ role: "admin" }).eq("user_id", admin.id).select(),
    "provision admin",
  );

  const course = async (name: string, language: "scratch" | "python") =>
    must(
      await svc
        .from("courses")
        .insert({ slug: slug(name), title: `[Test] ${name}`, language })
        .select()
        .single(),
      `course ${name}`,
    );
  const chapter = async (courseId: string, position: number) =>
    must(
      await svc
        .from("chapters")
        .insert({ course_id: courseId, title: `[Test] chương ${position}`, position })
        .select()
        .single(),
      "chapter",
    );
  const lesson = async (
    chapterId: string,
    name: string,
    position: number,
    opts: { publish: boolean; preview?: boolean },
  ) => {
    const row = must(
      await svc
        .from("lessons")
        .insert({
          chapter_id: chapterId,
          slug: slug(name),
          title: `[Test] ${name}`,
          position,
          is_preview: opts.preview ?? false,
        })
        .select()
        .single(),
      `lesson ${name}`,
    );
    must(
      await svc.from("lesson_contents").insert({ lesson_id: row.id, body_md: `Nội dung ${name}` }).select(),
      `lesson_contents ${name}`,
    );
    if (opts.publish) {
      must(await svc.from("lessons").update({ status: "published" }).eq("id", row.id).select(), `publish ${name}`);
    }
    return row;
  };
  const exercise = async (courseId: string, lessonId: string | null, name: string, position: number, publish: boolean) => {
    const row = must(
      await svc
        .from("exercises")
        .insert({ course_id: courseId, lesson_id: lessonId, slug: slug(name), title: `[Test] ${name}`, position })
        .select()
        .single(),
      `exercise ${name}`,
    );
    must(
      await svc
        .from("exercise_contents")
        .insert({ exercise_id: row.id, statement_md: `Đề ${name}`, hint1_md: "Gợi ý 1", hint2_md: "Gợi ý 2" })
        .select(),
      `exercise_contents ${name}`,
    );
    must(
      await svc.from("exercise_solutions").insert({ exercise_id: row.id, solution_md: `Lời giải ${name}` }).select(),
      `exercise_solutions ${name}`,
    );
    if (publish) {
      must(await svc.from("exercises").update({ status: "published" }).eq("id", row.id).select(), `publish ${name}`);
    }
    return row;
  };

  // Khóa published
  const coursePub = await course("pub", "scratch");
  const ch1 = await chapter(coursePub.id, 1);
  const ch2 = await chapter(coursePub.id, 2);
  const lessonPreview = await lesson(ch1.id, "preview", 1, { publish: true, preview: true });
  const lessonPrivate = await lesson(ch1.id, "private", 2, { publish: true });
  const lessonDraft = await lesson(ch1.id, "draft", 3, { publish: false });
  const lessonDraftOnlyChapter = await lesson(ch2.id, "draft-only", 1, { publish: false });
  const exercisePub = await exercise(coursePub.id, lessonPrivate.id, "ex-pub", 1, true);
  const exerciseDraft = await exercise(coursePub.id, null, "ex-draft", 2, false);
  must(await svc.from("courses").update({ status: "published" }).eq("id", coursePub.id).select(), "publish coursePub");

  // Khóa draft chứa nội dung published (P-11)
  const courseDraft = await course("draft", "python");
  const chDraft = await chapter(courseDraft.id, 1);
  const lessonInDraftCourse = await lesson(chDraft.id, "in-draft-course", 1, { publish: true, preview: true });
  const exerciseInDraftCourse = await exercise(courseDraft.id, null, "ex-in-draft-course", 1, true);

  // Khóa archived (Q04 mặc định: ẩn với mọi người trừ admin)
  const courseArchived = await course("archived", "python");
  const chArchived = await chapter(courseArchived.id, 1);
  const lessonInArchived = await lesson(chArchived.id, "in-archived", 1, { publish: true, preview: true });
  must(await svc.from("courses").update({ status: "published" }).eq("id", courseArchived.id).select(), "publish archived");
  must(await svc.from("courses").update({ status: "archived" }).eq("id", courseArchived.id).select(), "archive");

  must(
    await svc.from("enrollments").insert({ user_id: studentA.id, course_id: coursePub.id }).select(),
    "enroll studentA",
  );

  const [asA, asB, asAdmin] = await Promise.all([
    signedInClient(studentA.email, PASSWORD),
    signedInClient(studentB.email, PASSWORD),
    signedInClient(admin.email, PASSWORD),
  ]);

  const courseIds = [coursePub.id, courseDraft.id, courseArchived.id];

  async function cleanup() {
    // Xóa user → cascade dữ liệu học viên; chuyển khóa về draft để gỡ bất biến D10 rồi xóa nội dung.
    await Promise.all([studentA, studentB, admin].map((u) => svc.auth.admin.deleteUser(u.id)));
    await svc.from("courses").update({ status: "draft" }).in("id", courseIds);
    await svc.from("courses").delete().in("id", courseIds);
    await svc.from("courses").delete().like("slug", `t-${tag}-%`);
  }

  return {
    svc,
    tag,
    slug,
    password: PASSWORD,
    users: { studentA, studentB, admin },
    clients: { asA, asB, asAdmin } as Record<"asA" | "asB" | "asAdmin", Client>,
    courses: { coursePub, courseDraft, courseArchived },
    chapters: { ch1, ch2, chDraft },
    lessons: { lessonPreview, lessonPrivate, lessonDraft, lessonDraftOnlyChapter, lessonInDraftCourse, lessonInArchived },
    exercises: { exercisePub, exerciseDraft, exerciseInDraftCourse },
    cleanup,
  };
}
