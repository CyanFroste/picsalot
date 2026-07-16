import { memo, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { open } from '@tauri-apps/plugin-dialog'
import { Channel, convertFileSrc } from '@tauri-apps/api/core'
import { appCacheDir } from '@tauri-apps/api/path'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cropper } from 'react-cropper'
import { useHotkeys } from 'react-hotkeys-hook'
import chunk from 'lodash.chunk'
import {
  cn,
  addToast,
  useDisclosure,
  Button,
  Checkbox,
  Chip,
  Drawer,
  DrawerContent,
  Image,
  Input,
  ScrollShadow,
  Select,
  SelectItem,
  Modal,
  ModalContent,
  Spinner,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@heroui/react'
import {
  CheckCheckIcon,
  CheckCircleIcon,
  CheckIcon,
  CornerRightUpIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  FolderIcon,
  HeartIcon,
  PaintbrushVerticalIcon,
  RotateCcwIcon,
  ScanTextIcon,
  SettingsIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react'
import { getPictures, moveToTrash, ocr, processPictures } from '@/commands'
import { useSelection, store } from '@/utils'
import { VirtualList } from '@/components/lists'
import type { ReactCropperElement } from 'react-cropper'
import type {
  ContainerProps as ListContainerProps,
  HeaderProps as ListHeaderProps,
  FooterProps as ListFooterProps,
  Handle as ListHandle,
} from '@/components/lists'
import type { PartialExcept, Picture } from '@/types'

const ASPECT_RATIOS = [
  { label: 'Free', value: 0 },
  { label: 'Square', value: 1 / 1 },
  { label: '16 : 9', value: 16 / 9 },
  { label: '9 : 16', value: 9 / 16 },
  { label: '3 : 4', value: 3 / 4 },
  { label: '4 : 3', value: 4 / 3 },
  { label: '4 : 5', value: 4 / 5 },
  { label: '5 : 4', value: 5 / 4 },
] as const

export function HomeScreen() {
  const queryClient = useQueryClient()
  const cropperRef = useRef<ReactCropperElement>(null)
  const listRef = useRef<ListHandle>(null)
  const globalStore = useStore(store)

  const [directory, setDirectory] = useState<string | null>()
  const [current, setCurrent] = useState<Picture | null>(null)
  const [edits, setEdits] = useState<Map<string, Picture>>(new Map())
  const [ocrResults, setOcrResults] = useState<Map<string, string>>(new Map())
  const [currentEdit, setCurrentEdit] = useState(current)
  const [currentOcrResult, setCurrentOcrResult] = useState('')

  const [remaining, setRemaining] = useState(0)
  const [removed, setRemoved] = useState<string[]>([])

  const [chunkSize, setChunkSize] = useState(8)
  const [chunked, setChunked] = useState<Picture[][]>([])
  const [isSelecting, setIsSelecting] = useState(false)

  const [batchResizeWidth, setBatchResizeWidth] = useState(512)
  const [batchResizeHeight, setBatchResizeHeight] = useState(512)

  const explorerDrawer = useDisclosure()
  const confirmationModal = useDisclosure()
  const settingsModal = useDisclosure()
  const selection = useSelection<Picture>((a, b) => a.path === b.path)

  const queryPictures = useQuery({
    enabled: !!directory,
    queryKey: ['pictures', directory],
    queryFn: async () => await getPictures(directory!),
  })

  const isCurrentChanged = current && currentEdit && isChanged(current, currentEdit)

  const totalUnsavedChanges =
    queryPictures.data?.reduce((acc, item) => {
      const edit = edits.get(item.path)
      return acc + Number(edit ? isChanged(item, edit) : false)
    }, 0) ?? 0

  // fn reference is not updated inside <Cropper />
  const onCropEnd = () => {
    if (!cropperRef.current?.cropper || !current) return
    const data = cropperRef.current.cropper.getData()

    onEdit([
      {
        path: current.path,
        cropX: Math.round(data.x),
        cropY: Math.round(data.y),
        cropW: Math.round(data.width),
        cropH: Math.round(data.height),
      },
    ])
  }

  const setCropperData = (data: Picture) => {
    cropperRef.current?.cropper.setAspectRatio(data.aspectRatio ?? 0)
    cropperRef.current?.cropper.setData({
      x: data.cropX,
      y: data.cropY,
      width: data.cropW,
      height: data.cropH,
      scaleX: data.flipH ? -1 : 1,
      scaleY: data.flipV ? -1 : 1,
    })
  }

  // fn reference is not updated inside <Cropper />
  const onReady = () => {
    if (!cropperRef.current?.cropper || !current) return

    const edit = edits.get(current.path)
    if (!edit) return

    setCropperData(edit)
  }

  const onEdit = (items: PartialExcept<Picture, 'path'>[]) => {
    setEdits(oldEdits => {
      if (!queryPictures.data?.length) return oldEdits
      const newEdits = new Map(oldEdits)

      for (const item of items) {
        const existing = oldEdits.get(item.path) ?? queryPictures.data.find(p => p.path === item.path)! // this should exist
        newEdits.set(item.path, { ...existing, ...item })
      }

      return newEdits
    })
  }

  const onFlipHorizontal = () => {
    if (!cropperRef.current?.cropper || !current) return
    const edit = edits.get(current.path)
    const newFlipH = !edit?.flipH

    cropperRef.current.cropper.scaleX(newFlipH ? -1 : 1)
    onEdit([{ path: current.path, flipH: newFlipH }])
  }

  const onFlipVertical = () => {
    if (!cropperRef.current?.cropper || !current) return
    const edit = edits.get(current.path)
    const newFlipV = !edit?.flipV

    cropperRef.current.cropper.scaleY(newFlipV ? -1 : 1)
    onEdit([{ path: current.path, flipV: newFlipV }])
  }

  const onAspectRatioChange = (ratio: number) => {
    if (!cropperRef.current?.cropper || !current) return

    cropperRef.current.cropper.setAspectRatio(ratio)
    onEdit([{ path: current.path, aspectRatio: ratio }])
    onCropEnd()
  }

  const gotoCurrent = () => {
    setTimeout(() => {
      const index = chunked.findIndex(items => items.some(it => it.path === current?.path))
      if (index !== -1) listRef.current?.scrollToIndex(index)
    }, 100)
  }

  const resetAll = () => {
    setEdits(new Map())
    setCurrent(null)
  }

  const mutationProcessPictures = useMutation({
    mutationFn: async (items: Picture[]) =>
      await processPictures(items, new Channel<string>(() => setRemaining(prev => prev - 1))),
    onSuccess: (failed, vars) => {
      if (directory) revealItemInDir(`${directory}/${globalStore.appName}-output`)
      resetAll()

      addToast({
        timeout: 10000,
        title: 'Edits Processed',
        color: 'success',
        description: `${vars.length - failed.length} out of ${vars.length} edits processed successfully. ${failed.length} failed.`,
      })
    },
  })

  const mutationMoveToTrash = useMutation({
    mutationFn: moveToTrash,
    onSuccess: (failed, vars) => {
      queryClient.setQueryData<Picture[]>(['pictures', directory], old => {
        if (!old) return old

        const filtered = old.filter(it => !vars.includes(it.path))
        const isCurrentRemoved = vars.some(it => it === current?.path)

        if (isCurrentRemoved) {
          const currentIndex = old.findIndex(it => it.path === current?.path)
          let newIndex = 0

          if (currentIndex < filtered.length - 1) newIndex = currentIndex
          else if (filtered.length > 0) newIndex = filtered.length - 1

          setCurrent(filtered[newIndex] ?? null)
        }

        return filtered
      })

      setRemoved(old => old.concat(vars))
      if (explorerDrawer.isOpen) gotoCurrent()
      selection.clear()

      addToast({
        timeout: 2000,
        title: 'Move to Trash',
        color: 'success',
        description: `${vars.length - failed.length} out of ${vars.length} files were moved to Trash successfully. ${failed.length} failed.`,
      })
    },
  })

  const mutationOcr = useMutation({
    mutationFn: ocr,
    onSuccess: (res, path) =>
      setOcrResults(old => {
        const newMap = new Map(old)
        newMap.set(path, res)
        return newMap
      }),
  })

  const onProcess = () => {
    const items =
      queryPictures.data?.reduce<Picture[]>((acc, it) => {
        const edit = edits.get(it.path)
        if (edit && isChanged(it, edit)) acc.push(edit)
        return acc
      }, []) ?? []

    if (!items.length) return

    setRemaining(items.length)
    mutationProcessPictures.mutate(items)
    confirmationModal.onClose()
  }

  const onOpenExplorer = () => {
    explorerDrawer.onOpen()
    setIsSelecting(false)
    selection.clear()
    gotoCurrent()
  }

  useEffect(() => {
    if (current) setCurrentEdit(edits.get(current.path) ?? null)
  }, [edits, current])

  useEffect(() => {
    if (current) setCurrentOcrResult(ocrResults.get(current.path) ?? '')
  }, [ocrResults, current])

  useEffect(() => setChunkSize(isSelecting ? 6 : 7), [isSelecting])

  useEffect(() => {
    if (queryPictures.data) setChunked(chunk(queryPictures.data, chunkSize))
  }, [queryPictures.data, chunkSize])

  useHotkeys('Ctrl + b', onOpenExplorer)

  useHotkeys('ArrowLeft', () => {
    if (!queryPictures.data?.length) return
    const currentIndex = queryPictures.data.findIndex(item => item.path === current?.path)
    if (currentIndex > 0) setCurrent(queryPictures.data[currentIndex - 1])
  })

  useHotkeys('ArrowRight', () => {
    if (!queryPictures.data?.length) return
    const currentIndex = queryPictures.data.findIndex(item => item.path === current?.path)
    if (currentIndex < queryPictures.data.length - 1) setCurrent(queryPictures.data[currentIndex + 1])
  })

  useHotkeys('Delete', () => {
    if (current) mutationMoveToTrash.mutate([current.path])
  })

  return (
    <>
      <div className="size-full overflow-auto flex">
        <div className="p-3 size-full">
          {current && (
            <Cropper
              ref={cropperRef}
              src={convertFileSrc(current.path)}
              className="size-full"
              responsive
              viewMode={1}
              autoCropArea={1}
              minCropBoxHeight={20}
              minCropBoxWidth={20}
              background={false}
              zoomable={false}
              // fns are not reactive
              // need to re-render to update
              key={current.path}
              cropend={onCropEnd}
              ready={onReady}
            />
          )}
        </div>

        <div className="w-150 border-l border-default-50 flex flex-col overflow-auto h-full">
          {current && (
            <>
              <div className="p-3 flex flex-col gap-2 border-b border-default-50 break-all">
                <div className="text-default-500 text-small font-mono pt-3">{current.path}</div>

                <div className="flex items-center gap-1 pb-3">
                  {current.w}
                  <XIcon className="text-default-500" />
                  {current.h}
                </div>

                <div className="flex items-center">
                  <Button
                    radius="sm"
                    variant="flat"
                    color="danger"
                    isLoading={mutationMoveToTrash.isPending}
                    onPress={() => mutationMoveToTrash.mutate([current.path])}>
                    <TrashIcon className="text-lg" /> Move to Trash (Del)
                  </Button>

                  {isCurrentChanged && (
                    <Chip variant="flat" size="sm" radius="sm" className="ml-auto" color="warning">
                      Unsaved changes
                    </Chip>
                  )}
                </div>
              </div>

              <div className="p-3 flex gap-3 items-center border-b border-default-50">
                <Select
                  radius="sm"
                  label="Aspect Ratio"
                  selectedKeys={[(currentEdit?.aspectRatio ?? 0).toString()]}
                  onSelectionChange={value => onAspectRatioChange(+value.currentKey!)}>
                  {ASPECT_RATIOS.map(it => (
                    <SelectItem key={it.value}>{it.label}</SelectItem>
                  ))}
                </Select>

                <Button
                  size="lg"
                  radius="sm"
                  isIconOnly
                  variant="flat"
                  color={currentEdit?.flipH ? 'warning' : 'default'}
                  onPress={onFlipHorizontal}>
                  <FlipHorizontal2Icon className="text-lg" />
                </Button>

                <Button
                  size="lg"
                  radius="sm"
                  isIconOnly
                  variant="flat"
                  color={currentEdit?.flipV ? 'warning' : 'default'}
                  onPress={onFlipVertical}>
                  <FlipVertical2Icon className="text-lg" />
                </Button>
              </div>

              <div className="p-3 flex gap-3 items-center border-b border-default-50">
                <Input
                  type="number"
                  radius="sm"
                  label="Resize Width"
                  value={(currentEdit?.resizeW ?? current.resizeW).toString()}
                  onValueChange={value => onEdit([{ path: current.path, resizeW: +value }])}
                />

                <XIcon className="text-lg text-default-500 shrink-0" />

                <Input
                  type="number"
                  radius="sm"
                  label="Resize Height"
                  value={(currentEdit?.resizeH ?? current.resizeH).toString()}
                  onValueChange={value => onEdit([{ path: current.path, resizeH: +value }])}
                />
              </div>

              <div className="p-3 flex items-center gap-3">
                <Button
                  radius="sm"
                  variant="flat"
                  isLoading={mutationOcr.isPending}
                  onPress={() => mutationOcr.mutate(current.path)}>
                  <ScanTextIcon className="text-lg" /> Scan for Text
                </Button>

                <Button
                  radius="sm"
                  variant="flat"
                  color="success"
                  className="ml-auto"
                  isDisabled={!isCurrentChanged}
                  onPress={() => {
                    onEdit([{ ...current, aspectRatio: 0 }])
                    setCropperData(current)
                  }}>
                  <RotateCcwIcon className="text-lg" /> Reset changes
                </Button>
              </div>

              {currentOcrResult && (
                <div className="p-3 flex h-full overflow-hidden border-t border-default-50">
                  <div className="size-full p-3 rounded-small border border-default-50 overflow-auto font-mono whitespace-pre-wrap select-text">
                    {currentOcrResult}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center p-3 shrink-0 border-t border-default-50 gap-3">
        <Button radius="sm" variant="flat" isIconOnly onPress={settingsModal.onOpen}>
          <SettingsIcon className="text-lg" />
        </Button>

        <Button
          radius="sm"
          color="warning"
          onPress={async () => {
            const dir = await open({ directory: true })
            if (!dir) return

            setDirectory(dir)
            explorerDrawer.onOpen()
          }}>
          <FolderIcon className="text-lg" /> Open
        </Button>

        {directory && (
          <>
            <div className="text-default-500 text-small font-mono">{directory}</div>
            <div className="ml-auto text-default-500 text-small">{remaining > 0 && `${remaining} remaining . . .`}</div>

            <Button
              radius="sm"
              color="success"
              isDisabled={!totalUnsavedChanges}
              isLoading={mutationProcessPictures.isPending}
              onPress={confirmationModal.onOpen}>
              <PaintbrushVerticalIcon className="text-lg" /> Apply edits
              {totalUnsavedChanges > 0 && ` to ${totalUnsavedChanges} item(s)`}
            </Button>

            {/* <Button radius="sm" variant="flat" color="success" onPress={resetAll}>
              Reset all
            </Button> */}

            <Button radius="sm" variant="flat" onPress={onOpenExplorer}>
              <CornerRightUpIcon className="text-lg" /> Show Explorer (Ctrl + b)
            </Button>

            <Popover size="lg" radius="sm" offset={24}>
              <PopoverTrigger>
                <Button radius="sm" variant="flat" color="danger" isDisabled={!removed.length}>
                  <TrashIcon className="text-lg" /> Trash ({removed.length})
                </Button>
              </PopoverTrigger>

              <PopoverContent className="bg-background border border-default-50 p-0 overflow-hidden">
                <div className="p-3 h-200 w-150 flex flex-col overflow-auto border border-default-50">
                  {removed.map(it => (
                    <div key={it} className="text-small p-2 text-default-500">
                      {it}
                    </div>
                  ))}
                </div>

                <div className="p-3 w-full">
                  <Button
                    fullWidth
                    radius="sm"
                    variant="flat"
                    className="shrink-0"
                    onPress={() => revealItemInDir(`${directory}/${globalStore.appName}-trash`)}>
                    <FolderIcon className="text-lg" /> Locate Trash
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      <Drawer
        size="4xl"
        radius="none"
        hideCloseButton
        placement="bottom"
        isOpen={explorerDrawer.isOpen}
        onOpenChange={explorerDrawer.onOpenChange}>
        <DrawerContent className="bg-background/90 backdrop-blur-lg size-full border-t border-default-50">
          {!!queryPictures.data?.length && (
            <div className="flex flex-col size-full">
              <div className="flex items-center gap-3 border-b border-default-50 p-3">
                {isSelecting ? (
                  <>
                    <Button
                      radius="sm"
                      variant="flat"
                      onPress={() => {
                        setIsSelecting(false)
                        selection.clear()
                      }}>
                      <XIcon className="text-lg" /> Cancel
                    </Button>

                    <Button
                      radius="sm"
                      color="primary"
                      isDisabled={selection.values.length === queryPictures.data.length}
                      onPress={() => selection.set(queryPictures.data)}>
                      <CheckCheckIcon className="text-lg" /> Select all
                    </Button>

                    <Chip
                      radius="sm"
                      variant="flat"
                      onClose={selection.clear}
                      classNames={{ base: 'shrink-0 font-mono', closeButton: 'mx-0.5' }}>
                      {selection.values.length} of {queryPictures.data.length} selected
                    </Chip>
                  </>
                ) : (
                  <>
                    <Button radius="sm" variant="flat" onPress={() => setIsSelecting(true)}>
                      <CheckCircleIcon className="text-lg" /> Select
                    </Button>

                    <div className="text-default-500 text-small font-mono">{directory}</div>
                  </>
                )}

                {totalUnsavedChanges > 0 && (
                  <Chip variant="flat" radius="sm" className="ml-auto" color="warning">
                    {totalUnsavedChanges} unsaved change(s)
                  </Chip>
                )}
              </div>

              <div className="flex size-full">
                <div className="size-full">
                  <VirtualList
                    ref={listRef}
                    data={chunked}
                    components={{ Container: ListContainer, Header: ListHeader, Footer: ListFooter }}>
                    {items => {
                      return (
                        <ListItem
                          key={items[0].path}
                          data={items}
                          columns={chunkSize}
                          onOpen={setCurrent}
                          isSelecting={isSelecting}
                          onToggleSelect={selection.toggle}
                          isSelected={items.map(it => selection.isSelected(it))}
                          isCurrent={item => item.path === current?.path}
                          isChanged={item => {
                            const edit = edits.get(item.path)
                            return edit ? isChanged(item, edit) : false
                          }}
                        />
                      )
                    }}
                  </VirtualList>
                </div>

                {isSelecting && (
                  <div className="w-150 border-l border-default-50 flex flex-col">
                    <div className="p-3 flex gap-3 items-center border-b border-default-50">
                      <Button
                        radius="sm"
                        variant="flat"
                        color="danger"
                        className="ml-auto"
                        isDisabled={!selection.values.length}
                        isLoading={mutationMoveToTrash.isPending}
                        onPress={() => mutationMoveToTrash.mutate(selection.values.map(it => it.path))}>
                        <TrashIcon className="text-lg" /> Move {selection.values.length} selected to Trash
                      </Button>
                    </div>

                    <div className="p-3 flex gap-3 items-center border-b border-default-50">
                      <Input
                        type="number"
                        radius="sm"
                        label="Resize Width"
                        value={batchResizeWidth.toString()}
                        onValueChange={value => setBatchResizeWidth(+value)}
                      />
                      <XIcon className="text-lg text-default-500 shrink-0" />
                      <Input
                        type="number"
                        radius="sm"
                        label="Resize Height"
                        value={batchResizeHeight.toString()}
                        onValueChange={value => setBatchResizeHeight(+value)}
                      />
                    </div>

                    <div className="p-3 flex items-center gap-3">
                      <Button
                        radius="sm"
                        color="primary"
                        className="ml-auto"
                        isDisabled={!selection.values.length}
                        onPress={() => {
                          onEdit(
                            selection.values.map(it => ({
                              path: it.path,
                              resizeW: batchResizeWidth,
                              resizeH: batchResizeHeight,
                            })),
                          )
                          selection.clear()
                        }}>
                        <PaintbrushVerticalIcon className="text-lg" />
                        Apply to {selection.values.length} selected
                      </Button>

                      <Button
                        radius="sm"
                        variant="flat"
                        color="success"
                        isDisabled={!selection.values.length}
                        onPress={() => {
                          onEdit(selection.values.map(it => ({ path: it.path, resizeW: it.w, resizeH: it.h })))
                          selection.clear()
                        }}>
                        <RotateCcwIcon className="text-lg" /> Reset selected
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!queryPictures.data?.length && (
            <div className="flex items-center gap-3 border-b border-default-50 p-3">
              <Button radius="sm" variant="flat" onPress={explorerDrawer.onClose}>
                <XIcon className="text-lg" /> Close
              </Button>

              <div className="text-default-500 text-small">There's nothing here . . .</div>
            </div>
          )}

          {queryPictures.isLoading && (
            <div className="flex size-full items-center justify-center">
              <Spinner size="lg" />
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Modal
        size="2xl"
        radius="sm"
        hideCloseButton
        isOpen={confirmationModal.isOpen}
        onOpenChange={confirmationModal.onOpenChange}>
        <ModalContent className="bg-background border border-default-50">
          <div className="p-6 text-2xl font-semibold">Confirm Edit</div>

          <div className="px-6">
            Are you sure you want to apply these edits? The changes will be saved to folder{' '}
            <span className="font-mono mx-2 text-warning-500">picsalot-output</span> inside{' '}
            <span className="font-mono mx-2 text-warning-500">{directory}</span>{' '}
          </div>

          <div className="w-full p-6 flex gap-3 border-t border-default-50 mt-6 justify-end">
            <Button radius="sm" variant="flat" onPress={confirmationModal.onClose}>
              Cancel
            </Button>

            <Button radius="sm" color="success" onPress={onProcess}>
              <CheckIcon className="text-lg" /> Confirm
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <Modal
        size="2xl"
        radius="sm"
        hideCloseButton
        isOpen={settingsModal.isOpen}
        onOpenChange={settingsModal.onOpenChange}>
        <ModalContent className="bg-background border border-default-50">
          <Settings />
        </ModalContent>
      </Modal>
    </>
  )
}

type ListItemProps = {
  data: Picture[]
  columns: number
  isSelected: boolean[]
  isSelecting: boolean
  onToggleSelect: (data: Picture, previouslySelected?: boolean) => void
  isChanged: (data: Picture) => boolean
  isCurrent: (data: Picture) => boolean
  onOpen: (data: Picture) => void
}

export const ListItem = memo(
  ({ data, onOpen, columns, onToggleSelect, isSelecting, ...props }: ListItemProps) => {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {data.map((item, index) => {
          const isSelected = props.isSelected[index]
          const isChanged = props.isChanged(item)
          const isCurrent = props.isCurrent(item)

          return (
            <div
              key={item.path}
              onClick={() => (isSelecting ? onToggleSelect(item, isSelected) : onOpen(item))}
              className={cn(
                'relative isolate rounded-medium overflow-hidden border border-default-50 flex flex-col cursor-pointer',
                isCurrent && 'border-warning-300 bg-warning-50',
                isSelected && 'border-primary-300 bg-primary-50',
              )}>
              {isSelecting && (
                <Checkbox
                  radius="full"
                  isSelected={isSelected}
                  classNames={{ base: 'absolute top-3 left-3 z-12', wrapper: 'bg-background mr-0' }}
                />
              )}

              {item.thumbnail && (
                <Image
                  isBlurred
                  radius="none"
                  shadow="none"
                  width="100%"
                  className="h-60 object-contain"
                  src={convertFileSrc(item.thumbnail)}
                  classNames={{ wrapper: 'overflow-hidden' }}
                />
              )}

              <div
                className={cn(
                  'flex p-3 items-center gap-3 border-t border-default-50',
                  isCurrent && 'border-warning-300',
                  isSelected && 'border-primary-300',
                )}>
                {isChanged && <div className="size-3 shrink-0 rounded-full bg-warning" />}

                <ScrollShadow
                  hideScrollBar
                  orientation="horizontal"
                  className="text-default-500 text-tiny font-mono text-nowrap">
                  {item.path}
                </ScrollShadow>
              </div>
            </div>
          )
        })}
      </div>
    )
  },
  (prev, next) =>
    prev.onOpen === next.onOpen &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.isChanged === next.isChanged &&
    prev.isCurrent === next.isCurrent &&
    prev.columns === next.columns &&
    prev.data.length === next.data.length &&
    prev.isSelecting === next.isSelecting &&
    prev.isSelected.length === next.isSelected.length &&
    !!prev.data.every((it, i) => it.path === next.data[i].path) &&
    !!prev.isSelected.every((it, i) => it === next.isSelected[i]),
)

function ListContainer(props: ListContainerProps) {
  return <div {...props} className="flex flex-col gap-3 px-3 shrink-0 w-full" />
}

function ListHeader(props: ListHeaderProps) {
  return <div {...props} className="h-3" />
}

function ListFooter(props: ListFooterProps) {
  return <div {...props} className="h-3" />
}

function isChanged(a: Picture, b: Picture) {
  return (
    a.path !== b.path ||
    a.flipH !== b.flipH ||
    a.flipV !== b.flipV ||
    a.cropX !== b.cropX ||
    a.cropY !== b.cropY ||
    a.cropW !== b.cropW ||
    a.cropH !== b.cropH ||
    a.resizeH !== b.resizeH ||
    a.resizeW !== b.resizeW
  )
}

function Settings() {
  const globalStore = useStore(store)

  return (
    <>
      <div className="p-6 text-2xl font-semibold border-b border-default-50">Settings</div>

      <div className="p-6 flex items-center gap-3 border-b border-default-50">
        <Button radius="sm" variant="flat" onPress={async () => revealItemInDir(await appCacheDir())}>
          <FolderIcon className="text-lg" /> Locate app directory
        </Button>
      </div>

      <div className="p-6 flex gap-3">
        <div className="flex flex-col text-default-500 text-small w-full">
          <Image removeWrapper src="/icons/logo.png" width={88} height={88} className="mb-6" />

          <div className="text-medium text-foreground mb-0.5">
            <span className="capitalize">{globalStore.appName}</span> v{globalStore.appVersion}
          </div>

          <div>© {new Date().getFullYear()} Cyan Froste</div>

          <div className="text-tiny my-3">
            Licensed under Apache <br /> License 2.0 SPDX-License-Identifier: Apache-2.0
          </div>

          <button
            onClick={() => openUrl('https://github.com/CyanFroste/picsalot/blob/master/LICENSE')}
            className="self-start text-secondary-700 cursor-pointer">
            View full license
          </button>
        </div>

        <div className="flex flex-col gap-3 items-end w-full">
          <Button radius="sm" variant="flat" onPress={() => openUrl('https://github.com/CyanFroste/picsalot')}>
            <img height="24" width="24" src="https://cdn.simpleicons.org/github/white" className="size-6" />
            View source code
          </Button>

          <Button
            radius="sm"
            variant="flat"
            title="Sponsor CyanFroste"
            onPress={() => openUrl('https://github.com/sponsors/CyanFroste')}>
            <HeartIcon className="text-lg text-pink-400" /> Sponsor
          </Button>
        </div>
      </div>
    </>
  )
}
