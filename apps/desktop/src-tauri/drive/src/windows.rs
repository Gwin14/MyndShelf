//! Windows: Cloud Files API, a mesma do OneDrive. A pasta `%USERPROFILE%\MyndShelf`
//! aparece no painel do Explorer com ícone de nuvem; cada arquivo é um placeholder
//! que baixa ao abrir. O que o usuário cria, edita, renomeia ou apaga ali sobe
//! para o servidor.
//!
//! Tudo roda dentro do app (como o Google Drive): o app precisa estar aberto,
//! nem que seja só na bandeja.

use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::fs;
use std::io::Read;
use std::os::windows::ffi::OsStringExt;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use notify::{RecursiveMode, Watcher};
use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Security::Cryptography::{BinaryStringEncoding, CryptographicBuffer};
use windows::Storage::Provider::*;
use windows::Storage::StorageFolder;
use windows::Win32::Foundation::{LocalFree, HANDLE, HLOCAL, NTSTATUS};
use windows::Win32::Security::Authorization::ConvertSidToStringSidW;
use windows::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
use windows::Win32::Storage::CloudFilters::*;
use windows::Win32::Storage::FileSystem::FILE_BASIC_INFO;
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

use crate::api::{Api, DriveItem, ROOT};
use crate::is_temp_name;
use crate::tree::Tree;

const STATUS_SUCCESS: NTSTATUS = NTSTATUS(0);
const STATUS_UNSUCCESSFUL: NTSTATUS = NTSTATUS(0xC000_0001u32 as i32);
const STATUS_ACCESS_DENIED: NTSTATUS = NTSTATUS(0xC000_0022u32 as i32);
const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
const FILE_ATTRIBUTE_NORMAL: u32 = 0x80;
const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
const FILE_READ_ATTRIBUTES: u32 = 0x80;
const FILE_WRITE_ATTRIBUTES: u32 = 0x100;
const GENERIC_READ: u32 = 0x8000_0000;
const SHARE_ALL: u32 = 0x1 | 0x2 | 0x4;
/// múltiplo de 4 KiB, como a API pede
const CHUNK: usize = 1 << 20;
const REFRESH: Duration = Duration::from_secs(30);
const SETTLE: Duration = Duration::from_secs(2);
const PROVIDER: &str = "MyndShelf";

struct Shared {
    api: Api,
    tree: Mutex<Tree>,
    root: PathBuf,
    /// caminho da raiz sem a letra do drive, em minúsculas ("\users\ana\myndshelf")
    root_rel: String,
    key: Mutex<i64>,
    /// ids que nós mesmos estamos movendo/apagando: os avisos do sistema não voltam ao servidor
    ours: Mutex<HashSet<String>>,
    stop: AtomicBool,
}

static SHARED: OnceLock<Mutex<Option<Arc<Shared>>>> = OnceLock::new();

fn shared() -> Option<Arc<Shared>> {
    SHARED.get_or_init(|| Mutex::new(None)).lock().unwrap().clone()
}

pub struct Provider {
    sh: Arc<Shared>,
    _watcher: notify::RecommendedWatcher,
}

impl Drop for Provider {
    fn drop(&mut self) {
        self.sh.stop.store(true, Ordering::SeqCst);
        let key = *self.sh.key.lock().unwrap();
        unsafe {
            let _ = CfDisconnectSyncRoot(CF_CONNECTION_KEY(key));
        }
        *SHARED.get_or_init(|| Mutex::new(None)).lock().unwrap() = None;
    }
}

