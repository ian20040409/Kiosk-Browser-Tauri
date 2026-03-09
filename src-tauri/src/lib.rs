// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Manager;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

static CACHED_HOME_URL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn cached_home_url() -> &'static Mutex<Option<String>> {
    CACHED_HOME_URL.get_or_init(|| Mutex::new(None))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    fullscreen: bool,
    always_on_top: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct RemoteConfigPayload {
    #[serde(default)]
    version: Option<i64>,
    #[serde(default)]
    home_url: Option<String>,
    #[serde(default)]
    user_agent: Option<String>,
    #[serde(default)]
    show_share_options: Option<bool>,
    #[serde(default)]
    external_app_url: Option<String>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn normalize_http_url(raw: &str) -> Result<reqwest::Url, String> {
    let mut url_str = raw.to_string();
    #[cfg(target_os = "windows")]
    if url_str.starts_with("tauri://localhost") {
        url_str = url_str.replace("tauri://localhost", "http://tauri.localhost");
    }
    let parsed = reqwest::Url::parse(&url_str).map_err(|e| format!("Invalid URL: {e}"))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" && scheme != "tauri" {
        return Err("Only http/https/tauri allowed".into());
    }
    Ok(parsed)
}

#[tauri::command]
async fn fetch_remote_config(url: String) -> Result<RemoteConfigPayload, String> {
    let normalized = normalize_http_url(&url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("Client build failed: {e}"))?;

    let response = client
        .get(normalized)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    response
        .json::<RemoteConfigPayload>()
        .await
        .map_err(|e| format!("Invalid JSON: {e}"))
}

#[tauri::command]
fn apply_main_window_state(
    app: tauri::AppHandle,
    always_on_top: bool,
    fullscreen: bool,
) -> Result<WindowState, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let next_always_on_top = if fullscreen { false } else { always_on_top };

    window
        .set_always_on_top(next_always_on_top)
        .map_err(|e| format!("set_always_on_top failed: {e}"))?;
    window
        .set_fullscreen(fullscreen)
        .map_err(|e| format!("set_fullscreen failed: {e}"))?;

    Ok(WindowState {
        fullscreen: window.is_fullscreen().unwrap_or(fullscreen),
        always_on_top: window.is_always_on_top().unwrap_or(next_always_on_top),
    })
}

#[tauri::command]
fn set_window_menu_visible(app: tauri::AppHandle, label: String, visible: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Window not found: {label}"))?;

    if visible {
        window
            .show_menu()
            .map_err(|e| format!("show_menu failed: {e}"))?;
    } else {
        window
            .hide_menu()
            .map_err(|e| format!("hide_menu failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn get_main_window_state(app: tauri::AppHandle) -> Result<WindowState, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    Ok(WindowState {
        fullscreen: window.is_fullscreen().unwrap_or(false),
        always_on_top: window.is_always_on_top().unwrap_or(false),
    })
}

#[tauri::command]
fn navigate_main_home(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let normalized = normalize_http_url(&url)?;
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    window
        .navigate(normalized)
        .map_err(|e| format!("navigate failed: {e}"))
}

#[tauri::command]
fn sync_cached_home_url(url: String) -> Result<(), String> {
    let normalized = normalize_http_url(&url)?;
    let lock = cached_home_url();
    let mut guard = lock
        .lock()
        .map_err(|_| "cached home url lock poisoned".to_string())?;
    *guard = Some(normalized.to_string());
    Ok(())
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(settings_window) = app.get_webview_window("settings") {
        let _ = settings_window.show();
        let _ = settings_window.set_focus();
        let _ = settings_window.eval(
            r#"window.dispatchEvent(new Event('kiosk-open-settings'));"#,
        );
    } else {
        if let Ok(settings_window) = WebviewWindowBuilder::new(
            &app,
            "settings",
            WebviewUrl::App("index.html?mode=settings#open-settings".into()),
        )
        .title("設定")
        .inner_size(1200.0, 780.0)
        .resizable(true)
        .initialization_script(
            r#"
window.__TAURI_OPEN_SETTINGS__ = true;
"#,
        )
        .build() {
            let _ = settings_window.hide_menu();
        }
    }
    Ok(())
}

#[tauri::command]
fn close_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
fn force_exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn clear_browser_data(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.clear_all_browsing_data();
    }
    Ok(())
}

