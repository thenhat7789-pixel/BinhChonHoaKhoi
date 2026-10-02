/**
 * PWA Install Manager
 * Hệ thống cài đặt ứng dụng Web App chuẩn Progressive Web App (PWA)
 * Hỗ trợ giao diện chuẩn đa nền tảng: PC/Máy tính, Android, iPhone/iPad (iOS)
 */

(function () {
  'use strict';

  let deferredPrompt = null;
  let activeTab = 'desktop';

  // 1. Đăng ký Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(
        (reg) => {
          // SW registered successfully
        },
        (err) => {
          // Registration failed (offline or localhost SSL restrictions)
        }
      );
    });
  }

  // 2. Bắt sự kiện beforeinstallprompt của trình duyệt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.deferredPWAInstallPrompt = e;

    // Cập nhật trạng thái nút bấm nếu có
    const desktopBtn = document.getElementById('pwaBtnInstallDesktop');
    const androidBtn = document.getElementById('pwaBtnInstallAndroid');
    if (desktopBtn) desktopBtn.classList.add('ready');
    if (androidBtn) androidBtn.classList.add('ready');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.deferredPWAInstallPrompt = null;
    showToast('🎉 Bạn đã cài đặt ứng dụng thành công!', 'success');
    closePwaModal();
  });

  // 3. Nhận diện thiết bị người dùng
  function detectPlatform() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      return 'ios';
    }
    if (/android/i.test(ua)) {
      return 'android';
    }
    return 'desktop';
  }

  // 4. Khởi tạo Modal HTML vào trang web
  function injectPwaModal() {
    if (document.getElementById('pwaInstallModalOverlay')) return;

    const modalHTML = `
    <!-- PWA INSTALL MODAL OVERLAY -->
    <div id="pwaInstallModalOverlay" class="pwa-modal-overlay pwa-hidden" role="dialog" aria-modal="true" aria-labelledby="pwaModalTitle">
      <div class="pwa-modal-container" id="pwaModalContainer">
        
        <!-- Header -->
        <div class="pwa-modal-header">
          <div class="pwa-modal-header-left">
            <div class="pwa-header-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
              </svg>
            </div>
            <div class="pwa-modal-header-title" id="pwaModalTitle">
              Dùng mượt mà trên PC, Android &amp; iPhone
            </div>
          </div>
          <button class="pwa-modal-close-icon" id="pwaCloseIconBtn" aria-label="Đóng" title="Đóng">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Platform Tabs -->
        <div class="pwa-tabs-container" role="tablist">
          <button class="pwa-tab-btn active" id="pwaTabDesktop" data-target="desktop" role="tab" aria-selected="true">
            <span class="pwa-tab-icon">🖥️</span>
            <span>Máy tính</span>
          </button>
          <button class="pwa-tab-btn" id="pwaTabAndroid" data-target="android" role="tab" aria-selected="false">
            <span class="pwa-tab-icon">🤖</span>
            <span>Android</span>
          </button>
          <button class="pwa-tab-btn" id="pwaTabIos" data-target="ios" role="tab" aria-selected="false">
            <span class="pwa-tab-icon">🍎</span>
            <span>iPhone (iOS)</span>
          </button>
        </div>

        <!-- Content Card -->
        <div class="pwa-card-box">

          <!-- ─── TAB 1: MÁY TÍNH (DESKTOP) ─── -->
          <div class="pwa-tab-content active" id="pwaContentDesktop" role="tabpanel">
            <div class="pwa-step-header">
              <span class="pwa-badge pwa-badge-blue">Cách 1</span>
              <span class="pwa-step-title">Bấm cài trực tiếp:</span>
            </div>

            <button class="pwa-direct-install-btn" id="pwaBtnInstallDesktop">
              <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              <span>Bấm để Cài đặt ngay lên Máy tính</span>
            </button>

            <div class="pwa-step-header mt-16" id="pwaDeskWay2Header">
              <span class="pwa-badge pwa-badge-gray">Cách 2</span>
              <span class="pwa-step-title">Cài qua thanh địa chỉ trình duyệt:</span>
            </div>

            <ul class="pwa-guide-list" id="pwaDeskGuideList">
              <li>
                • <strong>Trên Chrome / Edge / Cốc Cốc:</strong> Nhìn sang <strong>cuối thanh địa chỉ URL</strong>, bấm biểu tượng <span class="pwa-inline-icon">🖥️</span> <strong>Cài đặt ứng dụng</strong>.
              </li>
              <li>
                • Hoặc bấm <strong>dấu 3 chấm ⋮ ở góc phải trên cùng</strong> → <strong>Lưu và chia sẻ</strong> → <strong>Cài đặt Bình Chọn Hoa Khôi...</strong>
              </li>
            </ul>
          </div>

          <!-- ─── TAB 2: ANDROID ─── -->
          <div class="pwa-tab-content" id="pwaContentAndroid" role="tabpanel">
            <div class="pwa-step-header">
              <span class="pwa-badge pwa-badge-blue">Cách 1</span>
              <span class="pwa-step-title">Bấm cài trực tiếp:</span>
            </div>

            <button class="pwa-direct-install-btn" id="pwaBtnInstallAndroid">
              <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              <span>Bấm để Cài đặt ngay lên Android</span>
            </button>

            <div class="pwa-step-header mt-16" id="pwaAndroidWay2Header">
              <span class="pwa-badge pwa-badge-gray">Cách 2</span>
              <span class="pwa-step-title">Cài qua trình duyệt Chrome / Cốc Cốc:</span>
            </div>

            <ul class="pwa-guide-list">
              <li>
                • <strong>Trên Chrome / Cốc Cốc:</strong> Bấm biểu tượng <strong>dấu 3 chấm ⋮</strong> ở góc trên bên phải màn hình.
              </li>
              <li>
                • Chọn mục <strong>"Cài đặt ứng dụng"</strong> (hoặc <strong>"Thêm vào màn hình chính" / Add to Home screen</strong>).
              </li>
              <li>
                • Bấm <strong>"Cài đặt" / "Thêm"</strong> để xác nhận. Ứng dụng sẽ xuất hiện như App thật trên màn hình điện thoại của bạn.
              </li>
            </ul>
          </div>

          <!-- ─── TAB 3: IPHONE (IOS) ─── -->
          <div class="pwa-tab-content" id="pwaContentIos" role="tabpanel">
            <div class="pwa-step-header">
              <span class="pwa-badge pwa-badge-blue">Hướng dẫn</span>
              <span class="pwa-step-title">Cài đặt trên trình duyệt Safari:</span>
            </div>

            <ul class="pwa-guide-list">
              <li>
                • <strong>Bước 1:</strong> Mở trang web bằng trình duyệt <strong>Safari</strong> (bắt buộc trên iOS để cài App).
              </li>
              <li>
                • <strong>Bước 2:</strong> Bấm vào biểu tượng <strong>Chia sẻ</strong> (hình ô vuông có mũi tên hướng lên <span class="pwa-inline-icon">📤</span>) ở thanh công cụ dưới đáy màn hình.
              </li>
              <li>
                • <strong>Bước 3:</strong> Vuốt lên danh sách tác vụ, tìm và bấm chọn <strong>"Thêm vào MH chính"</strong> (Add to Home Screen ⊞).
              </li>
              <li>
                • <strong>Bước 4:</strong> Bấm <strong>"Thêm"</strong> (Add) ở góc trên bên phải màn hình. Biểu tượng App sẽ được cài ngay ra màn hình chính iPhone của bạn.
              </li>
            </ul>
          </div>

        </div>

        <!-- Footer -->
        <div class="pwa-modal-footer">
          <button class="pwa-close-btn" id="pwaFooterCloseBtn">Đóng</button>
        </div>

      </div>
    </div>

    <!-- FLOATING ACTION BUTTON (FAB) -->
    <button class="pwa-fab-btn" id="pwaFabTrigger" title="Tải trang web thành App">
      <span class="pwa-fab-icon">
        <svg viewBox="0 0 24 24">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
        </svg>
      </span>
      <span>Cài đặt App</span>
      <span class="pwa-fab-badge"></span>
    </button>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    attachEvents();
  }

  // 5. Gắn sự kiện cho các thành phần giao diện
  function attachEvents() {
    const overlay = document.getElementById('pwaInstallModalOverlay');
    const container = document.getElementById('pwaModalContainer');
    const closeBtn = document.getElementById('pwaCloseIconBtn');
    const footerCloseBtn = document.getElementById('pwaFooterCloseBtn');
    const fabBtn = document.getElementById('pwaFabTrigger');

    // Chuyển tab
    const tabs = document.querySelectorAll('.pwa-tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-target');
        switchPwaTab(target);
      });
    });

    // Đóng modal
    const closeHandler = () => closePwaModal();
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    if (footerCloseBtn) footerCloseBtn.addEventListener('click', closeHandler);

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePwaModal();
      });
    }

    // Phím Escape để đóng
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.classList.contains('pwa-hidden')) {
        closePwaModal();
      }
    });

    // FAB Trigger mở modal
    if (fabBtn) {
      fabBtn.addEventListener('click', () => {
        openPwaModal();
      });
    }

    // Nút cài trực tiếp Máy tính & Android
    const deskInstallBtn = document.getElementById('pwaBtnInstallDesktop');
    if (deskInstallBtn) {
      deskInstallBtn.addEventListener('click', () => handleDirectInstall('desktop'));
    }

    const androidInstallBtn = document.getElementById('pwaBtnInstallAndroid');
    if (androidInstallBtn) {
      androidInstallBtn.addEventListener('click', () => handleDirectInstall('android'));
    }

    // Các nút trigger khác có sẵn trên trang (ví dụ trên Topbar)
    const extTriggers = document.querySelectorAll('[data-open-pwa-modal]');
    extTriggers.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openPwaModal();
      });
    });
  }

  // 6. Xử lý logic chuyển tab
  function switchPwaTab(tabName) {
    activeTab = tabName;
    const tabs = document.querySelectorAll('.pwa-tab-btn');
    const contents = document.querySelectorAll('.pwa-tab-content');

    tabs.forEach((tab) => {
      const isCurrent = tab.getAttribute('data-target') === tabName;
      tab.classList.toggle('active', isCurrent);
      tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    });

    contents.forEach((content) => {
      const matchId = `pwaContent${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
      content.classList.toggle('active', content.id === matchId);
    });
  }

  // 7. Xử lý bấm nút cài đặt trực tiếp
  async function handleDirectInstall(platform) {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          showToast('🎉 Đang tiến hành cài đặt ứng dụng...', 'success');
          deferredPrompt = null;
          closePwaModal();
        } else {
          showToast('Đã hủy cài đặt. Bạn có thể cài lại bất cứ lúc nào.', 'info');
        }
      } catch (err) {
        fallbackWay2(platform);
      }
    } else {
      fallbackWay2(platform);
    }
  }

  function fallbackWay2(platform) {
    if (platform === 'desktop') {
      showToast('💡 Vui lòng nhìn lên góc phải cuối thanh địa chỉ URL hoặc làm theo [Cách 2] bên dưới!', 'info', 4500);
      const way2Header = document.getElementById('pwaDeskWay2Header');
      if (way2Header) {
        way2Header.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      showToast('💡 Vui lòng bấm dấu 3 chấm ⋮ trên trình duyệt và chọn "Cài đặt ứng dụng" theo [Cách 2]!', 'info', 4500);
    }
  }

  // 8. Đóng / Mở modal
  function openPwaModal(requestedPlatform) {
    injectPwaModal();
    const overlay = document.getElementById('pwaInstallModalOverlay');
    if (!overlay) return;

    const platform = requestedPlatform || detectPlatform();
    switchPwaTab(platform);
    overlay.classList.remove('pwa-hidden');
    document.body.style.overflow = 'hidden';
  }

  function closePwaModal() {
    const overlay = document.getElementById('pwaInstallModalOverlay');
    if (overlay) {
      overlay.classList.add('pwa-hidden');
    }
    document.body.style.overflow = '';
  }

  // 9. Toast thông báo tiện ích
  function showToast(msg, type = 'info', duration = 3000) {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toastWrap';
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, duration);
  }

  // Public API toàn cục
  window.PWAInstaller = {
    open: openPwaModal,
    close: closePwaModal,
    switchTab: switchPwaTab,
    detectPlatform: detectPlatform
  };

  // Tự động khởi tạo khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPwaModal);
  } else {
    injectPwaModal();
  }
})();
