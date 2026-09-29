/* Progressive reading aids; retain the original Volantis UI and services. */
(() => {
  'use strict';
  // Volantis 6.8 calls this even on image-free pages. Keep the native lightbox,
  // but only download it when an image or gallery actually uses it.
  if (typeof VolantisFancyBox !== 'undefined') {
    const load = VolantisFancyBox.prototype.loadFancybox;
    VolantisFancyBox.prototype.loadFancybox = function () {
      if (!document.querySelector('#post-body img[fancybox], .md .gallery img, .fancybox')) return Promise.resolve();
      return load.call(this);
    };
  }
  document.querySelectorAll('a.s-menu, #s-top, a.toggle-mode-btn').forEach(control => {
    control.setAttribute('role', 'button'); control.tabIndex = 0;
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); }
    });
  });
  // Reuse the native menu and search UI at the wider CSS breakpoint. The
  // upstream JS only attaches mobile handlers below 500px, so bridge controls
  // directly instead of changing the theme's source or global device flags.
  const compactNav = matchMedia('(max-width: 1024px)');
  const menuButton = document.querySelector('.nav-main .s-menu');
  const menu = document.querySelector('.nav-main .menu-phone');
  const searchButton = document.querySelector('.nav-main .s-search');
  let closeOutline = () => {};
  const closeMenu = () => {
    menu?.classList.remove('tf-open');
    menuButton?.setAttribute('aria-expanded', 'false');
  };
  if (menu && menuButton) {
    menu.id = 'tf-native-menu';
    menuButton.setAttribute('aria-controls', menu.id);
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', '导航菜单');
    menuButton.addEventListener('click', event => {
      if (!compactNav.matches) return;
      event.preventDefault(); event.stopImmediatePropagation();
      closeOutline();
      const open = menu.classList.toggle('tf-open');
      menuButton.setAttribute('aria-expanded', String(open));
    }, true);
    menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    });
    compactNav.addEventListener('change', closeMenu);
  }
  if (searchButton) {
    searchButton.setAttribute('role', 'button'); searchButton.tabIndex = 0;
    searchButton.setAttribute('aria-label', '搜索文章');
    searchButton.addEventListener('click', event => {
      if (!compactNav.matches) return;
      event.preventDefault(); event.stopImmediatePropagation(); closeMenu(); closeOutline();
      if (typeof OpenSearch === 'function') OpenSearch('');
    }, true);
    searchButton.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); searchButton.click(); }
    });
  }
  // Keep one stable navigation bar while reading. The theme may still toggle
  // #wrapper.sub internally; scoped CSS prevents its visual replacement.
  const articleHeader = document.getElementById('l_header');
  if (window.pdata?.ispage && articleHeader) {
    // Normalize article headers even if an older cached template used auto.
    articleHeader.classList.remove('auto');
    articleHeader.classList.add('always', 'tf-article-nav');
    articleHeader.style.removeProperty('opacity');
    const outlineButton = document.getElementById('s-toc');
    const outline = document.querySelector('#l_side .toc-wrapper');
    const controls = articleHeader.querySelector('.nav-main > .switcher');
    const mobileOutline = matchMedia('(max-width: 768px)');
    if (outlineButton && outline?.querySelector('.toc-link') && controls) {
      const item = outlineButton.closest('li');
      item.classList.add('tf-toc-item');
      controls.prepend(item);
      outline.id ||= 'tf-article-outline';
      outlineButton.setAttribute('role', 'button');
      outlineButton.tabIndex = 0;
      outlineButton.setAttribute('aria-label', '文章目录');
      outlineButton.setAttribute('title', '文章目录');
      outlineButton.setAttribute('aria-controls', outline.id);
      outlineButton.setAttribute('aria-expanded', 'false');
      closeOutline = () => {
        if (!outline.classList.contains('active') && outlineButton.getAttribute('aria-expanded') === 'false') return;
        outline.classList.remove('active');
        outlineButton.classList.remove('active');
        outlineButton.setAttribute('aria-expanded', 'false');
      };
      outlineButton.addEventListener('click', event => {
        if (!mobileOutline.matches) return;
        event.preventDefault(); event.stopImmediatePropagation(); closeMenu();
        const open = !outline.classList.contains('active');
        outline.classList.toggle('active', open);
        outlineButton.classList.toggle('active', open);
        outlineButton.setAttribute('aria-expanded', String(open));
        if (open && event.detail === 0) outline.querySelector('.toc-link')?.focus({ preventScroll: true });
      }, true);
      outlineButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); outlineButton.click(); }
      });
      // The theme removes href during initialization. Keep its existing click
      // handler and make the same section jumps available from the keyboard.
      outline.querySelectorAll('.toc-link').forEach(link => {
        link.setAttribute('role', 'link');
        link.tabIndex = 0;
        link.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); link.click(); }
        });
      });
      outline.addEventListener('click', event => {
        if (event.target.closest('.toc-link') && mobileOutline.matches) {
          closeOutline(); outlineButton.focus({ preventScroll: true });
        }
      }, true);
      outline.addEventListener('click', event => {
        if (mobileOutline.matches) event.stopPropagation();
      });
      document.addEventListener('click', event => {
        if (!outline.contains(event.target) && !outlineButton.contains(event.target)) closeOutline();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && outline.classList.contains('active')) {
          closeOutline(); outlineButton.focus({ preventScroll: true });
        }
      });
      window.addEventListener('scroll', closeOutline, { passive: true });
      mobileOutline.addEventListener('change', closeOutline);
    }
  }
  // Short homepages may not have enough scroll range to reach the theme's
  // header threshold. Reveal the same bar when the article area approaches.
  const header = document.querySelector('#l_header.auto');
  const homeCover = document.querySelector('#l_cover #full');
  const contentArea = document.getElementById('safearea');
  if (header && homeCover && contentArea) {
    let queued = false;
    const updateHeader = () => {
      queued = false;
      const root = document.scrollingElement;
      const atEnd = scrollY > 0 && scrollY >= root.scrollHeight - root.clientHeight - 2;
      const nearContent = contentArea.getBoundingClientRect().top <= Math.max(header.offsetHeight + 24, innerHeight * .25);
      header.classList.toggle('tf-visible', atEnd || nearContent);
    };
    const scheduleHeader = () => { if (!queued) { queued = true; requestAnimationFrame(updateHeader); } };
    window.addEventListener('scroll', scheduleHeader, { passive: true });
    window.addEventListener('resize', scheduleHeader, { passive: true });
    updateHeader();
  }
  const readButtons = document.querySelectorAll('[data-read-mode]');
  const updateReading = () => readButtons.forEach(button => {
    const active = document.body.classList.contains('tf-focus');
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '退出专注' : '专注阅读';
  });
  readButtons.forEach(button => button.addEventListener('click', () => {
    document.body.classList.toggle('tf-focus'); updateReading();
  }));
  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
  document.addEventListener('keydown', event => {
    const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !editing)) {
      event.preventDefault();
      closeMenu(); closeOutline();
      if (typeof OpenSearch === 'function') OpenSearch('');
    }
    if (event.key === 'Escape') { closeMenu(); document.body.classList.remove('tf-focus'); updateReading(); }
  });
  const article = document.getElementById('post-body');
  if (!article) return;
  const bar = document.querySelector('.tf-reading-progress');
  let pending = false;
  const updateProgress = () => {
    pending = false;
    const top = article.getBoundingClientRect().top;
    const distance = Math.max(1, article.offsetHeight - innerHeight + 100);
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, (100 - top) / distance))})`;
  };
  window.addEventListener('scroll', () => {
    if (!pending) { pending = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();
})();
