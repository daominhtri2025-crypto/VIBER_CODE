// Minh họa SVG cho năm chủ đề. Vẽ bằng hình học, không dùng ảnh từ bên ngoài và không dùng dữ liệu người dùng.
// Chuỗi SVG là hằng số tĩnh trong mã; khi dữ liệu thật đến, chỉ tên chủ đề (đã là chữ) được đọc để chọn minh họa.
(function () {
  const STROKE = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
  const ART = {
    'Điện thoại': `<svg viewBox="0 0 160 96" role="presentation" focusable="false">
      <rect x="58" y="6" width="44" height="84" rx="9" ${STROKE}/>
      <rect x="64" y="18" width="32" height="54" rx="3" fill="var(--accent)" opacity=".18"/>
      <path d="M72 44 q8 -9 16 0 M68 38 q12 -14 24 0 M80 62 h0" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="80" cy="80" r="3" fill="currentColor"/>
      <path d="M28 30 q-8 10 0 20 M20 24 q-12 16 0 32 M132 30 q8 10 0 20 M140 24 q12 16 0 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".6"/>
    </svg>`,
    'Giao tiếp số': `<svg viewBox="0 0 160 96" role="presentation" focusable="false">
      <path d="M20 16 h72 a8 8 0 0 1 8 8 v34 a8 8 0 0 1 -8 8 h-44 l-16 14 v-14 h-12 a8 8 0 0 1 -8 -8 v-34 a8 8 0 0 1 8 -8 z" ${STROKE}/>
      <path d="M86 40 h46 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-4 v12 l-14 -12 h-28 a8 8 0 0 1 -8 -8 v-22 a8 8 0 0 1 8 -8 z" fill="var(--accent)" opacity=".2" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="40" cy="36" r="4" fill="currentColor"/><circle cx="56" cy="36" r="4" fill="currentColor"/><circle cx="72" cy="36" r="4" fill="currentColor"/>
      <path d="M100 58 h30 M100 66 h18" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
    'Tìm thông tin': `<svg viewBox="0 0 160 96" role="presentation" focusable="false">
      <rect x="22" y="14" width="82" height="70" rx="6" ${STROKE}/>
      <path d="M36 32 h54 M36 44 h54 M36 56 h36" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>
      <circle cx="108" cy="46" r="20" fill="var(--accent)" opacity=".15"/>
      <circle cx="108" cy="46" r="20" ${STROKE} stroke="var(--accent)"/>
      <path d="M123 61 l16 16" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"/>
    </svg>`,
    'Biểu mẫu': `<svg viewBox="0 0 160 96" role="presentation" focusable="false">
      <rect x="36" y="8" width="70" height="82" rx="6" ${STROKE}/>
      <rect x="50" y="2" width="42" height="12" rx="4" fill="var(--accent)"/>
      <rect x="46" y="28" width="12" height="12" rx="2" ${STROKE} stroke-width="2.5"/>
      <path d="M48 34 l3 3 l6 -7" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M66 34 h30" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>
      <rect x="46" y="50" width="12" height="12" rx="2" ${STROKE} stroke-width="2.5"/>
      <path d="M66 56 h30" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".6"/>
      <path d="M46 74 h50" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".4"/>
      <path d="M112 62 l22 -22 l8 8 l-22 22 l-10 2 z" fill="var(--accent)" opacity=".85"/>
    </svg>`,
    'An toàn số': `<svg viewBox="0 0 160 96" role="presentation" focusable="false">
      <path d="M80 8 l34 12 v24 c0 22 -15 38 -34 46 c-19 -8 -34 -24 -34 -46 v-24 z" fill="var(--accent)" opacity=".16" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
      <path d="M80 8 l34 12 v24 c0 22 -15 38 -34 46 c-19 -8 -34 -24 -34 -46 v-24 z" ${STROKE}/>
      <path d="M66 46 l10 10 l20 -22" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M118 22 l8 -4 M124 40 h10 M16 30 l8 4 M14 46 h10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".5"/>
    </svg>`,
  };
  const FALLBACK = 'Điện thoại';

  // Tạo một hình minh họa từ chuỗi SVG tĩnh; chỉ dùng template để không gắn chuỗi vào trang trực tiếp.
  function figureFor(group) {
    const figure = document.createElement('div');
    figure.className = 'svc-art';
    figure.setAttribute('aria-hidden', 'true');
    const template = document.createElement('template');
    template.innerHTML = (ART[group] || ART[FALLBACK]).trim();
    figure.append(template.content.cloneNode(true));
    return figure;
  }

  // Thẻ bài học: tên chủ đề nằm trước dấu " · " trong dòng meta do app.js tạo.
  function decorateCard(card) {
    if (card.querySelector('.svc-art')) return;
    const meta = card.querySelector('.meta');
    if (!meta) return;
    const group = meta.textContent.split(' · ')[0].trim();
    card.prepend(figureFor(group));
  }

  // Ô chủ đề: tên nằm trong .svc-tile-name do home-service.js tạo.
  function decorateTile(tile) {
    if (tile.querySelector('.svc-art')) return;
    const name = tile.querySelector('.svc-tile-name');
    if (!name) return;
    tile.prepend(figureFor(name.textContent.trim()));
  }

  // app.js tạo lại danh sách bài mỗi lần lọc hoặc tìm kiếm, nên theo dõi thay đổi thay vì chỉ chạy một lần.
  const lessonsBox = document.getElementById('lessons');
  if (lessonsBox) {
    new MutationObserver(() => lessonsBox.querySelectorAll('.card').forEach(decorateCard))
      .observe(lessonsBox, { childList: true });
  }
  const topicsBox = document.getElementById('topics');
  if (topicsBox) {
    new MutationObserver(() => topicsBox.querySelectorAll('.svc-tile-button').forEach(decorateTile))
      .observe(topicsBox, { childList: true });
  }
})();
