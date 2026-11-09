(function () {
  'use strict';

  // X-letter cache and stationery checks use Object.hasOwn, which is absent
  // in some WebViews even after Array.at has been repaired. Keep native code.
  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      configurable: true,
      writable: true,
      value: function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
      }
    });
  }

  // Some Android WebViews support the app syntax but not Array.at. Install
  // the missing method before any controller/view reads its last page or block.
  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true,
      writable: true,
      value: function at(index) {
        if (this == null) throw new TypeError('Array.at requires a receiver');
        var target = Object(this);
        var length = Math.min(Math.max(Math.floor(+target.length || 0), 0), 9007199254740991);
        var relative = +index || 0;
        relative = relative < 0 ? Math.ceil(relative) : Math.floor(relative);
        var position = relative >= 0 ? relative : length + relative;
        if (position < 0 || position >= length) return undefined;
        return target[position];
      }
    });
  }

  var elementProto = window.Element && window.Element.prototype;
  if (elementProto && !elementProto.matches) {
    elementProto.matches = elementProto.msMatchesSelector || elementProto.webkitMatchesSelector;
  }
  if (elementProto && !elementProto.closest) {
    elementProto.closest = function (selector) {
      var node = this;
      while (node && node.nodeType === 1) {
        if (node.matches && node.matches(selector)) return node;
        node = node.parentElement;
      }
      return null;
    };
  }
  if (window.NodeList && !window.NodeList.prototype.forEach) {
    window.NodeList.prototype.forEach = Array.prototype.forEach;
  }
  // Older Android WebViews may parse the main application successfully but
  // still miss the DOM convenience methods used while building X World.
  // Only fill methods that are absent so modern browsers keep their native path.
  if (elementProto && !elementProto.remove) {
    elementProto.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
  }
  if (elementProto && !elementProto.replaceWith) {
    elementProto.replaceWith = function (replacement) {
      if (!this.parentNode) return;
      var node = replacement && replacement.nodeType
        ? replacement
        : document.createTextNode(String(replacement));
      this.parentNode.replaceChild(node, this);
    };
  }
  if (elementProto && !elementProto.append) {
    elementProto.append = function () {
      for (var index = 0; index < arguments.length; index += 1) {
        var value = arguments[index];
        this.appendChild(value && value.nodeType ? value : document.createTextNode(String(value)));
      }
    };
  }
  if (elementProto && !elementProto.prepend) {
    elementProto.prepend = function () {
      var reference = this.firstChild;
      for (var index = 0; index < arguments.length; index += 1) {
        var value = arguments[index];
        var node = value && value.nodeType ? value : document.createTextNode(String(value));
        this.insertBefore(node, reference);
      }
    };
  }
  if (elementProto && !elementProto.replaceChildren) {
    elementProto.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (var index = 0; index < arguments.length; index += 1) {
        var value = arguments[index];
        this.appendChild(value && value.nodeType ? value : document.createTextNode(String(value)));
      }
    };
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function (callback) {
      return window.setTimeout(function () { callback(Date.now()); }, 16);
    };
  }
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = window.clearTimeout;

  function closestByAttribute(target, attribute, value) {
    var node = target && target.nodeType === 1 ? target : target && target.parentElement;
    while (node && node !== document.documentElement) {
      if (node.hasAttribute && node.hasAttribute(attribute)) {
        if (typeof value === 'undefined' || node.getAttribute(attribute) === value) return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  document.addEventListener('click', function (event) {
    var disclaimer = closestByAttribute(event.target, 'data-x-disclaimer-open');
    if (disclaimer && typeof window.SHEXOpenXDisclaimer === 'function') {
      event.preventDefault();
      event.stopPropagation();
      window.SHEXOpenXDisclaimer();
      return;
    }
    var node = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
    while (node && node !== document.documentElement) {
      if (node.id === 'ixClearChat' && typeof window.SHEXOpenChatSettings === 'function') {
        event.preventDefault();
        event.stopPropagation();
        window.SHEXOpenChatSettings();
        return;
      }
      node = node.parentElement;
    }
  }, true);

  var modernSyntax = true;
  try {
    modernSyntax = new Function('var value={x:1}; return value?.x ?? 0;')() === 1;
  } catch (_) {
    modernSyntax = false;
  }
  window.SHEXLegacyCompat = { modernSyntax: modernSyntax };
  if (modernSyntax) return;

  function showUnsupportedWebViewNotice() {
    if (document.getElementById('shexLegacyWebViewNotice')) return;
    var notice = document.createElement('div');
    notice.id = 'shexLegacyWebViewNotice';
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:block;box-sizing:border-box;overflow:auto;padding:48px 24px;color:#2f2940;background:#fff9ef;font:16px/1.8 sans-serif;text-align:center;';
    notice.innerHTML = '<div style="max-width:520px;margin:0 auto;padding:28px 22px;border-radius:18px;background:#fff;box-shadow:0 18px 60px rgba(70,52,90,.18)"><h1 style="margin:0 0 14px;font-size:24px">需要更新安卓网页组件</h1><p style="margin:0 0 12px">当前手机的 Android System WebView 或 Chrome 版本过旧，无法安全运行 SHE.X。</p><p style="margin:0">请在应用商店更新“Android System WebView”和 Chrome 后，完全退出 APP 再重新打开。Android 5.0 及更早系统不在当前安装包支持范围内。</p></div>';
    document.body.appendChild(notice);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showUnsupportedWebViewNotice);
  else showUnsupportedWebViewNotice();
})();