fn inject_nikflix_full(window: &tauri::Webview) {
    let nikflix_css = include_str!("../../Nikflix-master/chromium/netflix-controller.css");
    let nikflix_main = include_str!("../../Nikflix-master/chromium/Main.js");
    let nikflix_seeker = include_str!("../../Nikflix-master/chromium/netflix-seeker.js");
    let nikflix_audio = include_str!("../../Nikflix-master/chromium/netflix-audioChange.js");
    let nikflix_subtitle = include_str!("../../Nikflix-master/chromium/netflix-substitleChange.js");

    let css_json = serde_json::to_string(nikflix_css).unwrap_or_else(|_| "\"\"".to_string());
    let seeker_json = serde_json::to_string(nikflix_seeker).unwrap_or_else(|_| "\"\"".to_string());
    let audio_json = serde_json::to_string(nikflix_audio).unwrap_or_else(|_| "\"\"".to_string());
    let subtitle_json = serde_json::to_string(nikflix_subtitle).unwrap_or_else(|_| "\"\"".to_string());

    let script = format!(
        r##"
(() => {{
    if (!location.hostname.endsWith("netflix.com")) return;
    if (window.__nikflixTauriInjectedFull) return;
    window.__nikflixTauriInjectedFull = true;

    console.info("[Nikflix/Tauri] Starting full injection...");

    // Polyfill chrome API
    window.chrome = window.chrome || {{}};
    window.chrome.runtime = window.chrome.runtime || {{}};
    window.chrome.runtime.getURL = (path) => path;
    window.chrome.runtime.onMessage = {{
        addListener: () => {{}},
        removeListener: () => {{}}
    }};
    window.chrome.storage = window.chrome.storage || {{}};
    window.chrome.storage.local = {{
        get: (keys, callback) => {{
            const res = {{}};
            if (Array.isArray(keys)) {{
                keys.forEach(k => res[k] = localStorage.getItem("nikflix_" + k));
            }} else if (typeof keys === "string") {{
                res[keys] = localStorage.getItem("nikflix_" + keys);
            }}
            if (callback) callback(res);
        }},
        set: (items, callback) => {{
            for (const [k, v] of Object.entries(items)) {{
                localStorage.setItem("nikflix_" + k, v);
            }}
            if (callback) callback();
        }}
    }};

    // Inject CSS
    const style = document.createElement("style");
    style.id = "netflix-controller-styles"; // Use the ID Main.js looks for
    style.textContent = {css_json};
    (document.head || document.documentElement).appendChild(style);

    // Mock injectScript to prevent loading external files
    window.injectScript = (fileName) => {{
        console.info("[Nikflix/Tauri] Mocking injection of:", fileName);
    }};

    // Helper to inject script content
    const injectContent = (content, id) => {{
        const s = document.createElement("script");
        s.id = id;
        s.textContent = content;
        (document.head || document.documentElement).appendChild(s);
    }};

    // Inject Seeker, Audio, Subtitle scripts
    injectContent({seeker_json}, "nikflix-seeker");
    injectContent({audio_json}, "nikflix-audio");
    injectContent({subtitle_json}, "nikflix-subtitle");

    // Inject Main.js logic (wrapped in a function to avoid conflicts if needed, but Main.js seems top-level)
    const mainScript = document.createElement("script");
    mainScript.id = "nikflix-main";
    mainScript.textContent = {nikflix_main_json};
    (document.head || document.documentElement).appendChild(mainScript);

    console.info("[Nikflix/Tauri] Full injection complete");
}})();
"##,
        css_json = css_json,
        seeker_json = seeker_json,
        audio_json = audio_json,
        subtitle_json = subtitle_json,
        nikflix_main_json = serde_json::to_string(nikflix_main).unwrap_or_else(|_| "\"\"".to_string())
    );

    let _ = window.eval(&script);
}

