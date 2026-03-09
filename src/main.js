const { invoke } = window.__TAURI__.core;

let greetInputEl;
let greetMsgEl;
let appTitleEl;
let homeUrlLabelEl;

const DEFAULT_CONFIG_ENDPOINT = "https://worker.linyounttu.dpdns.org/";
const STORAGE_KEY = "hi_tauri_hidden_settings_v1";
const REMOTE_CONFIG_TIMEOUT_MS = 8000;
const HISTORY_LIMIT = 3;

const state = {
  tapCount: 0,
  tapResetTimer: null,
  settings: {
    version: 1,
    home_url: "https://linyounttu.dpdns.org",
    user_agent: "MusicAI/1.0 (lnu)",
    show_share_options: true,
    external_app_url: "unitymusicapp1007://",
    config_endpoint: DEFAULT_CONFIG_ENDPOINT,
    config_endpoint_history: [],
    home_url_history: [],
    user_agent_history: [],
  },
};

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  greetMsgEl.textContent = await invoke("greet", { name: greetInputEl.value });
}

function setSettingsMessage(message, isError = false) {
  const el = document.querySelector("#settings-msg");
  el.textContent = message;
  el.style.color = isError ? "#d9534f" : "inherit";
}

function normalizeHttpUrl(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("URL 必填");
  }
  const url = new URL(raw.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("僅允許 http/https");
  }
  return url.toString();
}

function sanitizeHistory(list, limit = HISTORY_LIMIT) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

function pushHistory(key, value, limit = HISTORY_LIMIT) {
  const current = sanitizeHistory(state.settings[key], limit);
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    state.settings[key] = current;
    return;
  }
  state.settings[key] = [trimmed, ...current.filter((v) => v !== trimmed)].slice(0, limit);
}

function syncSettingsToInputs() {
  document.querySelector("#config-endpoint-input").value =
    state.settings.config_endpoint || DEFAULT_CONFIG_ENDPOINT;
  document.querySelector("#home-url-input").value = state.settings.home_url || "";
  document.querySelector("#user-agent-input").value = state.settings.user_agent || "";
  document.querySelector("#external-app-url-input").value =
    state.settings.external_app_url || "";
  document.querySelector("#show-share-options-input").checked = Boolean(
    state.settings.show_share_options
  );

  document.querySelector("#config-preview").textContent = JSON.stringify(
    state.settings,
    null,
    2
  );
  homeUrlLabelEl.textContent = `Home URL: ${state.settings.home_url || "(not set)"}`;
}

function readSettingsFromInputs() {
  const endpointInput = document.querySelector("#config-endpoint-input").value.trim();
  state.settings.config_endpoint = endpointInput || DEFAULT_CONFIG_ENDPOINT;
  state.settings.home_url = document.querySelector("#home-url-input").value.trim();
  state.settings.user_agent = document.querySelector("#user-agent-input").value.trim();
  state.settings.external_app_url = document
    .querySelector("#external-app-url-input")
    .value.trim();
  state.settings.show_share_options = document.querySelector(
    "#show-share-options-input"
  ).checked;

  if (endpointInput) pushHistory("config_endpoint_history", endpointInput);
  if (state.settings.home_url) pushHistory("home_url_history", state.settings.home_url);
  if (state.settings.user_agent) pushHistory("user_agent_history", state.settings.user_agent);
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

function loadPersistedSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    state.settings = { ...state.settings, ...parsed };
    state.settings.config_endpoint_history = sanitizeHistory(
      state.settings.config_endpoint_history
    );
    state.settings.home_url_history = sanitizeHistory(state.settings.home_url_history);
    state.settings.user_agent_history = sanitizeHistory(state.settings.user_agent_history);
  } catch {
    setSettingsMessage("儲存設定損壞，已略過。", true);
  }
}

function openSettingsPanel() {
  document.querySelector("#settings-panel").classList.add("open");
  document.querySelector("#settings-panel").setAttribute("aria-hidden", "false");
}

function closeSettingsPanel() {
  document.querySelector("#settings-panel").classList.remove("open");
  document.querySelector("#settings-panel").setAttribute("aria-hidden", "true");
}

