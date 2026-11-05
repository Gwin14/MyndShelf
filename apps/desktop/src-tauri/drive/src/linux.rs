//! Linux: a Estante montada em `~/MyndShelf` por FUSE (usa o `fusermount3` do sistema,
//! que vem com o pacote `fuse3`). Os arquivos baixam ao abrir e ficam em cache;
//! o que é gravado sobe ao fechar.

use std::collections::HashMap;
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::os::unix::fs::FileExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use fuser::{
    FileAttr, FileType, Filesystem, MountOption, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyWrite,
    Request, TimeOrNow,
};
use libc::{EEXIST, EINVAL, EIO, EISDIR, ENOENT, ENOTDIR, ENOTEMPTY, EPERM};

use crate::api::{Api, DriveItem, ROOT};
use crate::is_temp_name;
use crate::tree::Tree;

const TTL: Duration = Duration::from_secs(1);
const ROOT_INO: u64 = 1;
const REFRESH: Duration = Duration::from_secs(20);

enum Node {
    Item(String),
    /// arquivo novo ou temporário, ainda só neste computador
    Local,
}

struct Local {
    /// id da pasta do drive (estante ou raiz)
    parent: String,
    name: String,
    path: PathBuf,
    uploading: bool,
}

struct Handle {
    ino: u64,
    file: File,
    /// cópia privada quando um arquivo do servidor é aberto para escrita
    path: PathBuf,
    writable: bool,
    dirty: bool,
}

struct State {
    api: Api,
    tree: Tree,
    ino_of: HashMap<String, u64>,
    node_of: HashMap<u64, Node>,
    locals: HashMap<u64, Local>,
    handles: HashMap<u64, Handle>,
    next_ino: u64,
    next_fh: u64,
    cache: PathBuf,
    tmp: PathBuf,
    uid: u32,
    gid: u32,
}

type Shared = Arc<Mutex<State>>;

fn ms_to_time(ms: u64) -> SystemTime {
    UNIX_EPOCH + Duration::from_millis(ms)
}

impl State {
    fn ino(&mut self, id: &str) -> u64 {
        if id == ROOT {
            return ROOT_INO;
        }
        if let Some(i) = self.ino_of.get(id) {
            return *i;
        }
        let i = self.next_ino;
        self.next_ino += 1;
        self.ino_of.insert(id.to_string(), i);
        self.node_of.insert(i, Node::Item(id.to_string()));
        i
    }

    fn new_local_ino(&mut self) -> u64 {
        let i = self.next_ino;
        self.next_ino += 1;
        self.node_of.insert(i, Node::Local);
        i
    }

    /// id do drive de uma pasta (raiz ou estante)
    fn folder_id(&self, ino: u64) -> Option<String> {
        if ino == ROOT_INO {
            return Some(ROOT.into());
        }
        match self.node_of.get(&ino) {
            Some(Node::Item(id)) if self.tree.items.get(id).is_some_and(|i| i.is_dir()) => Some(id.clone()),
            _ => None,
        }
    }

    fn item(&self, ino: u64) -> Option<&DriveItem> {
        match self.node_of.get(&ino) {
            Some(Node::Item(id)) => self.tree.items.get(id),
            _ => None,
        }
    }

    fn cache_path(&self, i: &DriveItem) -> PathBuf {
        self.cache.join(format!("{}.{}", i.id, i.content_version.unwrap_or(0)))
    }

    fn dir_attr(&self, ino: u64, created: u64) -> FileAttr {
        let t = ms_to_time(created);
        FileAttr {
            ino,
            size: 0,
            blocks: 0,
            atime: t,
            mtime: t,
            ctime: t,
            crtime: t,
            kind: FileType::Directory,
            perm: 0o755,
            nlink: 2,
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: 4096,
            flags: 0,
        }
    }

    fn file_attr(&self, ino: u64, size: u64, created: u64) -> FileAttr {
        let t = ms_to_time(created);
        FileAttr {
            ino,
            size,
            blocks: size.div_ceil(512),
            atime: t,
            mtime: t,
            ctime: t,
            crtime: t,
            kind: FileType::RegularFile,
            perm: 0o644,
            nlink: 1,
            uid: self.uid,
            gid: self.gid,
            rdev: 0,
            blksize: 4096,
            flags: 0,
        }
    }

