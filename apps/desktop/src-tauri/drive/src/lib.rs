//! MyndShelf Drive: a Estante como uma pasta do sistema.
//!
//! - macOS: File Provider (a extensão Swift em `macos/`); aqui só o registro do domínio
//! - Windows: Cloud Files API (a mesma do OneDrive), rodando dentro do app
//! - Linux: FUSE em `~/MyndShelf`, rodando dentro do app
//!
//! Todos falam com `/api/drive/*` do servidor (veja `apps/server/src/drive.ts`).

pub mod api;
pub mod tree;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;

pub use api::{Api, DriveItem, ROOT};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Config {
    pub url: String,
    pub token: String,
}

/// Corpo de uma requisição.
pub enum Body {
    Empty,
    Bytes(Vec<u8>),
    /// enviado direto do disco, sem carregar na memória
    File(PathBuf),
}

pub struct Request {
    pub method: &'static str,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Body,
}

pub struct Response {
    pub status: u16,
    pub body: Box<dyn Read + Send>,
}

/// O app entrega o cliente HTTP (bloqueante).
pub trait Http: Send + Sync + 'static {
    fn send(&self, req: Request) -> Result<Response, String>;
}

pub struct Options {
    pub http: Arc<dyn Http>,
    pub config: Config,
    /// cache dos arquivos baixados (Linux) e estado
    pub cache_dir: PathBuf,
    /// pasta pessoal: o drive fica em `~/MyndShelf` (Windows e Linux)
    pub home: PathBuf,
    /// executável do app, para o ícone no Explorer
    pub exe: Option<PathBuf>,
}

/// O drive ligado. Ao soltar (drop), desliga o que roda dentro do app.
pub struct Drive {
    #[cfg(target_os = "linux")]
    _inner: linux::Mount,
    #[cfg(windows)]
    _inner: windows::Provider,
    location: Option<PathBuf>,
}

impl Drive {
    /// Onde o drive aparece no disco (None no macOS, onde o Finder decide).
    pub fn location(&self) -> Option<PathBuf> {
        self.location.clone()
    }
}

/// Este sistema tem drive?
pub const SUPPORTED: bool = cfg!(any(target_os = "linux", target_os = "macos", windows));

/// Liga o drive. No Windows e no Linux ele vive enquanto o `Drive` existir;
/// no macOS o sistema cuida da extensão e isto só registra o domínio.
pub fn start(o: Options) -> Result<Drive, String> {
    // falha cedo com uma mensagem clara se o servidor não tem a API do drive
    let api = Api::new(o.http.clone(), o.config.clone());
    api.list()?;

    #[cfg(target_os = "linux")]
    {
        let location = o.home.join("MyndShelf");
        let inner = linux::Mount::start(api, &location, &o.cache_dir)?;
        return Ok(Drive { _inner: inner, location: Some(location) });
    }
    #[cfg(windows)]
    {
        let location = o.home.join("MyndShelf");
        let inner = windows::Provider::start(api, &location, o.exe.as_deref())?;
        return Ok(Drive { _inner: inner, location: Some(location) });
    }
    #[cfg(target_os = "macos")]
    {
        let _ = (&o.cache_dir, &o.home, &o.exe);
        macos::register(&o.config)?;
        return Ok(Drive { location: None });
    }
    #[allow(unreachable_code)]
    {
        let _ = o;
        Err("Este sistema ainda não tem drive.".into())
    }
}

/// Desliga de vez: tira a pasta da barra lateral e apaga o que ficou registrado.
/// Os arquivos continuam no servidor.
pub fn remove(home: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    return linux::forget(&home.join("MyndShelf"));
    #[cfg(windows)]
    return windows::unregister(&home.join("MyndShelf"));
    #[cfg(target_os = "macos")]
    {
        let _ = home;
        return macos::unregister();
    }
    #[allow(unreachable_code)]
    {
        let _ = home;
        Ok(())
    }
}

/// Tipo do arquivo pela extensão (o servidor usa para escolher a forma na Estante).
pub fn mime_of(name: &str) -> &'static str {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "ogg" | "opus" => "audio/ogg",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "html" | "htm" => "text/html",
        "json" => "application/json",
        "epub" => "application/epub+zip",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

/// Arquivos temporários de editores e do sistema: ficam só no disco, nunca sobem.
pub fn is_temp_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.starts_with('.')
        || n.starts_with("~$")
        || n.starts_with(".~lock")
        || n.ends_with('~')
        || n.ends_with(".tmp")
        || n.ends_with(".temp")
        || n.ends_with(".swp")
        || n.ends_with(".swx")
        || n.ends_with(".part")
        || n.ends_with(".crdownload")
        || n.ends_with(".partial")
        || n == "desktop.ini"
        || n == "thumbs.db"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_names() {
        assert!(is_temp_name(".goutputstream-ABC"));
        assert!(is_temp_name("~$Relatorio.docx"));
        assert!(is_temp_name("foto.jpg.part"));
        assert!(!is_temp_name("Relatório.docx"));
    }
}
