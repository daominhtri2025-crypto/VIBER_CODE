// Dữ liệu bài học khởi tạo (CLAUDE.md mục 4.16). Chỉ dùng cho migration 0002, kiểm thử và seed chèn bài còn thiếu.
// Bài mới và bài đã sửa nằm trong cơ sở dữ liệu; seed không bao giờ ghi đè bài đã có khi migrate hoặc khởi động lại.
// Nguồn gốc: public/app.js trước Commit 1.4. Mã bài là khóa ổn định: progress.lesson và quiz_attempts.lesson
// trỏ tới mã này, không đánh số lại. Trình duyệt đọc qua GET /api/lessons (chỉ bài đang hiện).

export interface LessonQuiz {
  question: string;
  options: string[];
  /** Chỉ số đáp án đúng trong options. */
  answer: number;
}

export interface LessonSeed {
  lesson: number;
  title: string;
  /** Nhóm 1–5, khớp LESSON_GROUP_NAMES. */
  groupNo: number;
  icon: string;
  summary: string;
  steps: string[];
  quiz: LessonQuiz;
  nextStep: string;
}

// Tên nhóm hiển thị (không gồm mục "Tất cả" của bộ lọc giao diện).
export const LESSON_GROUP_NAMES = ["Điện thoại", "Giao tiếp số", "Tìm thông tin", "Biểu mẫu", "An toàn số"] as const;

// Thời điểm cố định để seed tái lập được và idempotent.
export const LESSON_SEED_CREATED = '2026-10-20T00:00:00.000Z';

