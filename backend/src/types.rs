use anyhow::Result;
use image::imageops;
use image::{GenericImageView, ImageFormat};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct Error {
    message: String,
}

impl From<anyhow::Error> for Error {
    fn from(err: anyhow::Error) -> Self {
        Self {
            message: err.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Picture {
    pub path: PathBuf,
    pub thumbnail: Option<PathBuf>, // path to thumbnail

    pub h: u32, // original height
    pub w: u32, // original width

    pub flip_h: bool, // false = no flip horizontal
    pub flip_v: bool, // false = no flip vertical

    pub crop_w: u32, // same as width = no crop
    pub crop_h: u32, // same as height = no crop
    pub crop_x: u32,
    pub crop_y: u32,

    pub resize_h: u32, // same as height = no resize
    pub resize_w: u32, // same as width = no resize
}

impl Picture {
    pub fn apply_and_save(&self, output_path: &Path, format: ImageFormat) -> Result<()> {
        let mut img = image::open(&self.path)?;

        if self.flip_h {
            img = img.fliph();
        }

        if self.flip_v {
            img = img.flipv();
        }

        let (img_w, img_h) = img.dimensions();

        let crop_x = self.crop_x.min(img_w);
        let crop_y = self.crop_y.min(img_h);

        let crop_w = self.crop_w.min(img_w - crop_x);
        let crop_h = self.crop_h.min(img_h - crop_y);

        let mut img = img.crop_imm(crop_x, crop_y, crop_w, crop_h);

        if self.resize_w != crop_w || self.resize_h != crop_h {
            img = img.resize(self.resize_w, self.resize_h, imageops::FilterType::Lanczos3);
        }

        img.save_with_format(output_path, format)?;

        Ok(())
    }
}
