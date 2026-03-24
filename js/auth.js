(function () {
  const STORAGE = "scriptor_session_v1";

  function getKeys() {
    return (
      window.SCRIPTOR_KEYS || {
        masterKey: "",
        userKeys: {}
      }
    );
  }

  function normalizeUserId(raw) {
    if (raw == null) return "";
    const s = String(raw).trim();
    const m = s.match(/(\d{4})/);
    return m ? m[1] : s.replace(/\D/g, "").slice(-4) || s;
  }

  /**
   * @returns {{ role: 'none'|'master'|'user', userId?: string }}
   */
  function authenticate(enteredKey) {
    const key = String(enteredKey || "").trim();
    const keys = getKeys();

    if (keys.masterKey && key === keys.masterKey) {
      return { role: "master" };
    }

    const map = keys.userKeys || {};
    for (const uid of Object.keys(map)) {
      if (map[uid] && key === map[uid]) {
        return { role: "user", userId: String(uid) };
      }
    }

    return { role: "none" };
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    sessionStorage.setItem(STORAGE, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE);
  }

  function keysAreConfigured() {
    const keys = getKeys();
    if (keys.masterKey && String(keys.masterKey).trim()) return true;
    const uk = keys.userKeys || {};
    const ids = Object.keys(uk);
    for (let i = 0; i < ids.length; i++) {
      if (uk[ids[i]] && String(uk[ids[i]]).trim()) return true;
    }
    return false;
  }

  window.ScriptorAuth = {
    authenticate,
    normalizeUserId,
    keysAreConfigured,
    readSession,
    writeSession,
    clearSession
  };
})();
