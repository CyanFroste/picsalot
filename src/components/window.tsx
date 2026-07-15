import { Outlet } from 'react-router'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@heroui/react'
import { MinusIcon, XIcon } from 'lucide-react'

export function Window() {
  const currentWindow = getCurrentWindow()
  // const [isMaximized, setIsMaximized] = useState(false)

  // useEffect(() => {
  //   const unlisten = currentWindow.onResized(() => {
  //     currentWindow.isMaximized().then(setIsMaximized)
  //   })
  //   return () => {
  //     unlisten.then(fn => fn())
  //   }
  // }, [])

  return (
    <>
      <div data-tauri-drag-region className="flex items-center pointer-events-auto shrink-0 border-b border-default-50">
        <div className="flex items-center gap-3 px-3">
          <img src="/icons/logo.png" alt="logo" className="size-6" /> Picsalot
        </div>

        <Button variant="light" radius="none" className="min-w-12 ml-auto" onPress={() => currentWindow.minimize()}>
          <MinusIcon className="text-lg text-default-500" />
        </Button>

        {/* <Button
          radius="none"
          variant="light"
          className="min-w-12 text-default-500 text-lg"
          onPress={() => currentWindow.toggleMaximize()}>
          {isMaximized ? <ChevronsDownUpIcon className="rotate-45" /> : <ChevronsUpDownIcon className="rotate-45" />}
        </Button> */}

        <Button
          isIconOnly
          color="danger"
          variant="light"
          radius="none"
          className="min-w-12"
          onPress={() => currentWindow.close()}>
          <XIcon className="text-lg text-default-500" />
        </Button>
      </div>

      <Outlet />
    </>
  )
}
