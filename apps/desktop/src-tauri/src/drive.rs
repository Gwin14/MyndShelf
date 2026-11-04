//! Liga o crate `myndshelf-drive` ao app: comandos, cliente HTTP e religar ao abrir.

use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use myndshelf_drive::{Body, Config, Drive, Http, Options, Request, Response};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Cliente bloqueante: o drive roda em threads próprias (FUSE, Cloud Files).
struct Reqwest(reqwest::blocking::Client);

impl Http for Reqwest {
    fn send(&self, req: Request) -> Result<Response, String> {
        let method = reqwest::Method::from_bytes(req.method.as_bytes()).map_err(|e| e.to_string())?;
        let mut r = self.0.request(method, &req.url);
        for (k, v) in &req.headers {
            r = r.header(k, v);
        }
        r = match req.body {
            Body::Empty => r,
            Body::Bytes(b) => r.body(b),
            Body::File(p) => r.body(fs::File::open(p).map_err(|e| e.to_string())?),
        };
        let res = r.send().map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "Não deu para falar com o servidor (o Tailscale está ligado?).".to_string()
            } else {
                e.to_string()
            }
        })?;
        let status = res.status().as_u16();
        let body: Box<dyn Read + Send> = Box::new(res);
        Ok(Response { status, body })
    }
}

fn http() -> Result<Arc<dyn Http>, String> {
    let c = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        // arquivos grandes: sem limite total
        .timeout(None)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(Arc::new(Reqwest(c)))
}

#[derive(Default, Serialize, Deserialize)]
struct Saved {
    enabled: bool,
    url: String,
    token: String,
}

#[derive(Default)]
pub struct DriveState {
    drive: Mutex<Option<Drive>>,
    error: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveStatus {
    supported: bool,
    enabled: bool,
    running: bool,
    location: Option<String>,
    error: Option<String>,
}

fn saved_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("drive.json"))
}

fn load(app: &AppHandle) -> Saved {
    saved_path(app).and_then(|p| fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save(app: &AppHandle, s: &Saved) {
    if let Some(p) = saved_path(app) {
        if let Some(d) = p.parent() {
            let _ = fs::create_dir_all(d);
        }
        let _ = fs::write(&p, serde_json::to_vec(s).unwrap_or_default());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&p, fs::Permissions::from_mode(0o600));
        }
    }
}

fn options(app: &AppHandle, cfg: Config) -> Result<Options, String> {
    Ok(Options {
        http: http()?,
        config: cfg,
        cache_dir: app.path().app_cache_dir().map_err(|e| e.to_string())?,
        home: app.path().home_dir().map_err(|e| e.to_string())?,
        exe: std::env::current_exe().ok(),
    })
}

/// Liga (ou religa com outro endereço/token). Roda fora da thread do app.
fn start(app: &AppHandle, cfg: Config) -> Result<(), String> {
    let st = app.state::<DriveState>();
    // desliga o anterior antes de montar de novo na mesma pasta
    drop(st.drive.lock().unwrap().take());
    let res = myndshelf_drive::start(options(app, cfg)?);
    match res {
        Ok(d) => {
            *st.drive.lock().unwrap() = Some(d);
            *st.error.lock().unwrap() = None;
            Ok(())
        }
        Err(e) => {
            *st.error.lock().unwrap() = Some(e.clone());
            Err(e)
        }
    }
}

fn status(app: &AppHandle) -> DriveStatus {
    let st = app.state::<DriveState>();
    let (running, location) = {
        let drive = st.drive.lock().unwrap();
        (drive.is_some(), drive.as_ref().and_then(|d| d.location()).map(|p| p.display().to_string()))
    };
    let error = st.error.lock().unwrap().clone();
    DriveStatus { supported: myndshelf_drive::SUPPORTED, enabled: load(app).enabled, running, location, error }
}

#[tauri::command]
pub fn drive_status(app: AppHandle) -> DriveStatus {
    status(&app)
}

#[tauri::command]
pub async fn drive_enable(app: AppHandle, url: String, token: String) -> Result<DriveStatus, String> {
    let a = app.clone();
    let cfg = Config { url: url.clone(), token: token.clone() };
    tauri::async_runtime::spawn_blocking(move || start(&a, cfg)).await.map_err(|e| e.to_string())??;
    save(&app, &Saved { enabled: true, url, token });
    Ok(status(&app))
}

#[tauri::command]
pub async fn drive_disable(app: AppHandle) -> Result<DriveStatus, String> {
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let st = a.state::<DriveState>();
        drop(st.drive.lock().unwrap().take());
        *st.error.lock().unwrap() = None;
        if let Ok(home) = a.path().home_dir() {
            let _ = myndshelf_drive::remove(&home);
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    save(&app, &Saved::default());
    Ok(status(&app))
}

/// Ao abrir o app: religa o drive se estava ligado.
pub fn resume(app: &AppHandle) {
    let saved = load(app);
    if !saved.enabled || !myndshelf_drive::SUPPORTED {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // o servidor pode estar fora (Tailscale desligado): tenta de novo de tempos em tempos
        for wait in [0u64, 10, 30, 60, 120, 300] {
            std::thread::sleep(Duration::from_secs(wait));
            if !load(&app).enabled || app.state::<DriveState>().drive.lock().unwrap().is_some() {
                return;
            }
            match start(&app, Config { url: saved.url.clone(), token: saved.token.clone() }) {
                Ok(()) => return,
                Err(e) => eprintln!("[drive] {e}"),
            }
        }
    });
}
