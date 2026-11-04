//! A árvore do drive em memória, com o que mudou a cada atualização.

use std::collections::HashMap;

use crate::api::{ChangesResponse, DriveItem, ListResponse, ROOT};

#[derive(Default)]
pub struct Tree {
    pub items: HashMap<String, DriveItem>,
    pub cursor: u64,
}

/// O que mudou numa atualização.
#[derive(Default, Debug)]
pub struct Diff {
    pub added: Vec<DriveItem>,
    /// (antes, depois)
    pub changed: Vec<(DriveItem, DriveItem)>,
    pub removed: Vec<DriveItem>,
}

impl Diff {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty() && self.changed.is_empty() && self.removed.is_empty()
    }
}

impl Tree {
    pub fn from_list(l: ListResponse) -> Self {
        let mut t = Tree { items: HashMap::new(), cursor: l.cursor };
        for i in l.items {
            t.items.insert(i.id.clone(), i);
        }
        t
    }

    /// Troca a árvore inteira e devolve a diferença.
    pub fn replace(&mut self, items: Vec<DriveItem>) -> Diff {
        let mut diff = Diff::default();
        let mut next: HashMap<String, DriveItem> = HashMap::new();
        for i in items.into_iter().filter(|i| !i.is_deleted()) {
            match self.items.get(&i.id) {
                None => diff.added.push(i.clone()),
                Some(old) if old.version != i.version || old.name != i.name || old.parent_id != i.parent_id => diff.changed.push((old.clone(), i.clone())),
                _ => {}
            }
            next.insert(i.id.clone(), i);
        }
        for (id, old) in self.items.drain() {
            if !next.contains_key(&id) {
                diff.removed.push(old);
            }
        }
        self.items = next;
        // pastas antes dos arquivos: quem cria placeholders precisa da pasta primeiro
        diff.added.sort_by_key(|i| !i.is_dir());
        diff
    }

    pub fn apply(&mut self, c: ChangesResponse) -> Diff {
        self.cursor = c.cursor;
        if c.full {
            self.replace(c.items)
        } else {
            Diff::default()
        }
    }

    /// Guarda o que o servidor devolveu depois de uma escrita nossa.
    pub fn upsert(&mut self, i: DriveItem) {
        self.items.insert(i.id.clone(), i);
    }

    pub fn remove(&mut self, id: &str) -> Option<DriveItem> {
        let gone = self.items.remove(id);
        // estante apagada: as criações voltam para a raiz
        if gone.as_ref().is_some_and(|g| g.is_dir()) {
            for i in self.items.values_mut() {
                if i.parent_id == id {
                    i.parent_id = ROOT.into();
                }
            }
        }
        gone
    }

    pub fn children<'a>(&'a self, parent: &str) -> impl Iterator<Item = &'a DriveItem> + 'a {
        let parent = parent.to_string();
        self.items.values().filter(move |i| i.parent_id == parent)
    }

    /// Sem diferenciar maiúsculas, como os sistemas de arquivos do macOS e do Windows.
    pub fn child(&self, parent: &str, name: &str) -> Option<&DriveItem> {
        let n = name.to_lowercase();
        self.children(parent).find(|i| i.name.to_lowercase() == n)
    }

    /// Caminho relativo à raiz do drive: "Estante/arquivo.pdf".
    pub fn rel_path(&self, i: &DriveItem) -> Vec<String> {
        if i.parent_id == ROOT {
            vec![i.name.clone()]
        } else {
            match self.items.get(&i.parent_id) {
                Some(p) => vec![p.name.clone(), i.name.clone()],
                None => vec![i.name.clone()],
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, parent: &str, name: &str, v: &str) -> DriveItem {
        DriveItem {
            id: id.into(),
            parent_id: parent.into(),
            kind: if parent == ROOT && id.starts_with('s') { "folder".into() } else { "file".into() },
            name: name.into(),
            size: Some(1),
            mime: None,
            created_at: None,
            version: v.into(),
            content_version: Some(0),
            deleted: None,
        }
    }

    #[test]
    fn diff() {
        let mut t = Tree::default();
        t.replace(vec![item("s1", ROOT, "Fotos", "a"), item("f1", "s1", "a.jpg", "a")]);
        let d = t.replace(vec![item("s1", ROOT, "Fotos", "a"), item("f1", "s1", "b.jpg", "b"), item("f2", ROOT, "c.pdf", "a")]);
        assert_eq!(d.added.len(), 1);
        assert_eq!(d.changed.len(), 1);
        assert!(d.removed.is_empty());
        assert_eq!(t.child("s1", "B.JPG").unwrap().id, "f1");
        assert_eq!(t.rel_path(t.items.get("f1").unwrap()), vec!["Fotos", "b.jpg"]);
        let d = t.replace(vec![item("f2", ROOT, "c.pdf", "a")]);
        assert_eq!(d.removed.len(), 2);
    }
}
