import { AccountForm } from "@/components/AccountForm";

export default function TeacherAccounts() {
  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold">Tạo tài khoản học sinh</h1>
      <p className="mb-6 max-w-2xl text-muted">Học sinh đổi mật khẩu ở lần đăng nhập đầu. Nếu điền email, học sinh có thể đăng nhập bằng Google với đúng email đó.</p>
      <AccountForm roles={["student"]} />
    </>
  );
}