const ADBLOCK_SCRIPT: &str = r#"
(function() {
    if (window.__lnuAdBlockBound) return;
    window.__lnuAdBlockBound = true;

    const adDomains = [
        'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
        'taboola.com', 'outbrain.com', 'adnxs.com', 'adtech.de',
        'advertising.com', 'quantserve.com', 'scorecardresearch.com',
        'zedo.com', 'criteo.com', 'popads.net', 'adroll.com',
        'amazon-adsystem.com', 'adnxs.com', 'casalemedia.com', 'rubiconproject.com',
        'adsystem.com', 'adservice.google', 'pagead2.googlesyndication.com'
    ];
    
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        let urlStr = "";
        if (typeof url === 'string') urlStr = url;
        else if (url instanceof URL) urlStr = url.href;
        else if (url instanceof Request) urlStr = url.url;

        if (urlStr && adDomains.some(domain => urlStr.includes(domain))) {
            console.log('Blocked fetch to ad domain:', urlStr);
            return Promise.resolve(new Response('', { status: 200, statusText: 'OK' }));
        }
        return originalFetch.apply(this, arguments);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && adDomains.some(domain => url.includes(domain))) {
            console.log('Blocked XHR to ad domain:', url);
            this.__blockedByAdblock = true;
            return;
        }
        return originalOpen.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        if (this.__blockedByAdblock) {
            Object.defineProperty(this, 'readyState', { value: 4, writable: false });
            Object.defineProperty(this, 'status', { value: 200, writable: false });
            Object.defineProperty(this, 'responseText', { value: '', writable: false });
            if (typeof this.onreadystatechange === 'function') {
                setTimeout(() => this.onreadystatechange(new Event('readystatechange')), 10);
            }
            if (typeof this.onload === 'function') {
                setTimeout(() => this.onload(new ProgressEvent('load')), 15);
            }
            return;
        }
        return originalSend.apply(this, arguments);
    };

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.tagName === 'SCRIPT' && node.src && adDomains.some(domain => node.src.includes(domain))) {
                    node.type = 'javascript/blocked';
                    node.src = '';
                } else if (node.tagName === 'IFRAME' && node.src && adDomains.some(domain => node.src.includes(domain))) {
                    node.src = 'about:blank';
                    node.style.display = 'none';
                }
            });
        });
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });

    const blockSelectors = [
        'div[id^="ad-"]', 'div[class*="adsense"]', 'ins.adsbygoogle',
        'div[data-ad-unit]', 'div[class*="ad-unit"]', 'iframe[src*="ads"]'
    ];
    const hideAds = () => {
        blockSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
        });
    };
    setInterval(hideAds, 2000);
    hideAds();
    console.info("[AdBlock] Enhanced adblocker initialized");
})();
"#;

const MENU_AUTO_HIDE_SCRIPT: &str = r#"
(() => {
    if (window.__lnuMenuAutoHideBound) return;
    window.__lnuMenuAutoHideBound = true;

    const winApi = window.__TAURI__?.window;
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke || !winApi?.getCurrentWindow) return;

    const label = winApi.getCurrentWindow()?.label || "main";

    const EDGE_PX = 4;
    const HIDE_DELAY_MS = 1800;
    let visible = true;
    let hideTimer = 0;

    const setVisible = async (next) => {
        if (visible === next) return;
        visible = next;
        try {
            await invoke("set_window_menu_visible", { label, visible: next });
        } catch {
            // ignore
        }
    };

    const scheduleHide = () => {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            void setVisible(false);
        }, HIDE_DELAY_MS);
    };

    void setVisible(false);

    window.addEventListener("mousemove", (e) => {
        if ((e.clientY ?? 9999) <= EDGE_PX) {
            void setVisible(true);
            scheduleHide();
        }
    }, { passive: true });

    window.addEventListener("keydown", (e) => {
        const k = String(e.key || "");
        if (k === "Alt" || k === "F10") {
            void setVisible(true);
            scheduleHide();
        }
    });

    window.addEventListener("blur", () => {
        clearTimeout(hideTimer);
        void setVisible(false);
    });
})();
"#;

