/*!
 * html-ppt-remote · 翻页笔遥控 + 智能全屏（v2 通用架构）
 * 
 * 三层检测架构（越未知越靠后）：
 *  第一层：DOM 快速检测 — <deck-stage> / .active class / translateX / 通用 data-*
 *  第二层：事件监听捕获 — slidechange / 自定义事件 / postMessage
 *  第三层：键盘计数器兜底 — 记录按键次数，模拟翻页位置
 * 
 * 核心原理：capture 模式优先拦截，只在边界（首页/尾页）处理全屏，其余放行。
 * 
 * 兼容已知结构：
 *  - <deck-stage> web component（beautiful-html-templates）
 *  - .slide + .active / .current / .is-active class（reveal.js、pratyaya-ppt 等）
 *  - #deck + translateX 滑动（open-design）
 *  - .swiper-slide-active（Swiper.js）
 *  - 任意 section / div 通过 MutationObserver 追踪
 * 
 * 兼容未知结构：
 *  - 通过键盘计数器 + 事件监听自动追踪
 *  - 即使完全未知的框架也能正常工作
 * 
 * 使用：在 HTML 的 </body> 前加 <script src="slide-remote.js"></script>
 */

(function () {
  'use strict';

  // ====================================================================
  //  状态管理
  // ====================================================================

  var state = {
    idx: 0,        // 当前页索引（0-based）
    total: 1,      // 总页数
    inited: false, // 是否已初始化
    method: ''     // 当前使用的检测方法
  };

  // ====================================================================
  //  第一层：DOM 快速检测（同步，零延迟）
  // ====================================================================

  /** 获取所有幻灯片元素（尝试多种选择器） */
  function getAllSlides() {
    // 按优先级尝试不同选择器
    var selectors = [
      '.slide',                    // 最通用
      '.swiper-slide',             // Swiper.js
      '.reveal .slides > section', // reveal.js
      'deck-stage > *',           // beautiful-html-templates
      '#deck > .slide',            // open-design
      '.page',                     // 一些中文框架
      '[data-slide]',              // 自定义 data 属性
      'section[data-index]',       // 带索引的 section
    ];
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      if (els.length > 1) return els;
    }
    return [];
  }

  /** 获取当前页索引（DOM 方式，返回 -1 表示无法检测） */
  function detectFromDOM() {
    // A. <deck-stage> web component — 直接读 .index getter
    var ds = document.querySelector('deck-stage');
    if (ds && typeof ds.index === 'number') {
      state.method = 'deck-stage';
      return ds.index;
    }

    // B. 查找「当前活跃」class
    var slides = getAllSlides();
    if (slides.length) {
      var activeSelectors = [
        '.active', '.current', '.is-active', '.visible', '.present',
        '.swiper-slide-active', '.slide-current'
      ];
      for (var a = 0; a < activeSelectors.length; a++) {
        var active = document.querySelector('.slide' + activeSelectors[a] + ', ' +
          '.swiper-slide' + activeSelectors[a] + ', ' +
          'section' + activeSelectors[a] + ', ' +
          '.page' + activeSelectors[a]);
        if (active) {
          for (var j = 0; j < slides.length; j++) {
            if (slides[j] === active) {
              state.method = 'active-class';
              return j;
            }
          }
        }
      }

      // C. 检查 data-* 属性标记的活跃页
      var dataActive = document.querySelector('[data-active="true"], [data-state="active"], [data-current="true"], [data-deck-active]');
      if (dataActive) {
        for (var k = 0; k < slides.length; k++) {
          if (slides[k] === dataActive) {
            state.method = 'data-attr';
            return k;
          }
        }
      }

      // D. 从 #deck 的 transform 推算
      var deck = document.getElementById('deck');
      if (deck) {
        var transform = getComputedStyle(deck).transform;
        if (transform && transform !== 'none') {
          try {
            var mat = new DOMMatrix(transform);
            var slideWidth = slides[0].offsetWidth || innerWidth;
            if (slideWidth > 0) {
              state.method = 'translateX';
              return Math.round(Math.abs(mat.m41) / slideWidth);
            }
          } catch (e) {}
        }
      }

      // E. display:block / flex / grid 的可见性检测
      //    只适用于「同屏只显示一页」的布局
      for (var m = 0; m < slides.length; m++) {
        var st = getComputedStyle(slides[m]);
        if (st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0') {
          // 如果有多个可见，说明不是单页模式，跳过
          var visibleCount = 0;
          for (var n = 0; n < slides.length; n++) {
            var st2 = getComputedStyle(slides[n]);
            if (st2.display !== 'none' && st2.visibility !== 'hidden' && st2.opacity !== '0') visibleCount++;
          }
          if (visibleCount === 1) {
            state.method = 'visibility';
            return m;
          }
          break;
        }
      }
    }

    return -1; // 无法检测
  }

  // ====================================================================
  //  第二层：事件监听捕获（异步，实时追踪）
  // ====================================================================

  function initEventCapture() {
    // A. 自定义事件（常见框架都会派发 slide 切换事件）
    var events = [
      'slidechange', 'slidechanged', 'slide-change',
      'pageswitch', 'pagechange', 'page-change',
      'navigate', 'goto', 'turn', 'flip'
    ];
    events.forEach(function(name) {
      document.addEventListener(name, function(e) {
        if (e.detail) {
          if (typeof e.detail.index === 'number') state.idx = e.detail.index;
          else if (typeof e.detail === 'number') state.idx = e.detail;
          else if (e.detail.slideIndex !== undefined) state.idx = e.detail.slideIndex;
          else if (e.detail.currentPage !== undefined) state.idx = e.detail.currentPage - 1;
          if (typeof e.detail.total === 'number') state.total = e.detail.total;
        }
      }, true);
    });

    // B. postMessage（iframe 嵌入场景）
    window.addEventListener('message', function(e) {
      if (e.data && typeof e.data.slideIndex === 'number') {
        state.idx = e.data.slideIndex;
        if (typeof e.data.totalSlides === 'number') state.total = e.data.totalSlides;
      }
    }, true);

    // C. hashchange（URL hash 驱动翻页的框架）
    window.addEventListener('hashchange', function() {
      var hash = location.hash.replace('#', '');
      var num = parseInt(hash, 10);
      if (!isNaN(num)) {
        // 可能是 1-indexed 或 0-indexed
        var slides = getAllSlides();
        if (num >= 0 && num < slides.length) state.idx = num;
        else if (num >= 1 && num <= slides.length) state.idx = num - 1;
      }
    }, true);
  }

  // ====================================================================
  //  第三层：MutationObserver（追踪 DOM 变化）
  // ====================================================================

  function initMutationObserver() {
    if (typeof MutationObserver === 'undefined') return;

    var observer = new MutationObserver(function() {
      var detected = detectFromDOM();
      if (detected >= 0) {
        state.idx = detected;
        var slides = getAllSlides();
        if (slides.length > 1) state.total = slides.length;
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-active', 'data-state', 'data-current', 'data-deck-active', 'data-index', 'style'],
      subtree: true,
      childList: false
    });
  }

  // ====================================================================
  //  第四层：键盘计数器兜底（完全未知框架的最后手段）
  // ====================================================================

  var NEXT_KEYS = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'NumpadEnter'];
  var PREV_KEYS = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];

  function initKeyboardFallback() {
    // 在 capture 阶段，如果 DOM 检测失败，用计数器追踪翻页
    document.addEventListener('keydown', function(e) {
      var isNext = NEXT_KEYS.indexOf(e.key) >= 0;
      var isPrev = PREV_KEYS.indexOf(e.key) >= 0;
      if (!isNext && !isPrev) return;

      // 先尝试 DOM 检测
      var detected = detectFromDOM();
      if (detected >= 0) {
        state.idx = detected;
        var slides = getAllSlides();
        if (slides.length > 1) state.total = slides.length;
      } else {
        // DOM 检测失败，用计数器
        if (isNext && state.idx < state.total - 1) state.idx++;
        if (isPrev && state.idx > 0) state.idx--;
      }
    }, true); // capture，最早执行
  }

  // ====================================================================
  //  全屏 API
  // ====================================================================

  function isFS() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }

  function goFS() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (fn) {
      fn.call(el);
      console.log('[slide-remote] 进入全屏');
    }
  }

  function exitFS() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (fn) {
      fn.call(document);
      console.log('[slide-remote] 退出全屏');
    }
  }

  // ====================================================================
  //  核心逻辑：全屏拦截
  // ====================================================================

  function initFullscreenGuard() {
    document.addEventListener('keydown', function(e) {
      var isNext = NEXT_KEYS.indexOf(e.key) >= 0;
      var isPrev = PREV_KEYS.indexOf(e.key) >= 0;
      if (!isNext && !isPrev) return;

      // 如果用户在输入框里，放行
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

      // 使用最新的 state.idx（可能来自 DOM 检测、事件捕获、或键盘计数）
      var idx = state.idx;
      var total = state.total;

      // 首页 + 上一页 → 进入全屏
      if (isPrev && idx <= 0 && !isFS()) {
        goFS();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 尾页 + 下一页 → 退出全屏
      if (isNext && idx >= total - 1 && isFS()) {
        exitFS();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }, true); // capture，最优先
  }

  // ====================================================================
  //  初始化
  // ====================================================================

  function init() {
    if (state.inited) return;
    state.inited = true;

    // 初始检测一次
    var detected = detectFromDOM();
    if (detected >= 0) state.idx = detected;
    var slides = getAllSlides();
    if (slides.length > 1) state.total = slides.length;

    // 启动所有追踪层
    initEventCapture();
    initMutationObserver();
    initKeyboardFallback();
    initFullscreenGuard();

    console.log('[slide-remote] v2 通用架构已启用 | 检测方法: ' + (state.method || '键盘计数器') +
      ' | 总页数: ' + state.total + ' | 首页上一页=全屏 | 尾页下一页=退出全屏');
  }

  // 等 DOM ready 后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
