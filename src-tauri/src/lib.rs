// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
                .on_page_load(|window, payload| {
                        if payload.url().host_str().is_some_and(|host| host.ends_with("netflix.com")) {
                                inject_nikflix_skeleton(window);
                        }
                })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
