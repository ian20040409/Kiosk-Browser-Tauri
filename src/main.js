const STORAGE_KEY = "tauri_kiosk_settings_v2";
const HISTORY_LIMIT = 3;
const REMOTE_CONFIG_TIMEOUT_MS = 8000;
const PASSWORD_ITERATIONS = 120000;

const tauriWin = window.__TAURI__?.window;
const invoke = window.__TAURI__?.core?.invoke;
const appWindow = tauriWin?.getCurrentWindow ? tauriWin.getCurrentWindow() : null;
const windowLabel = appWindow?.label || "main";

const state = {
  unlocked: false,
  oskEnabled: true,
  oskShift: false,
  oskMinimized: false,
  activeInput: null,
  settings: {
    homeUrl: "https://linyounttu.dpdns.org",
    userAgent: "",
    remoteConfigUrl: "https://worker.linyounttu.dpdns.org/",
    alwaysOnTop: true,
    fullscreen: true,
    oskEnabled: true,
    hasPassword: false,
    passwordHash: "",
    passwordSalt: "",
    homeUrlHistory: [],
    userAgentHistory: [],
  },
};

const el = {
  openDirectBtn: document.querySelector("#open-direct-btn"),
  openNetflixBtn: document.querySelector("#open-netflix-btn"),
  closeWindowBtn: document.querySelector("#close-window-btn"),
  overlay: document.querySelector(".settings-overlay"),
  authPanel: document.querySelector(".settings-auth-panel"),
  authInput: document.querySelector("#settings-auth-input"),
  authErr: document.querySelector("#settings-auth-error"),
  authSubmit: document.querySelector("#settings-auth-submit"),
  authCancel: document.querySelector("#settings-auth-cancel"),
  protocol: document.querySelector("#settings-url-protocol"),
  homeInput: document.querySelector("#settings-url-input"),
  userAgentInput: document.querySelector("#settings-user-agent"),
  remoteInput: document.querySelector("#settings-remote-config-url"),
  remoteBtn: document.querySelector("#settings-remote-fetch"),
  remoteStatus: document.querySelector("#remote-config-status"),
  homeHistory: document.querySelector("#home-history-chips"),
  uaHistory: document.querySelector("#user-agent-history-chips"),
  alwaysOnTop: document.querySelector("#always-on-top"),
  oskEnabled: document.querySelector("#osk-enabled"),
  fsToggle: document.querySelector("#settings-fs-toggle"),
  fsToggleLabel: document.querySelector(".settings-btn__label--fs"),
  pwdCurrent: document.querySelector("#settings-password-current"),
  pwdNew: document.querySelector("#settings-password-new"),
  pwdConfirm: document.querySelector("#settings-password-confirm"),
  pwdStatus: document.querySelector("#settings-password-status"),
  pwdUpdate: document.querySelector("#settings-update-password"),
  saveBtn: document.querySelector("#settings-save"),
  cancelBtn: document.querySelector("#settings-cancel"),
  forceExit: document.querySelector("#settings-force-exit"),
  oskOverlay: document.querySelector(".osk-overlay"),
  osk: document.querySelector(".osk"),
};

function sanitizeHistory(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= HISTORY_LIMIT) break;
  }
  return out;
}

function pushHistory(targetKey, value) {
  const current = sanitizeHistory(state.settings[targetKey]);
  const v = (value || "").trim();
  if (!v) {
    state.settings[targetKey] = current;
    return;
  }
  state.settings[targetKey] = [v, ...current.filter((x) => x !== v)].slice(0, HISTORY_LIMIT);
}

function getErrorMessage(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  return e.message || String(e);
}

function normalizeHttpUrl(raw) {
  if (!raw || typeof raw !== "string") throw new Error("URL is required");
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("Only http/https allowed");
    }
    return u.toString();
  } catch (e) {
    if (e.message && e.message.includes("Invalid URL")) {
      throw new Error(`Invalid URL: ${trimmed}`);
    }
    throw e;
  }
}

