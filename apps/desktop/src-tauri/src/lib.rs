use std::time::Duration;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![fetch_html, resolve_url])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o MyndShelf");
}