impl Provider {
    pub fn start(api: Api, root: &Path, exe: Option<&Path>) -> Result<Provider, String> {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        fs::create_dir_all(root).map_err(|e| format!("não deu para criar {}: {e}", root.display()))?;
        register(root, exe)?;

        let root_str = root.to_string_lossy().to_string();
        let root_rel = root_str.get(2..).unwrap_or("").replace('/', "\\").trim_end_matches('\\').to_lowercase();
        let tree = Tree::from_list(api.list()?);
        let sh = Arc::new(Shared {
            api,
            tree: Mutex::new(tree),
            root: root.to_path_buf(),
            root_rel,
            key: Mutex::new(0),
            ours: Mutex::new(HashSet::new()),
            stop: AtomicBool::new(false),
        });
        *SHARED.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(sh.clone());

        let callbacks = [
            CF_CALLBACK_REGISTRATION { Type: CF_CALLBACK_TYPE_FETCH_DATA, Callback: Some(on_fetch_data) },
            CF_CALLBACK_REGISTRATION { Type: CF_CALLBACK_TYPE_NOTIFY_DELETE, Callback: Some(on_delete) },
            CF_CALLBACK_REGISTRATION { Type: CF_CALLBACK_TYPE_NOTIFY_RENAME, Callback: Some(on_rename) },
            CF_CALLBACK_REGISTRATION { Type: CF_CALLBACK_TYPE_NONE, Callback: None },
        ];
        let key = unsafe { CfConnectSyncRoot(&HSTRING::from(root.as_os_str()), callbacks.as_ptr(), None, CF_CONNECT_FLAG_REQUIRE_FULL_FILE_PATH) }
            .map_err(|e| format!("não deu para conectar a pasta do drive: {e}"))?;
        *sh.key.lock().unwrap() = key.0;

        // arquivos novos/editados no Explorer chegam por aqui
        let (tx, rx) = mpsc::channel::<PathBuf>();
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(ev) = res {
                for p in ev.paths {
                    let _ = tx.send(p);
                }
            }
        })
        .map_err(|e| e.to_string())?;
        watcher.watch(root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;

        let pending = reconcile(&sh, &HashSet::new());
        spawn_uploader(sh.clone(), rx, pending);
        spawn_refresh(sh.clone());
        Ok(Provider { sh, _watcher: watcher })
    }
}

/* ─────────────────────────── registro ─────────────────────────── */

fn user_sid() -> Result<String, String> {
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 256];
        let mut len = 0u32;
        GetTokenInformation(token, TokenUser, Some(buf.as_mut_ptr() as *mut c_void), buf.len() as u32, &mut len).map_err(|e| e.to_string())?;
        let user = &*(buf.as_ptr() as *const TOKEN_USER);
        let mut s = PWSTR::null();
        ConvertSidToStringSidW(user.User.Sid, &mut s).map_err(|e| e.to_string())?;
        let out = s.to_string().map_err(|e| e.to_string())?;
        let _ = LocalFree(HLOCAL(s.0 as *mut c_void));
        Ok(out)
    }
}

fn sync_root_id() -> Result<String, String> {
    Ok(format!("{PROVIDER}!{}!default", user_sid()?))
}

