use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};

use tauri::{
    image::Image,
    ipc::Response,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, EventTarget, Manager, PhysicalPosition, Rect, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const MAX_BYTES: usize = 2_500_000;
const USER_AGENT: &str = "Mozilla/5.0 (compatible; MyndShelfBot/0.1; link preview)";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(12))
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())
}

/// Segue os redirecionamentos de um link curto (maps.app.goo.gl…) e devolve o destino final.
#[tauri::command]
async fn resolve_url(url: String) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL inválida".into());
    }
    let res = client()?.get(&url).send().await.map_err(|e| e.to_string())?;
    Ok(res.url().to_string())
}

/// Baixa o HTML de uma página para o core ler os metadados OpenGraph.
/// Feito em Rust para escapar do CORS do webview.
#[tauri::command]
async fn fetch_html(url: String) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL inválida".into());
    }
    let res = client()?
        .get(&url)
        .header("accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
        .header("accept-language", "pt-BR,pt;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let slice = &bytes[..bytes.len().min(MAX_BYTES)];
    Ok(String::from_utf8_lossy(slice).into_owned())
}

/* ───────────────────────── arquivos e pastas arrastados ───────────────────────── */

/// Caminhos que a pessoa arrastou para a janela nesta sessão.
/// O app só lê arquivos que estão aqui — nada de acesso livre ao disco.
#[derive(Default)]
struct Dropped(Mutex<HashSet<PathBuf>>);

fn ensure_dropped(dropped: &State<Dropped>, path: &Path) -> Result<(), String> {
    if dropped.0.lock().map_err(|e| e.to_string())?.contains(path) {
        Ok(())
    } else {
        Err("Caminho não autorizado".into())
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInfo {
    name: String,
    is_dir: bool,
    size: u64,
    modified: Option<u64>,
    /// pastas: quantidade de itens diretos
    items: Option<usize>,
    /// pastas: alguns nomes do conteúdo (pastas primeiro)
    sample: Vec<String>,
}

#[tauri::command]
fn path_info(path: String, dropped: State<Dropped>) -> Result<PathInfo, String> {
    let p = PathBuf::from(&path);
    ensure_dropped(&dropped, &p)?;
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(path.clone());
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);

    let (items, sample) = if meta.is_dir() {
        let mut entries: Vec<(bool, String)> = std::fs::read_dir(&p)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| (e.path().is_dir(), e.file_name().to_string_lossy().into_owned()))
            .filter(|(_, n)| !n.starts_with('.'))
            .collect();
        entries.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.to_lowercase().cmp(&b.1.to_lowercase())));
        let count = entries.len();
        let sample = entries
            .into_iter()
            .take(8)
            .map(|(dir, n)| if dir { format!("{n}/") } else { n })
            .collect();
        (Some(count), sample)
    } else {
        (None, vec![])
    };

    Ok(PathInfo { name, is_dir: meta.is_dir(), size: meta.len(), modified, items, sample })
}

/// Bytes de um arquivo arrastado (binário direto, sem JSON).
#[tauri::command]
fn read_file(path: String, dropped: State<Dropped>) -> Result<Response, String> {
    let p = PathBuf::from(&path);
    ensure_dropped(&dropped, &p)?;
    if std::fs::metadata(&p).map_err(|e| e.to_string())?.len() > 1_500_000_000 {
        return Err("Arquivo grande demais".into());
    }
    std::fs::read(&p).map(Response::new).map_err(|e| e.to_string())
}

/// Abre uma pasta no gerenciador de arquivos (Finder, Explorer…) ou revela um arquivo nela.
#[tauri::command]
fn open_path(path: String, reveal: bool) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Esse caminho não existe mais — a pasta foi movida ou apagada?".into());
    }
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        if reveal {
            c.arg("-R");
        }
        c.arg(&p);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        if reveal {
            c.arg(format!("/select,{}", p.display()));
        } else {
            c.arg(&p);
        }
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(if reveal { p.parent().unwrap_or(&p) } else { &p });
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/* ───────────────────────── caixa de soltar (bandeja do sistema) ───────────────────────── */

const DROPZONE: &str = "dropzone";
const DROPZONE_W: f64 = 340.0;
const DROPZONE_H: f64 = 300.0;

/// Quando a caixa foi escondida pela última vez — o clique no ícone da bandeja
/// que a fechou (por "clique fora") não deve reabri-la logo em seguida.
#[derive(Default)]
struct DropzoneState(Mutex<Option<Instant>>);

fn dropzone_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window(DROPZONE) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, DROPZONE, WebviewUrl::App("index.html#dropzone".into()))
        .title("MyndShelf")
        .inner_size(DROPZONE_W, DROPZONE_H)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .shadow(false)
        .build()
}

/// Coloca a caixa logo abaixo do ícone (ou acima, se a bandeja estiver embaixo, como no Windows).
/// Devolve `true` quando ficou acima — a animação nasce do lado do ícone.
fn place_near(window: &WebviewWindow, rect: &Rect) -> tauri::Result<bool> {
    let scale = window.scale_factor()?;
    let pos = rect.position.to_physical::<f64>(scale);
    let size = rect.size.to_physical::<f64>(scale);
    let (w, h) = (DROPZONE_W * scale, DROPZONE_H * scale);
    let mut x = pos.x + size.width / 2.0 - w / 2.0;
    let mut y = pos.y + size.height + 6.0 * scale;
    let mut above = false;
    if let Some(monitor) = window.current_monitor()? {
        let m = monitor.size();
        let mp = monitor.position();
        if pos.y > mp.y as f64 + m.height as f64 / 2.0 {
            y = pos.y - h - 6.0 * scale;
            above = true;
        }
        x = x.clamp(mp.x as f64 + 8.0, mp.x as f64 + m.width as f64 - w - 8.0);
    }
    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(above)
}

