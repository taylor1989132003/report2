/* ============================================================
   app.js —— 应用主逻辑
   视图：学习 / 拼写自测 / 词库 / 数据
   ============================================================ */

(function () {
  'use strict';

  var DATA = window.FLASHCARD_DATA || { categories: [], terms: [] };
  var Store = window.Store;
  var BOXES = window.BOXES;

  /* ---------------- 工具函数 ---------------- */
  function $(id) { return document.getElementById(id); }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 去掉大小写、标点、多余空格，仅用于拼写判定 */
  function normalize(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  var catMap = {};
  DATA.categories.forEach(function (c) { catMap[c.id] = c; });

  function catName(id) {
    return catMap[id] ? catMap[id].name : '其他';
  }

  function boxName(b) {
    return BOXES[b] ? BOXES[b].name : '新词';
  }

  /* ---------------- 卡片模型 ---------------- */
  function cardFromTerm(t) {
    return {
      id: String(t.id),
      front: t.front || '',
      back: t.back || (t.term && t.definition ? t.term + '：' + t.definition : ''),
      term: t.term || '',
      pinyin: t.pinyin || '',
      definition: t.definition || '',
      definitionEn: t.definitionEn || '',
      example: t.example || '',
      exampleEn: t.exampleEn || '',
      category: t.category || '',
      tags: Array.isArray(t.tags) ? t.tags : [],
      custom: false
    };
  }

  function cardFromRow(row) {
    var front = String(row.front || '').trim();
    var back = String(row.back || '').trim();
    return {
      id: 'c_' + hash(front.toLowerCase()),
      front: front,
      back: back,
      term: '',
      pinyin: '',
      definition: back,
      definitionEn: '',
      example: '',
      exampleEn: '',
      category: '',
      tags: [],
      custom: true
    };
  }

  var cards = [];

  function mergeCards() {
    cards = DATA.terms.map(cardFromTerm).concat(Store.custom || []);
    cards.forEach(function (c) { c.id = String(c.id); });
  }

  /* ---------------- 状态 ---------------- */
  var state = {
    view: 'study',
    filters: { scope: 'all', category: 'all', favOnly: false },
    current: null,
    flipped: false,
    recent: [],
    libBox: 'all',
    libCat: 'all',
    search: '',
    detailId: null,
    spell: { card: null, answered: false, right: 0, wrong: 0, streak: 0, recent: [] }
  };

  /* ---------------- 筛选 ---------------- */
  function getPool() {
    var f = state.filters;
    return cards.filter(function (c) {
      var p = Store.get(c.id);
      if (f.scope === 'fav') { if (!p.fav) return false; }
      else if (f.scope !== 'all') { if (p.box !== Number(f.scope)) return false; }

      if (f.category !== 'all' && c.category !== f.category) return false;
      if (f.favOnly && !p.fav) return false;
      return true;
    });
  }

  /* ---------------- 抽卡：低记忆盒优先 + 冷却 ---------------- */
  function pickNext() {
    var pool = getPool();
    if (!pool.length) {
      state.current = null;
      state.flipped = false;
      renderCard();
      return;
    }

    var candidates = pool.filter(function (c) {
      return state.recent.indexOf(c.id) === -1;
    });
    if (!candidates.length) candidates = pool.slice();

    candidates.sort(function (a, b) {
      var pa = Store.get(a.id);
      var pb = Store.get(b.id);
      if (pa.box !== pb.box) return pa.box - pb.box;
      return pa.last - pb.last;
    });

    // 在最低记忆盒的前 5 张里随机，避免顺序死板
    var head = candidates.slice(0, Math.min(5, candidates.length));
    state.current = head[Math.floor(Math.random() * head.length)];
    state.flipped = false;
    renderCard();
  }

  /* ---------------- 渲染：卡片 ---------------- */
  function renderCard() {
    var c = state.current;

    if (!c) {
      $('cardFront').textContent = '当前筛选下没有卡片';
      $('cardTerm').textContent = '';
      $('cardPinyin').textContent = '';
      $('cardDef').textContent = '换一个记忆盒或分类试试，也可以在「数据」页导入 CSV。';
      $('cardExample').textContent = '';
      $('cardTags').innerHTML = '';
      $('boxPill').textContent = '—';
      $('catPill').textContent = '—';
      $('starBtn').classList.remove('on');
      $('starBtn').textContent = '☆';
      setFlip(false);
      updateCounters();
      return;
    }

    var p = Store.get(c.id);

    $('cardFront').textContent = c.front;
    $('cardTerm').textContent = c.term || '（导入卡片）';
    $('cardPinyin').textContent = c.pinyin || '';
    $('cardDef').textContent = c.definition || c.back || '';
    $('cardExample').textContent = c.example || '';
    $('cardTags').innerHTML = (c.tags || []).map(function (t) {
      return '<span>' + escapeHtml(t) + '</span>';
    }).join('');

    var bp = $('boxPill');
    bp.textContent = boxName(p.box);
    bp.setAttribute('data-box', p.box);

    $('catPill').textContent = catName(c.category);

    var star = $('starBtn');
    star.textContent = p.fav ? '★' : '☆';
    star.classList.toggle('on', p.fav);

    setFlip(state.flipped);
    updateCounters();
  }

  function setFlip(flipped) {
    state.flipped = !!flipped;
    $('faceFront').hidden = state.flipped;
    $('faceBack').hidden = !state.flipped;
    $('flipBtn').textContent = state.flipped ? '隐藏答案' : '显示答案';
    if (!$('flipBtn').querySelector('kbd')) {
      var k = document.createElement('kbd');
      k.textContent = '空格';
      $('flipBtn').appendChild(k);
    }
  }

  function updateCounters() {
    var all = cards.length;
    var pool = getPool();
    var c = Store.counts(cards);

    BOXES.forEach(function (b) {
      var el = document.querySelector('[data-count="' + b.id + '"]');
      if (el) el.textContent = c.boxes[b.id];
    });

    document.querySelectorAll('.box').forEach(function (btn) {
      btn.classList.toggle('active', state.filters.scope === btn.getAttribute('data-scope'));
    });

    var scopeText = state.filters.scope === 'all'
      ? '全部卡片'
      : state.filters.scope === 'fav' ? '仅收藏' : boxName(Number(state.filters.scope));

    $('scopeNote').textContent = scopeText;
    $('poolCounter').textContent = '当前范围 ' + pool.length + ' 张 / 共 ' + all + ' 张';
    $('masteryNum').textContent = Store.mastery(cards) + '%';

    $('statTotal').textContent = all;
    $('statBoxes').textContent = c.boxes.join(' / ');
    $('statFav').textContent = c.fav;
    $('statAnswers').textContent = c.answers;
  }

  /* ---------------- 评分 ---------------- */
  function rate(delta) {
    var c = state.current;
    if (!c) return;

    var p = Store.get(c.id);
    var patch = { seen: p.seen + 1, last: Date.now() };

    if (delta > 0) {
      patch.box = Math.min(3, p.box + 1);
      patch.right = p.right + 1;
    } else if (delta === 0) {
      patch.box = p.box;
    } else {
      patch.box = 0;
      patch.wrong = p.wrong + 1;
    }

    Store.update(c.id, patch);

    state.recent.unshift(c.id);
    state.recent = state.recent.slice(0, 3);

    pickNext();
    if (state.view === 'library') renderLibrary();
  }

  /* ---------------- 朗读 ---------------- */
  function speakEn() {
    if (!state.current) return;
    if (!Speech.supported) { toast('当前浏览器不支持语音朗读'); return; }
    Speech.speak(state.current.front, 'en', 0.92);
  }

  function speakZh() {
    if (!state.current) return;
    if (!Speech.supported) { toast('当前浏览器不支持语音朗读'); return; }
    var text = state.current.term || state.current.definition || '';
    Speech.speak(text, 'zh', 0.95);
  }

  /* ---------------- 视图切换 ---------------- */
  function switchView(name) {
    state.view = name;
    Store.saveSettings({ view: name });

    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === name);
    });

    if (location.hash !== '#' + name) {
      history.replaceState(null, '', '#' + name);
    }

    if (name === 'library') renderLibrary();
    if (name === 'spell') nextSpell(true);
    if (name === 'data') updateCounters();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------- 拼写自测 ---------------- */
  function nextSpell(initial) {
    var s = state.spell;
    var pool = cards.slice();

    var candidates = pool.filter(function (c) {
      return s.recent.indexOf(c.id) === -1;
    });
    if (!candidates.length) { candidates = pool; s.recent = []; }

    // 优先未掌握的卡片
    var weak = candidates.filter(function (c) { return Store.get(c.id).box < 3; });
    var source = weak.length ? weak : candidates;

    var card = source[Math.floor(Math.random() * source.length)];
    s.card = card;
    s.answered = false;
    s.recent.unshift(card.id);
    s.recent = s.recent.slice(0, 5);

    var p = Store.get(card.id);
    var bp = $('spellBoxPill');
    bp.textContent = boxName(p.box);
    bp.setAttribute('data-box', p.box);
    $('spellCatPill').textContent = catName(card.category);

    $('spellTerm').textContent = card.term || '（导入卡片）';
    $('spellDef').textContent = card.definition || card.back || '';

    var input = $('spellInput');
    input.value = '';
    input.readOnly = false;
    input.classList.remove('ok', 'bad');
    $('spellFeedback').hidden = true;
    $('spellFeedback').className = 'spell-feedback';
    $('spellNext').hidden = true;
    $('spellSkip').hidden = false;
    if (!initial) input.focus();

    renderSpellStats();
  }

  function renderSpellStats() {
    $('spellRight').textContent = state.spell.right;
    $('spellWrong').textContent = state.spell.wrong;
    $('spellStreak').textContent = state.spell.streak;
  }

  function checkSpell() {
    var s = state.spell;
    if (!s.card || s.answered) return;

    var input = $('spellInput');
    var typed = input.value.trim();
    if (!typed) { toast('先输入答案再检查'); input.focus(); return; }

    var correct = normalize(typed) === normalize(s.card.front);
    var fb = $('spellFeedback');
    var p = Store.get(s.card.id);
    var back = s.card.definition || s.card.back || '';

    s.answered = true;
    input.readOnly = true;
    $('spellSkip').hidden = true;
    $('spellNext').hidden = false;

    if (correct) {
      input.classList.add('ok');
      fb.className = 'spell-feedback ok';
      fb.innerHTML = '拼写正确！' +
        '<span class="answer">' + escapeHtml(s.card.front) + '</span>' +
        '已升入「' + boxName(Math.min(3, p.box + 1)) + '」' +
        (back ? '<br><span style="opacity:.8">' + escapeHtml(back) + '</span>' : '');
      Store.update(s.card.id, {
        box: Math.min(3, p.box + 1),
        seen: p.seen + 1,
        right: p.right + 1,
        last: Date.now()
      });
      s.right++;
      s.streak++;
    } else {
      input.classList.add('bad');
      fb.className = 'spell-feedback bad';
      fb.innerHTML = '拼写有误，正确写法是：' +
        '<span class="answer">' + escapeHtml(s.card.front) + '</span>' +
        '已退回「新词」' +
        (back ? '<br><span style="opacity:.8">' + escapeHtml(back) + '</span>' : '');
      Store.update(s.card.id, {
        box: 0,
        seen: p.seen + 1,
        wrong: p.wrong + 1,
        last: Date.now()
      });
      s.wrong++;
      s.streak = 0;
    }

    fb.hidden = false;
    renderSpellStats();
    updateCounters();
    $('spellNext').focus();
  }

  /* ---------------- 词库 ---------------- */
  var ICON_SPEAK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';

  function renderLibrary() {
    var list = $('libList');
    var keyword = state.search.trim().toLowerCase();

    var rows = cards.filter(function (c) {
      var p = Store.get(c.id);
      if (state.libBox === 'fav') { if (!p.fav) return false; }
      else if (state.libBox !== 'all' && p.box !== Number(state.libBox)) return false;

      if (state.libCat !== 'all' && c.category !== state.libCat) return false;

      if (!keyword) return true;

      var hay = [
        c.front, c.term, c.definition, c.definitionEn, c.back,
        c.pinyin, (c.tags || []).join(' ')
      ].join(' ').toLowerCase();

      return hay.indexOf(keyword) !== -1;
    });

    $('libCount').textContent = '共 ' + rows.length + ' 张卡片';

    if (!rows.length) {
      list.innerHTML = '<div class="empty">没有匹配的卡片，换个关键词试试。</div>';
      return;
    }

    list.innerHTML = rows.map(function (c) {
      var p = Store.get(c.id);
      var zh = c.term || (c.definition || c.back || '');
      if (zh.length > 46) zh = zh.slice(0, 46) + '…';
      return '' +
        '<div class="lib-item" data-id="' + escapeHtml(c.id) + '" role="button" tabindex="0">' +
          '<div class="lib-main">' +
            '<div class="lib-en">' + escapeHtml(c.front) + '</div>' +
            '<div class="lib-zh">' + escapeHtml(zh) + '</div>' +
          '</div>' +
          '<div class="lib-side">' +
            '<span class="mini-box" data-box="' + p.box + '">' + boxName(p.box) + '</span>' +
            '<button class="icon-btn' + (p.fav ? ' on' : '') + '" data-act="fav" data-id="' + escapeHtml(c.id) + '" title="收藏">' + (p.fav ? '★' : '☆') + '</button>' +
            '<button class="icon-btn" data-act="speak" data-id="' + escapeHtml(c.id) + '" title="朗读英文">' + ICON_SPEAK + '</button>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------------- 详情弹窗 ---------------- */
  function openDetail(id) {
    var c = cards.filter(function (x) { return x.id === String(id); })[0];
    if (!c) return;
    state.detailId = c.id;
    var p = Store.get(c.id);

    $('mFront').textContent = c.front;
    $('mTerm').textContent = c.term || '';
    $('mPinyin').textContent = c.pinyin || '';

    var bp = $('mBox');
    bp.textContent = boxName(p.box);
    bp.setAttribute('data-box', p.box);
    $('mCat').textContent = catName(c.category);

    $('mDef').textContent = c.definition || c.back || '—';
    $('mDefEn').textContent = c.definitionEn || '—';
    $('mExample').textContent = c.example || '—';
    $('mExampleEn').textContent = c.exampleEn || '';

    $('mTags').innerHTML = (c.tags || []).map(function (t) {
      return '<span>' + escapeHtml(t) + '</span>';
    }).join('');
    $('mTagSection').hidden = !(c.tags && c.tags.length);

    var star = $('mStar');
    star.textContent = p.fav ? '★ 已收藏' : '☆ 收藏';

    $('mStats').textContent = '作答 ' + (p.right + p.wrong) + ' 次 · 正确 ' + p.right + ' · 错误 ' + p.wrong +
      (c.custom ? ' · 来自导入' : ' · 内置术语');

    $('modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    $('modal').hidden = true;
    document.body.style.overflow = '';
    state.detailId = null;
  }

  /* ---------------- CSV ---------------- */
  function decodeBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    var text = new TextDecoder('utf-8').decode(bytes);
    // Excel 中文版默认导出 GBK，出现替换字符时回退解码
    if (text.indexOf('\ufffd') !== -1) {
      try { text = new TextDecoder('gbk').decode(bytes); } catch (e) { /* 保持 UTF-8 结果 */ }
    }
    return text;
  }

  function handleCSVFile(file) {
    if (!file) return;
    var msg = $('importMsg');
    msg.className = 'msg';

    if (!/\.csv$/i.test(file.name)) {
      msg.textContent = '只支持 .csv 文件';
      msg.className = 'msg err';
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var rows = CSV.parseCards(decodeBuffer(e.target.result));
        if (!rows.length) throw new Error('没有解析到有效数据行');

        var normalized = rows.map(cardFromRow);
        var result = Store.addCustom(normalized);

        mergeCards();
        refreshAfterDataChange();

        msg.textContent = '导入完成：新增 ' + result.added + ' 张，更新 ' + result.updated + ' 张。';
        toast('已导入 ' + (result.added + result.updated) + ' 张卡片');
      } catch (err) {
        msg.textContent = '导入失败：' + err.message;
        msg.className = 'msg err';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportCSV() {
    var rows = [['front', 'back']];
    cards.forEach(function (c) {
      rows.push([c.front, c.back || (c.term + '：' + c.definition)]);
    });

    var csv = CSV.stringify(rows);
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');

    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');

    a.href = url;
    a.download = '术语卡片-' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    $('exportMsg').className = 'msg';
    $('exportMsg').textContent = '已导出 ' + cards.length + ' 张卡片。';
  }

  function refreshAfterDataChange() {
    populateCategorySelect($('catSelect'), true);
    populateCategorySelect($('libCat'), true);
    updateCounters();
    if (state.view === 'library') renderLibrary();
    if (!state.current) pickNext();
    else if (!getPool().some(function (c) { return c.id === state.current.id; })) pickNext();
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------------- 分类下拉 ---------------- */
  function populateCategorySelect(sel, keepValue) {
    var current = keepValue ? sel.value : 'all';
    var html = '<option value="all">全部分类</option>';
    DATA.categories.forEach(function (c) {
      html += '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
    });
    // 导入卡片可能有分类之外的项，这里忽略
    sel.innerHTML = html;
    sel.value = current;
    if (!sel.value) sel.value = 'all';
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 导航
    $('tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (btn) switchView(btn.getAttribute('data-view'));
    });

    // 记忆盒筛选
    $('boxes').addEventListener('click', function (e) {
      var btn = e.target.closest('.box');
      if (!btn) return;
      var scope = btn.getAttribute('data-scope');
      state.filters.scope = (state.filters.scope === scope) ? 'all' : scope;
      state.recent = [];
      pickNext();
    });

    // 分类 / 收藏 / 重抽
    $('catSelect').addEventListener('change', function () {
      state.filters.category = this.value;
      pickNext();
    });

    $('favOnly').addEventListener('click', function () {
      state.filters.favOnly = !state.filters.favOnly;
      this.classList.toggle('active', state.filters.favOnly);
      this.setAttribute('aria-pressed', state.filters.favOnly);
      pickNext();
    });

    $('reshuffle').addEventListener('click', function () {
      state.recent = [];
      pickNext();
      toast('已重新抽卡');
    });

    // 卡片翻转
    $('flashcard').addEventListener('click', function (e) {
      if (e.target.closest('.star')) return;
      setFlip(!state.flipped);
    });
    $('flashcard').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setFlip(!state.flipped);
      }
    });
    $('flipBtn').addEventListener('click', function () { setFlip(!state.flipped); });

    // 评分
    document.querySelector('.rate-row').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-rate]');
      if (btn) rate(Number(btn.getAttribute('data-rate')));
    });

    // 收藏 / 朗读 / 详情
    $('starBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      if (!state.current) return;
      var on = Store.toggleFav(state.current.id);
      this.textContent = on ? '★' : '☆';
      this.classList.toggle('on', on);
      toast(on ? '已加入收藏' : '已取消收藏');
      updateCounters();
      if (state.view === 'library') renderLibrary();
    });

    $('speakBtn').addEventListener('click', speakEn);
    $('speakZhBtn').addEventListener('click', speakZh);
    $('detailBtn').addEventListener('click', function () {
      if (state.current) openDetail(state.current.id);
    });

    // 拼写自测
    $('spellForm').addEventListener('submit', function (e) {
      e.preventDefault();
      checkSpell();
    });
    $('spellHint').addEventListener('click', function () {
      var c = state.spell.card;
      if (!c) return;
      var first = c.front.charAt(0);
      $('spellInput').value = first;
      $('spellInput').focus();
      toast('首字母是 ' + first + '，共 ' + c.front.length + ' 个字符（含空格）');
    });
    $('spellSpeak').addEventListener('click', function () {
      if (!state.spell.card) return;
      if (!Speech.supported) { toast('当前浏览器不支持语音朗读'); return; }
      Speech.speak(state.spell.card.front, 'en', 0.85);
    });
    $('spellSkip').addEventListener('click', function () {
      if (!state.spell.card) return;
      var c = state.spell.card;
      var fb = $('spellFeedback');
      fb.className = 'spell-feedback bad';
      fb.innerHTML = '已跳过。正确答案：<span class="answer">' + escapeHtml(c.front) + '</span>';
      fb.hidden = false;
      $('spellSkip').hidden = true;
      $('spellNext').hidden = false;
      state.spell.answered = true;
      $('spellInput').readOnly = true;
      state.spell.streak = 0;
      renderSpellStats();
    });
    $('spellNext').addEventListener('click', function () { nextSpell(false); });

    // 词库
    $('searchInput').addEventListener('input', function () {
      state.search = this.value;
      renderLibrary();
    });
    $('libCat').addEventListener('change', function () {
      state.libCat = this.value;
      renderLibrary();
    });
    $('libChips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      state.libBox = chip.getAttribute('data-box');
      this.querySelectorAll('.chip').forEach(function (x) { x.classList.toggle('active', x === chip); });
      renderLibrary();
    });

    $('libList').addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (act) {
        e.stopPropagation();
        var id = act.getAttribute('data-id');
        var card = cards.filter(function (c) { return c.id === id; })[0];
        if (!card) return;

        if (act.getAttribute('data-act') === 'fav') {
          var on = Store.toggleFav(id);
          act.textContent = on ? '★' : '☆';
          act.classList.toggle('on', on);
          if (state.current && state.current.id === id) {
            $('starBtn').textContent = on ? '★' : '☆';
            $('starBtn').classList.toggle('on', on);
          }
          updateCounters();
          if (state.libBox === 'fav' && !on) renderLibrary();
        } else {
          if (!Speech.supported) { toast('当前浏览器不支持语音朗读'); return; }
          Speech.speak(card.front, 'en', 0.92);
        }
        return;
      }

      var row = e.target.closest('.lib-item');
      if (row) openDetail(row.getAttribute('data-id'));
    });

    $('libList').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (e.target.closest('[data-act]')) return;
      var row = e.target.closest('.lib-item');
      if (row) openDetail(row.getAttribute('data-id'));
    });

    // 弹窗
    $('modal').addEventListener('click', function (e) {
      if (e.target.getAttribute('data-close')) closeDetail();
    });
    $('mSpeakEn').addEventListener('click', function () {
      var c = cards.filter(function (x) { return x.id === state.detailId; })[0];
      if (c && Speech.supported) Speech.speak(c.front, 'en', 0.92);
    });
    $('mSpeakZh').addEventListener('click', function () {
      var c = cards.filter(function (x) { return x.id === state.detailId; })[0];
      if (!c) return;
      if (!Speech.supported) { toast('当前浏览器不支持语音朗读'); return; }
      Speech.speak(c.term || c.definition || '', 'zh', 0.95);
    });
    $('mStar').addEventListener('click', function () {
      if (!state.detailId) return;
      var on = Store.toggleFav(state.detailId);
      this.textContent = on ? '★ 已收藏' : '☆ 收藏';
      if (state.current && state.current.id === state.detailId) {
        $('starBtn').textContent = on ? '★' : '☆';
        $('starBtn').classList.toggle('on', on);
      }
      updateCounters();
      if (state.view === 'library') renderLibrary();
    });
    $('mPractice').addEventListener('click', function () {
      var c = cards.filter(function (x) { return x.id === state.detailId; })[0];
      if (!c) return;
      closeDetail();
      state.filters = { scope: 'all', category: 'all', favOnly: false };
      $('catSelect').value = 'all';
      $('favOnly').classList.remove('active');
      state.current = c;
      state.flipped = false;
      switchView('study');
      renderCard();
    });

    // 数据页
    $('csvInput').addEventListener('change', function () {
      handleCSVFile(this.files && this.files[0]);
      this.value = '';
    });

    var dz = $('dropZone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        dz.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        dz.classList.remove('over');
      });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleCSVFile(f);
    });

    $('exportBtn').addEventListener('click', exportCSV);

    $('resetBtn').addEventListener('click', function () {
      if (!confirm('确定要重置全部学习进度吗？此操作不可撤销。')) return;
      Store.resetProgress();
      state.recent = [];
      updateCounters();
      pickNext();
      if (state.view === 'library') renderLibrary();
      $('resetMsg').className = 'msg';
      $('resetMsg').textContent = '进度已重置。';
      toast('学习进度已重置');
    });

    $('resetCustomBtn').addEventListener('click', function () {
      if (!Store.custom.length) { toast('当前没有导入的卡片'); return; }
      if (!confirm('确定要删除全部通过 CSV 导入的卡片吗？')) return;
      var n = Store.clearCustom();
      mergeCards();
      state.recent = [];
      refreshAfterDataChange();
      pickNext();
      $('resetMsg').className = 'msg';
      $('resetMsg').textContent = '已删除 ' + n + ' 张导入卡片。';
    });

    // 键盘快捷键（学习视图）
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!$('modal').hidden) {
        if (e.key === 'Escape') closeDetail();
        return;
      }
      if (state.view !== 'study') return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlip(!state.flipped);
      } else if (e.key === '1') {
        rate(-2);
      } else if (e.key === '2') {
        rate(0);
      } else if (e.key === '3') {
        rate(1);
      } else if (e.key.toLowerCase() === 's') {
        speakEn();
      } else if (e.key.toLowerCase() === 'f') {
        $('starBtn').click();
      }
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    mergeCards();
    populateCategorySelect($('catSelect'), false);
    populateCategorySelect($('libCat'), false);
    bind();
    updateCounters();

    var saved = Store.settings.view;
    var fromHash = location.hash.replace('#', '');
    var valid = ['study', 'spell', 'library', 'data'];
    var initial = valid.indexOf(fromHash) !== -1 ? fromHash : (valid.indexOf(saved) !== -1 ? saved : 'study');

    switchView(initial);
    pickNext();

    window.addEventListener('hashchange', function () {
      var name = location.hash.replace('#', '');
      if (valid.indexOf(name) !== -1 && name !== state.view) switchView(name);
    });

    if (!Speech.supported) {
      $('speakBtn').disabled = true;
      $('speakZhBtn').disabled = true;
      $('speakBtn').title = '当前浏览器不支持语音朗读';
      $('speakZhBtn').title = '当前浏览器不支持语音朗读';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