/// Registra a pasta como sync root. O registro do WinRT põe a pasta no painel
/// do Explorer; se o Windows recusar (versões antigas, app sem identidade),
/// cai para o registro do Win32, que funciona igual mas sem o atalho no painel.
fn register(root: &Path, exe: Option<&Path>) -> Result<(), String> {
    let id = sync_root_id()?;
    let winrt = (|| -> windows::core::Result<()> {
        if StorageProviderSyncRootManager::GetSyncRootInformationForId(&HSTRING::from(&id)).is_ok() {
            return Ok(());
        }
        let info = StorageProviderSyncRootInfo::new()?;
        info.SetId(&HSTRING::from(&id))?;
        let folder = StorageFolder::GetFolderFromPathAsync(&HSTRING::from(root.as_os_str()))?.get()?;
        info.SetPath(&windows::core::Interface::cast::<windows::Storage::IStorageFolder>(&folder)?)?;
        info.SetDisplayNameResource(&HSTRING::from(PROVIDER))?;
        let icon = exe.map(|e| format!("{},0", e.display())).unwrap_or_else(|| "%SystemRoot%\\system32\\imageres.dll,-1043".into());
        info.SetIconResource(&HSTRING::from(icon))?;
        info.SetHydrationPolicy(StorageProviderHydrationPolicy::Full)?;
        info.SetHydrationPolicyModifier(StorageProviderHydrationPolicyModifier::None)?;
        info.SetPopulationPolicy(StorageProviderPopulationPolicy::AlwaysFull)?;
        info.SetInSyncPolicy(StorageProviderInSyncPolicy::Default)?;
        info.SetHardlinkPolicy(StorageProviderHardlinkPolicy::None)?;
        info.SetShowSiblingsAsGroup(false)?;
        info.SetVersion(&HSTRING::from(env!("CARGO_PKG_VERSION")))?;
        info.SetContext(&CryptographicBuffer::ConvertStringToBinary(&HSTRING::from(&id), BinaryStringEncoding::Utf8)?)?;
        StorageProviderSyncRootManager::Register(&info)
    })();
    if let Err(e) = winrt {
        eprintln!("[drive] registro WinRT falhou ({e}); usando o do Win32");
        let name = HSTRING::from(PROVIDER);
        let version = HSTRING::from(env!("CARGO_PKG_VERSION"));
        let reg = CF_SYNC_REGISTRATION {
            StructSize: std::mem::size_of::<CF_SYNC_REGISTRATION>() as u32,
            ProviderName: PCWSTR(name.as_ptr()),
            ProviderVersion: PCWSTR(version.as_ptr()),
            ..Default::default()
        };
        let policies = CF_SYNC_POLICIES {
            StructSize: std::mem::size_of::<CF_SYNC_POLICIES>() as u32,
            Hydration: CF_HYDRATION_POLICY { Primary: CF_HYDRATION_POLICY_FULL, Modifier: Default::default() },
            Population: CF_POPULATION_POLICY { Primary: CF_POPULATION_POLICY_ALWAYS_FULL, Modifier: Default::default() },
            InSync: CF_INSYNC_POLICY_TRACK_ALL,
            ..Default::default()
        };
        unsafe { CfRegisterSyncRoot(&HSTRING::from(root.as_os_str()), &reg, &policies, CF_REGISTER_FLAG_UPDATE) }
            .map_err(|e| format!("o Windows não aceitou a pasta do drive: {e}"))?;
    }
    Ok(())
}

pub fn unregister(root: &Path) -> Result<(), String> {
    unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
        let _ = CfUnregisterSyncRoot(&HSTRING::from(root.as_os_str()));
    }
    if let Ok(id) = sync_root_id() {
        let _ = StorageProviderSyncRootManager::Unregister(&HSTRING::from(id));
    }
    Ok(())
}

/* ─────────────────────────── placeholders ─────────────────────────── */

fn filetime(ms: u64) -> i64 {
    (ms as i64) * 10_000 + 116_444_736_000_000_000
}

fn metadata(i: &DriveItem) -> CF_FS_METADATA {
    let t = filetime(i.created_ms());
    CF_FS_METADATA {
        BasicInfo: FILE_BASIC_INFO {
            CreationTime: t,
            LastAccessTime: t,
            LastWriteTime: t,
            ChangeTime: t,
            FileAttributes: if i.is_dir() { FILE_ATTRIBUTE_DIRECTORY } else { FILE_ATTRIBUTE_NORMAL },
        },
        FileSize: if i.is_dir() { 0 } else { i.size.unwrap_or(0) as i64 },
    }
}

