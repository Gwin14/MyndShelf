//! macOS: o Finder mostra a Estante pela extensão File Provider (`macos/MyndShelfDrive`,
//! embutida no app em `Contents/PlugIns`). Aqui o app só entrega endereço e token
//! à extensão (pela pasta do App Group) e registra o domínio "MyndShelf".

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_file_provider::{NSFileProviderDomain, NSFileProviderManager, NSFileProviderWorkingSetContainerItemIdentifier};
use objc2_foundation::{NSError, NSFileManager, NSString};

use crate::Config;

const DOMAIN: &str = "myndshelf";

/// Enquanto o app está aberto, pede ao Finder que pergunte ao servidor o que mudou.
static POLLING: AtomicBool = AtomicBool::new(false);

fn signal() {
    if let Some(m) = unsafe { NSFileProviderManager::managerForDomain(&domain()) } {
        let _ = wait(|b| unsafe { m.signalEnumeratorForContainerItemIdentifier_completionHandler(NSFileProviderWorkingSetContainerItemIdentifier, b) });
    }
}

/// O mesmo App Group dos entitlements (veja `scripts/build-drive-appex.mjs`).
fn app_group() -> Result<String, String> {
    match option_env!("MYNDSHELF_APPLE_TEAM_ID") {
        Some(team) if !team.is_empty() => Ok(format!("{team}.app.myndshelf.desktop")),
        _ => Err("Este build não tem o drive: gere o app com MYNDSHELF_APPLE_TEAM_ID definido.".into()),
    }
}

/// A pasta do App Group vem do sistema, não de um caminho montado à mão: desde o macOS 15,
/// só `containerURLForSecurityApplicationGroupIdentifier` confere a autorização do grupo
/// (o provisioning profile); escrever direto em `~/Library/Group Containers` cai na proteção
/// de dados de outros apps e o kernel nega ("Operation not permitted").
fn config_path() -> Result<PathBuf, String> {
    let group = app_group()?;
    let url = NSFileManager::defaultManager()
        .containerURLForSecurityApplicationGroupIdentifier(&NSString::from_str(&group))
        .ok_or_else(|| format!("o macOS não liberou o App Group {group} (falta o provisioning profile?)"))?;
    let dir = url.path().ok_or("pasta do App Group sem caminho")?;
    Ok(PathBuf::from(dir.to_string()).join("drive.json"))
}

fn domain() -> Retained<NSFileProviderDomain> {
    unsafe { NSFileProviderDomain::initWithIdentifier_displayName(NSFileProviderDomain::alloc(), &NSString::from_str(DOMAIN), &NSString::from_str("MyndShelf")) }
}

/// Espera a resposta do sistema (o bloco roda em outra thread).
fn wait(run: impl FnOnce(&block2::DynBlock<dyn Fn(*mut NSError)>)) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Option<String>>();
    let block = RcBlock::new(move |err: *mut NSError| {
        let msg = if err.is_null() { None } else { Some(unsafe { (*err).localizedDescription().to_string() }) };
        let _ = tx.send(msg);
    });
    run(&block);
    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(None) => Ok(()),
        Ok(Some(e)) => Err(e),
        Err(_) => Err("o macOS não respondeu".into()),
    }
}

pub fn register(cfg: &Config) -> Result<(), String> {
    let path = config_path()?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::to_vec(cfg).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    let d = domain();
    wait(|b| unsafe { NSFileProviderManager::addDomain_completionHandler(&d, b) }).map_err(|e| format!("o macOS não aceitou o drive: {e}"))?;
    // a extensão relê a configuração e a lista
    signal();
    if !POLLING.swap(true, Ordering::SeqCst) {
        std::thread::spawn(|| {
            while POLLING.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_secs(60));
                if POLLING.load(Ordering::SeqCst) {
                    signal();
                }
            }
        });
    }
    Ok(())
}

pub fn unregister() -> Result<(), String> {
    POLLING.store(false, Ordering::SeqCst);
    let d = domain();
    let res = wait(|b| unsafe { NSFileProviderManager::removeDomain_completionHandler(&d, b) });
    if let Ok(p) = config_path() {
        let _ = fs::remove_file(p);
    }
    res
}
