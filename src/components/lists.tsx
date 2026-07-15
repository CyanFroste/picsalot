import { useEffect, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { cn } from '@heroui/react'
import type {
  ItemProps as VirtuosoItemProps,
  ContextProp as VirtuosoContextProps,
  VirtuosoHandle,
} from 'react-virtuoso'

const DEFAULT_OVERSCAN = 10

type VirtualListProps<T> = {
  ref?: React.Ref<VirtuosoHandle>
  data: T[]
  className?: string
  overscan?: number
  children: ListChildren<T>
  components: {
    Container?: (props: ContainerProps) => React.ReactNode
    Header?: (props: HeaderProps) => React.ReactNode
    Footer?: (props: FooterProps) => React.ReactNode
  }
}

export function VirtualList<T>({
  ref,
  data,
  children,
  className,
  overscan = DEFAULT_OVERSCAN,
  components: { Container, Header, Footer },
}: VirtualListProps<T>) {
  return (
    <Virtuoso
      ref={ref}
      data={data}
      overscan={overscan}
      components={{ Item: VirtualItem, List: Container, Header, Footer }}
      className={cn('size-full shrink-0', className)}
      itemContent={(index, item) => children(item, index)}
    />
  )
}

type VirtualItemProps<T> = VirtuosoItemProps<T>

function VirtualItem<T>({ item, ...props }: VirtualItemProps<T>) {
  // needed to preserve height
  const [size, setSize] = useState(0)
  const knownSize = props['data-known-size']

  useEffect(() => {
    if (knownSize) setSize(knownSize)
  }, [knownSize])

  return (
    <div
      {...props}
      style={{ ...props.style, '--item-height': `${size}px` } as React.CSSProperties}
      className="empty:min-h-(--item-height) empty:box-border"
    />
  )
}

export type HeaderProps<T = unknown> = VirtuosoContextProps<T>
export type FooterProps<T = unknown> = VirtuosoContextProps<T>

export type ContainerProps = React.HTMLAttributes<HTMLDivElement>
export type ListChildren<T> = (item: T, index: number) => React.ReactNode

export type Handle = VirtuosoHandle