fn create_placeholder(dir: &Path, i: &DriveItem) -> Result<(), String> {
    let name = HSTRING::from(i.name.as_str());
    let mut flags = CF_PLACEHOLDER_CREATE_FLAG_MARK_IN_SYNC;
    if i.is_dir() {
        // a pasta já nasce com tudo dentro: nós mesmos criamos os filhos
        flags |= CF_PLACEHOLDER_CREATE_FLAG_DISABLE_ON_DEMAND_POPULATION;
    }
    let mut info = [CF_PLACEHOLDER_CREATE_INFO {
        RelativeFileName: PCWSTR(name.as_ptr()),
        FsMetadata: metadata(i),
        FileIdentity: i.id.as_ptr() as *const c_void,
        FileIdentityLength: i.id.len() as u32,
        Flags: flags,
        ..Default::default()
    }];
    unsafe { CfCreatePlaceholders(&HSTRING::from(dir.as_os_str()), &mut info, CF_CREATE_FLAG_NONE, None) }.map_err(|e| e.to_string())
}

fn open(path: &Path, write: bool) -> std::io::Result<fs::File> {
    let mut o = fs::OpenOptions::new();
    o.access_mode(if write { GENERIC_READ | FILE_WRITE_ATTRIBUTES | 0x2 /* FILE_WRITE_DATA */ } else { FILE_READ_ATTRIBUTES })
        .share_mode(SHARE_ALL)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS);
    o.open(path)
}

fn handle(f: &fs::File) -> HANDLE {
    HANDLE(f.as_raw_handle())
}

/// (id, em dia com o servidor) — None quando não é placeholder (arquivo novo do usuário).
fn placeholder(path: &Path) -> Option<(String, bool)> {
    let f = open(path, false).ok()?;
    let mut buf = vec![0u8; 1024];
    let mut len = 0u32;
    unsafe { CfGetPlaceholderInfo(handle(&f), CF_PLACEHOLDER_INFO_BASIC, buf.as_mut_ptr() as *mut c_void, buf.len() as u32, Some(&mut len)) }.ok()?;
    let info = unsafe { &*(buf.as_ptr() as *const CF_PLACEHOLDER_BASIC_INFO) };
    let start = std::mem::offset_of!(CF_PLACEHOLDER_BASIC_INFO, FileIdentity);
    let end = (start + info.FileIdentityLength as usize).min(buf.len());
    let id = String::from_utf8_lossy(&buf[start..end]).to_string();
    Some((id, info.InSyncState == CF_IN_SYNC_STATE_IN_SYNC))
}

fn convert(path: &Path, id: &str) -> Result<(), String> {
    let f = open(path, true).map_err(|e| e.to_string())?;
    unsafe { CfConvertToPlaceholder(handle(&f), Some(id.as_ptr() as *const c_void), id.len() as u32, CF_CONVERT_FLAG_MARK_IN_SYNC, None, None) }
        .map_err(|e| e.to_string())
}

fn mark_in_sync(path: &Path) -> Result<(), String> {
    let f = open(path, true).map_err(|e| e.to_string())?;
    unsafe { CfSetInSyncState(handle(&f), CF_IN_SYNC_STATE_IN_SYNC, CF_SET_IN_SYNC_FLAG_NONE, None) }.map_err(|e| e.to_string())
}

/// Conteúdo mudou no servidor: novo tamanho e volta a ser só nuvem (baixa de novo ao abrir).
fn refresh_content(path: &Path, i: &DriveItem) -> Result<(), String> {
    let f = open(path, true).map_err(|e| e.to_string())?;
    let meta = metadata(i);
    unsafe {
        CfUpdatePlaceholder(
            handle(&f),
            Some(&meta),
            Some(i.id.as_ptr() as *const c_void),
            i.id.len() as u32,
            Some(&[CF_FILE_RANGE { StartingOffset: 0, Length: -1 }]),
            CF_UPDATE_FLAG_DEHYDRATE | CF_UPDATE_FLAG_MARK_IN_SYNC,
            None,
            None,
        )
    }
    .map_err(|e| e.to_string())
}

/* ─────────────────────────── reconciliação ─────────────────────────── */

fn path_of(sh: &Shared, tree: &Tree, i: &DriveItem) -> PathBuf {
    let mut p = sh.root.clone();
    for c in tree.rel_path(i) {
        p.push(c);
    }
    p
}

