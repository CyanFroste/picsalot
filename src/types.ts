export type Picture = {
  path: string // path to image
  thumbnail?: string | null // path to thumbnail

  h: number // original height
  w: number // original width

  flipH: boolean // false = no flip horizontal
  flipV: boolean // false = no flip vertical

  cropW: number // same as width = no crop
  cropH: number // same as height = no crop
  cropX: number
  cropY: number

  resizeH: number // same as height = no resize
  resizeW: number // same as width = no resize

  aspectRatio?: number | null
}

export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Required<Pick<T, K>>
