//! Cliente de `/api/drive/*` (contrato em `packages/sync/src/protocol.ts`).

use std::fs;
use std::io::{self, Read, Write};
use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::{mime_of, Body, Config, Http, Request};

/// Id da raiz do drive (arquivos sem estante).
pub const ROOT: &str = "root";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveItem {
    pub id: String,
    pub parent_id: String,
    /// "folder" ou "file"
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub mime: Option<String>,
    #[serde(default)]
    pub created_at: Option<f64>,
    pub version: String,
    #[serde(default)]
    pub content_version: Option<u64>,
    #[serde(default)]
    pub deleted: Option<bool>,
}

impl DriveItem {
    pub fn is_dir(&self) -> bool {
        self.kind == "folder"
    }
    pub fn is_deleted(&self) -> bool {
        self.deleted == Some(true)
    }
    /// ms desde 1970
    pub fn created_ms(&self) -> u64 {
        self.created_at.unwrap_or(0.0).max(0.0) as u64
    }
}

#[derive(Debug, Deserialize)]
pub struct ListResponse {
    pub items: Vec<DriveItem>,
    pub cursor: u64,
}

#[derive(Debug, Deserialize)]
pub struct ChangesResponse {
    pub items: Vec<DriveItem>,
    pub cursor: u64,
    #[serde(default)]
    pub full: bool,
}

#[derive(Clone)]
pub struct Api {
    http: Arc<dyn Http>,
    cfg: Config,
}

/// Codifica um pedaço de URL (ids e nomes).
fn enc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

impl Api {
    pub fn new(http: Arc<dyn Http>, mut cfg: Config) -> Self {
        cfg.url = cfg.url.trim_end_matches('/').to_string();
        Api { http, cfg }
    }

    fn send(&self, method: &'static str, path: &str, mut headers: Vec<(String, String)>, body: Body) -> Result<Box<dyn Read + Send>, String> {
        headers.push(("authorization".into(), format!("Bearer {}", self.cfg.token)));
        let res = self.http.send(Request { method, url: format!("{}{}", self.cfg.url, path), headers, body })?;
        match res.status {
            200..=299 => Ok(res.body),
            401 => Err("O servidor recusou o token.".into()),
            404 if path.starts_with("/api/drive/items") && method == "GET" => {
                Err("O servidor não tem o drive. Atualize o MyndShelf no servidor.".into())
            }
            s => {
                let mut msg = String::new();
                let _ = res.body.take(2000).read_to_string(&mut msg);
                Err(format!("O servidor respondeu {s} {msg}"))
            }
        }
    }

    fn json<T: for<'de> Deserialize<'de>>(&self, method: &'static str, path: &str, headers: Vec<(String, String)>, body: Body) -> Result<T, String> {
        let r = self.send(method, path, headers, body)?;
        serde_json::from_reader(r).map_err(|e| format!("resposta inválida: {e}"))
    }

    fn json_body(v: serde_json::Value) -> (Vec<(String, String)>, Body) {
        (vec![("content-type".into(), "application/json".into())], Body::Bytes(v.to_string().into_bytes()))
    }

    pub fn list(&self) -> Result<ListResponse, String> {
        self.json("GET", "/api/drive/items", vec![], Body::Empty)
    }

    pub fn changes(&self, since: u64) -> Result<ChangesResponse, String> {
        self.json("GET", &format!("/api/drive/changes?since={since}"), vec![], Body::Empty)
    }

    /// Conteúdo do arquivo, em fluxo.
    pub fn open(&self, id: &str) -> Result<Box<dyn Read + Send>, String> {
        self.send("GET", &format!("/api/files/{}", enc(id)), vec![], Body::Empty)
    }

    /// Baixa para `dest` (escrita atômica: arquivo temporário + rename).
    pub fn download(&self, id: &str, dest: &Path) -> Result<(), String> {
        let mut r = self.open(id)?;
        if let Some(dir) = dest.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = dest.with_extension("download");
        let res = (|| -> io::Result<()> {
            let mut f = fs::File::create(&tmp)?;
            io::copy(&mut r, &mut f)?;
            f.flush()?;
            fs::rename(&tmp, dest)
        })();
        if res.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        res.map_err(|e| e.to_string())
    }

    /// Arquivo novo numa pasta (estante ou raiz): vira uma criação.
    pub fn create_file(&self, parent: &str, name: &str, src: &Path) -> Result<DriveItem, String> {
        let headers = vec![("x-file-name".into(), enc(name)), ("content-type".into(), mime_of(name).into())];
        self.json("POST", &format!("/api/drive/files?parent={}", enc(parent)), headers, Body::File(src.to_path_buf()))
    }

    /// Troca o conteúdo de um arquivo que já existe.
    pub fn replace_file(&self, id: &str, name: &str, src: &Path) -> Result<DriveItem, String> {
        let headers = vec![("content-type".into(), mime_of(name).into())];
        self.json("PUT", &format!("/api/drive/files/{}", enc(id)), headers, Body::File(src.to_path_buf()))
    }

    /// Estante nova (só na raiz).
    pub fn mkdir(&self, name: &str) -> Result<DriveItem, String> {
        let (h, b) = Self::json_body(serde_json::json!({ "name": name }));
        self.json("POST", "/api/drive/folders", h, b)
    }

    pub fn patch(&self, id: &str, name: Option<&str>, parent: Option<&str>) -> Result<DriveItem, String> {
        let mut v = serde_json::Map::new();
        if let Some(n) = name {
            v.insert("name".into(), n.into());
        }
        if let Some(p) = parent {
            v.insert("parentId".into(), p.into());
        }
        let (h, b) = Self::json_body(serde_json::Value::Object(v));
        self.json("PATCH", &format!("/api/drive/items/{}", enc(id)), h, b)
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.send("DELETE", &format!("/api/drive/items/{}", enc(id)), vec![], Body::Empty).map(|_| ())
    }
}