/// Deixa a pasta igual ao servidor: cria o que falta, move o que mudou de nome/pasta,
/// apaga o que saiu. Devolve os arquivos do usuário que ainda não subiram.
fn reconcile(sh: &Arc<Shared>, content_changed: &HashSet<String>) -> Vec<PathBuf> {
    let tree = sh.tree.lock().unwrap();
    let mut local: HashMap<String, PathBuf> = HashMap::new();
    let mut fresh: Vec<PathBuf> = Vec::new();

    let scan = |dir: &Path, local: &mut HashMap<String, PathBuf>, fresh: &mut Vec<PathBuf>| {
        for e in fs::read_dir(dir).into_iter().flatten().flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if is_temp_name(&name) {
                continue;
            }
            match placeholder(&p) {
                Some((id, _)) => {
                    local.insert(id, p);
                }
                None => fresh.push(p),
            }
        }
    };
    scan(&sh.root, &mut local, &mut fresh);
    let dirs: Vec<PathBuf> = local.iter().filter(|(id, _)| tree.items.get(*id).is_some_and(|i| i.is_dir())).map(|(_, p)| p.clone()).collect();
    for d in dirs {
        scan(&d, &mut local, &mut fresh);
    }

    let mut ours = sh.ours.lock().unwrap();
    let mut items: Vec<&DriveItem> = tree.items.values().collect();
    items.sort_by_key(|i| !i.is_dir());
    for i in items {
        let want = path_of(sh, &tree, i);
        match local.remove(&i.id) {
            Some(have) if have != want => {
                ours.insert(i.id.clone());
                if let Err(e) = fs::rename(&have, &want) {
                    eprintln!("[drive] não moveu {}: {e}", have.display());
                }
                if content_changed.contains(&i.id) {
                    let _ = refresh_content(&want, i);
                }
            }
            Some(have) => {
                if content_changed.contains(&i.id) {
                    if let Err(e) = refresh_content(&have, i) {
                        eprintln!("[drive] não atualizou {}: {e}", have.display());
                    }
                }
            }
            None if want.exists() => {} // arquivo do usuário com o mesmo nome: deixa como está
            None => {
                if let Err(e) = create_placeholder(want.parent().unwrap_or(&sh.root), i) {
                    eprintln!("[drive] não criou {}: {e}", want.display());
                }
            }
        }
    }
    // saiu do servidor
    let mut gone: Vec<(String, PathBuf)> = local.into_iter().collect();
    gone.sort_by_key(|(_, p)| std::cmp::Reverse(p.components().count()));
    for (id, p) in gone {
        ours.insert(id);
        let _ = if p.is_dir() { fs::remove_dir(&p) } else { fs::remove_file(&p) };
    }
    fresh
}

fn spawn_refresh(sh: Arc<Shared>) {
    thread::spawn(move || loop {
        let until = Instant::now() + REFRESH;
        while Instant::now() < until {
            if sh.stop.load(Ordering::SeqCst) {
                return;
            }
            thread::sleep(Duration::from_secs(1));
        }
        let cursor = sh.tree.lock().unwrap().cursor;
        let Ok(c) = sh.api.changes(cursor) else { continue };
        let diff = sh.tree.lock().unwrap().apply(c);
        if diff.is_empty() {
            continue;
        }
        let content: HashSet<String> = diff.changed.iter().filter(|(a, b)| a.content_version != b.content_version).map(|(_, b)| b.id.clone()).collect();
        reconcile(&sh, &content);
    });
}

/* ─────────────────────────── envio ─────────────────────────── */

