import '@/styles.css'
import 'cropperjs/dist/cropper.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { ToastProvider } from '@heroui/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { HomeScreen } from '@/components/home'
import { Window } from '@/components/window'
import { init } from '@/utils'

await init()

const router = createBrowserRouter([
  {
    path: '/',
    Component: Window,
    children: [{ path: '/', Component: HomeScreen }],
  },
])

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 2 * 60 * 1000, refetchOnMount: 'always' },
  },
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />

      <ToastProvider
        toastOffset={40}
        placement="top-center"
        toastProps={{ radius: 'sm', classNames: { description: 'whitespace-pre-wrap not-empty:pt-1' } }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)

const currentWindow = getCurrentWindow()

try {
  await currentWindow.maximize()
  await currentWindow.show()
  await currentWindow.setFocus()
  await currentWindow.setResizable(false)
} catch {
  await currentWindow.close()
}

document.addEventListener('contextmenu', evt => {
  if (import.meta.env.PROD) evt.preventDefault()
})

window.addEventListener('keydown', evt => {
  if (import.meta.env.PROD && evt.ctrlKey && evt.key.toLowerCase() === 'r') evt.preventDefault()
})