const CUSTOM_CONTEXT_MENU_SCRIPT: &str = r#"
(() => {
    if (window.__lnuCustomContextMenuBound) return;
    window.__lnuCustomContextMenuBound = true;

    const MENU_ID = "lnu-kiosk-context-menu";
    const STYLE_ID = "lnu-kiosk-context-style";

    const hideMenu = () => {
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.style.display = "none";
    };

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
#${MENU_ID} {
    position: fixed;
    z-index: 2147483647;
    min-width: 180px;
    background: rgba(22, 26, 33, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 10px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
    padding: 6px;
    display: none;
    backdrop-filter: blur(4px);
}
#${MENU_ID} .lnu-item {
    display: block;
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #f8fafc;
    text-align: left;
    font-size: 14px;
    line-height: 1;
    padding: 11px 12px;
    cursor: pointer;
}
#${MENU_ID} .lnu-item:hover {
    background: rgba(255, 255, 255, 0.10);
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    let menu = document.getElementById(MENU_ID);
    if (!menu) {
        menu = document.createElement("div");
        menu.id = MENU_ID;
        menu.innerHTML = `
            <button class="lnu-item" data-action="back">上一頁</button>
            <button class="lnu-item" data-action="forward">下一頁</button>
            <button class="lnu-item" data-action="reload">重新整理</button>
        `;
        (document.body || document.documentElement).appendChild(menu);

        menu.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            const action = String(btn.getAttribute("data-action") || "");
            if (action === "back") history.back();
            if (action === "forward") history.forward();
            if (action === "reload") location.reload();
            hideMenu();
        });
    }

    document.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const width = menu.offsetWidth || 180;
        const height = menu.offsetHeight || 140;
        const maxX = Math.max(8, window.innerWidth - width - 8);
        const maxY = Math.max(8, window.innerHeight - height - 8);
        const x = Math.min(Math.max(8, e.clientX), maxX);
        const y = Math.min(Math.max(8, e.clientY), maxY);

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = "block";
    }, true);

    document.addEventListener("click", hideMenu, true);
    window.addEventListener("blur", hideMenu);
    window.addEventListener("scroll", hideMenu, true);
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideMenu();
    });
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let open_settings = MenuItemBuilder::with_id("open_settings", "開啟設定").build(app)?;
            let go_home = MenuItemBuilder::with_id("go_home", "回首頁").build(app)?;

            let tools_submenu = SubmenuBuilder::new(app, "工具")
                .item(&open_settings)
                .item(&go_home)
                .build()?;

            let menu = MenuBuilder::new(app).item(&tools_submenu).build()?;
            app.set_menu(menu)?;

            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.hide_menu();
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open_settings" => {
                    let _ = open_settings_window(app.clone());
                }
                "go_home" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let home_url = cached_home_url()
                            .lock()
                            .ok()
                            .and_then(|guard| guard.clone())
                            .unwrap_or_else(|| "tauri://localhost/index.html#open-home".to_string());

                        if let Ok(parsed) = normalize_http_url(&home_url) {
                            let _ = window.navigate(parsed);
                        }
                    }
                }
                _ => {}
            }
        })
        .on_page_load(|window, payload| {
            if window.label() == "main" {
                let _ = window.eval(MENU_AUTO_HIDE_SCRIPT);
            }

            if window.label() == "main" {
                let _ = window.eval(CUSTOM_CONTEXT_MENU_SCRIPT);
            }

            // Inject AdBlock on every page
            let _ = window.eval(ADBLOCK_SCRIPT);

            if window.label() == "settings" {
                let _ = window.eval("window.dispatchEvent(new Event('kiosk-open-settings'));\nsetTimeout(() => window.dispatchEvent(new Event('kiosk-open-settings')), 300);\n");
            }
            if payload.url().host_str().is_some_and(|host| host.ends_with("netflix.com")) {
                inject_nikflix_full(window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            fetch_remote_config,
            apply_main_window_state,
            get_main_window_state,
            navigate_main_home,
            sync_cached_home_url,
            set_window_menu_visible,
            open_settings_window,
            close_main_window,
            force_exit_app,
            clear_browser_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