/// Arquivos novos ou editados no Explorer: espera assentar e sobe.
fn spawn_uploader(sh: Arc<Shared>, rx: mpsc::Receiver<PathBuf>, initial: Vec<PathBuf>) {
    thread::spawn(move || {
        let mut queue: HashMap<PathBuf, Instant> = initial.into_iter().map(|p| (p, Instant::now())).collect();
        loop {
            if sh.stop.load(Ordering::SeqCst) {
                return;
            }
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(p) => {
                    queue.insert(p, Instant::now());
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
                Err(_) => {}
            }
            let ready: Vec<PathBuf> = queue.iter().filter(|(_, t)| t.elapsed() >= SETTLE).map(|(p, _)| p.clone()).collect();
            for p in ready {
                queue.remove(&p);
                if let Err(retry) = upload(&sh, &p) {
                    if retry {
                        queue.insert(p, Instant::now() + SETTLE);
                    }
                }
            }
        }
    });
}

/// Err(true) = tentar de novo depois (arquivo em uso, pasta ainda não subiu).
fn upload(sh: &Arc<Shared>, path: &Path) -> Result<(), bool> {
    let Ok(rel) = path.strip_prefix(&sh.root) else { return Ok(()) };
    let comps: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect();
    if comps.is_empty() || comps.len() > 2 || comps.iter().any(|c| is_temp_name(c)) {
        return Ok(());
    }
    let Ok(meta) = fs::metadata(path) else { return Ok(()) };
    let name = comps.last().unwrap().clone();

    if meta.is_dir() {
        if comps.len() != 1 || placeholder(path).is_some() {
            return Ok(());
        }
        let item = sh.api.mkdir(&name).map_err(|_| true)?;
        convert(path, &item.id).map_err(|_| true)?;
        sh.tree.lock().unwrap().upsert(item);
        return Ok(());
    }

    let parent = if comps.len() == 1 {
        ROOT.to_string()
    } else {
        let tree = sh.tree.lock().unwrap();
        match tree.child(ROOT, &comps[0]).filter(|i| i.is_dir()) {
            Some(d) => d.id.clone(),
            None => return Err(true), // a pasta ainda está subindo
        }
    };
    // em uso por quem está gravando? tenta depois
    if fs::OpenOptions::new().read(true).share_mode(0x1).open(path).is_err() {
        return Err(true);
    }
    match placeholder(path) {
        None => {
            let item = sh.api.create_file(&parent, &name, path).map_err(|_| true)?;
            convert(path, &item.id).map_err(|_| true)?;
            // o servidor pode ter ajustado o nome (caractere proibido, repetido)
            if item.name != name {
                sh.ours.lock().unwrap().insert(item.id.clone());
                let _ = fs::rename(path, path.with_file_name(&item.name));
            }
            sh.tree.lock().unwrap().upsert(item);
        }
        Some((id, false)) => {
            let item = sh.api.replace_file(&id, &name, path).map_err(|_| true)?;
            mark_in_sync(path).map_err(|_| true)?;
            sh.tree.lock().unwrap().upsert(item);
        }
        Some((_, true)) => {}
    }
    Ok(())
}

/* ─────────────────────────── avisos do sistema ─────────────────────────── */

unsafe fn identity(info: &CF_CALLBACK_INFO) -> String {
    if info.FileIdentity.is_null() || info.FileIdentityLength == 0 {
        return String::new();
    }
    String::from_utf8_lossy(std::slice::from_raw_parts(info.FileIdentity as *const u8, info.FileIdentityLength as usize)).to_string()
}

unsafe fn wide(p: PCWSTR) -> String {
    if p.is_null() {
        return String::new();
    }
    std::ffi::OsString::from_wide(p.as_wide()).to_string_lossy().to_string()
}

unsafe fn execute(key: i64, transfer: i64, ty: CF_OPERATION_TYPE, params: &mut CF_OPERATION_PARAMETERS) -> windows::core::Result<()> {
    let info = CF_OPERATION_INFO {
        StructSize: std::mem::size_of::<CF_OPERATION_INFO>() as u32,
        Type: ty,
        ConnectionKey: CF_CONNECTION_KEY(key),
        TransferKey: transfer,
        ..Default::default()
    };
    CfExecute(&info, params)
}

