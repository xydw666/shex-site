// X小宠叫声：所有宠物吃饭共用小狗 E2；文件音效播放约 1 秒，小狗其他合成声音保持原样。
// 统一入口 play(species, kind)，静音、防连点和素材播放器共用，不增加互动调用路线。
// 静音：localStorage 'shex_pet_sound_muted' = '1'（只存本机）。
(function (root) {
  'use strict';
  let ctx = null;
  const muted = () => { try { return root.localStorage?.getItem('shex_pet_sound_muted') === '1'; } catch (_) { return false; } };
  const audioBase = new URL('./assets/audio/', root.document?.currentScript?.src || new URL('./x-world/pet/pet-sound.js', root.document?.baseURI || 'http://localhost/'));
  let mediaClip = null, mediaTimer = null, mediaPlayId = 0;
  function stopClip() {
    mediaPlayId++;
    if (mediaTimer !== null) root.clearTimeout(mediaTimer);
    mediaTimer = null;
    mediaClip?.pause();
  }
  function playClip(file) {
    if (!root.Audio) return false;
    stopClip();
    const url = new URL(file, audioBase).href;
    mediaClip ||= new root.Audio(url);
    if (mediaClip.src !== url) mediaClip.src = url;
    mediaClip.preload = 'none';
    mediaClip.currentTime = 0;
    const playId = mediaPlayId;
    mediaClip.onplaying = () => {
      if (playId !== mediaPlayId) return;
      if (muted()) { stopClip(); return; }
      if (mediaTimer !== null) root.clearTimeout(mediaTimer);
      // 沿用小狗 E2：从实际开始播放起计时，最长 1 秒；不足 1 秒的素材自然结束。
      mediaTimer = root.setTimeout(stopClip, 1000);
    };
    try {
      mediaClip.play()?.catch(() => { if (playId === mediaPlayId) stopClip(); });
      return true;
    } catch (_) { stopClip(); return false; }
  }
  function audio() {
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ctx ||= new AC(); if (ctx.state === 'suspended') ctx.resume?.();
    return ctx;
  }
  // 一声“汪”：方波 + 三角波，音高快速下滑，带一点鼻音（带通滤波）。
  function bark(a, t, { from = 820, to = 430, len = 0.13, vol = 0.18 } = {}) {
    const out = a.createGain(), bp = a.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(1300, t); bp.Q.value = 1.1;
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vol, t + 0.012); out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    for (const [type, mul] of [['square', 1], ['triangle', 0.5]]) {
      const o = a.createOscillator(), g = a.createGain(); o.type = type; g.gain.value = mul;
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + len);
      o.connect(g).connect(bp); o.start(t); o.stop(t + len + 0.02);
    }
    bp.connect(out).connect(a.destination);
  }
  // 一下“吧唧”：短促的滤波噪声。
  function chomp(a, t, vol = 0.22) {
    const n = Math.floor(a.sampleRate * 0.07), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination); s.start(t);
  }
  function pant(a, t) { for (let i = 0; i < 3; i++) { const s = t + i * 0.16; chomp(a, s, 0.06); } }
  function whine(a, t) {
    const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(980, t + 0.25); o.frequency.linearRampToValueAtTime(560, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.7);
  }
  const FEED_FILE = 'dog-feed-e2.mp3';
  const SOUNDS = {
    dog: {
      pet: (a, t) => { bark(a, t, { from: 1100, to: 700, len: 0.09, vol: 0.15 }); bark(a, t + 0.14, { from: 1150, to: 720, len: 0.09, vol: 0.15 }); bark(a, t + 0.28, { from: 1250, to: 760, len: 0.11, vol: 0.16 }); },
      feed: () => playClip(FEED_FILE),
      play: (a, t) => { bark(a, t, { from: 950, to: 480, len: 0.14 }); bark(a, t + 0.22, { from: 1000, to: 500, len: 0.14 }); pant(a, t + 0.5); },
      sleep: (a, t) => whine(a, t),
      wake: (a, t) => bark(a, t, { from: 900, to: 520, len: 0.12, vol: 0.14 })
    }
  };
  // 用户选定的试听编号。摸摸/叫醒复用选定叫声；乌鸦 P1 用于叫声，P2 用于玩耍。
  const SELECTED = {
    cat: { call: 'cat-play-p2.mp3', play: 'cat-play-p2.mp3' },
    rabbit: { call: 'rabbit-play-p2.mp3', play: 'rabbit-play-p2.mp3' },
    capybara: { call: 'capybara-call-p1.mp3', play: 'capybara-call-p1.mp3' },
    hamster: { call: 'hamster-play-p1.mp3', play: 'hamster-play-p1.mp3' },
    crow: { call: 'crow-call-p1.mp3', play: 'crow-play-p2.mp3' }
  };
  for (const [species, selected] of Object.entries(SELECTED)) {
    SOUNDS[species] = {
      pet: () => playClip(selected.call),
      play: () => playClip(selected.play),
      feed: () => playClip(FEED_FILE),
      sleep: () => playClip('shared-sleep-s1.mp3'),
      wake: () => playClip(selected.call)
    };
  }
  let last = 0;
  function play(species, kind) {
    const fn = SOUNDS[species]?.[kind]; if (!fn || muted()) return false;
    const a = audio(); if (!a) return false;
    const now = a.currentTime; if (now - last < 0.25) return false; // 连点时不叠在一起
    last = now; try { return fn(a, now + 0.02) !== false; } catch (_) { return false; }
  }
  root.SHEXPetSound = Object.freeze({ play, setMuted: on => { try { root.localStorage?.setItem('shex_pet_sound_muted', on ? '1' : '0'); } catch (_) {} if (on) stopClip(); }, muted });
}(typeof window !== 'undefined' ? window : globalThis));