    /// Tamanho enquanto alguém escreve: o da cópia aberta.
    fn open_size(&self, ino: u64) -> Option<u64> {
        self.handles.values().find(|h| h.ino == ino && h.writable).and_then(|h| h.file.metadata().ok()).map(|m| m.len())
    }

    fn attr(&self, ino: u64) -> Option<FileAttr> {
        if ino == ROOT_INO {
            return Some(self.dir_attr(ROOT_INO, 0));
        }
        if let Some(l) = self.locals.get(&ino) {
            let size = fs::metadata(&l.path).map(|m| m.len()).unwrap_or(0);
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
            return Some(self.file_attr(ino, size, now));
        }
        let i = self.item(ino)?;
        Some(if i.is_dir() {
            self.dir_attr(ino, i.created_ms())
        } else {
            self.file_attr(ino, self.open_size(ino).unwrap_or(i.size.unwrap_or(0)), i.created_ms())
        })
    }

    fn local_child(&self, parent: &str, name: &str) -> Option<u64> {
        self.locals.iter().find(|(_, l)| l.parent == parent && l.name == name).map(|(i, _)| *i)
    }

    /// Filho por nome: primeiro exato, depois sem diferenciar maiúsculas (o servidor não repete).
    fn lookup(&mut self, parent: &str, name: &str) -> Option<u64> {
        if let Some(i) = self.local_child(parent, name) {
            return Some(i);
        }
        let id = self
            .tree
            .children(parent)
            .find(|i| i.name == name)
            .or_else(|| self.tree.child(parent, name))
            .map(|i| i.id.clone())?;
        Some(self.ino(&id))
    }

    fn new_fh(&mut self) -> u64 {
        self.next_fh += 1;
        self.next_fh
    }
}

pub struct Mount {
    session: Option<fuser::BackgroundSession>,
    stop: Arc<AtomicBool>,
}

impl Drop for Mount {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // soltar a sessão desmonta
        drop(self.session.take());
    }
}

impl Mount {
    pub fn start(api: Api, at: &Path, cache_dir: &Path) -> Result<Mount, String> {
        if !Path::new("/dev/fuse").exists() {
            return Err("FUSE não está disponível. Instale o pacote fuse3.".into());
        }
        // montagem velha de uma sessão que caiu
        unmount(at);
        fs::create_dir_all(at).map_err(|e| format!("não deu para criar {}: {e}", at.display()))?;
        if fs::read_dir(at).map(|mut d| d.next().is_some()).unwrap_or(false) {
            return Err(format!("A pasta {} não está vazia.", at.display()));
        }
        let cache = cache_dir.join("drive").join("files");
        let tmp = cache_dir.join("drive").join("tmp");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
        fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;

        let tree = Tree::from_list(api.list()?);
        let st: Shared = Arc::new(Mutex::new(State {
            api,
            tree,
            ino_of: HashMap::new(),
            node_of: HashMap::new(),
            locals: HashMap::new(),
            handles: HashMap::new(),
            next_ino: 2,
            next_fh: 0,
            cache,
            tmp,
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
        }));

        let opts = [
            MountOption::FSName("myndshelf".into()),
            MountOption::Subtype("myndshelf".into()),
            MountOption::DefaultPermissions,
            MountOption::NoAtime,
            MountOption::NoExec,
        ];
        let session = fuser::spawn_mount2(Fs { st: st.clone() }, at, &opts).map_err(|e| format!("não deu para montar o drive: {e}"))?;

        let stop = Arc::new(AtomicBool::new(false));
        spawn_refresh(st, stop.clone());
        bookmark(at, true);
        Ok(Mount { session: Some(session), stop })
    }
}

/// Busca o que mudou nos outros aparelhos de tempos em tempos.
fn spawn_refresh(st: Shared, stop: Arc<AtomicBool>) {
    thread::spawn(move || loop {
        for _ in 0..REFRESH.as_secs() {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            thread::sleep(Duration::from_secs(1));
        }
        let (api, cursor) = {
            let s = st.lock().unwrap();
            (s.api.clone(), s.tree.cursor)
        };
        if let Ok(c) = api.changes(cursor) {
            let mut s = st.lock().unwrap();
            let diff = s.tree.apply(c);
            for gone in diff.removed {
                if let Some(ino) = s.ino_of.remove(&gone.id) {
                    s.node_of.remove(&ino);
                }
            }
        }
    });
}