function splitProtocol(urlValue) {
  const value = (urlValue || "").trim();
  if (value.startsWith("http://")) return { protocol: "http://", body: value.slice(7) };
  if (value.startsWith("https://")) return { protocol: "https://", body: value.slice(8) };
  return { protocol: "https://", body: value };
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.settings = { ...state.settings, ...parsed };
    state.settings.homeUrlHistory = sanitizeHistory(state.settings.homeUrlHistory);
    state.settings.userAgentHistory = sanitizeHistory(state.settings.userAgentHistory);
  } catch {
    // ignore
  }
}

function setRemoteStatus(msg, type = "") {
  el.remoteStatus.textContent = msg || "";
  el.remoteStatus.classList.remove("is-error", "is-success");
  if (type) el.remoteStatus.classList.add(type);
}

function setPasswordStatus(msg, type = "") {
  el.pwdStatus.textContent = msg || "";
  el.pwdStatus.classList.remove("is-error", "is-success");
  if (type) el.pwdStatus.classList.add(type);
}

function renderHistory(container, list, onSelect) {
  container.innerHTML = "";
  const parent = container.parentElement;
  const items = sanitizeHistory(list);
  if (parent) {
    parent.classList.toggle("is-visible", items.length > 0);
  }
  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-history__chip";
    btn.textContent = item.length > 48 ? `${item.slice(0, 45)}…` : item;
    btn.title = item;
    btn.addEventListener("click", () => onSelect(item));
    container.appendChild(btn);
  }
}

async function openDirectHome() {
  if (invoke) {
    try {
      await invoke("navigate_main_home", { url: state.settings.homeUrl });
      return;
    } catch {
      // fallback below
    }
  }
  window.location.href = state.settings.homeUrl;
}

function resetFrame() {
  void openDirectHome();
}

async function syncCachedHomeUrl() {
  if (!invoke) return;
  try {
    await invoke("sync_cached_home_url", { url: state.settings.homeUrl });
  } catch {
    // ignore backend cache sync error
  }
}

async function applyWindowState() {
  if (!invoke) return;
  try {
    const res = await invoke("apply_main_window_state", {
      alwaysOnTop: !!state.settings.alwaysOnTop,
      fullscreen: !!state.settings.fullscreen,
    });
    if (res && typeof res === "object") {
      state.settings.fullscreen = !!res.fullscreen;
      state.settings.alwaysOnTop = !!res.alwaysOnTop;
    }
    updateAlwaysOnTopAvailability();
  } catch {
    // ignore backend error
  }
}

async function updateFsButton() {
  let fullscreen = !!state.settings.fullscreen;
  if (invoke) {
    try {
      const stateRes = await invoke("get_main_window_state");
      fullscreen = !!stateRes?.fullscreen;
      state.settings.alwaysOnTop = !!stateRes?.alwaysOnTop;
    } catch {
      // ignore
    }
  }
  state.settings.fullscreen = fullscreen;
  if (fullscreen) {
    state.settings.alwaysOnTop = false;
  }
  updateAlwaysOnTopAvailability();
  el.fsToggleLabel.textContent = fullscreen ? "Exit Fullscreen" : "Enter Fullscreen";
}

function updateAlwaysOnTopAvailability() {
  const fullscreen = !!state.settings.fullscreen;
  if (fullscreen) {
    state.settings.alwaysOnTop = false;
    el.alwaysOnTop.checked = false;
  }
  el.alwaysOnTop.disabled = fullscreen;
  el.alwaysOnTop.title = fullscreen
    ? "Always on top is only available when fullscreen is off."
    : "";
}

