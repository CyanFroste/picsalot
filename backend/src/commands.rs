use crate::state::State;
use crate::types::{Error, Picture};
use std::path::PathBuf;
use tauri::State as StateGuard;
use tauri::ipc::Channel;

#[tauri::command]
pub async fn get_pictures(
    state: StateGuard<State, '_>,
    path: PathBuf,
) -> Result<Vec<Picture>, Error> {
    Ok(state.get_pictures(&path).await?)
}

#[tauri::command]
pub async fn process_pictures(
    state: StateGuard<State, '_>,
    items: Vec<Picture>,
    progress_channel: Channel<String>,
) -> Result<Vec<String>, Error> {
    Ok(state.process_pictures(items, progress_channel).await)
}

#[tauri::command]
pub async fn move_to_trash(
    state: StateGuard<State, '_>,
    paths: Vec<PathBuf>,
) -> Result<Vec<String>, Error> {
    Ok(state.move_to_trash(paths).await)
}
