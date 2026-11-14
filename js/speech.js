/* ============================================================
   speech.js —— 浏览器语音朗读
   使用原生 Web Speech API（speechSynthesis），不依赖任何外部接口
   ============================================================ */

(function () {
  'use strict';

  var synth = window.speechSynthesis;
  var supported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';
  var voiceCache = [];

  function loadVoices() {
    if (!supported) return;
    voiceCache = synth.getVoices() || [];
  }

  if (supported) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = loadVoices;
    }
  }

  /* 挑选最合适的声音：优先同语言，其次任意可用声音 */
  function pickVoice(lang) {
    if (!voiceCache.length) loadVoices();
    var prefix = lang.split('-')[0];
    var exact = voiceCache.filter(function (v) { return v.lang === lang; });
    if (exact.length) return exact[0];
    var loose = voiceCache.filter(function (v) { return v.lang && v.lang.indexOf(prefix) === 0; });
    return loose.length ? loose[0] : null;
  }

  /**
   * 朗读一段文本
   * @param {string} text
   * @param {'en'|'zh'} langKey
   * @param {number} rate 语速，默认 0.92
   */
  function speak(text, langKey, rate) {
    if (!supported) return false;
    if (!text) return false;

    synth.cancel();

    var lang = langKey === 'zh' ? 'zh-CN' : 'en-US';
    var u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate || 0.92;
    u.pitch = 1;

    var voice = pickVoice(lang);
    if (voice) u.voice = voice;

    synth.speak(u);
    return true;
  }

  function stop() {
    if (supported) synth.cancel();
  }

  window.Speech = {
    supported: supported,
    speak: speak,
    stop: stop
  };
})();