function syncUiFromSettings() {
  const { protocol, body } = splitProtocol(state.settings.homeUrl);
  el.protocol.value = protocol;
  el.homeInput.value = body;
  el.userAgentInput.value = state.settings.userAgent || "";
  el.remoteInput.value = state.settings.remoteConfigUrl || "";
  el.alwaysOnTop.checked = !!state.settings.alwaysOnTop;
  el.oskEnabled.checked = !!state.settings.oskEnabled;
  state.oskEnabled = !!state.settings.oskEnabled;
  updateAlwaysOnTopAvailability();

  renderHistory(el.homeHistory, state.settings.homeUrlHistory, (item) => {
    const split = splitProtocol(item);
    el.protocol.value = split.protocol;
    el.homeInput.value = split.body;
  });
  renderHistory(el.uaHistory, state.settings.userAgentHistory, (item) => {
    el.userAgentInput.value = item;
  });
  applyOskEnabledState();
}

function collectFormSettings() {
  const homeCandidate = `${el.protocol.value}${el.homeInput.value.trim()}`;
  const normalizedHome = normalizeHttpUrl(homeCandidate);
  const remote = el.remoteInput.value.trim() ? normalizeHttpUrl(el.remoteInput.value.trim()) : "";

  state.settings.homeUrl = normalizedHome;
  state.settings.userAgent = el.userAgentInput.value.trim();
  state.settings.remoteConfigUrl = remote;
  state.settings.alwaysOnTop = state.settings.fullscreen ? false : !!el.alwaysOnTop.checked;
  state.settings.oskEnabled = !!el.oskEnabled.checked;
  state.oskEnabled = !!el.oskEnabled.checked;

  pushHistory("homeUrlHistory", state.settings.homeUrl);
  if (state.settings.userAgent) pushHistory("userAgentHistory", state.settings.userAgent);
}

function openSettings() {
  const locked = state.settings.hasPassword && !state.unlocked;
  el.overlay.classList.add("is-visible");
  el.overlay.setAttribute("aria-hidden", "false");
  el.overlay.classList.toggle("is-auth", locked);
  if (locked) {
    el.authErr.textContent = "";
    el.authInput.value = "";
    el.authInput.focus();
  }
}

function handleHashAction() {
  const hash = String(window.location.hash || "").toLowerCase();
  if (hash === "#open-settings") {
    openSettings();
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } else if (hash === "#open-home") {
    openDirectHome();
  }
}

function closeSettings() {
  if (windowLabel === "settings" && appWindow?.close) {
    appWindow.close().catch(console.error);
    return;
  }
  state.unlocked = false;
  el.overlay.classList.remove("is-visible", "is-auth");
  el.overlay.setAttribute("aria-hidden", "true");
}

async function derivePassword(plain, saltBase64) {
  const enc = new TextEncoder();
  const salt = saltBase64
    ? Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-512", salt, iterations: PASSWORD_ITERATIONS },
    key,
    512
  );
  const hashBytes = new Uint8Array(bits);
  const hash = btoa(String.fromCharCode(...hashBytes));
  const saltOut = btoa(String.fromCharCode(...salt));
  return { hash, salt: saltOut };
}

async function verifyPassword(plain) {
  if (!state.settings.hasPassword) return true;
  if (!plain) return false;
  const derived = await derivePassword(plain, state.settings.passwordSalt);
  return derived.hash === state.settings.passwordHash;
}

async function onAuthSubmit() {
  const ok = await verifyPassword(el.authInput.value);
  if (!ok) {
    el.authErr.textContent = "Incorrect password.";
    return;
  }
  state.unlocked = true;
  el.overlay.classList.remove("is-auth");
}

async function onUpdatePassword() {
  const current = el.pwdCurrent.value;
  const nextPwd = el.pwdNew.value;
  const confirm = el.pwdConfirm.value;

  if (state.settings.hasPassword) {
    const validCurrent = await verifyPassword(current);
    if (!validCurrent) {
      setPasswordStatus("Current password is incorrect.", "is-error");
      return;
    }
  }

  if (!nextPwd) {
    state.settings.hasPassword = false;
    state.settings.passwordHash = "";
    state.settings.passwordSalt = "";
    saveSettings();
    setPasswordStatus("Password protection disabled.", "is-success");
    return;
  }

  if (nextPwd !== confirm) {
    setPasswordStatus("Password confirmation does not match.", "is-error");
    return;
  }

  const derived = await derivePassword(nextPwd);
  state.settings.hasPassword = true;
  state.settings.passwordHash = derived.hash;
  state.settings.passwordSalt = derived.salt;
  saveSettings();
  setPasswordStatus("Password updated.", "is-success");
  el.pwdCurrent.value = "";
  el.pwdNew.value = "";
  el.pwdConfirm.value = "";
}