/// Sobe um arquivo local (novo ou salvo por cima de outro) sem travar o sistema de arquivos.
fn schedule_upload(st: &Shared, ino: u64) {
    let job = {
        let mut s = st.lock().unwrap();
        let busy = s.handles.values().any(|h| h.ino == ino && h.writable);
        let target = match s.locals.get(&ino) {
            Some(l) if !busy && !l.uploading && !is_temp_name(&l.name) => Some((l.parent.clone(), l.name.clone(), l.path.clone())),
            _ => None,
        };
        let Some((parent, name, path)) = target else { return };
        let replace = s.tree.child(&parent, &name).filter(|i| !i.is_dir()).map(|i| i.id.clone());
        s.locals.get_mut(&ino).unwrap().uploading = true;
        (s.api.clone(), parent, name, path, replace)
    };
    let st = st.clone();
    thread::spawn(move || {
        let (api, parent, name, path, replace) = job;
        let res = match &replace {
            Some(id) => api.replace_file(id, &name, &path),
            None => api.create_file(&parent, &name, &path),
        };
        let mut s = st.lock().unwrap();
        match res {
            Ok(item) => {
                let _ = fs::rename(&path, s.cache_path(&item));
                s.locals.remove(&ino);
                if let Some(old) = s.ino_of.insert(item.id.clone(), ino) {
                    if old != ino {
                        s.node_of.remove(&old);
                    }
                }
                s.node_of.insert(ino, Node::Item(item.id.clone()));
                s.tree.upsert(item);
            }
            Err(e) => {
                eprintln!("[drive] não subiu {name}: {e}");
                if let Some(l) = s.locals.get_mut(&ino) {
                    l.uploading = false;
                }
            }
        }
    });
}

struct Fs {
    st: Shared,
}

fn name_of(n: &OsStr) -> Option<&str> {
    n.to_str().filter(|s| !s.is_empty() && !s.contains('/'))
}

impl Filesystem for Fs {
    fn lookup(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEntry) {
        let mut s = self.st.lock().unwrap();
        let (Some(pid), Some(name)) = (s.folder_id(parent), name_of(name)) else { return reply.error(ENOENT) };
        match s.lookup(&pid, name).and_then(|i| s.attr(i)) {
            Some(a) => reply.entry(&TTL, &a, 0),
            None => reply.error(ENOENT),
        }
    }

    fn getattr(&mut self, _req: &Request<'_>, ino: u64, _fh: Option<u64>, reply: ReplyAttr) {
        let s = self.st.lock().unwrap();
        match s.attr(ino) {
            Some(a) => reply.attr(&TTL, &a),
            None => reply.error(ENOENT),
        }
    }

    fn setattr(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _mode: Option<u32>,
        _uid: Option<u32>,
        _gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        fh: Option<u64>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<u32>,
        reply: ReplyAttr,
    ) {
        let mut s = self.st.lock().unwrap();
        if let Some(size) = size {
            let open = fh.and_then(|f| s.handles.get_mut(&f)).filter(|h| h.writable);
            if let Some(h) = open {
                if h.file.set_len(size).is_err() {
                    return reply.error(EIO);
                }
                h.dirty = true;
            } else if let Some(l) = s.locals.get(&ino) {
                if OpenOptions::new().write(true).open(&l.path).and_then(|f| f.set_len(size)).is_err() {
                    return reply.error(EIO);
                }
            } else if s.item(ino).is_some_and(|i| !i.is_dir()) {
                // truncar sem abrir: raro; só aceitamos zerar o arquivo
                if size != 0 {
                    return reply.error(EPERM);
                }
                let i = s.item(ino).unwrap().clone();
                let path = s.tmp.join(format!("trunc-{ino}"));
                let api = s.api.clone();
                drop(s);
                let res = File::create(&path).map_err(|e| e.to_string()).and_then(|_| api.replace_file(&i.id, &i.name, &path));
                let _ = fs::remove_file(&path);
                s = self.st.lock().unwrap();
                match res {
                    Ok(item) => s.tree.upsert(item),
                    Err(_) => return reply.error(EIO),
                }
            }
        }
        match s.attr(ino) {
            Some(a) => reply.attr(&TTL, &a),
            None => reply.error(ENOENT),
        }
    }

