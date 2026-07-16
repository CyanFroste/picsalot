import { Channel, invoke } from '@tauri-apps/api/core'
import type { Picture } from '@/types'

export async function getPictures(path: string) {
  return await invoke<Picture[]>('get_pictures', { path })
}

export async function processPictures(items: Picture[], progressChannel: Channel<string>) {
  return await invoke<string[]>('process_pictures', { items, progressChannel })
}

export async function moveToTrash(paths: string[]) {
  return await invoke<string[]>('move_to_trash', { paths })
}

export async function ocr(path: string) {
  return await invoke<string>('ocr', { path })
}
