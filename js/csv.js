/* ============================================================
   csv.js —— CSV 解析与生成
   支持：双引号包裹、字段内逗号/换行、转义双引号 ""
   兼容 Excel（导出带 BOM）
   ============================================================ */

(function () {
  'use strict';

  /* 解析 CSV 文本 → 二维数组 */
  function parse(text) {
    // 去掉 BOM
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') { inQuotes = true; continue; }

      if (ch === ',') { row.push(field); field = ''; continue; }

      if (ch === '\r') continue;

      if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        continue;
      }

      field += ch;
    }

    // 收尾
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    // 去掉完全空行
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  /* 单元格转义 */
  function esc(value) {
    var s = value == null ? '' : String(value);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /* 二维数组 → CSV 文本（不含 BOM） */
  function stringify(rows) {
    return rows.map(function (r) {
      return r.map(esc).join(',');
    }).join('\r\n');
  }

  /* 解析成对象数组：要求含 front / back 表头 */
  function parseCards(text) {
    var rows = parse(text);
    if (!rows.length) throw new Error('文件是空的');

    var header = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iFront = header.indexOf('front');
    var iBack = header.indexOf('back');

    if (iFront === -1 || iBack === -1) {
      throw new Error('缺少 front / back 表头，请检查第一行');
    }

    var cards = [];
    for (var i = 1; i < rows.length; i++) {
      var front = String(rows[i][iFront] || '').trim();
      var back = String(rows[i][iBack] || '').trim();
      if (!front) continue;
      cards.push({ front: front, back: back });
    }
    return cards;
  }

  window.CSV = {
    parse: parse,
    stringify: stringify,
    parseCards: parseCards
  };
})();