async function fetchRemoteConfig() {
  try {
    const url = normalizeHttpUrl(el.remoteInput.value.trim());
    state.settings.remoteConfigUrl = url;
    setRemoteStatus("Fetching...", "");

    let data;
    if (invoke) {
      data = await invoke("fetch_remote_config", { url });
    } else {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), REMOTE_CONFIG_TIMEOUT_MS);
      const res = await fetch(url, { cache: "no-store", signal: controller.signal, redirect: "follow" });
      window.clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }

    const home = typeof data?.home_url === "string" ? data.home_url.trim() : "";
    const ua = typeof data?.user_agent === "string" ? data.user_agent.trim() : "";
    if (!home && !ua) throw new Error("Remote config missing home_url and user_agent");

    if (home) state.settings.homeUrl = normalizeHttpUrl(home);
    if (ua) state.settings.userAgent = ua;
    if (typeof data?.show_share_options === "boolean") {
      // reserved
    }

    pushHistory("homeUrlHistory", state.settings.homeUrl);
    if (state.settings.userAgent) pushHistory("userAgentHistory", state.settings.userAgent);
    saveSettings();
    await syncCachedHomeUrl();
    syncUiFromSettings();
    await openDirectHome();
    setRemoteStatus("Remote config applied.", "is-success");
  } catch (e) {
    setRemoteStatus(`Fetch failed: ${getErrorMessage(e)}`, "is-error");
  }
}

function applyOskEnabledState() {
  el.oskOverlay.dataset.enabled = state.oskEnabled ? "true" : "false";
  if (!state.oskEnabled) hideOsk();
}

function showOsk() {
  if (!state.oskEnabled) return;
  el.oskOverlay.classList.add("is-visible");
}

function hideOsk() {
  el.oskOverlay.classList.remove("is-visible");
  state.oskMinimized = false;
  el.osk.classList.remove("is-minimized");
}

function insertTextToActive(text) {
  const input = state.activeInput;
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function backspaceActive() {
  const input = state.activeInput;
  if (!input) return;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  if (start !== end) {
    input.value = `${input.value.slice(0, start)}${input.value.slice(end)}`;
    input.setSelectionRange(start, start);
  } else if (start > 0) {
    input.value = `${input.value.slice(0, start - 1)}${input.value.slice(end)}`;
    input.setSelectionRange(start - 1, start - 1);
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function bindOskButtons() {
  el.osk.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const key = btn.dataset.key;

    if (action === "hide") return hideOsk();
    if (action === "minimize") {
      state.oskMinimized = !state.oskMinimized;
      el.osk.classList.toggle("is-minimized", state.oskMinimized);
      return;
    }
    if (action === "backspace") return backspaceActive();
    if (action === "space") return insertTextToActive(" ");
    if (action === "enter") return insertTextToActive("\n");
    if (action === "shift") {
      state.oskShift = !state.oskShift;
      return;
    }

    if (typeof key === "string") {
      const out = state.oskShift ? key.toUpperCase() : key;
      insertTextToActive(out);
      if (state.oskShift) state.oskShift = false;
    }
  });
}

function bindFocusForOsk() {
  document.addEventListener("focusin", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
    state.activeInput = t;
    if (el.overlay.classList.contains("is-visible")) showOsk();
  }, true);

  document.addEventListener("focusout", () => {
    window.setTimeout(() => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement)) {
        state.activeInput = null;
      }
    }, 100);
  }, true);
}

