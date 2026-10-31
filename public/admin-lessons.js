// Quản lý bài học cho quản trị viên (CLAUDE.md mục 4.4, 4.15, 4.16; quyết định 30/10/2026).
// Chỉ khởi tạo khi admin.js xác nhận quyền quản trị viên. Quyền thật vẫn do máy chủ kiểm tra.
// Mọi nội dung hiển thị đi qua textContent, không chèn HTML từ dữ liệu máy chủ (CLAUDE.md mục 2).
(function () {
  const state = { page: 1, pages: 1, lessons: [], groupNames: [], editing: null, ready: false };
  const el = (id) => document.getElementById(id);
  const text = (id, value) => { el(id).textContent = value; };
  const when = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');
  const groupLabel = (group) => (group ? state.groupNames[group - 1] || 'Nhóm ' + group : '—');

  async function request(path, options) {
    const response = await fetch('/api/' + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Không thể kết nối');
    return data;
  }
  const postJson = (path, body) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function button(label, onClick) {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.onclick = onClick;
    return node;
  }

  // Ô dạng văn bản thuần; mọi giá trị từ máy chủ đi qua textContent.
  function appendCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }

  function renderList() {
    const body = el('lessonList');
    body.replaceChildren();
    for (const item of state.lessons) {
      const row = document.createElement('tr');
      appendCell(row, String(item.lesson));
      appendCell(row, item.title);
      appendCell(row, groupLabel(item.group_no));
      appendCell(row, item.hidden ? 'Đã ẩn' : 'Đang hiển thị');
      appendCell(row, when(item.updated));
      const actions = document.createElement('td');
      actions.append(
        button('Sửa', () => fillForm(item)),
        ' ',
        button(item.hidden ? 'Hiện bài' : 'Ẩn bài', () => toggleHidden(item)),
        ' ',
        button('Lịch sử', () => showVersions(item)),
      );
      row.append(actions);
      body.append(row);
    }
  }

  async function loadPage(page) {
    text('lessonStatus', 'Đang tải bài học…');
    try {
      const data = await request('admin/lessons?page=' + page);
      state.page = data.page;
      state.pages = data.pages;
      state.lessons = data.lessons;
      renderList();
      text('lessonPageInfo', 'Trang ' + data.page + ' / ' + data.pages + ' · ' + data.total + ' bài');
      el('lessonPrev').disabled = data.page <= 1;
      el('lessonNext').disabled = data.page >= data.pages;
      text('lessonStatus', 'Đã tải ' + data.lessons.length + ' bài trên trang này.');
    } catch (error) {
      state.lessons = [];
      el('lessonList').replaceChildren();
      text('lessonStatus', 'Chưa tải được bài học: ' + error.message);
    }
  }

  // Biểu mẫu: chế độ thêm (lesson còn nhập được) và chế độ sửa (mã bài khóa để không đổi bài khác).
  function fillForm(item) {
    const form = el('lessonForm');
    state.editing = item ? item.lesson : null;
    form.elements.lesson.value = item ? String(item.lesson) : '';
    form.elements.lesson.readOnly = Boolean(item);
    form.elements.title.value = item ? item.title : '';
    form.elements.group_no.value = item ? String(item.group_no) : '1';
    form.elements.icon.value = item ? item.icon : '';
    form.elements.summary.value = item ? item.summary : '';
    form.elements.steps.value = item ? item.steps.join('\n') : '';
    form.elements.quiz_question.value = item ? item.quiz.question : '';
    form.elements.quiz_options.value = item ? item.quiz.options.join('\n') : '';
    // Giao diện đánh số phương án từ 1; máy chủ nhận chỉ số từ 0 (quiz.answer).
    form.elements.quiz_answer.value = item ? String(item.quiz.answer + 1) : '';
    form.elements.next_step.value = item ? item.next_step : '';
    text('lessonFormTitle', item ? 'Sửa bài ' + item.lesson : 'Thêm bài mới');
    form.querySelector('button').textContent = item ? 'Lưu thay đổi' : 'Thêm bài';
  }

  const linesOf = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean);
  const numberOrNull = (raw) => (String(raw).trim() === '' ? null : Number(raw));

  // Đọc biểu mẫu thành body gửi máy chủ; mọi kiểm tra nghiệp vụ nằm ở máy chủ.
  function readForm(form) {
    const answer = numberOrNull(form.elements.quiz_answer.value);
    return {
      lesson: numberOrNull(form.elements.lesson.value),
      title: form.elements.title.value,
      group_no: Number(form.elements.group_no.value),
      icon: form.elements.icon.value,
      summary: form.elements.summary.value,
      steps: linesOf(form.elements.steps.value),
      quiz: {
        question: form.elements.quiz_question.value,
        options: linesOf(form.elements.quiz_options.value),
        answer: answer === null ? null : answer - 1,
      },
      next_step: form.elements.next_step.value,
    };
  }

  async function toggleHidden(item) {
    text('lessonMsg', '');
    try {
      await postJson('admin/lessons/visibility', { lesson: item.lesson, hidden: !item.hidden });
      text('lessonMsg', (item.hidden ? 'Đã hiện bài ' : 'Đã ẩn bài ') + item.lesson + '. Số liệu lịch sử vẫn được giữ nguyên.');
      await loadPage(state.page);
      window.dispatchEvent(new Event('lessons-changed'));
    } catch (error) {
      text('lessonMsg', error.message);
    }
  }

  function versionLine(container, label, value) {
    const line = document.createElement('p');
    line.textContent = label + ': ' + value;
    container.append(line);
  }

  // Lịch sử phiên bản do máy chủ sắp xếp mới nhất trước; mỗi mục là bản trước khi sửa.
  async function showVersions(item) {
    el('versionPanel').classList.remove('hidden');
    text('versionTitle', 'Lịch sử bài ' + item.lesson);
    el('versionList').replaceChildren();
    text('versionStatus', 'Đang tải lịch sử…');
    try {
      const data = await request('admin/lessons/versions?lesson=' + item.lesson);
      const list = el('versionList');
      if (data.versions.length === 0) {
        text('versionStatus', 'Chưa có bản cũ. Bản trước sẽ được lưu ở đây mỗi lần bạn sửa nội dung bài.');
        return;
      }
      text('versionStatus', 'Có ' + data.versions.length + ' bản cũ, bản mới nhất ở trên.');
      for (const version of data.versions) {
        const entry = document.createElement('li');
        const heading = document.createElement('strong');
        heading.textContent = when(version.saved_at) + ' · ' + version.title;
        entry.append(heading);
        versionLine(entry, 'Tóm tắt', version.summary);
        versionLine(entry, 'Câu hỏi', version.quiz.question);
        versionLine(entry, 'Đáp án đúng', 'phương án ' + (version.quiz.answer + 1));
        list.append(entry);
      }
    } catch (error) {
      text('versionStatus', 'Chưa tải được lịch sử: ' + error.message);
    }
  }

  function fillGroupSelect(names) {
    const select = el('lessonGroup');
    select.replaceChildren();
    const count = Math.max(names.length, 5);
    for (let group = 1; group <= count; group += 1) {
      const option = document.createElement('option');
      option.value = String(group);
      option.textContent = group + '. ' + (names[group - 1] || 'Nhóm ' + group);
      select.append(option);
    }
  }

  function bind() {
    el('lessonPrev').onclick = () => loadPage(state.page - 1);
    el('lessonNext').onclick = () => loadPage(state.page + 1);
    el('lessonCancel').onclick = () => { fillForm(null); text('lessonMsg', ''); };
    el('versionClose').onclick = () => el('versionPanel').classList.add('hidden');
    el('lessonForm').onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('button');
      const editing = state.editing;
      submit.disabled = true;
      text('lessonMsg', editing === null ? 'Đang thêm bài…' : 'Đang lưu thay đổi…');
      try {
        const body = readForm(form);
        if (editing === null) {
          await postJson('admin/lessons', body);
          text('lessonMsg', 'Đã thêm bài mới.');
        } else {
          await postJson('admin/lessons/update', body);
          text('lessonMsg', 'Đã lưu. Bản trước của bài đã được giữ trong lịch sử.');
        }
        fillForm(null);
        await loadPage(state.page);
        window.dispatchEvent(new Event('lessons-changed'));
      } catch (error) {
        text('lessonMsg', error.message);
      } finally {
        submit.disabled = false;
      }
    };
  }

  async function init() {
    if (state.ready) return;
    state.ready = true;
    bind();
    fillForm(null);
    try {
      // Tên nhóm lấy từ danh mục công khai, cùng nguồn với trang học và báo cáo.
      const catalog = await request('lessons');
      state.groupNames = catalog.groups;
    } catch (error) {
      state.groupNames = [];
    }
    fillGroupSelect(state.groupNames);
    await loadPage(1);
  }

  window.SonTraLessons = { init };
})();
