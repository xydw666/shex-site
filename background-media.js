(function (global) {
  "use strict";

  const VERSION = 2;
  const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
  const MAX_GIF_BYTES = 10 * 1024 * 1024;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_VIDEO_DURATION = 15;
  const activeVideos = new Set();
  const preparedCandidates = new WeakMap();

  const cleanText = (value) => String(value || "").trim();
  const isCloudFile = (value) => /^cloud:\/\//i.test(cleanText(value));
  const isVideoMime = (value) => /^video\//i.test(cleanText(value));
  const isGifMime = (value) => /^image\/gif$/i.test(cleanText(value));
  const normalizeView = (value) => {
    if (global.SHEXImageCropper?.normalizeView) return global.SHEXImageCropper.normalizeView(value);
    const focalX = Number(value?.focalX);
    const focalY = Number(value?.focalY);
    const zoom = Number(value?.zoom);
    return {
      version: 1,
      mode: "crop-view",
      aspectRatio: cleanText(value?.aspectRatio) || "free",
      focalX: Math.min(1, Math.max(0, Number.isFinite(focalX) ? focalX : .5)),
      focalY: Math.min(1, Math.max(0, Number.isFinite(focalY) ? focalY : .5)),
      zoom: Math.min(4, Math.max(1, Number.isFinite(zoom) ? zoom : 1)),
      rotation: ((Number(value?.rotation) || 0) % 360 + 360) % 360
    };
  };

  function applyView(element, value) {
    if (!element) return;
    const view = normalizeView(value);
    if (global.SHEXImageCropper?.applyView) {
      global.SHEXImageCropper.applyView(element, view);
      return;
    }
    element.style.objectPosition = `${view.focalX * 100}% ${view.focalY * 100}%`;
    element.style.transform = `scale(${view.zoom}) rotate(${view.rotation}deg)`;
    element.style.transformOrigin = `${view.focalX * 100}% ${view.focalY * 100}%`;
  }

  function normalize(value) {
    if (!value) return null;
    if (typeof value === "string") {
      const source = cleanText(value);
      if (!source) return null;
      return {
        version: VERSION,
        mediaType: "image",
        fileID: isCloudFile(source) ? source : "",
        posterFileID: "",
        url: isCloudFile(source) ? "" : source,
        mimeType: "",
        fileName: "",
        width: 0,
        height: 0,
        duration: 0,
        size: 0,
        createdAt: 0,
        view: normalizeView(null)
      };
    }
    if (typeof value !== "object" || Array.isArray(value)) return null;
    const fileID = cleanText(value.fileID || value.fileId || value.cloudFileID || value.cloudFileId);
    const url = cleanText(value.url || value.src || value.localUrl);
    const mimeType = cleanText(value.mimeType || value.type);
    const mediaType = cleanText(value.mediaType).toLowerCase() === "video" || isVideoMime(mimeType)
      ? "video"
      : "image";
    if (!fileID && !url) return null;
    return {
      version: VERSION,
      mediaType,
      fileID,
      posterFileID: cleanText(value.posterFileID || value.posterFileId),
      url,
      posterUrl: cleanText(value.posterUrl),
      mimeType,
      fileName: cleanText(value.fileName || value.name),
      width: Math.max(0, Number(value.width || 0) || 0),
      height: Math.max(0, Number(value.height || 0) || 0),
      duration: Math.max(0, Number(value.duration || 0) || 0),
      size: Math.max(0, Number(value.size || 0) || 0),
      createdAt: Math.max(0, Number(value.createdAt || 0) || 0),
      view: normalizeView(value.view || value.cropView || value.imageView)
    };
  }

  function identity(value) {
    const media = normalize(value);
    if (!media) return "";
    const view = media.view || normalizeView(null);
    return [media.mediaType, media.fileID || media.url, media.posterFileID || media.posterUrl,
      view.aspectRatio, view.focalX, view.focalY, view.zoom, view.rotation].join(":");
  }

  function fileIDs(value) {
    const media = normalize(value);
    if (!media) return [];
    return [media.fileID, media.posterFileID].filter(isCloudFile);
  }

  function inspectVideo(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      const finish = (result, error) => {
        URL.revokeObjectURL(url);
        video.removeAttribute("src");
        video.load();
        if (error) reject(error);
        else resolve(result);
      };
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => finish({
        duration: Number(video.duration || 0),
        width: Number(video.videoWidth || 0),
        height: Number(video.videoHeight || 0)
      });
      video.onerror = () => finish(null, new Error("无法读取这个视频，请确认它是可播放的 MP4 文件"));
      video.src = url;
    });
  }

  async function validate(file) {
    if (!file) throw new Error("请选择背景文件");
    const type = cleanText(file.type).toLowerCase();
    const name = cleanText(file.name).toLowerCase();
    const looksMp4 = type === "video/mp4" || (!type && /\.mp4$/i.test(name));
    if (isVideoMime(type) || /\.(mp4|mov|webm|m4v)$/i.test(name)) {
      if (!looksMp4) throw new Error("第一版动态背景只支持 MP4（H.264 优先）");
      if (file.size > MAX_VIDEO_BYTES) throw new Error("视频太大，请选择不超过 10MB 的短视频");
      const meta = await inspectVideo(file);
      if (!Number.isFinite(meta.duration) || meta.duration <= 0) throw new Error("无法读取视频时长，请更换 MP4 文件");
      if (meta.duration > MAX_VIDEO_DURATION + 0.05) throw new Error("视频太长，请选择不超过 15 秒的短视频");
      const longSide = Math.max(meta.width, meta.height);
      const shortSide = Math.min(meta.width, meta.height);
      if (longSide > 1920 || shortSide > 1080) throw new Error("视频分辨率过高，请使用最高 1080p 的视频");
      return { mediaType: "video", mimeType: "video/mp4", ...meta };
    }
    if (!/^image\//i.test(type) && !/\.(png|jpe?g|webp|gif|avif)$/i.test(name)) {
      throw new Error("请选择图片、GIF 或 MP4 文件");
    }
    const gif = isGifMime(type) || /\.gif$/i.test(name);
    const maxBytes = gif ? MAX_GIF_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) throw new Error(`${gif ? "GIF" : "图片"}太大，请选择不超过 10MB 的文件`);
    return { mediaType: "image", mimeType: type || (gif ? "image/gif" : "image/jpeg"), duration: 0, width: 0, height: 0 };
  }

  function createPoster(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      let settled = false;
      const finish = (poster) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        video.removeAttribute("src");
        video.load();
        resolve(poster || null);
      };
      const capture = () => {
        try {
          const sourceWidth = video.videoWidth || 1;
          const sourceHeight = video.videoHeight || 1;
          const scale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(sourceWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) return finish(null);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return finish(null);
            const base = cleanText(file.name || "background").replace(/\.[^.]+$/, "") || "background";
            finish(new File([blob], `${base}-poster.jpg`, { type: "image/jpeg" }));
          }, "image/jpeg", 0.82);
        } catch (_) {
          finish(null);
        }
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.onloadeddata = () => {
        if (Number(video.duration || 0) > 0.1) {
          video.currentTime = Math.min(0.1, video.duration / 2);
        } else capture();
      };
      video.onseeked = capture;
      video.onerror = () => finish(null);
      global.setTimeout(() => finish(null), 8000);
      video.src = url;
      video.load();
    });
  }

  async function upload(file, kind, storage) {
    if (!storage?.uploadFile) throw new Error("云端上传服务暂时不可用");
    const details = await validate(file);
    const animated = kind === "chat-backgrounds" && details.mediaType === "image"
      ? await global.SHEXImageCropper?.isAnimated?.(file) === true
      : false;
    const runtime = kind === "chat-backgrounds" && details.mediaType === "image" && !animated
      ? await global.SHEXImageCropper?.runtimeBackgroundFile?.(file, { width:720, height:1280 })
      : null;
    if (kind === "chat-backgrounds" && details.mediaType === "image" && !animated && !runtime) {
      throw new Error("背景运行图无法生成，请重试");
    }
    const uploadFile = runtime?.file || file;
    const asset = await storage.uploadFile(uploadFile, kind, { allowLocalFallback: false, resolveTempUrl: false, verifyRemote:true });
    if (!isCloudFile(asset?.fileID)) throw new Error("文件没有成功上传到云端，请检查网络后重试");
    let posterAsset = null;
    if (details.mediaType === "video") {
      const poster = await createPoster(file);
      if (poster) {
        try {
          posterAsset = await storage.uploadFile(poster, `${kind}-posters`, { allowLocalFallback: false, resolveTempUrl: false, verifyRemote:true });
          if (!isCloudFile(posterAsset?.fileID)) posterAsset = null;
        } catch (error) {
          const cleanupType = kind === "chat-backgrounds"
            ? "chat_background_poster"
            : (kind === "companion-backgrounds" ? "companion_background_poster" : "");
          if (cleanupType && error?.uploadedFileID) {
            try { await global.SHEXUserData?.registerPendingFileCleanup?.(error.uploadedFileID, cleanupType); } catch (_) { /* best effort */ }
          }
          // The video remains usable with the page's default background as its loading fallback.
          posterAsset = null;
        }
      }
    }
    return {
      version: VERSION,
      mediaType: details.mediaType,
      fileID: cleanText(asset.fileID),
      posterFileID: cleanText(posterAsset?.fileID),
      mimeType: runtime ? cleanText(uploadFile.type) : details.mimeType || cleanText(file.type),
      fileName: cleanText(uploadFile.name),
      width: runtime?.width || details.width || 0,
      height: runtime?.height || details.height || 0,
      duration: details.duration || 0,
      size: Number(uploadFile.size || 0),
      createdAt: Date.now(),
      view: normalizeView(runtime?.view || global.SHEXImageCropper?.viewFor?.(file) || null)
    };
  }

  function isHostPageActive(video) {
    if (video?.closest?.("#ixChat")) return document.body?.dataset?.xPage === "message";
    if (video?.closest?.("#xCompanionStage")) return document.body?.dataset?.xPage === "companion";
    return true;
  }

  function safePlay(video) {
    if (!video || document.visibilityState === "hidden" || video.dataset.backgroundActive !== "true" || !isHostPageActive(video)) return;
    const result = video.play();
    if (result?.catch) result.catch(() => {});
  }

  function candidateResult(success, reason, details = {}) {
    return {
      success: success === true,
      failure: success !== true,
      reason: cleanText(reason) || (success === true ? "READY" : "CANDIDATE_FAILED"),
      ...details
    };
  }

  function evaluateCandidateGuard(check) {
    if (typeof check !== "function") return { current: true, error: null };
    try {
      return { current: check() === true, error: null };
    } catch (error) {
      return { current: false, error };
    }
  }

  function createImageCandidateLayer(media, source) {
    const layer = document.createElement("div");
    layer.className = "shex-background-media-layer shex-background-media-image";
    layer.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    applyView(image, media.view);
    layer.appendChild(image);
    return { layer, image, source };
  }

  async function prepareCandidate(host, mediaValue, imageUrl = "", options = {}) {
    let media;
    try {
      media = normalize(mediaValue);
    } catch (error) {
      return candidateResult(false, "PREPARE_FAILED", { error });
    }
    if (!host) return candidateResult(false, "HOST_UNAVAILABLE");
    if (media?.mediaType !== "image") return candidateResult(false, "INVALID_MEDIA");
    const source = cleanText(imageUrl || media.url);
    if (!source) return candidateResult(false, "SOURCE_UNAVAILABLE");
    const timeoutMs = Math.max(1, Number(options.timeoutMs || 12000) || 12000);
    const contextKey = cleanText(options.contextKey);
    const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : null;
    const phase = (name) => { try { options.onPhase?.(name); } catch (_) {} };
    const initialGuard = evaluateCandidateGuard(isCurrent);
    if (initialGuard.error) return candidateResult(false, "PREPARE_FAILED", { error: initialGuard.error, contextKey });
    if (!initialGuard.current) return candidateResult(false, "STALE_CANDIDATE", { contextKey });
    let activeLayers;
    let candidate;
    try {
      activeLayers = Array.from(host.querySelectorAll(":scope > .shex-background-media-layer"));
      if (activeLayers.length > 1) {
        return candidateResult(false, "MULTIPLE_ACTIVE_LAYERS", { activeLayerCount: activeLayers.length, contextKey });
      }
      candidate = createImageCandidateLayer(media, source);
    } catch (error) {
      return candidateResult(false, "PREPARE_FAILED", { error, contextKey });
    }
    const previousLayer = activeLayers[0] || null;
    return new Promise((resolve) => {
      const { layer, image } = candidate;
      let settled = false;
      let timeoutId = null;
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        if (timeoutId !== null) global.clearTimeout(timeoutId);
        timeoutId = null;
      };
      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (result.success !== true) {
          try { image.removeAttribute("src"); } catch (_) {}
        }
        resolve(result);
      };
      const fail = (reason, error = null) => finish(candidateResult(false, reason, { error, contextKey }));
      image.onerror = (error) => fail("IMAGE_LOAD_FAILED", error);
      image.onload = async () => {
        phase("backgroundFileReady");
        phase("backgroundDecodeStart");
        try {
          if (typeof image.decode === "function") await image.decode();
        } catch (error) {
          phase("backgroundDecodeEnd");
          fail("IMAGE_DECODE_FAILED", error);
          return;
        }
        phase("backgroundDecodeEnd");
        if (settled) return;
        const readyGuard = evaluateCandidateGuard(isCurrent);
        if (readyGuard.error) {
          fail("PREPARE_FAILED", readyGuard.error);
          return;
        }
        if (!readyGuard.current) {
          fail("STALE_CANDIDATE");
          return;
        }
        const candidateIdentity = identity(media);
        const handle = candidateResult(true, "READY", {
          identity: candidateIdentity,
          contextKey
        });
        preparedCandidates.set(handle, { host, candidate: layer, previousLayer, media, source, contextKey, isCurrent, identity: candidateIdentity, ownsSourceObjectUrl:options.ownsSourceObjectUrl===true });
        finish(handle);
      };
      timeoutId = global.setTimeout(() => fail("PREPARE_TIMEOUT"), timeoutMs);
      try {
        image.src = source;
        if (image.complete && Number(image.naturalWidth || 0) > 0) {
          Promise.resolve().then(() => image.onload?.());
        }
      } catch (error) {
        fail("PREPARE_FAILED", error);
      }
    });
  }

  function prepareDecodedCandidate(host, mediaValue, decodedImage, options = {}) {
    let media;
    try {
      media = normalize(mediaValue);
    } catch (error) {
      return candidateResult(false, "PREPARE_FAILED", { error });
    }
    if (!host) return candidateResult(false, "HOST_UNAVAILABLE");
    if (media?.mediaType !== "image") return candidateResult(false, "INVALID_MEDIA");
    const contextKey = cleanText(options.contextKey);
    const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : null;
    const initialGuard = evaluateCandidateGuard(isCurrent);
    if (initialGuard.error) return candidateResult(false, "PREPARE_FAILED", { error: initialGuard.error, contextKey });
    if (!initialGuard.current) return candidateResult(false, "STALE_CANDIDATE", { contextKey });
    const source = cleanText(decodedImage?.currentSrc || decodedImage?.getAttribute?.("src") || decodedImage?.src);
    const width = Math.max(0, Number(decodedImage?.naturalWidth || decodedImage?.width || 0));
    if (!decodedImage || String(decodedImage?.tagName || "").toUpperCase() !== "IMG" || !source || !width || decodedImage.complete === false) {
      return candidateResult(false, "DECODED_IMAGE_UNAVAILABLE", { contextKey });
    }
    if (decodedImage.isConnected) return candidateResult(false, "DECODED_IMAGE_CONNECTED", { contextKey });
    let activeLayers;
    let layer;
    try {
      activeLayers = Array.from(host.querySelectorAll(":scope > .shex-background-media-layer"));
      if (activeLayers.length > 1) {
        return candidateResult(false, "MULTIPLE_ACTIVE_LAYERS", { activeLayerCount: activeLayers.length, contextKey });
      }
      layer = document.createElement("div");
      layer.className = "shex-background-media-layer shex-background-media-image";
      layer.setAttribute("aria-hidden", "true");
      decodedImage.remove?.();
      decodedImage.alt = "";
      decodedImage.decoding = "async";
      applyView(decodedImage, media.view);
      layer.appendChild(decodedImage);
    } catch (error) {
      try { layer?.remove?.(); } catch (_) {}
      return candidateResult(false, "PREPARE_FAILED", { error, contextKey });
    }
    const candidateIdentity = identity(media);
    const handle = candidateResult(true, "READY", { identity: candidateIdentity, contextKey });
    preparedCandidates.set(handle, {
      host,
      candidate: layer,
      previousLayer: activeLayers[0] || null,
      media,
      source,
      contextKey,
      isCurrent,
      identity: candidateIdentity,
      ownsSourceObjectUrl:options.ownsSourceObjectUrl===true
    });
    return handle;
  }

  function prepareReusableDecodedCandidate(host, mediaValue, decodedSource, options = {}) {
    if (!decodedSource || decodedSource.complete === false || !decodedSource.naturalWidth) {
      return candidateResult(false, "DECODED_IMAGE_UNAVAILABLE");
    }
    // prepareDecodedCandidate adopts its input into the live layer. Keep the
    // cached source detached and hand each commit its own browser-decoded clone.
    const candidateImage = decodedSource.cloneNode?.(false);
    if (!candidateImage || candidateImage.complete === false || !candidateImage.naturalWidth) {
      return candidateResult(false, "DECODED_IMAGE_CLONE_NOT_READY");
    }
    return prepareDecodedCandidate(host, mediaValue, candidateImage, options);
  }

  function disposeCandidate(prepared) {
    const record = preparedCandidates.get(prepared);
    if (prepared?.success !== true || !record?.candidate) {
      return candidateResult(false, "CANDIDATE_NOT_READY");
    }
    const candidate = record.candidate;
    if (candidate.parentNode) {
      return candidateResult(false, "CANDIDATE_ALREADY_COMMITTED", {
        identity: record.identity,
        contextKey: record.contextKey
      });
    }
    preparedCandidates.delete(prepared);
    const image = candidate.querySelector?.("img") || null;
    if (image) {
      image.onload = null;
      image.onerror = null;
      try { image.removeAttribute("src"); } catch (_) {}
    }
    if (record.ownsSourceObjectUrl === true && /^blob:/i.test(record.source) && typeof global.URL?.revokeObjectURL === "function") {
      try { global.URL.revokeObjectURL(record.source); } catch (_) {}
    }
    try { candidate.remove(); } catch (_) {}
    return candidateResult(true, "DISPOSED", {
      identity: record.identity,
      contextKey: record.contextKey
    });
  }

  function commitCandidate(host, prepared, options = {}) {
    if (!host) return candidateResult(false, "HOST_UNAVAILABLE");
    const record = preparedCandidates.get(prepared);
    if (prepared?.success !== true || !record?.candidate) return candidateResult(false, "CANDIDATE_NOT_READY");
    if (record.host !== host) return candidateResult(false, "HOST_MISMATCH");
    const contextKey = cleanText(options.contextKey);
    if (record.contextKey !== contextKey) {
      return candidateResult(false, "STALE_CANDIDATE", { contextKey, candidateContextKey: record.contextKey });
    }
    const preparedGuard = evaluateCandidateGuard(record.isCurrent);
    const commitGuard = evaluateCandidateGuard(options.isCurrent);
    if (preparedGuard.error || commitGuard.error) {
      return candidateResult(false, "COMMIT_FAILED", { error: preparedGuard.error || commitGuard.error });
    }
    if (!preparedGuard.current || !commitGuard.current) {
      return candidateResult(false, "STALE_CANDIDATE", { contextKey: record.contextKey });
    }
    let activeLayers;
    try {
      activeLayers = Array.from(host.querySelectorAll(":scope > .shex-background-media-layer"));
    } catch (error) {
      return candidateResult(false, "COMMIT_FAILED", { error });
    }
    if (activeLayers.length > 1) {
      return candidateResult(false, "MULTIPLE_ACTIVE_LAYERS", { activeLayerCount: activeLayers.length });
    }
    const activeLayer = activeLayers[0] || null;
    if (activeLayer !== (record.previousLayer || null)) {
      return candidateResult(false, "ACTIVE_LAYER_CHANGED");
    }
    const candidate = record.candidate;
    if (candidate.parentNode) return candidateResult(false, "CANDIDATE_ALREADY_COMMITTED");
    const previousClasses = {
      video: host.classList.contains("has-background-media-video"),
      image: host.classList.contains("has-background-media-image"),
      poster: host.classList.contains("has-background-media-poster")
    };
    let exchanged = false;
    try {
      if (activeLayer) activeLayer.replaceWith(candidate);
      else host.prepend(candidate);
      exchanged = true;
      host.classList.remove("has-background-media-video", "has-background-media-image", "has-background-media-poster");
      host.classList.add("has-background-media-image");
    } catch (error) {
      if (exchanged && candidate.parentNode === host && activeLayer && !activeLayer.parentNode) {
        try { candidate.replaceWith(activeLayer); } catch (_) {}
      } else if (exchanged && candidate.parentNode === host && !activeLayer) {
        try { candidate.remove(); } catch (_) {}
      }
      host.classList.remove("has-background-media-video", "has-background-media-image", "has-background-media-poster");
      if (previousClasses.video) host.classList.add("has-background-media-video");
      if (previousClasses.image) host.classList.add("has-background-media-image");
      if (previousClasses.poster) host.classList.add("has-background-media-poster");
      return candidateResult(false, "COMMIT_FAILED", { error });
    }
    const retiredVideo = activeLayer?.querySelector?.("video");
    if (retiredVideo) {
      activeVideos.delete(retiredVideo);
      retiredVideo.dataset.backgroundActive = "false";
      try { retiredVideo.pause(); } catch (_) {}
      try { retiredVideo.removeAttribute("src"); } catch (_) {}
      try { retiredVideo.load(); } catch (_) {}
    }
    preparedCandidates.delete(prepared);
    return candidateResult(true, "COMMITTED", { layer: candidate, previousLayer: activeLayer, identity: record.identity, contextKey: record.contextKey });
  }

  function remove(host) {
    if (!host) return;
    host.querySelectorAll(":scope > .shex-background-media-layer").forEach((layer) => {
      const video = layer.querySelector("video");
      if (video) {
        activeVideos.delete(video);
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      layer.remove();
    });
    host.classList.remove("has-background-media-video", "has-background-media-image", "has-background-media-poster");
  }

  function mountImage(host, mediaValue, imageUrl = "") {
    const media = normalize(mediaValue);
    if (!host || media?.mediaType !== "image") {
      remove(host);
      return null;
    }
    const source = cleanText(imageUrl || media.url);
    if (!source) return null;
    remove(host);
    const layer = document.createElement("div");
    layer.className = "shex-background-media-layer shex-background-media-image";
    layer.setAttribute("aria-hidden", "true");
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.src = source;
    applyView(image, media.view);
    layer.appendChild(image);
    host.prepend(layer);
    host.classList.add("has-background-media-image");
    return layer;
  }

  function mountVideo(host, mediaValue, urls = {}, options = {}) {
    const media = normalize(mediaValue);
    if (!host || media?.mediaType !== "video") {
      remove(host);
      return null;
    }
    remove(host);
    const layer = document.createElement("div");
    layer.className = "shex-background-media-layer";
    layer.setAttribute("aria-hidden", "true");
    const posterUrl = cleanText(urls.posterUrl || media.posterUrl);
    if (posterUrl) {
      layer.style.backgroundImage = `url("${posterUrl.replace(/(["\\])/g, "\\$1")}")`;
      host.classList.add("has-background-media-poster");
    }
    const videoUrl = cleanText(urls.videoUrl || media.url);
    if (videoUrl && options.dynamicEnabled !== false) {
      const preparedVideo = options.preparedVideo;
      const video = preparedVideo?.tagName === "VIDEO" ? preparedVideo : document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = preparedVideo ? "auto" : "metadata";
      video.disablePictureInPicture = true;
      video.controls = false;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.dataset.backgroundActive = options.active === false ? "false" : "true";
      applyView(video, media.view);
      video.addEventListener("canplay", () => {
        layer.classList.add("is-video-ready");
        safePlay(video);
      });
      video.addEventListener("error", () => layer.classList.remove("is-video-ready"));
      if (!preparedVideo) video.src = videoUrl;
      layer.appendChild(video);
      activeVideos.add(video);
    }
    host.prepend(layer);
    host.classList.add("has-background-media-video");
    const mountedVideo = layer.querySelector("video");
    if (mountedVideo) {
      if (Number(mountedVideo.readyState || 0) >= 3) layer.classList.add("is-video-ready");
      safePlay(mountedVideo);
    }
    return layer;
  }

  function syncVisibility() {
    activeVideos.forEach((video) => {
      if (!video.isConnected) {
        activeVideos.delete(video);
        return;
      }
      if (document.visibilityState === "hidden" || !isHostPageActive(video)) video.pause();
      else safePlay(video);
    });
  }

  document.addEventListener("visibilitychange", syncVisibility);
  global.addEventListener("pagehide", () => activeVideos.forEach((video) => video.pause()));
  global.addEventListener("pageshow", syncVisibility);
  global.addEventListener("hashchange", () => global.setTimeout(syncVisibility, 0));

  global.SHEXBackgroundMedia = Object.freeze({
    VERSION,
    limits: Object.freeze({ maxVideoBytes: MAX_VIDEO_BYTES, maxVideoDuration: MAX_VIDEO_DURATION }),
    normalize,
    identity,
    fileIDs,
    validate,
    createPoster,
    upload,
    prepareCandidate,
    commitCandidate,
    disposeCandidate,
    mountImage,
    prepareDecodedCandidate,
    prepareReusableDecodedCandidate,
    mountVideo,
    remove,
    syncVisibility
  });
})(window);
