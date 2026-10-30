// Trang chủ theo bố cục dịch vụ công (bản xem trước). Ba khối: bài đang học, chủ đề, tin tức.
// Dữ liệu từ máy chủ và từ thiết bị chỉ hiển thị bằng textContent, không dùng innerHTML (CLAUDE.md mục 2).
(function () {
  const $ = (id) => document.getElementById(id);
  const DEFAULT_KEY = 'sontra-progress';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function showState(box, className, message) {
    box.replaceChildren(el('p', className, message));
  }

  // Khóa tiến độ giống app.js: khách dùng 'sontra-progress'; đăng nhập dùng khóa theo mã học viên.
  function progressKey() {
    return typeof progressStorageKey === 'string' ? progressStorageKey : DEFAULT_KEY;
  }

  function readProgress() {
    try {
      const s = JSON.parse(localStorage.getItem(progressKey()));
      if (s && Array.isArray(s.read) && Array.isArray(s.done)) return s;
    } catch {
      /* Trình duyệt chặn bộ nhớ hoặc dữ liệu hỏng: coi như chưa có tiến độ. */
    }
    return { read: [], done: [], scores: {} };
  }

  // Bài đang học: ưu tiên bài đã đọc nhưng chưa tự xác nhận hoàn thành; nếu không có, lấy bài chưa hoàn thành đầu tiên.
  function renderContinue(lessons) {
    const box = $('continueBody');
    const s = readProgress();
    const total = lessons.length;
    const readCount = s.read.filter((i) => i < total).length;
    const doneCount = s.done.filter((i) => i < total).length;

    let index = lessons.findIndex((_, i) => s.read.includes(i) && !s.done.includes(i));
    if (index < 0) index = lessons.findIndex((_, i) => !s.done.includes(i));

    if (index < 0) {
      box.replaceChildren(el('p', 'state', 'Bạn đã tự xác nhận hoàn thành cả ' + total + ' bài trên thiết bị này.'));
      return;
    }

    const lesson = lessons[index];
    const title = el('p', 'svc-continue-title', 'Bài ' + String(index + 1).padStart(2, '0') + ': ' + lesson.title);
    const meta = el('p', 'svc-continue-meta', 'Đã đọc ' + readCount + '/' + total + ' · Đã tự xác nhận hoàn thành ' + doneCount + '/' + total);
    const action = el('button', 'btn btn-primary', s.read.includes(index) ? 'Tiếp tục bài này' : 'Vào bài học');
    action.type = 'button';
    action.addEventListener('click', () => {
      if (typeof window.lesson === 'function') window.lesson(index);
    });
    box.replaceChildren(title, meta, action);
  }

  // Chủ đề: đếm bài theo nhóm. group_no bắt đầu từ 1 và tương ứng với nút lọc thứ group_no trong app.js.
  function renderTopics(data) {
    const box = $('topics');
    const counts = new Map();
    for (const lesson of data.lessons) counts.set(lesson.group_no, (counts.get(lesson.group_no) || 0) + 1);
    box.replaceChildren();
    data.groups.forEach((name, i) => {
      const group = i + 1;
      const tile = el('button', 'svc-tile svc-tile-button');
      tile.type = 'button';
      tile.append(el('span', 'svc-tile-count', String(counts.get(group) || 0) + ' bài'));
      tile.append(el('span', 'svc-tile-name', name));
      tile.addEventListener('click', () => {
        const filterButton = document.querySelectorAll('#filters button')[group];
        if (filterButton) filterButton.click();
        location.hash = 'hoc';
      });
      box.append(tile);
    });
  }

  // Tin tức: chỉ tin công khai từ máy chủ. Liên kết nguồn chỉ mở khi là https; máy chủ cũng kiểm tra điều này.
  function renderNews(news) {
    const box = $('news');
    if (!news.length) {
      showState(box, 'state', 'Chưa có tin mới. Tin sẽ được đăng khi có thông báo từ ban quản lý.');
      return;
    }
    box.replaceChildren();
    for (const item of news) {
      const article = el('article', 'svc-news-item');
      const date = new Date(item.published_at);
      const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      article.append(el('p', 'svc-news-date', when));
      article.append(el('h3', '', item.title));
      if (item.summary) article.append(el('p', '', item.summary));
      if (item.source_url && item.source_url.startsWith('https://')) {
        const link = el('a', 'svc-news-link', 'Đọc nguồn gốc');
        link.href = item.source_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        article.append(link);
      }
      box.append(article);
    }
  }

  async function getJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // Bài học dùng cho hai khối đầu; nếu lỗi thì báo rõ, không để trống im lặng.
  getJson('/api/lessons')
    .then((data) => {
      renderContinue(data.lessons);
      renderTopics(data);
    })
    .catch(() => {
      showState($('continueBody'), 'state', 'Chưa tải được bài học. Kiểm tra kết nối rồi tải lại trang.');
      showState($('topics'), 'state', 'Chưa tải được chủ đề.');
    });

  getJson('/api/news')
    .then((data) => renderNews(data.news || []))
    .catch(() => showState($('news'), 'state', 'Chưa tải được tin tức. Vui lòng thử lại sau.'));

  // Khi người dùng đổi tiến độ ở khối khác, cập nhật lại khối bài đang học.
  window.addEventListener('storage', () => {
    getJson('/api/lessons').then((data) => renderContinue(data.lessons)).catch(() => {});
  });
})();