    fn readdir(&mut self, _req: &Request<'_>, ino: u64, _fh: u64, offset: i64, mut reply: ReplyDirectory) {
        let mut s = self.st.lock().unwrap();
        let Some(pid) = s.folder_id(ino) else { return reply.error(ENOTDIR) };
        let mut entries: Vec<(u64, FileType, String)> = vec![(ino, FileType::Directory, ".".into()), (ROOT_INO, FileType::Directory, "..".into())];
        let mut kids: Vec<(String, bool, String)> = s.tree.children(&pid).map(|i| (i.id.clone(), i.is_dir(), i.name.clone())).collect();
        kids.sort_by(|a, b| a.2.cmp(&b.2));
        for (id, dir, name) in kids {
            let i = s.ino(&id);
            entries.push((i, if dir { FileType::Directory } else { FileType::RegularFile }, name));
        }
        for (i, l) in s.locals.iter().filter(|(_, l)| l.parent == pid) {
            entries.push((*i, FileType::RegularFile, l.name.clone()));
        }
        for (n, (i, kind, name)) in entries.into_iter().enumerate().skip(offset as usize) {
            if reply.add(i, (n + 1) as i64, kind, name) {
                break;
            }
        }
        reply.ok();
    }

    fn open(&mut self, _req: &Request<'_>, ino: u64, flags: i32, reply: ReplyOpen) {
        let write = flags & libc::O_ACCMODE != libc::O_RDONLY;
        let trunc = flags & libc::O_TRUNC != 0;
        let mut s = self.st.lock().unwrap();

        if let Some(l) = s.locals.get(&ino) {
            let f = OpenOptions::new().read(true).write(true).truncate(trunc).open(&l.path);
            let path = l.path.clone();
            return match f {
                Ok(file) => {
                    let fh = s.new_fh();
                    s.handles.insert(fh, Handle { ino, file, path, writable: write, dirty: trunc });
                    reply.opened(fh, 0)
                }
                Err(_) => reply.error(EIO),
            };
        }

        let Some(item) = s.item(ino).cloned() else { return reply.error(ENOENT) };
        if item.is_dir() {
            return reply.error(EISDIR);
        }
        let cached = s.cache_path(&item);
        let fh = s.new_fh();
        let tmp = s.tmp.join(format!("{fh}"));
        let api = s.api.clone();
        drop(s);

        // baixa fora da trava: outros acessos continuam enquanto o arquivo desce
        let st = self.st.clone();
        thread::spawn(move || {
            if !cached.exists() && !(write && trunc) {
                if let Err(e) = api.download(&item.id, &cached) {
                    eprintln!("[drive] não baixou {}: {e}", item.name);
                    return reply.error(EIO);
                }
            }
            let opened = if write {
                // escrita numa cópia; sobe ao fechar
                let prep = if trunc { File::create(&tmp).map(|_| ()) } else { fs::copy(&cached, &tmp).map(|_| ()) };
                prep.and_then(|_| OpenOptions::new().read(true).write(true).open(&tmp)).map(|f| (f, tmp))
            } else {
                File::open(&cached).map(|f| (f, cached))
            };
            match opened {
                Ok((file, path)) => {
                    st.lock().unwrap().handles.insert(fh, Handle { ino, file, path, writable: write, dirty: trunc });
                    reply.opened(fh, 0)
                }
                Err(_) => reply.error(EIO),
            }
        });
    }

    fn read(&mut self, _req: &Request<'_>, _ino: u64, fh: u64, offset: i64, size: u32, _flags: i32, _lock: Option<u64>, reply: ReplyData) {
        let s = self.st.lock().unwrap();
        let Some(h) = s.handles.get(&fh) else { return reply.error(EIO) };
        let mut buf = vec![0u8; size as usize];
        match h.file.read_at(&mut buf, offset.max(0) as u64) {
            Ok(n) => reply.data(&buf[..n]),
            Err(_) => reply.error(EIO),
        }
    }

    fn write(&mut self, _req: &Request<'_>, _ino: u64, fh: u64, offset: i64, data: &[u8], _wf: u32, _flags: i32, _lock: Option<u64>, reply: ReplyWrite) {
        let mut s = self.st.lock().unwrap();
        let Some(h) = s.handles.get_mut(&fh).filter(|h| h.writable) else { return reply.error(EPERM) };
        match h.file.write_all_at(data, offset.max(0) as u64) {
            Ok(()) => {
                h.dirty = true;
                reply.written(data.len() as u32)
            }
            Err(_) => reply.error(EIO),
        }
    }