/// A caixa anima a própria saída e depois chama `hide_dropzone`.
fn ask_close(window: &WebviewWindow) -> tauri::Result<()> {
    window.emit_to(EventTarget::webview_window(DROPZONE), "dropzone-close", ())
}

fn toggle_dropzone(app: &AppHandle, rect: &Rect) -> tauri::Result<()> {
    let window = dropzone_window(app)?;
    if window.is_visible()? {
        return ask_close(&window);
    }
    let just_hidden = app
        .state::<DropzoneState>()
        .0
        .lock()
        .ok()
        .and_then(|t| *t)
        .is_some_and(|t| t.elapsed() < Duration::from_millis(400));
    if just_hidden {
        return Ok(());
    }
    let above = place_near(&window, rect)?;
    window.show()?;
    window.set_focus()?;
    // o painel começa invisível; este evento dispara a animação de entrada
    window.emit_to(EventTarget::webview_window(DROPZONE), "dropzone-open", above)
}

#[tauri::command]
fn hide_dropzone(app: AppHandle, state: State<DropzoneState>) -> Result<(), String> {
    if let Ok(mut t) = state.0.lock() {
        *t = Some(Instant::now());
    }
    if let Some(w) = app.get_webview_window(DROPZONE) {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// O botão esquerdo do mouse está pressionado agora (em qualquer app)?
/// Distingue "clicar fora" (fecha a caixa) de "segurar e arrastar algo" (mantém aberta).
#[tauri::command]
fn mouse_pressed() -> bool {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGEventSourceButtonState(state_id: i32, button: u32) -> bool;
        }
        // kCGEventSourceStateCombinedSessionState = 0, kCGMouseButtonLeft = 0
        unsafe { CGEventSourceButtonState(0, 0) }
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Links (aba do Safari, link de uma página) não chegam como arquivo:
/// lemos o texto/URL direto da área de arrasto do macOS.
#[cfg(target_os = "macos")]
fn drag_pasteboard_text() -> Option<String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardNameDrag, NSPasteboardTypeString, NSPasteboardTypeURL};
    unsafe {
        let pb = NSPasteboard::pasteboardWithName(NSPasteboardNameDrag);
        pb.stringForType(NSPasteboardTypeURL)
            .or_else(|| pb.stringForType(NSPasteboardTypeString))
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty())
    }
}

#[cfg(not(target_os = "macos"))]
fn drag_pasteboard_text() -> Option<String> {
    None
}

/* ───────────── ícone do app (as mesmas artes do celular) ───────────── */

/// PNGs no grid do macOS, gerados a partir dos .icon do mobile; o site usa os mesmos.
fn icon_png(name: &str) -> Option<&'static [u8]> {
    match name {
        "MindShelf" => Some(include_bytes!("../../public/app-icons/MindShelf.png")),
        "Cosmos" => Some(include_bytes!("../../public/app-icons/Cosmos.png")),
        "Emblema" => Some(include_bytes!("../../public/app-icons/Emblema.png")),
        _ => None,
    }
}

/// Troca o ícone: janela/barra de tarefas (Windows, Linux) e Dock + Finder (macOS).
/// O principal ("MindShelf") volta ao ícone do pacote, com o vidro do macOS.
#[tauri::command]
fn set_app_icon(app: AppHandle, name: String) -> Result<(), String> {
    let png = icon_png(&name).ok_or_else(|| format!("ícone desconhecido: {name}"))?;
    if let Some(window) = app.get_webview_window("main") {
        window.set_icon(Image::from_bytes(png).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let custom = (name != "MindShelf").then_some(png);
        app.run_on_main_thread(move || macos_icon(custom)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_icon(png: Option<&'static [u8]>) {
    use objc2::{rc::Retained, AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage, NSWorkspace, NSWorkspaceIconCreationOptions};
    use objc2_foundation::{NSData, NSString};

    let Some(mtm) = MainThreadMarker::new() else { return };
    let image: Option<Retained<NSImage>> = png.and_then(|b| NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(b)));
    // Dock, enquanto o app está aberto
    unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(image.as_deref()) };
    // Finder e Dock com o app fechado: ícone próprio no pacote .app (não existe em `tauri dev`)
    let bundle = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.ancestors().find(|p| p.extension().is_some_and(|e| e == "app")).map(Path::to_path_buf));
    if let Some(bundle) = bundle {
        let path = NSString::from_str(&bundle.to_string_lossy());
        NSWorkspace::sharedWorkspace().setIcon_forFile_options(image.as_deref(), &path, NSWorkspaceIconCreationOptions::empty());
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir MyndShelf", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("MyndShelf — solte coisas aqui")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = event {
                let _ = toggle_dropzone(tray.app_handle(), &rect);
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Dropped::default())
        .manage(DropzoneState::default())
        .setup(|app| {
            build_tray(app)?;
            dropzone_window(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                if paths.is_empty() {
                    // não é arquivo: provavelmente um link ou texto
                    if let Some(text) = drag_pasteboard_text() {
                        let _ = window.emit_to(EventTarget::webview_window(window.label()), "drop-text", text);
                    }
                } else if let Ok(mut set) = window.state::<Dropped>().0.lock() {
                    set.extend(paths.iter().cloned());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![fetch_html, resolve_url, path_info, read_file, open_path, hide_dropzone, mouse_pressed, set_app_icon])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o MyndShelf");
}