export const LESSONS_SEED: LessonSeed[] = [
  {
    lesson: 0,
    title: "Chỉnh điện thoại cho dễ sử dụng",
    groupNo: 1,
    icon: "📱",
    summary: "Chữ to hơn, nghe rõ hơn và kết nối Wi-Fi.",
    steps: [
      "Mở Cài đặt trên điện thoại. Tên mục có thể khác tùy máy.",
      "Tìm Màn hình hoặc Trợ năng → Cỡ chữ. Tăng đến mức bạn đọc thoải mái.",
      "Dùng nút âm lượng để điều chỉnh. Kiểm tra âm lượng cuộc gọi và âm thanh riêng nếu có.",
      "Mở Wi-Fi, chọn mạng đáng tin cậy và nhập mật khẩu do người quản lý mạng cung cấp.",
      "Mở lại một trang quen thuộc để kiểm tra kết nối. Tránh thao tác tài chính trên Wi-Fi công cộng.",
    ],
    quiz: {
      question: "Muốn đọc rõ hơn, bạn nên làm gì?",
      options: ["Tăng cỡ chữ trong Cài đặt", "Đưa mật khẩu cho người lạ", "Tắt màn hình"],
      answer: 0,
    },
    nextStep: "Thử tăng cỡ chữ rồi quay về mức phù hợp.",
  },
  {
    lesson: 1,
    title: "Quét mã QR và mở đường dẫn",
    groupNo: 1,
    icon: "▦",
    summary: "Mở một hướng dẫn từ mã QR một cách an toàn.",
    steps: [
      "Mở Camera hoặc tính năng quét QR có sẵn trên điện thoại.",
      "Hướng camera vào toàn bộ mã, giữ yên và đủ ánh sáng.",
      "Đọc địa chỉ liên kết hiện ra trước khi bấm. Mã QR không tự bảo đảm đường dẫn an toàn.",
      "Chỉ mở đường dẫn khi biết rõ nguồn cung cấp. Không nhập mật khẩu hoặc OTP từ mã lạ.",
      "Đóng trang nếu có yêu cầu bất thường; nhờ người hỗ trợ kiểm tra.",
    ],
    quiz: {
      question: "Khi quét QR lạ yêu cầu nhập OTP, bạn nên?",
      options: ["Nhập ngay", "Dừng lại và kiểm tra nguồn", "Gửi OTP cho người đưa mã"],
      answer: 1,
    },
    nextStep: "Tìm nút quét QR trên điện thoại. Nhờ người hỗ trợ cung cấp một mã học liệu đã kiểm tra.",
  },
  {
    lesson: 2,
    title: "Chụp và gửi ảnh rõ nét",
    groupNo: 2,
    icon: "📷",
    summary: "Chụp đúng nội dung, kiểm tra trước khi gửi.",
    steps: [
      "Lau nhẹ ống kính và đặt vật cần chụp ở nơi đủ sáng.",
      "Giữ máy chắc, lấy đủ nội dung và chạm để lấy nét.",
      "Mở ảnh kiểm tra chữ có rõ và có lộ thông tin riêng tư không.",
      "Trong ứng dụng nhắn tin, chọn đúng người nhận rồi chọn ảnh.",
      "Kiểm tra lại người nhận và ảnh trước khi gửi.",
    ],
    quiz: {
      question: "Trước khi gửi ảnh cần kiểm tra điều gì?",
      options: ["Chỉ màu sắc", "Người nhận và thông tin riêng tư", "Không cần kiểm tra"],
      answer: 1,
    },
    nextStep: "Chụp một tờ giấy có chữ “Bài thực hành”, gửi cho người thân đồng ý hỗ trợ.",
  },
  {
    lesson: 3,
    title: "Gửi tài liệu và trao đổi trong nhóm",
    groupNo: 2,
    icon: "💬",
    summary: "Chọn đúng tệp, đúng người, đúng nội dung.",
    steps: [
      "Mở cuộc trò chuyện hoặc nhóm cần gửi. Kiểm tra tên nhóm.",
      "Chọn nút đính kèm, thường là dấu cộng hoặc hình kẹp giấy.",
      "Chọn tệp mẫu không chứa dữ liệu cá nhân. Kiểm tra tên và nội dung.",
      "Viết lời nhắn ngắn giải thích tài liệu rồi gửi.",
      "Không phát tán thông tin chưa kiểm chứng và không gửi dữ liệu riêng tư vào nhóm đông người.",
    ],
    quiz: {
      question: "Tệp nào phù hợp để thực hành?",
      options: ["Ảnh giấy tờ tùy thân", "Danh sách tài khoản ngân hàng", "Tài liệu mẫu không có thông tin cá nhân"],
      answer: 2,
    },
    nextStep: "Tạo ghi chú “Lịch học mẫu”, lưu và gửi cho người hỗ trợ.",
  },
  {
    lesson: 4,
    title: "Tìm thông tin trên Internet",
    groupNo: 3,
    icon: "⌕",
    summary: "Dùng từ khóa rõ ràng và đọc kỹ kết quả.",
    steps: [
      "Mở trình duyệt hoặc công cụ tìm kiếm quen thuộc.",
      "Gõ từ khóa cụ thể, ví dụ “cách tăng cỡ chữ điện thoại”.",
      "Xem tên trang và mô tả; phân biệt kết quả quảng cáo nếu có.",
      "Mở kết quả phù hợp và kiểm tra ngày cập nhật.",
      "Đối chiếu thêm nguồn khác khi thông tin quan trọng hoặc chưa rõ.",
    ],
    quiz: {
      question: "Từ khóa nào dễ tìm đúng nội dung hơn?",
      options: ["Điện thoại", "Cách tăng cỡ chữ điện thoại", "Hay"],
      answer: 1,
    },
    nextStep: "Tìm cách tăng cỡ chữ đúng với loại điện thoại bạn đang dùng.",
  },
  {
    lesson: 5,
    title: "Nhận biết nguồn thông tin đáng tin cậy",
    groupNo: 3,
    icon: "✓",
    summary: "Kiểm tra người đăng, nguồn và thời điểm.",
    steps: [
      "Xem tên cơ quan hoặc tác giả và thông tin giới thiệu của trang.",
      "Kiểm tra địa chỉ trang, lỗi chính tả và dấu hiệu giả mạo. HTTPS không đủ chứng minh uy tín.",
      "Đọc toàn bộ nội dung, ngày đăng và nguồn dẫn.",
      "Đối chiếu với kênh chính thức đã được đơn vị xác nhận.",
      "Chưa xác minh được thì chưa chia sẻ.",
    ],
    quiz: {
      question: "Một trang có biểu tượng ổ khóa có chắc đáng tin không?",
      options: ["Có, luôn đúng", "Không; vẫn phải kiểm tra nguồn và nội dung", "Có nếu tiêu đề hấp dẫn"],
      answer: 1,
    },
    nextStep: "Chọn một thông báo, tìm tác giả, ngày đăng và nguồn gốc.",
  },
  {
    lesson: 6,
    title: "Điền biểu mẫu trực tuyến",
    groupNo: 4,
    icon: "▤",
    summary: "Thực hành với dữ liệu mẫu, không lo nhầm lẫn.",
    steps: [
      "Kiểm tra đơn vị thu thập và mục đích sử dụng thông tin.",
      "Đọc hướng dẫn, tìm ô bắt buộc thường có dấu sao.",
      "Nhập thông tin đúng định dạng; không cung cấp dữ liệu vượt nhu cầu.",
      "Kiểm tra lại trước khi bấm Gửi.",
      "Đọc thông báo xác nhận; nếu báo lỗi, sửa ô được chỉ ra.",
    ],
    quiz: {
      question: "Khi bài tập yêu cầu dữ liệu cá nhân thật, bạn nên?",
      options: ["Dùng dữ liệu mẫu theo hướng dẫn", "Nhập OTP", "Đăng mật khẩu"],
      answer: 0,
    },
    nextStep: "Hoàn thành biểu mẫu mẫu bên dưới.",
  },
  {
    lesson: 7,
    title: "Lưu và tìm lại thông tin xác nhận",
    groupNo: 4,
    icon: "📂",
    summary: "Biết mình đã gửi thành công và tìm lại khi cần.",
    steps: [
      "Sau khi gửi, chờ thông báo xác nhận thay vì bấm liên tục.",
      "Ghi lại mã tham chiếu nếu hệ thống cung cấp.",
      "Lưu ảnh màn hình hoặc bản tải xuống nếu được phép và không lộ dữ liệu nhạy cảm.",
      "Đặt tên tệp dễ nhớ, tìm trong Tệp hoặc thư mục Tải xuống.",
      "Không chia sẻ ảnh xác nhận chứa thông tin cá nhân lên nhóm công khai.",
    ],
    quiz: {
      question: "Dấu hiệu nào giúp biết đã gửi thành công?",
      options: ["Đã bấm nút dù còn lỗi", "Thông báo xác nhận của hệ thống", "Màn hình bị tắt"],
      answer: 1,
    },
    nextStep: "Tạo ghi chú “Xác nhận thực hành ST-001”, lưu rồi tìm lại.",
  },
  {
    lesson: 8,
    title: "Bảo vệ mật khẩu và mã OTP",
    groupNo: 5,
    icon: "🔒",
    summary: "Giữ tài khoản an toàn bằng những thói quen nhỏ.",
    steps: [
      "Dùng mật khẩu dài, khó đoán và riêng cho mỗi tài khoản.",
      "Không gửi mật khẩu, mã PIN hoặc OTP cho bất kỳ người hỗ trợ nào.",
      "Bật xác thực nhiều bước nếu dịch vụ hỗ trợ.",
      "Chỉ nhập mã khi chính bạn khởi tạo thao tác trên ứng dụng hoặc trang đã xác minh.",
      "Nếu nghi bị lộ, đổi mật khẩu qua kênh chính thức và liên hệ bên cung cấp dịch vụ.",
    ],
    quiz: {
      question: "Ai được phép yêu cầu bạn đọc OTP để hỗ trợ?",
      options: ["Người tự xưng nhân viên", "Người lạ biết tên bạn", "Không chia sẻ OTP cho người hỗ trợ"],
      answer: 2,
    },
    nextStep: "Đọc lại quy tắc OTP và kiểm tra tùy chọn bảo mật, không ghi mật khẩu vào bài tập.",
  },
  {
    lesson: 9,
    title: "Nhận diện lừa đảo và tìm hỗ trợ",
    groupNo: 5,
    icon: "🛡",
    summary: "Bình tĩnh trước lời thúc giục hoặc đe dọa.",
    steps: [
      "Dừng lại khi được yêu cầu chuyển tiền gấp, cung cấp OTP hoặc cài ứng dụng lạ.",
      "Không bấm liên kết hay mở tệp đáng ngờ.",
      "Xác minh độc lập: gọi lại người quen bằng số đã lưu hoặc tìm kênh chính thức.",
      "Nếu đã thao tác, liên hệ ngay bên cung cấp tài khoản qua kênh chính thức để được hỗ trợ.",
      "Lưu bằng chứng phù hợp và báo người thân hoặc cơ quan có thẩm quyền.",
    ],
    quiz: {
      question: "Người quen nhắn vay tiền gấp, bạn nên?",
      options: ["Chuyển ngay", "Gọi lại bằng số đã biết để xác minh", "Gửi thông tin tài khoản"],
      answer: 1,
    },
    nextStep: "Thử góc an toàn số và giải thích vì sao bạn chọn cách xử lý.",
  },
];
