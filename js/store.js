/* ============================================================
   store.js —— 本地状态层
   负责：记忆盒定义、localStorage 读写、进度与收藏、导入卡片
   ============================================================ */

(function () {
  'use strict';

  var KEYS = {
    progress: 'btl.progress.v1',
    custom: 'btl.custom.v1',
    settings: 'btl.settings.v1'
  };

  var BOXES = [
    { id: 0, name: '新词', en: 'New', desc: '尚未形成记忆' },
    { id: 1, name: '学习中', en: 'Learning', desc: '开始有印象' },
    { id: 2, name: '熟练', en: 'Familiar', desc: '能快速回忆' },
    { id: 3, name: '掌握', en: 'Mastered', desc: '稳定长期记忆' }
  ];

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('读取本地数据失败:', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('写入本地数据失败:', key, e);
      return false;
    }
  }

  function emptyProgress() {
    return { box: 0, seen: 0, right: 0, wrong: 0, last: 0, fav: false };
  }

  var Store = {
    BOXES: BOXES,

    progress: read(KEYS.progress, {}),
    custom: read(KEYS.custom, []),
    settings: read(KEYS.settings, { view: 'study' }),

    /* 取某张卡的进度（没有则返回默认值） */
    get: function (id) {
      var p = this.progress[id];
      if (!p) return emptyProgress();
      return {
        box: typeof p.box === 'number' ? Math.min(3, Math.max(0, p.box)) : 0,
        seen: p.seen || 0,
        right: p.right || 0,
        wrong: p.wrong || 0,
        last: p.last || 0,
        fav: !!p.fav
      };
    },

    /* 局部更新并立即持久化 */
    update: function (id, patch) {
      var p = this.get(id);
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) p[k] = patch[k];
      }
      this.progress[id] = p;
      this.save();
      return p;
    },

    save: function () {
      write(KEYS.progress, this.progress);
    },

    toggleFav: function (id) {
      var p = this.get(id);
      return this.update(id, { fav: !p.fav }).fav;
    },

    /* 记忆盒统计 */
    counts: function (cards) {
      var c = [0, 0, 0, 0], fav = 0, answers = 0;
      cards.forEach(function (card) {
        var p = Store.get(card.id);
        c[p.box]++;
        if (p.fav) fav++;
        answers += p.right + p.wrong;
      });
      return { boxes: c, fav: fav, answers: answers };
    },

    /* 掌握度：熟练 70%、掌握 100%、学习中 30% 加权 */
    mastery: function (cards) {
      if (!cards.length) return 0;
      var sum = 0;
      cards.forEach(function (card) {
        var b = Store.get(card.id).box;
        sum += b === 3 ? 1 : b === 2 ? 0.7 : b === 1 ? 0.3 : 0;
      });
      return Math.round((sum / cards.length) * 100);
    },

    resetProgress: function () {
      this.progress = {};
      this.save();
    },

    addCustom: function (cards) {
      var existing = {};
      this.custom.forEach(function (c) { existing[c.front.toLowerCase()] = true; });
      var added = 0, updated = 0;
      cards.forEach(function (c) {
        var key = c.front.toLowerCase();
        if (existing[key]) {
          for (var i = 0; i < Store.custom.length; i++) {
            if (Store.custom[i].front.toLowerCase() === key) {
              Store.custom[i].back = c.back;
              updated++;
              break;
            }
          }
        } else {
          Store.custom.push(c);
          existing[key] = true;
          added++;
        }
      });
      write(KEYS.custom, this.custom);
      return { added: added, updated: updated };
    },

    clearCustom: function () {
      var ids = this.custom.map(function (c) { return String(c.id); });
      ids.forEach(function (id) { delete Store.progress[id]; });
      this.custom = [];
      write(KEYS.custom, []);
      this.save();
      return ids.length;
    },

    saveSettings: function (patch) {
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) this.settings[k] = patch[k];
      }
      write(KEYS.settings, this.settings);
    }
  };

  window.BOXES = BOXES;
  window.Store = Store;
})();
