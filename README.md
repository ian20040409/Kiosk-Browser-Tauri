# LNU Kiosk Browser (Tauri v2)

A specialized, lightweight kiosk-style browser built with **Tauri v2** and **Vanilla HTML/CSS/JS**. Designed for public terminals, interactive displays, or dedicated Netflix controllers.

## ✨ Core Features

- **🚀 Performance:** Powered by Tauri v2 and native OS webview (WebView2 on Windows, WebKit on macOS).
- **🔒 Public Mode Security:**
  - Password-protected Settings panel.
  - Global hotkey for exiting the application (**Ctrl+Alt+Q**).
  - Global hotkey for the settings menu (**Ctrl+Alt+S**).
  - Context menu limited to Navigation (Back/Forward/Reload).
- **🌐 Dynamic Configuration:**
  - **Remote Config:** Automatically fetch `home_url` and `user_agent` from a remote JSON endpoint.
  - **Always-on-Top:** Keep the browser always in focus (auto-disabled in fullscreen).
  - **Fullscreen Persistence:** Remember your view preference across restarts.
- **⌨️ On-Screen Keyboard (OSK):** Built-in interactive keyboard for touchscreens, automatically triggered on input focus.
- **🛡️ Integrated AdBlocker:** Native JavaScript-based interception for tracking scripts, ad network XHR/Fetch requests, and dynamic iframes.
- **🎬 Nikflix Integration:** Bundled Netflix-specific CSS and JS injection for an enhanced playback experience.
- **🖱️ Hover Toolbar:** Auto-hiding native application menu that appears when the mouse touches the top edge of the screen.
- **🧹 Maintenance:** Built-in "Clear Browser Data" tool in settings to wipe cache, cookies, and storage.

## 🛠️ Tech Stack

- **Backend:** Rust (Tauri v2)
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Protocols:** Automatic translation of `tauri://localhost` to `http://tauri.localhost` on Windows for cross-platform compatibility.

## 🚀 Getting Started

### Prerequisites

- [Rust & Cargo](https://rustup.rs/)
- [Node.js & npm](https://nodejs.org/)
- **Windows:** WebView2 and C++ Build Tools.
- **macOS:** Xcode Command Line Tools.

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd hi-tauri-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in Development Mode:
   ```bash
   npm run tauri:dev
   ```

4. Build for Production:
   ```bash
   npm run tauri:build
   ```

## ⌨️ Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **Ctrl + Alt + Q** | Force Quit the application. |
| **Ctrl + Alt + S** | Open Settings panel (Password may be required). |
| **Alt / F10** | Temporarily show the hidden top toolbar. |
| **Esc** | Hide/Show Exit Hint. |

## ⚙️ Settings & Configuration

### Remote Config JSON Format
The app can sync with a worker or JSON endpoint with the following structure:
```json
{
  "home_url": "https://your-homepage.com",
  "user_agent": "Custom User Agent String"
}
```

### Protocol Handling
The app uses a custom normalization layer to handle the differences between macOS/Linux (`tauri://`) and Windows (`http://tauri.localhost`) protocols. Use `tauri://localhost/index.html` for internal routing; the backend will handle the translation automatically on Windows.

