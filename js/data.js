(function () {
  /**
   * Parse minimal CSV (handles quoted fields with commas).
   * @returns {string[][]}
   */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") {
          row.push(cur);
          cur = "";
        } else if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n") i++;
          row.push(cur);
          rows.push(row);
          row = [];
          cur = "";
        } else {
          cur += c;
        }
      }
    }
    row.push(cur);
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
    return rows;
  }

  function splitMediaCell(cell) {
    if (!cell || !String(cell).trim()) return [];
    return String(cell)
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** @param {{ media?: number|number[] }} col */
  function mediaColumnIndices(col) {
    const m = col && col.media;
    if (Array.isArray(m)) return m.filter(function (n) {
      return typeof n === "number" && n >= 0;
    });
    if (typeof m === "number" && m >= 0) return [m];
    return [4];
  }

  /** Merge photo/file links from one or more sheet columns (Google Forms may add E, F, G…). */
  function mediaFromRow(line, col) {
    const urls = [];
    const seen = {};
    const indices = mediaColumnIndices(col);
    for (let i = 0; i < indices.length; i++) {
      const cell = line[indices[i]];
      const parts = splitMediaCell(cell || "");
      for (let j = 0; j < parts.length; j++) {
        const u = parts[j];
        if (u && !seen[u]) {
          seen[u] = true;
          urls.push(u);
        }
      }
    }
    return urls;
  }

  const UNSPECIFIED_WEEK = "_unspecified";

  function weekKeyFromRow(line, col) {
    if (col.week === undefined || col.week === null) return UNSPECIFIED_WEEK;
    const w = String(line[col.week] != null ? line[col.week] : "").trim();
    return w ? w : UNSPECIFIED_WEEK;
  }

  function looksLikeCsv(text) {
    const t = String(text || "").trimStart();
    if (!t) return false;
    if (t.charAt(0) === "<") return false;
    const lower = t.slice(0, 200).toLowerCase();
    if (lower.indexOf("<!doctype") >= 0 || lower.indexOf("<html") >= 0) return false;
    const firstLine = t.split(/\r\n|\n|\r/)[0] || "";
    return firstLine.indexOf(",") >= 0;
  }

  function buildCsvFetchUrls(config) {
    const list = [];
    const primary = (config && config.responsesCsvUrl) || "";
    if (String(primary).trim()) list.push(String(primary).trim());
    const id = (config && config.spreadsheetId) || "";
    const gid = String(
      config && config.responsesSheetGid != null && config.responsesSheetGid !== ""
        ? config.responsesSheetGid
        : "0"
    );
    if (String(id).trim()) {
      const sid = String(id).trim();
      list.push(
        "https://docs.google.com/spreadsheets/d/" + sid + "/gviz/tq?tqx=out:csv&gid=" + encodeURIComponent(gid)
      );
    }
    const out = [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!seen[u]) {
        seen[u] = true;
        out.push(u);
      }
    }
    return out;
  }

  const CSV_LOAD_HELP =
    "Could not load responses as CSV. Fix: (1) In Google Sheets: Share → General access → Anyone with the link → Viewer, " +
    "or (2) File → Share → Publish to web → choose the Form Responses tab → CSV, then paste that URL into js/config.js as responsesCsvUrl. " +
    "(3) If the tab is not the first sheet, set responsesSheetGid in config to the number after #gid= when that tab is open.";

  /**
   * @param {string} csvText
   * @param {{ timestamp: number, week?: number, userId: number, text: number, media?: number|number[] }} col
   * @param {(raw: string) => string} resolveUserId
   */
  function rowsToSubmissions(csvText, col, resolveUserId) {
    const table = parseCsv(csvText.replace(/^\uFEFF/, ""));
    if (table.length < 2) return [];

    const out = [];
    for (let r = 1; r < table.length; r++) {
      const line = table[r];
      if (!line || !line.length) continue;
      const uid = resolveUserId(line[col.userId] || "");
      const week = weekKeyFromRow(line, col);
      const text = (line[col.text] || "").trim();
      const media = mediaFromRow(line, col);
      const ts = (line[col.timestamp] || "").trim();
      if (!uid && !text && media.length === 0) continue;
      out.push({
        userId: uid,
        week,
        text,
        media,
        timestamp: ts
      });
    }
    return out;
  }

  /**
   * @param {Array<{userId:string,week:string,text:string,media:string[],timestamp:string}>} submissions
   * @param {string|null} filterUserId
   */
  function groupByUserAndWeek(submissions, filterUserId) {
    const by = {};
    for (let i = 0; i < submissions.length; i++) {
      const s = submissions[i];
      if (filterUserId && s.userId !== filterUserId) continue;
      if (!s.userId) continue;
      const weekKey = s.week || UNSPECIFIED_WEEK;
      if (!by[s.userId]) by[s.userId] = {};
      if (!by[s.userId][weekKey]) {
        by[s.userId][weekKey] = { texts: [], media: [] };
      }
      const bucket = by[s.userId][weekKey];
      if (s.text) {
        bucket.texts.push({ body: s.text, ts: s.timestamp });
      }
      for (let j = 0; j < s.media.length; j++) {
        bucket.media.push({ url: s.media[j], ts: s.timestamp });
      }
    }
    return by;
  }

  function compareWeekKeys(a, b) {
    if (a === UNSPECIFIED_WEEK && b === UNSPECIFIED_WEEK) return 0;
    if (a === UNSPECIFIED_WEEK) return 1;
    if (b === UNSPECIFIED_WEEK) return -1;
    const isoA = a.match(/^(\d{4})-W(\d{1,2})$/i);
    const isoB = b.match(/^(\d{4})-W(\d{1,2})$/i);
    if (isoA && isoB) {
      const na = parseInt(isoA[1], 10) * 100 + parseInt(isoA[2], 10);
      const nb = parseInt(isoB[1], 10) * 100 + parseInt(isoB[2], 10);
      return na - nb;
    }
    const wkA = a.match(/^week\s*(\d+)/i);
    const wkB = b.match(/^week\s*(\d+)/i);
    if (wkA && wkB) return parseInt(wkA[1], 10) - parseInt(wkB[1], 10);
    const da = Date.parse(a);
    const db = Date.parse(b);
    if (!isNaN(da) && !isNaN(db)) return da - db;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  function sortWeekKeys(keys) {
    return keys.slice().sort(compareWeekKeys);
  }

  function weekHeading(key) {
    return key === UNSPECIFIED_WEEK ? "Week not specified" : key;
  }

  async function fetchSubmissions(config, resolveUserId) {
    const urls = buildCsvFetchUrls(config || {});
    if (urls.length === 0) return [];

    const col = (config && config.csvColumns) || {
      timestamp: 0,
      week: 1,
      userId: 2,
      text: 3,
      media: [4, 5, 6, 7]
    };
    const resolver =
      typeof resolveUserId === "function"
        ? resolveUserId
        : function (raw) {
            return String(raw || "").trim();
          };

    /** So a full browser refresh always asks the sheet again, not a cached CSV copy. */
    function withCacheBust(url) {
      const u = String(url || "");
      const sep = u.indexOf("?") >= 0 ? "&" : "?";
      return u + sep + "_scriptor_cb=" + Date.now();
    }

    let lastProblem = "";
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(withCacheBust(urls[i]), {
          cache: "no-store",
          mode: "cors"
        });
        const text = await res.text();
        if (!res.ok) {
          lastProblem = "HTTP " + res.status + " from " + urls[i].slice(0, 80) + "…";
          continue;
        }
        if (!looksLikeCsv(text)) {
          lastProblem = "Response was not CSV (often: sheet private or sign-in page).";
          continue;
        }
        return rowsToSubmissions(text, col, resolver);
      } catch (e) {
        lastProblem = e && e.message ? e.message : String(e);
      }
    }

    throw new Error(CSV_LOAD_HELP + (lastProblem ? " Details: " + lastProblem : ""));
  }

  window.ScriptorData = {
    fetchSubmissions,
    groupByUserAndWeek,
    sortWeekKeys,
    weekHeading,
    UNSPECIFIED_WEEK,
    parseCsv
  };
})();