    fn release(&mut self, _req: &Request<'_>, ino: u64, fh: u64, _flags: i32, _lock: Option<u64>, _flush: bool, reply: ReplyEmpty) {
        let mut s = self.st.lock().unwrap();
        let Some(h) = s.handles.remove(&fh) else { return reply.ok() };
        reply.ok();
        if !h.writable || !h.dirty {
            return;
        }
        let _ = h.file.sync_all();
        drop(h.file);
        if s.locals.contains_key(&ino) {
            drop(s);
            return schedule_upload(&self.st, ino);
        }
        // arquivo do servidor editado: a cópia sobe por cima do original
        let Some(item) = s.item(ino).cloned() else { return };
        let api = s.api.clone();
        drop(s);
        let st = self.st.clone();
        thread::spawn(move || match api.replace_file(&item.id, &item.name, &h.path) {
            Ok(updated) => {
                let mut s = st.lock().unwrap();
                let _ = fs::rename(&h.path, s.cache_path(&updated));
                s.tree.upsert(updated);
            }
            Err(e) => eprintln!("[drive] não subiu {}: {e}", item.name),
        });
    }

    fn create(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, _mode: u32, _umask: u32, flags: i32, reply: ReplyCreate) {
        let mut s = self.st.lock().unwrap();
        let (Some(pid), Some(name)) = (s.folder_id(parent), name_of(name)) else { return reply.error(ENOENT) };
        if s.local_child(&pid, name).is_some() || (flags & libc::O_EXCL != 0 && s.tree.child(&pid, name).is_some()) {
            return reply.error(EEXIST);
        }
        let ino = s.new_local_ino();
        let path = s.tmp.join(format!("local-{ino}"));
        let Ok(file) = OpenOptions::new().read(true).write(true).create(true).truncate(true).open(&path) else { return reply.error(EIO) };
        s.locals.insert(ino, Local { parent: pid, name: name.to_string(), path: path.clone(), uploading: false });
        let fh = s.new_fh();
        s.handles.insert(fh, Handle { ino, file, path, writable: true, dirty: true });
        let a = s.attr(ino).unwrap();
        reply.created(&TTL, &a, 0, fh, 0);
    }

    fn mkdir(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, _mode: u32, _umask: u32, reply: ReplyEntry) {
        if parent != ROOT_INO {
            // estantes não têm subpastas
            return reply.error(EPERM);
        }
        let Some(name) = name_of(name) else { return reply.error(EINVAL) };
        let api = self.st.lock().unwrap().api.clone();
        match api.mkdir(name) {
            Ok(item) => {
                let mut s = self.st.lock().unwrap();
                let id = item.id.clone();
                s.tree.upsert(item);
                let ino = s.ino(&id);
                let a = s.attr(ino).unwrap();
                reply.entry(&TTL, &a, 0)
            }
            Err(e) => {
                eprintln!("[drive] mkdir: {e}");
                reply.error(EIO)
            }
        }
    }

    fn unlink(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        let mut s = self.st.lock().unwrap();
        let (Some(pid), Some(name)) = (s.folder_id(parent), name_of(name)) else { return reply.error(ENOENT) };
        if let Some(i) = s.local_child(&pid, name) {
            if let Some(l) = s.locals.remove(&i) {
                let _ = fs::remove_file(l.path);
            }
            return reply.ok();
        }
        let Some(item) = s.tree.child(&pid, name).cloned() else { return reply.error(ENOENT) };
        if item.is_dir() {
            return reply.error(EISDIR);
        }
        let api = s.api.clone();
        drop(s);
        match api.delete(&item.id) {
            Ok(()) => {
                let mut s = self.st.lock().unwrap();
                s.tree.remove(&item.id);
                let _ = fs::remove_file(s.cache_path(&item));
                reply.ok()
            }
            Err(_) => reply.error(EIO),
        }
    }

    fn rmdir(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        let s = self.st.lock().unwrap();
        if parent != ROOT_INO {
            return reply.error(ENOENT);
        }
        let Some(name) = name_of(name) else { return reply.error(EINVAL) };
        let Some(item) = s.tree.child(ROOT, name).filter(|i| i.is_dir()).cloned() else { return reply.error(ENOENT) };
        if s.tree.children(&item.id).next().is_some() || s.locals.values().any(|l| l.parent == item.id) {
            return reply.error(ENOTEMPTY);
        }
        let api = s.api.clone();
        drop(s);
        match api.delete(&item.id) {
            Ok(()) => {
                self.st.lock().unwrap().tree.remove(&item.id);
                reply.ok()
            }
            Err(_) => reply.error(EIO),
        }
    }

