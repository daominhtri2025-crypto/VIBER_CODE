export type TutorReply = {
  session_id: string; session_version: number; state: string;
  feedback: string; question: string; math_status: "valid" | "invalid" | "unknown" | null; error_code: string | null;
  step_id: string | null; hint_level: number; hint: string | null; hint_trigger: string | null; needs_teacher: boolean;
  options: { id: string; label: string }[] | null; next_session_id: string | null; replayed: boolean;
  summary: { steps: number; invalid_steps: number; reached_correct_final_form: boolean } | null;
  extra: {
    statement?: string; current_equation?: string; learning_mode?: string; verify_mode?: "substitution" | "conclusion";
    parent_session_id?: string | null; child_session_id?: string | null; accepted?: boolean;
    steps?: { step_index: number; submitted_equation: string; operation: string; operation_value: string | null;
      explanation: string; math_status?: string }[];
  };
  ai_generated: boolean; ai_message_id: string | null; ai_disclosure: string | null;
};

export type Assignment = { id: string; class_id: string; title: string; learning_mode: string; due_at: string | null;
  problems: { position: number; problem_id: string; version: number; statement: string; difficulty: string }[] };

export const STATE_STEPS = [
  { state: "READ_PROBLEM", label: "Đọc đề" },
  { state: "IDENTIFY_KNOWLEDGE", label: "Kiến thức" },
  { state: "PROPOSE_PLAN", label: "Hướng giải" },
  { state: "SOLVE_STEP", label: "Giải" },
  { state: "VERIFY_RESULT", label: "Kiểm tra" },
  { state: "INDEPENDENT_PRACTICE", label: "Tự luyện" },
] as const;

export const MODE_LABEL: Record<string, string> = { guided: "Có hướng dẫn", practice: "Luyện tập", independent: "Tự làm" };
export const OP_LABEL: Record<string, string> = {
  transpose_term: "chuyển vế", subtract_both_sides: "trừ hai vế", add_both_sides: "cộng hai vế",
  divide_both_sides: "chia hai vế", multiply_both_sides: "nhân hai vế", expand: "bỏ ngoặc",
  collect_like_terms: "thu gọn", verify_substitution: "thay nghiệm", conclude: "kết luận",
};
export const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";
