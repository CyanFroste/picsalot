import { useState } from 'react'
import { createStore } from 'zustand'
import { persist } from 'zustand/middleware'
import { getName, getVersion } from '@tauri-apps/api/app'

type Store = { fontFamily: string; fontSize: number; appName: string; appVersion: string }

function initialState(): Store {
  return { fontFamily: 'Poppins', fontSize: 16, appName: '', appVersion: '' }
}

export const store = createStore<Store>()(persist(initialState, { name: 'settings' }))

store.subscribe(init)

function applyTheme({ fontFamily, fontSize }: Store = store.getState()) {
  document.documentElement.style.setProperty('--font-mono', 'JetBrains Mono')
  document.documentElement.style.setProperty('--font-sans', fontFamily)
  document.documentElement.style.setProperty('font-size', `${fontSize}px`)
}

export async function init(state = store.getState()) {
  applyTheme(state)
  store.setState({ appName: await getName(), appVersion: await getVersion() })
}

export type UseSelection<T> = {
  values: T[]
  set: React.Dispatch<React.SetStateAction<T[]>>
  isSelected: (data: T) => boolean
  toggle: (data: T, previouslySelected?: boolean) => void
  clear: () => void
}

export function useSelection<T>(isEqual: (a: T, b: T) => boolean): UseSelection<T> {
  const [values, set] = useState<T[]>([])

  const isSelected = (data: T) => values.some(t => isEqual(t, data))
  const clear = () => set([])

  const toggle = (data: T, previouslySelected?: boolean) => {
    if (previouslySelected) set(state => state.filter(t => !isEqual(t, data)))
    else set(state => state.concat(data))
  }

  return { values, set, isSelected, toggle, clear }
}
