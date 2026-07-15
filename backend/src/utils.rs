use blake3::Hasher;
use image::ImageFormat;
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

pub struct ThumbnailManager {
    root: PathBuf,
}

impl ThumbnailManager {
    pub fn new(root: PathBuf) -> Self {
        _ = std::fs::create_dir_all(&root);
        Self { root }
    }

    pub async fn get(&self, path: impl AsRef<Path>) -> Option<PathBuf> {
        let src_path = path.as_ref().to_path_buf();

        if !src_path.exists() {
            return None;
        }

        let hash = hash_image_file(&src_path).await?;
        let thumbnail_path = self.root.join(format!("{}.jpg", hash));

        if thumbnail_path.exists() {
            return Some(thumbnail_path);
        }

        let thumbnail_path = tokio::task::spawn_blocking(move || {
            let img = image::open(&src_path).ok()?;
            let file = img.thumbnail(300, 300);
            let tmp_path = thumbnail_path.with_extension("tmp");

            file.save_with_format(&tmp_path, ImageFormat::Jpeg).ok()?;
            std::fs::rename(&tmp_path, &thumbnail_path).ok()?;

            Some(thumbnail_path)
        })
        .await
        .ok()??;

        Some(thumbnail_path)
    }
}

async fn hash_image_file(path: &Path) -> Option<String> {
    let mut file = File::open(path).await.ok()?;
    let metadata = file.metadata().await.ok()?;

    let chunk_size: u64 = 64 * 1024;
    let file_size = metadata.len();
    let mut hasher = Hasher::new();

    hasher.update(&file_size.to_le_bytes());
    if let Some(name) = path.file_name() {
        hasher.update(name.to_string_lossy().as_bytes());
    }

    if file_size <= 2 * chunk_size {
        let mut buffer = Vec::with_capacity(file_size as usize);

        file.read_to_end(&mut buffer).await.ok()?;
        hasher.update(&buffer);
    } else {
        let mut buffer = vec![0u8; chunk_size as usize];

        file.read_exact(&mut buffer).await.ok()?;
        hasher.update(&buffer);

        file.seek(SeekFrom::End(-(chunk_size as i64))).await.ok()?;
        file.read_exact(&mut buffer).await.ok()?;
        hasher.update(&buffer);
    }

    Some(hasher.finalize().to_hex().to_string())
}