    fn rename(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, newparent: u64, newname: &OsStr, _flags: u32, reply: ReplyEmpty) {
        let mut s = self.st.lock().unwrap();
        let (Some(from), Some(to), Some(name), Some(newname)) = (s.folder_id(parent), s.folder_id(newparent), name_of(name), name_of(newname)) else {
            return reply.error(EINVAL);
        };

        // arquivo local (novo, temporário de editor, download .part…)
        if let Some(i) = s.local_child(&from, name) {
            // por cima de outro local: o outro some
            if let Some(other) = s.local_child(&to, newname).filter(|o| *o != i) {
                if let Some(l) = s.locals.remove(&other) {
                    let _ = fs::remove_file(l.path);
                }
            }
            let l = s.locals.get_mut(&i).unwrap();
            l.parent = to;
            l.name = newname.to_string();
            drop(s);
            reply.ok();
            // nome definitivo: sobe (por cima do arquivo de mesmo nome, se houver)
            return schedule_upload(&self.st, i);
        }

        let Some(item) = s.tree.child(&from, name).cloned() else { return reply.error(ENOENT) };
        if item.is_dir() && newparent != ROOT_INO {
            return reply.error(EPERM);
        }
        let replaced = s.tree.child(&to, newname).filter(|o| o.id != item.id).cloned();
        if replaced.as_ref().is_some_and(|o| o.is_dir()) {
            return reply.error(EISDIR);
        }
        let api = s.api.clone();
        drop(s);
        if let Some(o) = &replaced {
            if api.delete(&o.id).is_err() {
                return reply.error(EIO);
            }
        }
        let new_name = (newname != item.name).then_some(newname);
        let new_parent = (to != item.parent_id).then_some(to.as_str());
        match api.patch(&item.id, new_name, new_parent) {
            Ok(updated) => {
                let mut s = self.st.lock().unwrap();
                if let Some(o) = replaced {
                    s.tree.remove(&o.id);
                }
                s.tree.upsert(updated);
                reply.ok()
            }
            Err(e) => {
                eprintln!("[drive] rename: {e}");
                reply.error(EIO)
            }
        }
    }
}

fn unmount(at: &Path) {
    for bin in ["fusermount3", "fusermount"] {
        if std::process::Command::new(bin).arg("-u").arg("-z").arg(at).output().is_ok_and(|o| o.status.success()) {
            return;
        }
    }
}

/// Atalho na barra lateral do Nautilus/Thunar (GTK) e do Dolphin (KDE).
fn bookmark(at: &Path, add: bool) {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else { return };
    let uri = format!("file://{}", at.display()).replace(' ', "%20");

    let gtk = home.join(".config/gtk-3.0/bookmarks");
    let line = format!("{uri} MyndShelf");
    let current = fs::read_to_string(&gtk).unwrap_or_default();
    let has = current.lines().any(|l| l.split(' ').next() == Some(uri.as_str()));
    if add && !has {
        let _ = fs::create_dir_all(gtk.parent().unwrap());
        let sep = if current.is_empty() || current.ends_with('\n') { "" } else { "\n" };
        let _ = fs::write(&gtk, format!("{current}{sep}{line}\n"));
    } else if !add && has {
        let kept: Vec<&str> = current.lines().filter(|l| l.split(' ').next() != Some(uri.as_str())).collect();
        let _ = fs::write(&gtk, kept.join("\n") + "\n");
    }

    let kde = home.join(".local/share/user-places.xbel");
    if let Ok(xml) = fs::read_to_string(&kde) {
        let entry = format!(" <bookmark href=\"{uri}\">\n  <title>MyndShelf</title>\n </bookmark>\n");
        let has = xml.contains(&format!("href=\"{uri}\""));
        if add && !has {
            if let Some(end) = xml.rfind("</xbel>") {
                let _ = fs::write(&kde, format!("{}{}{}", &xml[..end], entry, &xml[end..]));
            }
        } else if !add && has {
            let _ = fs::write(&kde, xml.replace(&entry, ""));
        }
    }
}

pub fn forget(at: &Path) -> Result<(), String> {
    unmount(at);
    bookmark(at, false);
    // só apaga a pasta se ficou vazia (nunca arquivos do usuário)
    let _ = fs::remove_dir(at);
    Ok(())
}
