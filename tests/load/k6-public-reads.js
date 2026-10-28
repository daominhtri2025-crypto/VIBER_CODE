// Kịch bản đo tải NFR-PERF-03 (CLAUDE.md mục 7, 8): 500 học viên đồng thời, trang học và danh mục bài.
// Chạy trên STAGING, không chạy trên production. Không chứa khóa hay cookie: đọc từ biến môi trường lúc chạy.
//   BASE_URL       URL staging, ví dụ https://<staging>.example
//   ADMIN_COOKIE   (tùy chọn) cookie phiên quản trị để đo GET /api/dashboard; thiếu biến này thì bỏ qua kịch bản quản trị.
//                  Giá trị chỉ truyền qua biến môi trường lúc chạy, không ghi vào tệp này.
// Ngưỡng nghiệm thu: p95 dưới 1 giây cho GET /api/dashboard; tỷ lệ lỗi dưới 1%.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) throw new Error('Thiếu BASE_URL (URL staging)');

export const options = {
  scenarios: {
    learners: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '3m', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '1m', target: 0 },
      ],
      exec: 'learnerPage',
    },
    ...(__ENV.ADMIN_COOKIE
      ? {
          admin: {
            executor: 'constant-vus',
            vus: 5,
            duration: '10m',
            exec: 'adminDashboard',
          },
        }
      : {}),
  },
  thresholds: {
    'http_req_failed{endpoint:dashboard}': ['rate<0.01'],
    'http_req_duration{endpoint:dashboard}': ['p(95)<1000'],
    'http_req_failed{endpoint:lessons}': ['rate<0.01'],
    'http_req_duration{endpoint:lessons}': ['p(95)<1000'],
    'http_req_failed{endpoint:videos}': ['rate<0.01'],
    'http_req_duration{endpoint:videos}': ['p(95)<1000'],
  },
};

// Mỗi học viên mở trang học: danh mục bài và danh sách video (hai đường đọc công khai).
export function learnerPage() {
  const lessons = http.get(`${BASE_URL}/api/lessons`, { tags: { endpoint: 'lessons' } });
  check(lessons, { 'lessons 200': (r) => r.status === 200 });
  const videos = http.get(`${BASE_URL}/api/videos`, { tags: { endpoint: 'videos' } });
  check(videos, { 'videos 200': (r) => r.status === 200 });
  sleep(1);
}

// Quản trị viên mở báo cáo định kỳ: GET /api/dashboard (đo ngưỡng 1 giây theo NFR-PERF-03).
export function adminDashboard() {
  const response = http.get(`${BASE_URL}/api/dashboard`, {
    headers: { Cookie: __ENV.ADMIN_COOKIE },
    tags: { endpoint: 'dashboard' },
  });
  check(response, { 'dashboard 200': (r) => r.status === 200 });
  sleep(15);
}
