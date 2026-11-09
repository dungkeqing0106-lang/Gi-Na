'use strict';
// Hiện lỗi ra màn hình thay vì để trắng tinh (giúp chẩn đoán trên iPhone)
(function () {
  var app = document.getElementById('app');
  function show(msg) {
    if (!app || app.querySelector('.topbar, .auth')) return;
    app.innerHTML = '';
    var d = document.createElement('div');
    d.style.cssText = 'padding:32px 20px;font:15px/1.5 -apple-system,sans-serif;color:#081c36';
    d.textContent = msg;
    app.appendChild(d);
  }
  if (location.protocol === 'file:') {
    show('Không mở trực tiếp file index.html được. Hãy chạy server (node server.js) hoặc deploy rồi mở bằng địa chỉ http(s):// của server.');
    return;
  }
  window.addEventListener('error', function (e) { show('Lỗi: ' + (e.message || 'không rõ') + (e.lineno ? ' (dòng ' + e.lineno + ')' : '')); });
  window.addEventListener('unhandledrejection', function (e) { show('Lỗi: ' + (e.reason && e.reason.message || e.reason)); });
  setTimeout(function () {
    if (app && !app.querySelector('.topbar, .auth')) show('Ứng dụng chưa tải được. Kiểm tra kết nối mạng, rồi kéo xuống tải lại trang. Nếu vẫn trắng, hãy gửi mình thông báo hiện ở đây.');
  }, 6000);
})();
