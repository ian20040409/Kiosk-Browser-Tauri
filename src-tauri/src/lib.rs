// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Manager;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use std::time::Duration;

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
    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("Invalid URL: {e}"))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("Only http/https allowed".into());
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

    window
        .set_always_on_top(always_on_top)
        .map_err(|e| format!("set_always_on_top failed: {e}"))?;
    window
        .set_fullscreen(fullscreen)
        .map_err(|e| format!("set_fullscreen failed: {e}"))?;

    Ok(WindowState {
        fullscreen: window.is_fullscreen().unwrap_or(fullscreen),
        always_on_top,
    })
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

fn inject_nikflix_skeleton(window: &tauri::Webview) {
        // 先把 extension 的 CSS 注入（僅做骨架樣式）
        let nikflix_css = include_str!("../../Nikflix-master/chromium/netflix-controller.css");
        let css_json = serde_json::to_string(nikflix_css).unwrap_or_else(|_| "\"\"".to_string());

        let script = format!(
            r##"
(() => {{
    if (!location.hostname.endsWith("netflix.com")) return;
    if (window.__nikflixTauriInjected) return;
    window.__nikflixTauriInjected = true;

    // 1) 先做最小可用遮罩，避免限制畫面閃現
    const earlyStyle = document.createElement("style");
    earlyStyle.id = "nikflix-tauri-early-style";
    earlyStyle.textContent = `
        .nf-modal.interstitial-full-screen,
        .nf-modal.uma-modal.two-section-uma,
        .nf-modal.extended-diacritics-language.interstitial-full-screen,
        .css-1nym653.modal-enter-done {{
            display: none !important;
        }}
    `;
    (document.head || document.documentElement).appendChild(earlyStyle);

    // 2) 注入 Nikflix 控制器 CSS（目前先作為骨架）
    const style = document.createElement("style");
    style.id = "nikflix-tauri-style";
    style.textContent = {css_json};
    (document.head || document.documentElement).appendChild(style);

    // 3) 給一個可見的骨架標記，方便確認注入成功
    const badge = document.createElement("div");
    badge.id = "nikflix-tauri-badge";
    badge.textContent = "Nikflix (Tauri Skeleton)";
    Object.assign(badge.style, {{
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "2147483647",
        background: "rgba(229, 9, 20, 0.9)",
        color: "#fff",
        padding: "6px 10px",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: "700",
        fontFamily: "Arial, sans-serif",
        pointerEvents: "none"
    }});
    document.body.appendChild(badge);

    setTimeout(() => badge.remove(), 2500);
    console.info("[Nikflix/Tauri] skeleton injected");
}})();
"##
        );

        let _ = window.eval(&script);
}

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
            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open_settings" => {
                    if let Some(settings_window) = app.get_webview_window("settings") {
                        let _ = settings_window.show();
                        let _ = settings_window.set_focus();
                        let _ = settings_window.eval(
                            r#"location.href = 'tauri://localhost/index.html?mode=settings#open-settings';"#,
                        );
                    } else {
                        let _ = WebviewWindowBuilder::new(
                            app,
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
                        .build();
                    }
                }
                "go_home" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval(
                            r#"
(() => {
  if (location.origin === "tauri://localhost") {
    window.dispatchEvent(new Event("kiosk-open-home"));
  } else {
    location.href = "tauri://localhost/index.html#open-home";
  }
})();
"#,
                        );
                    }
                }
                _ => {}
            }
        })
                .on_page_load(|window, payload| {
                    if window.label() == "settings" {
                        let _ = window.eval("window.dispatchEvent(new Event('kiosk-open-settings'));\nsetTimeout(() => window.dispatchEvent(new Event('kiosk-open-settings')), 300);\n");
                    }
                        if payload.url().host_str().is_some_and(|host| host.ends_with("netflix.com")) {
                                inject_nikflix_skeleton(window);
                        }
                })
        .invoke_handler(tauri::generate_handler![
            greet,
            fetch_remote_config,
            apply_main_window_state,
            get_main_window_state,
            navigate_main_home
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
