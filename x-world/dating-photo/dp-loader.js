(function (window) {
  "use strict";

  var D = window.SHEXDatingPhoto = window.SHEXDatingPhoto || {};
  var assetPromises = Object.create(null);
  var profilePromises = Object.create(null);
  var profileReady = Object.create(null);
  var manifestPromise = null;
  var threePromise = null;
  var unsupportedMessage = "当前设备暂不支持 3D 拍照";
  var loaderUrl = window.document && window.document.currentScript && window.document.currentScript.src;
  var openTicket = 0;

  var bookScripts = [
    "./dp-contract.js",
    "./dp-presets.js",
    "./dp-memento-templates.js",
    "./dp-memento-render.js",
    "./dp-memento-view.js",
    "./dp-service.js",
    "./dp-viewer.js",
    "./dp-book.js"
  ];
  var bookStyles = ["./dp-memento-view.css", "./dp-viewer.css", "./dp-book.css"];
  var stageBaseScripts = ["./dp-contract.js", "./dp-presets.js", "./dp-choice-options.js"];
  // Figure construction reads the accessory builder, so load it before stageCoreScripts in studio/auto.
  var posePropScripts = ["./dp-pose-library.js", "./dp-props.js", "./dp-accessories.js"];
  var stageCoreScripts = ["./dp-rules.js", "./dp-atmosphere.js", "./dp-booth-lens.js", "./dp-camera-control.js", "./dp-device-frame.js", "./dp-figure.js", "./dp-bed.js", "./dp-pose-safety.js", "./dp-pose-library-extra.js", "./dp-stage.js"];
  var studioScripts = ["./dp-frame-render.js", "./dp-doodle.js", "./dp-gesture.js", "./dp-expression-preview.js", "./dp-studio.js"];
  var studioStyles = ["./dp-studio.css", "./dp-doodle.css"];


  function getDocument(options) {
    return options && options.document || window.document;
  }

  function checkWebGL(options) {
    var doc = getDocument(options);
    if (!doc || typeof doc.createElement !== "function") return false;
    try {
      var canvas = doc.createElement("canvas");
      if (!canvas || !canvas.getContext) return false;
      var context = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!context) return false;
      try {
        var extension = context.getExtension && context.getExtension("WEBGL_lose_context");
        if (extension && typeof extension.loseContext === "function") extension.loseContext();
      } catch (releaseError) { /* Releasing a probe must not affect feature detection. */ }
      return true;
    } catch (error) {
      return false;
    }
  }

  function assetUrl(relativePath, sourceUrl) {
    var resolved = new URL(relativePath, sourceUrl);
    var params = new URL(sourceUrl).searchParams;
    params.forEach(function (value, key) {
      if (!resolved.searchParams.has(key)) resolved.searchParams.append(key, value);
    });
    resolved.hash = "";
    return resolved.href;
  }

  function rememberPromise(cache, key, factory) {
    if (cache[key]) return cache[key];
    var pending;
    try {
      pending = factory();
    } catch (error) {
      pending = Promise.reject(error);
    }
    var promise = Promise.resolve(pending).catch(function (error) {
      if (cache[key] === promise) delete cache[key];
      throw error;
    });
    cache[key] = promise;
    return promise;
  }
  function loadAsset(doc, url, kind) {
    if (assetPromises[url]) return assetPromises[url];
    var promise = new Promise(function (resolve, reject) {
      var node = doc.createElement(kind === "css" ? "link" : "script");
      if (kind === "css") {
        node.rel = "stylesheet";
        node.href = url;
      } else {
        node.src = url;
        node.async = false;
      }
      node.onload = function () {
        node.onload = null;
        node.onerror = null;
        resolve();
      };
      node.onerror = function () {
        node.onload = null;
        node.onerror = null;
        if (node.parentNode && typeof node.parentNode.removeChild === "function") node.parentNode.removeChild(node);
        reject(Object.assign(new Error("无法加载拍照组件资源：" + new URL(url).pathname.split("/").pop()), {code:"RESOURCE_LOAD_FAILED"}));
      };
      (doc.head || doc.body || doc.documentElement).appendChild(node);
    });
    assetPromises[url] = promise.catch(function (error) {
      delete assetPromises[url];
      throw error;
    });
    return assetPromises[url];
  }

  function loadAssets(options, scripts, styles) {
    if (!loaderUrl) return Promise.reject(new Error("无法确定拍照组件的部署路径。"));
    var doc = getDocument(options);
    var chain = Promise.resolve();
    scripts.forEach(function (relativePath) {
      chain = chain.then(function () { return loadAsset(doc, assetUrl(relativePath, loaderUrl), "js"); });
    });
    (styles || []).forEach(function (relativePath) {
      chain = chain.then(function () { return loadAsset(doc, assetUrl(relativePath, loaderUrl), "css"); });
    });
    return chain;
  }

  function checkThreeVersion() {
    if (!window.THREE || String(window.THREE.REVISION) !== "149") {
      return Promise.reject(new Error("3D 拍照需要 Three.js r149，请检查页面中已加载的 Three.js 版本。"));
    }
    return Promise.resolve();
  }

  function unsupported(options) {
    var error = new Error(unsupportedMessage);
    if (typeof options.onUnsupported === "function") {
      try { options.onUnsupported(error); } catch (callbackError) { /* Preserve the loader error. */ }
    }
    return Promise.reject(error);
  }

  function loadBackgroundManifest(options) {
    if (D.BG_MANIFEST) {
      D.backgroundManifestError = null;
      return Promise.resolve();
    }
    if (manifestPromise) return manifestPromise;
    if (!loaderUrl) {
      D.backgroundManifestError = new Error("无法确定背景清单的部署路径。");
      return Promise.resolve();
    }
    var manifestUrl;
    var attempt;
    try {
      var doc = getDocument(options);
      manifestUrl = assetUrl("./dp-bg-manifest.js", loaderUrl);
      attempt = loadAsset(doc, manifestUrl, "js").then(function () {
        if (!D.BG_MANIFEST) {
          delete assetPromises[manifestUrl];
          throw new Error("背景清单未注册：dp-bg-manifest.js");
        }
        D.backgroundManifestError = null;
      });
    } catch (error) {
      attempt = Promise.reject(error);
    }
    manifestPromise = attempt.catch(function (error) {
      D.backgroundManifestError = error;
    }).then(function () {
      manifestPromise = null;
    });
    return manifestPromise;
  }

  function retryBackgroundManifest(options, profile) {
    if (profileReady[profile] && !D.BG_MANIFEST && D.backgroundManifestError) {
      return loadBackgroundManifest(options);
    }
    return Promise.resolve();
  }

  function loadThree(options) {
    if (threePromise) return threePromise;
    var promise;
    try {
      var doc = getDocument(options);
      if (!checkWebGL({ document: doc })) {
        promise = unsupported(options);
      } else if (window.THREE) {
        promise = checkThreeVersion();
      } else if (!loaderUrl) {
        promise = Promise.reject(new Error("无法确定 3D 拍照组件的部署路径。"));
      } else {
        promise = loadAsset(doc, assetUrl("../../vendor/three/three-r149.min.js", loaderUrl), "js").then(checkThreeVersion);
      }
    } catch (error) {
      promise = Promise.reject(error);
    }
    threePromise = Promise.resolve(promise).catch(function (error) {
      threePromise = null;
      throw error;
    });
    return threePromise;
  }

  function loadStageCore(options) {
    return rememberPromise(profilePromises, "stageCore", function () {
      return loadAssets(options, stageCoreScripts).then(function () { D.installPoseExtra(); });
    });
  }

  function loadLegacyStage(options) {
    return loadThree(options)
      .then(function () { return loadAssets(options, stageBaseScripts); })
      .then(function () { return loadAssets(options, posePropScripts); })
      .then(function () { return loadBackgroundManifest(options); })
      .then(function () { return loadStageCore(options); })
      .then(function () { profileReady.legacy = true; return D; });
  }

  function load(options) {
    options = options || {};
    var profile = options.profile;
    if (!profile) {
      if (profileReady.legacy && !D.BG_MANIFEST && D.backgroundManifestError) return loadBackgroundManifest(options).then(function () { return D; });
      return rememberPromise(profilePromises, "legacy", function () { return loadLegacyStage(options); });
    }
    if (profile !== "book" && profile !== "studio") {
      return Promise.reject(new Error("不支持的拍照加载 profile：" + profile));
    }
    if (profile === "studio" && profileReady.studio && !D.BG_MANIFEST && D.backgroundManifestError) {
      return loadBackgroundManifest(options).then(function () { return D; });
    }

    return rememberPromise(profilePromises, profile, function () {
      if (profile === "book") {
        return loadAssets(options, bookScripts, bookStyles).then(function () { profileReady.book = true; return D; });
      }
      return load(Object.assign({}, options, { profile: "book" }))
        .then(function () { return loadThree(options); })
        .then(function () { return loadAssets(options, stageBaseScripts); })
        .then(function () { return loadAssets(options, posePropScripts); })
        .then(function () { return loadBackgroundManifest(options); })
        .then(function () { return loadStageCore(options); })
        .then(function () { return loadAssets(options, studioScripts, studioStyles); })
        .then(function () { profileReady.studio = true; return D; });
    });
  }
  function open(options) {
    options = options || {};
    var mode = options.mode == null ? "studio" : options.mode;
    if (mode !== "book" && mode !== "studio" && mode !== "auto") {
      return Promise.reject(new Error("不支持的拍照模式：" + mode));
    }
    var ticket = ++openTicket;
    var profile = mode === "book" ? "book" : "studio";
    var manifestRetry = profile === "studio" ? retryBackgroundManifest(options, profile) : Promise.resolve();
    return load(Object.assign({}, options, { profile: profile })).then(function () { return manifestRetry; }).then(function () {
      if (ticket !== openTicket) return D;
      var route = mode === "book" ? D.book : D.studio;
      var method = mode === "book" ? "mount" : "open";
      if (!route || typeof route[method] !== "function") {
        throw new Error("拍照页面尚未就绪：" + (mode === "book" ? "dp-book" : "dp-studio"));
      }
      return route[method](options);
    });
  }
  // Product-only Canvas renderer: no Three/WebGL dependency and shared by concurrent opens.
  D.loadProductAssets = function (options) {
    var scripts=[];
    if (!D.presets || !D.presets.DEFAULT_APPEARANCE) {
      if (!window.SHEXDatingPhotoContract) scripts.push("./dp-contract.js");
      scripts.push("./dp-presets.js");
    }
    if (!window.SHEXDatingMediaSummary || typeof window.SHEXDatingMediaSummary.builtinLengthCm!=='function') scripts.push("./dp-media-summary.js");
    scripts.push("./dp-handfoot-render.js");
    return loadAssets(options || {}, scripts).then(function () {
      if (typeof D.renderHandFoot !== "function") {
        delete assetPromises[assetUrl("./dp-handfoot-render.js", loaderUrl)];
        throw new Error("手脚印渲染模块尚未就绪，请重试。");
      }
      return D;
    });
  };
  D.checkWebGL = checkWebGL;
  D.load = load;
  D.open = open;
})(window);