async function fetchRemoteConfig({ silent = false } = {}) {
  readSettingsFromInputs();
  const endpoint = state.settings.config_endpoint || DEFAULT_CONFIG_ENDPOINT;
  if (!silent) setSettingsMessage("抓取中...");

  try {
    const normalizedEndpoint = normalizeHttpUrl(endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_CONFIG_TIMEOUT_MS);

    const response = await fetch(normalizedEndpoint, {
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const remoteHomeUrl = typeof data?.home_url === "string" ? data.home_url.trim() : "";
    const remoteUserAgent =
      typeof data?.user_agent === "string" ? data.user_agent.trim() : "";

    if (!remoteHomeUrl && !remoteUserAgent) {
      throw new Error("遠端設定缺少 home_url / user_agent");
    }

    const merged = {
      ...state.settings,
      version: typeof data?.version === "number" ? data.version : state.settings.version,
      config_endpoint: normalizedEndpoint,
      show_share_options:
        typeof data?.show_share_options === "boolean"
          ? data.show_share_options
          : state.settings.show_share_options,
      external_app_url:
        typeof data?.external_app_url === "string"
          ? data.external_app_url.trim()
          : state.settings.external_app_url,
    };

    if (remoteHomeUrl) {
      merged.home_url = normalizeHttpUrl(remoteHomeUrl);
      pushHistory("home_url_history", merged.home_url);
    }
    if (remoteUserAgent) {
      merged.user_agent = remoteUserAgent;
      pushHistory("user_agent_history", remoteUserAgent);
    }

    state.settings = merged;
    pushHistory("config_endpoint_history", normalizedEndpoint);
    state.settings = {
      ...state.settings,
      config_endpoint_history: sanitizeHistory(state.settings.config_endpoint_history),
      home_url_history: sanitizeHistory(state.settings.home_url_history),
      user_agent_history: sanitizeHistory(state.settings.user_agent_history),
    };

    syncSettingsToInputs();
    persistSettings();
    if (!silent) setSettingsMessage("已抓取並套用遠端設定。", false);
  } catch (error) {
    if (!silent) setSettingsMessage(`抓取失敗：${error.message}`, true);
  }
}

function handleHiddenTap() {
  state.tapCount += 1;
  if (state.tapResetTimer) clearTimeout(state.tapResetTimer);

  state.tapResetTimer = setTimeout(() => {
    state.tapCount = 0;
  }, 1800);

  if (state.tapCount >= 5) {
    state.tapCount = 0;
    openSettingsPanel();
  }
}

function openHomeUrl() {
  const target = state.settings.home_url?.trim();
  if (!target) {
    setSettingsMessage("home_url 尚未設定。", true);
    return;
  }
  try {
    window.location.href = normalizeHttpUrl(target);
  } catch (error) {
    setSettingsMessage(`home_url 無效：${error.message}`, true);
  }
}

function onGlobalShortcut(e) {
  const key = String(e.key || "").toLowerCase();
  const isSettingsCombo = (e.ctrlKey || e.metaKey) && e.altKey && key === "s";
  if (isSettingsCombo) {
    e.preventDefault();
    openSettingsPanel();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  appTitleEl = document.querySelector("#app-title");
  homeUrlLabelEl = document.querySelector("#home-url-label");

  loadPersistedSettings();
  syncSettingsToInputs();

  document.querySelector("#greet-form").addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });

  appTitleEl.addEventListener("click", handleHiddenTap);
  window.addEventListener("keydown", onGlobalShortcut);

  document.querySelector("#fetch-config-btn").addEventListener("click", fetchRemoteConfig);
  document.querySelector("#save-settings-btn").addEventListener("click", () => {
    readSettingsFromInputs();
    persistSettings();
    syncSettingsToInputs();
    setSettingsMessage("設定已儲存。", false);
  });
  document.querySelector("#close-settings-btn").addEventListener("click", closeSettingsPanel);
  document.querySelector("#open-home-btn").addEventListener("click", openHomeUrl);

  // 參考 Electron 版本：啟動時自動嘗試抓取 remote config（失敗不打擾）
  fetchRemoteConfig({ silent: true });
});