unsafe fn transfer(key: i64, tk: i64, data: &[u8], offset: i64, length: i64, status: NTSTATUS) -> windows::core::Result<()> {
    let mut p = CF_OPERATION_PARAMETERS {
        ParamSize: (std::mem::offset_of!(CF_OPERATION_PARAMETERS, Anonymous) + std::mem::size_of::<CF_OPERATION_PARAMETERS_0_6>()) as u32,
        Anonymous: CF_OPERATION_PARAMETERS_0 {
            TransferData: CF_OPERATION_PARAMETERS_0_6 {
                Flags: CF_OPERATION_TRANSFER_DATA_FLAG_NONE,
                CompletionStatus: status,
                Buffer: if data.is_empty() { std::ptr::null() } else { data.as_ptr() as *const c_void },
                Offset: offset,
                Length: length,
            },
        },
    };
    execute(key, tk, CF_OPERATION_TYPE_TRANSFER_DATA, &mut p)
}

unsafe fn ack(key: i64, tk: i64, rename: bool, status: NTSTATUS) {
    let size = std::mem::offset_of!(CF_OPERATION_PARAMETERS, Anonymous) + std::mem::size_of::<CF_OPERATION_PARAMETERS_0_2>();
    let mut p = CF_OPERATION_PARAMETERS {
        ParamSize: size as u32,
        Anonymous: if rename {
            CF_OPERATION_PARAMETERS_0 { AckRename: CF_OPERATION_PARAMETERS_0_3 { Flags: CF_OPERATION_ACK_RENAME_FLAG_NONE, CompletionStatus: status } }
        } else {
            CF_OPERATION_PARAMETERS_0 { AckDelete: CF_OPERATION_PARAMETERS_0_2 { Flags: CF_OPERATION_ACK_DELETE_FLAG_NONE, CompletionStatus: status } }
        },
    };
    let ty = if rename { CF_OPERATION_TYPE_ACK_RENAME } else { CF_OPERATION_TYPE_ACK_DELETE };
    if let Err(e) = execute(key, tk, ty, &mut p) {
        eprintln!("[drive] ack: {e}");
    }
}

/// Alguém abriu um arquivo que ainda não está no disco: desce do servidor em pedaços.
unsafe extern "system" fn on_fetch_data(info: *const CF_CALLBACK_INFO, params: *const CF_CALLBACK_PARAMETERS) {
    let (info, params) = (&*info, &*params);
    let id = identity(info);
    let (key, tk) = (info.ConnectionKey.0, info.TransferKey);
    let req = params.Anonymous.FetchData;
    let Some(sh) = shared() else { return };
    thread::spawn(move || {
        let res = (|| -> Result<(), String> {
            let mut r = sh.api.open(&id)?;
            let mut buf = vec![0u8; CHUNK];
            let mut offset = 0i64;
            loop {
                let mut n = 0;
                while n < CHUNK {
                    match r.read(&mut buf[n..]) {
                        Ok(0) => break,
                        Ok(k) => n += k,
                        Err(e) => return Err(e.to_string()),
                    }
                }
                if n == 0 {
                    break;
                }
                transfer(key, tk, &buf[..n], offset, n as i64, STATUS_SUCCESS).map_err(|e| e.to_string())?;
                offset += n as i64;
                if n < CHUNK {
                    break;
                }
            }
            Ok(())
        })();
        if let Err(e) = res {
            eprintln!("[drive] download de {id} falhou: {e}");
            let _ = transfer(key, tk, &[], req.RequiredFileOffset, req.RequiredLength, STATUS_UNSUCCESSFUL);
        }
    });
}

