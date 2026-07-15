use crate::types::Picture;
use crate::utils::ThumbnailManager;
use anyhow::Result;
use futures::stream;
use futures::stream::{FuturesUnordered, StreamExt};
use image::{ImageFormat, ImageReader};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::fs;
use tokio::sync::Semaphore;

pub struct State {
    thumbnail_manager: Arc<ThumbnailManager>,
    app_name: String,
    log_dir: PathBuf,
}

impl State {
    pub fn new(app_name: String, cache_dir: PathBuf, log_dir: PathBuf) -> Self {
        let thumbnail_manager = Arc::new(ThumbnailManager::new(cache_dir.join("thumbnails")));
        _ = std::fs::create_dir_all(&log_dir);

        Self {
            thumbnail_manager,
            app_name,
            log_dir,
        }
    }

    pub async fn get_pictures(&self, path: &Path) -> Result<Vec<Picture>> {
        let mut entries = fs::read_dir(path).await?;
        let mut tasks = FuturesUnordered::new();

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();

            // filter only files
            if !path.is_file() {
                continue;
            }

            // optional: filter by extension
            if let Some(ext) = path
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.to_lowercase())
            {
                if !["jpg", "jpeg", "png", "webp"].contains(&ext.as_str()) {
                    continue;
                }
            }

            let thumbnail_manager = self.thumbnail_manager.clone();

            tasks.push(tokio::spawn(async move {
                // open image and read dimensions
                let reader = ImageReader::open(&path).ok()?;
                let reader = reader.with_guessed_format().ok()?;
                let (w, h) = reader.into_dimensions().ok()?;

                // generate thumbnail
                let thumbnail = thumbnail_manager.get(&path).await;

                Some(Picture {
                    path,
                    thumbnail,
                    h,
                    w,
                    flip_h: false,
                    flip_v: false,
                    crop_w: w,
                    crop_h: h,
                    crop_x: 0,
                    crop_y: 0,
                    resize_h: h,
                    resize_w: w,
                })
            }));
        }

        let mut data = Vec::new();

        while let Some(Ok(Some(it))) = tasks.next().await {
            data.push(it);
        }

        Ok(data)
    }

    pub async fn process_pictures(
        &self,
        items: Vec<Picture>,
        progress_channel: Channel<String>,
    ) -> Vec<String> {
        let limit = Arc::new(Semaphore::new(8));

        let res: Vec<Option<String>> = stream::iter(items)
            .map(|item| {
                let permit = limit.clone();
                let progress_channel = progress_channel.clone();

                async move {
                    let _permit = permit.acquire().await.ok()?;

                    let parent = item.path.parent()?;
                    let output_dir = parent.join(format!("{}-output", self.app_name));

                    fs::create_dir_all(&output_dir).await.ok()?;

                    let format = ImageReader::open(&item.path).ok()?.format()?;
                    let ext = match format {
                        ImageFormat::Jpeg => "jpg",
                        ImageFormat::Png => "png",
                        ImageFormat::WebP => "webp",
                        ImageFormat::Gif => "gif",
                        _ => "img",
                    };

                    let file_name = item.path.file_stem()?.to_string_lossy();
                    let output_path = output_dir.join(format!("{file_name}.{ext}"));
                    let msg = item.path.to_string_lossy().to_string();

                    let res = tokio::task::spawn_blocking(move || {
                        item.apply_and_save(&output_path, format)
                            .err()
                            .map(|err| format!("[{}] {err}", item.path.to_string_lossy()))
                    })
                    .await
                    .ok()?;

                    progress_channel.send(msg).ok()?;

                    res
                }
            })
            .buffer_unordered(8)
            .collect()
            .await;

        let failed: Vec<String> = res.into_iter().flatten().collect();

        if !failed.is_empty() {
            let timestamp = chrono::Local::now().format("%Y%m%d%H%M%S");
            let path = self.log_dir.join(format!("{timestamp}.log"));

            _ = fs::write(path, failed.join("\n")).await;
        }

        failed
    }
}
