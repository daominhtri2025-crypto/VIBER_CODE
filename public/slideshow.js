// Slideshow đầu trang chủ (Commit 1.7). Nội dung tĩnh nằm trong HTML; script không dùng innerHTML.
// Hành vi: tự chạy mỗi 6 giây; dừng khi rê chuột hoặc đặt focus vào cụm; có thể tạm dừng bằng nút;
// mũi tên trái/phải để chuyển khi cụm đang có focus. Nếu hệ thống yêu cầu giảm chuyển động thì không tự chạy.
(function () {
  var root = document.getElementById('slideshow');
  if (!root) return;

  var INTERVAL_MS = 6000;
  var slides = Array.prototype.slice.call(root.querySelectorAll('.slide'));
  var dots = Array.prototype.slice.call(root.querySelectorAll('.dots button'));
  var playButton = document.getElementById('slidePlay');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var index = 0;
  var timer = null;
  var autoplay = !reduceMotion;
  var hovered = false;
  var focused = false;

  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach(function (slide, i) {
      var on = i === index;
      slide.classList.toggle('active', on);
      slide.setAttribute('aria-hidden', String(!on));
    });
    dots.forEach(function (dot, i) {
      dot.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  }

  // Chỉ chạy khi đang bật tự chạy và không có tương tác (chuột hoặc focus) trong cụm.
  function restart() {
    clearInterval(timer);
    timer = null;
    if (autoplay && !hovered && !focused && !document.hidden) {
      timer = setInterval(function () { show(index + 1); }, INTERVAL_MS);
    }
  }

  function setPlaying(on) {
    autoplay = on;
    if (playButton) {
      playButton.setAttribute('aria-pressed', String(on));
      playButton.setAttribute('aria-label', on ? 'Tạm dừng tự chạy' : 'Bật tự chạy');
      playButton.textContent = on ? '❚❚' : '▶';
    }
    restart();
  }

  document.getElementById('slidePrev').addEventListener('click', function () { show(index - 1); restart(); });
  document.getElementById('slideNext').addEventListener('click', function () { show(index + 1); restart(); });
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { show(i); restart(); });
  });
  if (playButton) playButton.addEventListener('click', function () { setPlaying(!autoplay); });

  root.addEventListener('mouseenter', function () { hovered = true; restart(); });
  root.addEventListener('mouseleave', function () { hovered = false; restart(); });
  root.addEventListener('focusin', function () { focused = true; restart(); });
  root.addEventListener('focusout', function (event) {
    if (!root.contains(event.relatedTarget)) { focused = false; restart(); }
  });
  root.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft') { show(index - 1); restart(); }
    if (event.key === 'ArrowRight') { show(index + 1); restart(); }
  });
  document.addEventListener('visibilitychange', restart);

  show(0);
  setPlaying(autoplay);
})();
