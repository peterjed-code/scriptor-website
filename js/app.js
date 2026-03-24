(function () {
  const auth = window.ScriptorAuth;
  const data = window.ScriptorData;
  const cfg = window.SCRIPTOR_CONFIG || {};

  const el = {
    gate: document.getElementById("gate"),
    keyInput: document.getElementById("key-input"),
    unlockBtn: document.getElementById("unlock-btn"),
    gateError: document.getElementById("gate-error"),
    app: document.getElementById("app"),
    bannerRole: document.getElementById("banner-role"),
    logoutBtn: document.getElementById("logout-btn"),
    refreshBtn: document.getElementById("refresh-btn"),
    formFrame: document.getElementById("form-frame"),
    formPlaceholder: document.getElementById("form-placeholder"),
    dataStatus: document.getElementById("data-status"),
    dataRoot: document.getElementById("data-root"),
    envWarning: document.getElementById("env-warning")
  };

  let users = [];
  /** @type {(raw: string) => string} */
  let resolveSheetUserId = function () {
    return "";
  };

  function normalizeNameKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function buildUserIdResolver(userList) {
    /** @type {Record<string, string>} */
    const map = {};
    for (let i = 0; i < userList.length; i++) {
      const u = userList[i];
      const keys = [u.formLabel];
      if (u.aliases) {
        for (let j = 0; j < u.aliases.length; j++) {
          keys.push(u.aliases[j]);
        }
      }
      for (let k = 0; k < keys.length; k++) {
        const nk = normalizeNameKey(keys[k]);
        if (nk) map[nk] = u.id;
      }
    }
    return function resolveUserId(raw) {
      const s = String(raw != null ? raw : "").trim();
      if (!s) return "";
      if (/^\d{4}$/.test(s)) {
        for (let i = 0; i < userList.length; i++) {
          if (userList[i].id === s) return s;
        }
        return s;
      }
      const byName = map[normalizeNameKey(s)];
      if (byName) return byName;
      const m = s.match(/(\d{4})/);
      if (m) {
        for (let i = 0; i < userList.length; i++) {
          if (userList[i].id === m[1]) return m[1];
        }
      }
      return "";
    };
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function userLabel(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return "Participant";
    return u.formLabel;
  }

  function applyFormEmbed() {
    const url = (cfg.googleFormEmbedUrl || "").trim();
    if (url) {
      el.formPlaceholder.hidden = true;
      el.formFrame.hidden = false;
      el.formFrame.src = url;
    } else {
      el.formPlaceholder.hidden = false;
      el.formFrame.hidden = true;
      el.formFrame.removeAttribute("src");
    }
  }

  function showGate(msg) {
    el.app.hidden = true;
    el.gate.hidden = false;
    el.gateError.textContent = msg || "";
    auth.clearSession();
  }

  function showApp(session) {
    el.gate.hidden = true;
    el.app.hidden = false;
    if (session.role === "master") {
      el.bannerRole.textContent = "Overview — all participants";
    } else {
      el.bannerRole.textContent = "Signed in as " + userLabel(session.userId);
    }
  }

  async function loadUsers() {
    const res = await fetch("data/users.json", { cache: "no-store" });
    if (!res.ok) throw new Error("LOAD_FAILED");
    users = await res.json();
    users.sort((a, b) => a.formLabel.localeCompare(b.formLabel, undefined, { sensitivity: "base" }));
    resolveSheetUserId = buildUserIdResolver(users);
  }

  function userWeeksHaveContent(userWeeks) {
    if (!userWeeks) return false;
    return Object.keys(userWeeks).some((wk) => {
      const w = userWeeks[wk];
      return w.texts.length > 0 || w.media.length > 0;
    });
  }

  /**
   * @param {{ stem: string }} [downloadMeta] — if set and there is text, show “Download .txt”
   */
  function appendTextSubsection(parent, texts, downloadMeta) {
    const textWrap = document.createElement("div");
    textWrap.className = "subsection";
    const h4 = document.createElement("h4");
    h4.textContent = "Textual information";
    textWrap.appendChild(h4);
    const textList = document.createElement("ul");
    textList.className = "entry-list";
    if (texts.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No text for this week.";
      textList.appendChild(li);
    } else {
      texts.forEach((t) => {
        const li = document.createElement("li");
        li.innerHTML =
          (t.ts ? "<span class=\"ts\">" + esc(t.ts) + "</span> " : "") + esc(t.body);
        textList.appendChild(li);
      });
    }
    textWrap.appendChild(textList);
    if (downloadMeta && downloadMeta.stem && texts.length > 0) {
      const lines = texts.map(function (t) {
        return (t.ts ? "[" + t.ts + "] " : "") + t.body;
      });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-dl text-dl";
      btn.textContent = "Download text (.txt)";
      btn.addEventListener("click", function () {
        triggerTextDownload(lines.join("\n\n"), sanitizeFilenamePart(downloadMeta.stem) + ".txt");
      });
      textWrap.appendChild(btn);
    }
    parent.appendChild(textWrap);
  }

  /** Improve inline display for common Google Drive file links (sheet often stores /file/d/… or open?id=…). */
  function mediaDisplayUrl(raw, asVideo) {
    const u = String(raw || "").trim();
    if (!u) return u;
    const fileD = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    const idFromFile = fileD ? fileD[1] : null;
    const openM = u.match(/drive\.google\.com\/open\?[^#]*id=([a-zA-Z0-9_-]+)/);
    const id = idFromFile || (openM ? openM[1] : null);
    if (!id) return u;
    if (asVideo) return "https://drive.google.com/file/d/" + id + "/preview";
    return "https://drive.google.com/uc?export=view&id=" + id;
  }

  function driveFileIdFromUrl(url) {
    const u = String(url || "");
    const fileD = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileD) return fileD[1];
    const openM = u.match(/drive\.google\.com\/open\?[^#]*id=([a-zA-Z0-9_-]+)/);
    if (openM) return openM[1];
    const uc = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (uc && u.indexOf("drive.google.com") >= 0) return uc[1];
    return null;
  }

  /** Best-effort URL for saving the file (Drive uses export=download). */
  function mediaDownloadHref(originalUrl) {
    const u = String(originalUrl || "").trim();
    const id = driveFileIdFromUrl(u);
    if (id) return "https://drive.google.com/uc?export=download&id=" + id;
    return u;
  }

  function sanitizeFilenamePart(s) {
    return String(s || "")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "scriptor";
  }

  function guessExtension(url, isVideo) {
    const u = String(url || "").split("?")[0];
    const m = u.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) return "." + m[1].toLowerCase();
    return isVideo ? ".mp4" : ".jpg";
  }

  async function triggerFileDownload(originalUrl, filename) {
    const href = mediaDownloadHref(originalUrl);
    try {
      const res = await fetch(href, { mode: "cors", cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = obj;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(obj);
        return;
      }
    } catch (e) {
      /* CORS common for Drive — fall through */
    }
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function triggerTextDownload(textBody, filename) {
    const blob = new Blob([textBody], { type: "text/plain;charset=utf-8" });
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(obj);
  }

  function appendMediaSubsection(parent, med) {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "subsection";
    const h4 = document.createElement("h4");
    h4.textContent = "Photos / videos";
    mediaWrap.appendChild(h4);
    const grid = document.createElement("div");
    grid.className = "media-grid";
    if (med.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No files for this week.";
      grid.appendChild(p);
    } else {
      med.forEach((m, idx) => {
        const u = m.url;
        const isVid =
          /\.(mp4|webm|mov)(\?|$)/i.test(u) ||
          /video\//i.test(u) ||
          /drive\.google\.com.*\/preview/i.test(u);
        const displaySrc = mediaDisplayUrl(u, isVid);
        const ext = guessExtension(u, isVid);
        const baseName = "media-" + (idx + 1) + ext;
        const box = document.createElement("div");
        box.className = "media-item";
        if (isVid) {
          const v = document.createElement("video");
          v.controls = true;
          v.src = displaySrc;
          v.onerror = function () {
            const a = document.createElement("a");
            a.href = u;
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = "Open in Drive";
            box.innerHTML = "";
            box.appendChild(a);
          };
          box.appendChild(v);
        } else {
          const img = document.createElement("img");
          img.alt = "Submission";
          img.loading = "lazy";
          img.src = displaySrc;
          img.onerror = function () {
            const a = document.createElement("a");
            a.href = u;
            a.target = "_blank";
            a.rel = "noopener";
            a.textContent = "Open link";
            box.innerHTML = "";
            box.appendChild(a);
          };
          box.appendChild(img);
        }
        if (m.ts) {
          const cap = document.createElement("div");
          cap.className = "ts";
          cap.textContent = m.ts;
          box.appendChild(cap);
        }
        const actions = document.createElement("div");
        actions.className = "media-actions";
        const dl = document.createElement("button");
        dl.type = "button";
        dl.className = "btn-dl";
        dl.textContent = "Download";
        dl.addEventListener("click", function () {
          triggerFileDownload(u, baseName);
        });
        const open = document.createElement("a");
        open.className = "btn-dl secondary";
        open.href = mediaDownloadHref(u);
        open.target = "_blank";
        open.rel = "noopener noreferrer";
        open.textContent = "Open";
        actions.appendChild(dl);
        actions.appendChild(open);
        box.appendChild(actions);
        grid.appendChild(box);
      });
    }
    mediaWrap.appendChild(grid);
    parent.appendChild(mediaWrap);
  }

  /**
   * @returns {string} optional status line for the current user (e.g. no data)
   */
  function renderData(grouped, session) {
    el.dataRoot.innerHTML = "";
    const sortWeekKeys = data.sortWeekKeys;
    const weekHeading = data.weekHeading;

    let ids;
    if (session.role === "master") {
      ids = Object.keys(grouped).filter((id) => userWeeksHaveContent(grouped[id]));
      ids.sort((a, b) => userLabel(a).localeCompare(userLabel(b)));
    } else {
      ids = [session.userId];
    }

    let empty = true;
    for (const id of ids) {
      const userWeeks = grouped[id];
      const card = document.createElement("section");
      card.className = "user-card";
      const h = document.createElement("h2");
      h.textContent = userLabel(id);
      card.appendChild(h);

      if (!userWeeksHaveContent(userWeeks)) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent =
          session.role === "master"
            ? "No entries for this person yet."
            : "No entries yet. Use the form above, then choose Refresh data.";
        card.appendChild(p);
      } else {
        const weekKeys = sortWeekKeys(Object.keys(userWeeks || {}));
        for (const wk of weekKeys) {
          const wdata = userWeeks[wk];
          if (wdata.texts.length === 0 && wdata.media.length === 0) continue;

          empty = false;
          const weekSection = document.createElement("section");
          weekSection.className = "week-block";
          const wh = document.createElement("h3");
          wh.className = "week-title";
          wh.textContent = weekHeading(wk);
          weekSection.appendChild(wh);

          const dlStem =
            "id" +
            id +
            "-" +
            sanitizeFilenamePart(weekHeading(wk)) +
            "-" +
            sanitizeFilenamePart(userLabel(id));
          appendTextSubsection(weekSection, wdata.texts, { stem: dlStem });
          appendMediaSubsection(weekSection, wdata.media);

          card.appendChild(weekSection);
        }
      }

      el.dataRoot.appendChild(card);
    }

    if (session.role === "master" && ids.length === 0) {
      el.dataRoot.innerHTML = "<p class=\"muted\">No entries yet.</p>";
    }

    if (empty && session.role !== "master") {
      return "Nothing here for your account yet. If you just submitted, pick your name on the form and try Refresh data in a few seconds.";
    }
    return "";
  }

  async function refreshData(session) {
    el.dataStatus.textContent = "Loading…";
    try {
      const subs = await data.fetchSubmissions(cfg, resolveSheetUserId);
      const filter = session.role === "user" ? session.userId : null;
      const grouped = data.groupByUserAndWeek(subs, filter);
      const hint = renderData(grouped, session);
      if (!cfg.responsesCsvUrl && !cfg.spreadsheetId) {
        el.dataStatus.textContent = "Unable to load data.";
      } else if (hint) {
        el.dataStatus.textContent = hint;
      } else {
        el.dataStatus.textContent = "";
      }
    } catch (e) {
      el.dataStatus.textContent =
        "Unable to load the latest data. Wait a few seconds and try Refresh data.";
      renderData({}, session);
    }
  }

  function tryUnlock() {
    if (!auth.keysAreConfigured()) {
      el.gateError.textContent = "This site is not set up yet.";
      return;
    }
    const entered = el.keyInput.value;
    const result = auth.authenticate(entered);
    if (result.role === "none") {
      el.gateError.textContent = "That key is not valid.";
      return;
    }
    const session =
      result.role === "master"
        ? { role: "master" }
        : { role: "user", userId: result.userId };
    auth.writeSession(session);
    el.keyInput.value = "";
    el.gateError.textContent = "";
    showApp(session);
    refreshData(session);
  }

  function initGate() {
    if (!auth.keysAreConfigured()) {
      showGate("This site is not set up yet.");
      return;
    }
    const existing = auth.readSession();
    if (existing && (existing.role === "master" || existing.userId)) {
      showApp(existing);
      refreshData(existing);
    } else {
      showGate("");
    }
  }

  el.unlockBtn.addEventListener("click", tryUnlock);
  el.keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });
  el.logoutBtn.addEventListener("click", () => {
    showGate("");
  });
  el.refreshBtn.addEventListener("click", () => {
    const s = auth.readSession();
    if (s) refreshData(s);
  });

  applyFormEmbed();

  if (window.location.protocol === "file:" && el.envWarning) {
    el.envWarning.hidden = false;
    el.envWarning.textContent =
      "Open this site from its normal web address (http or https), not as a saved file.";
  }

  loadUsers()
    .then(initGate)
    .catch((e) => {
      el.app.hidden = true;
      el.gate.hidden = false;
      el.gateError.textContent =
        e && e.message === "LOAD_FAILED"
          ? "Something went wrong loading this page."
          : "Something went wrong. Try again later.";
    });
})();
