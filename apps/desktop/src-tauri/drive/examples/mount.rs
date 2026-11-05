//! Monta o drive sem o app: `cargo run --example mount -- <url> <token> <pasta-pessoal>`
//! (Linux: aparece em <pasta-pessoal>/MyndShelf; Ctrl+C desmonta.)

use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;

use myndshelf_drive::{Body, Config, Http, Options, Request, Response};

struct Ureq;

impl Http for Ureq {
    fn send(&self, req: Request) -> Result<Response, String> {
        let mut r = ureq::request(req.method, &req.url);
        for (k, v) in &req.headers {
            r = r.set(k, v);
        }
        let res = match req.body {
            Body::Empty => r.call(),
            Body::Bytes(b) => r.send_bytes(&b),
            Body::File(p) => r.send(std::fs::File::open(p).map_err(|e| e.to_string())?),
        };
        let res = match res {
            Ok(r) => r,
            Err(ureq::Error::Status(_, r)) => r,
            Err(e) => return Err(e.to_string()),
        };
        let status = res.status();
        let body: Box<dyn Read + Send> = Box::new(res.into_reader());
        Ok(Response { status, body })
    }
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let home = PathBuf::from(&a[3]);
    let drive = myndshelf_drive::start(Options {
        http: Arc::new(Ureq),
        config: Config { url: a[1].clone(), token: a[2].clone() },
        cache_dir: home.join(".cache/myndshelf"),
        home: home.clone(),
        exe: None,
    })
    .expect("drive");
    println!("montado em {:?}", drive.location());
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}
