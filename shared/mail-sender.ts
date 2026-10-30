// Gửi email giao dịch (SRS FR-AUTH-11). Nhà cung cấp là Resend, gọi bằng fetch, không thêm thư viện (CLAUDE.md mục 3, 8).
// Khóa API chỉ nhận qua tham số từ biến môi trường RESEND_API_KEY; không ghi vào nhật ký, không đưa vào thông báo lỗi.
// Kiểm thử dùng bộ gửi giả hoặc fetch giả, không gọi Resend thật (CLAUDE.md mục 7).

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

// 'failed' không kèm chi tiết để không làm lộ khóa hay nội dung phản hồi của nhà cung cấp.
export type MailResult = 'sent' | 'failed';

// Strategy (CLAUDE.md mục 3): đổi nhà cung cấp chỉ cần một bộ gửi khác, không đổi dịch vụ nghiệp vụ.
export interface MailSender {
  send(message: MailMessage): Promise<MailResult>;
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function createResendSender(options: ResendOptions): MailSender {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async send(message: MailMessage): Promise<MailResult> {
      try {
        const res = await doFetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
        });
        return res.ok ? 'sent' : 'failed';
      } catch {
        // Lỗi mạng có thể chứa URL hoặc tiêu đề yêu cầu; không ghi lại để tránh rò khóa.
        return 'failed';
      }
    },
  };
}
