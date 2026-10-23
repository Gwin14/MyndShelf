use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};

use tauri::{ipc::Response, Manager, State};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Dropped::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                if let Ok(mut set) = window.state::<Dropped>().0.lock() {
                    set.extend(paths.iter().cloned());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![fetch_html, resolve_url, path_info, read_file, open_path])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o MyndShelf");
}