async function onSaveSettings() {
  try {
    collectFormSettings();
    saveSettings();
    await syncCachedHomeUrl();
    await openDirectHome();
    applyOskEnabledState();
    await applyWindowState();
    await updateFsButton();
    if (windowLabel === "settings" && appWindow?.close) {
      await appWindow.close();
    } else {
      closeSettings();
    }
  } catch (e) {
    setRemoteStatus(`Save failed: ${getErrorMessage(e)}`, "is-error");
  }
}

async function toggleFullscreen() {
  state.settings.fullscreen = !state.settings.fullscreen;
  await applyWindowState();
  await updateFsButton();
}

async function forceQuit() {
  if (invoke) {
    try {
      await invoke("force_exit_app");
      return;
    } catch {
      // fallback below
    }
  }
  if (windowLabel === "settings" && appWindow?.close) {
    await appWindow.close();
    return;
  }
  if (appWindow?.close) {
    await appWindow.close();
  } else {
    window.close();
  }
}

async function closeCurrentWindow() {
  if (appWindow?.close) {
    await appWindow.close();
    return;
  }
  window.close();
}

function bindEvents() {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("kiosk-open-settings", openSettings);
  window.addEventListener("kiosk-open-home", () => {
    void openDirectHome();
  });

  el.openDirectBtn.addEventListener("click", () => {
    void openDirectHome();
  });
  el.openNetflixBtn.addEventListener("click", () => {
    if (invoke) {
      void invoke("navigate_main_home", { url: "https://www.netflix.com" });
    } else {
      window.location.href = "https://www.netflix.com";
    }
  });
  el.closeWindowBtn?.addEventListener("click", () => {
    void closeCurrentWindow();
  });

  el.authSubmit.addEventListener("click", onAuthSubmit);
  el.authCancel.addEventListener("click", closeSettings);
  el.authInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onAuthSubmit();
  });

  el.remoteBtn.addEventListener("click", fetchRemoteConfig);
  el.pwdUpdate.addEventListener("click", onUpdatePassword);
  el.saveBtn.addEventListener("click", onSaveSettings);
  el.cancelBtn.addEventListener("click", closeSettings);
  el.forceExit.addEventListener("click", forceQuit);
  el.fsToggle.addEventListener("click", toggleFullscreen);
  el.alwaysOnTop.addEventListener("change", async () => {
    if (state.settings.fullscreen) {
      state.settings.alwaysOnTop = false;
      el.alwaysOnTop.checked = false;
      return;
    }
    state.settings.alwaysOnTop = !!el.alwaysOnTop.checked;
    saveSettings();
    await applyWindowState();
  });
  el.oskEnabled.addEventListener("change", () => {
    state.oskEnabled = !!el.oskEnabled.checked;
    state.settings.oskEnabled = state.oskEnabled;
    saveSettings();
    applyOskEnabledState();
  });

  window.addEventListener("keydown", async (e) => {
    const key = String(e.key || "").toLowerCase();
    const settingsCombo = (e.ctrlKey || e.metaKey) && e.altKey && key === "s";
    const exitCombo = (e.ctrlKey || e.metaKey) && e.altKey && key === "q";
    if (settingsCombo) {
      e.preventDefault();
      openSettings();
      return;
    }
    if (exitCombo) {
      e.preventDefault();
      await forceQuit();
      return;
    }
  });
}

async function boot() {
  loadSettings();
  await syncCachedHomeUrl();
  syncUiFromSettings();
  bindEvents();
  bindOskButtons();
  bindFocusForOsk();
  applyOskEnabledState();
  await applyWindowState();
  await updateFsButton();

  const params = new URLSearchParams(window.location.search || "");
  const mode = String(params.get("mode") || "").toLowerCase();
  const forceOpenSettings =
    windowLabel === "settings" ||
    window.__TAURI_OPEN_SETTINGS__ === true ||
    mode === "settings";
  if (forceOpenSettings) {
    openSettings();
    window.setTimeout(openSettings, 300);
  } else {
    handleHashAction();
  }

  if (state.settings.remoteConfigUrl) {
    void fetchRemoteConfig();
  }
}

window.addEventListener("DOMContentLoaded", boot);