/// Apagado no Explorer: apaga no servidor (ou recusa, se o servidor não responder).
unsafe extern "system" fn on_delete(info: *const CF_CALLBACK_INFO, _params: *const CF_CALLBACK_PARAMETERS) {
    let info = &*info;
    let id = identity(info);
    let (key, tk) = (info.ConnectionKey.0, info.TransferKey);
    let Some(sh) = shared() else { return ack(key, tk, false, STATUS_SUCCESS) };
    if id.is_empty() || sh.ours.lock().unwrap().remove(&id) {
        return ack(key, tk, false, STATUS_SUCCESS);
    }
    thread::spawn(move || {
        let status = match sh.api.delete(&id) {
            Ok(()) => {
                sh.tree.lock().unwrap().remove(&id);
                STATUS_SUCCESS
            }
            Err(e) => {
                eprintln!("[drive] não apagou {id}: {e}");
                STATUS_UNSUCCESSFUL
            }
        };
        ack(key, tk, false, status);
    });
}

/// Renomeado ou movido no Explorer. Para fora da pasta (inclusive a Lixeira) = apagar.
unsafe extern "system" fn on_rename(info: *const CF_CALLBACK_INFO, params: *const CF_CALLBACK_PARAMETERS) {
    let (info, params) = (&*info, &*params);
    let id = identity(info);
    let (key, tk) = (info.ConnectionKey.0, info.TransferKey);
    let r = params.Anonymous.Rename;
    let target = wide(r.TargetPath);
    let in_scope = (r.Flags & CF_CALLBACK_RENAME_FLAG_TARGET_IN_SCOPE).0 != 0;
    let Some(sh) = shared() else { return ack(key, tk, true, STATUS_SUCCESS) };
    if id.is_empty() || sh.ours.lock().unwrap().remove(&id) {
        return ack(key, tk, true, STATUS_SUCCESS);
    }
    thread::spawn(move || {
        let status = (|| {
            if !in_scope {
                return match sh.api.delete(&id) {
                    Ok(()) => {
                        sh.tree.lock().unwrap().remove(&id);
                        STATUS_SUCCESS
                    }
                    Err(_) => STATUS_UNSUCCESSFUL,
                };
            }
            // "\users\ana\myndshelf\Estante\a.pdf" → ["Estante", "a.pdf"]
            let t = target.replace('/', "\\");
            let t = if t.len() > 2 && t.as_bytes()[1] == b':' { t[2..].to_string() } else { t };
            let Some(rest) = t.to_lowercase().strip_prefix(&sh.root_rel).map(|r| r.len()) else { return STATUS_ACCESS_DENIED };
            let rel = &t[t.len() - rest..];
            let comps: Vec<&str> = rel.split('\\').filter(|c| !c.is_empty()).collect();
            let (item, parent) = {
                let tree = sh.tree.lock().unwrap();
                let Some(item) = tree.items.get(&id).cloned() else { return STATUS_SUCCESS };
                let parent = match comps.len() {
                    1 => ROOT.to_string(),
                    2 if !item.is_dir() => match tree.child(ROOT, comps[0]).filter(|d| d.is_dir()) {
                        Some(d) => d.id.clone(),
                        None => return STATUS_ACCESS_DENIED,
                    },
                    // estantes não têm subpastas
                    _ => return STATUS_ACCESS_DENIED,
                };
                (item, parent)
            };
            let name = comps.last().copied().unwrap_or_default();
            if is_temp_name(name) {
                return STATUS_ACCESS_DENIED;
            }
            let new_name = (name != item.name).then_some(name);
            let new_parent = (parent != item.parent_id).then_some(parent.as_str());
            if new_name.is_none() && new_parent.is_none() {
                return STATUS_SUCCESS;
            }
            match sh.api.patch(&id, new_name, new_parent) {
                Ok(updated) => {
                    sh.tree.lock().unwrap().upsert(updated);
                    STATUS_SUCCESS
                }
                Err(e) => {
                    eprintln!("[drive] não renomeou {id}: {e}");
                    STATUS_UNSUCCESSFUL
                }
            }
        })();
        ack(key, tk, true, status);
    });
}
