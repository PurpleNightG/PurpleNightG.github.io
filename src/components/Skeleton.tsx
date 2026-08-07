import type { HTMLAttributes } from 'react'

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  className?: string
}

/** 基础骨架块（带横向光泽流动） */
export function Skeleton({ className = '', ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-md bg-white/[0.08] ${className}`}
      {...rest}
    >
      <div
        className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent"
        style={{ animationDuration: '1.4s' }}
      />
    </div>
  )
}

export type PageSkeletonVariant = 'table' | 'cards' | 'detail' | 'form' | 'plain'

type PageSkeletonProps = {
  variant?: PageSkeletonVariant
  /** 表格行数 / 卡片数 / 表单项数 */
  rows?: number
  className?: string
  /** 是否带页面内边距（整页 return 时用 true） */
  padded?: boolean
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <div className="flex gap-3 px-4 py-3 bg-white/[0.04] border-b border-white/10">
        {[28, 20, 24, 16, 18].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-4 w-[18%]" />
            <Skeleton className="h-4 w-[22%]" />
            <Skeleton className="h-4 w-[14%]" />
            <Skeleton className="h-4 w-[20%]" />
            <Skeleton className="h-4 w-[12%] ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CardsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3"
          >
            <Skeleton className="h-5 w-[66%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-9 w-24 mt-2" />
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-[75%]" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[83%]" />
        <Skeleton className="h-4 w-[66%]" />
      </div>
    </div>
  )
}

function FormSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  )
}

function PlainSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  )
}

/**
 * 页面级骨架屏：替换「加载中…」整页/列表占位
 */
export default function PageSkeleton({
  variant = 'table',
  rows,
  className = '',
  padded = true,
}: PageSkeletonProps) {
  const n =
    rows ??
    (variant === 'cards' ? 6 : variant === 'form' ? 5 : variant === 'plain' ? 6 : 8)

  const body =
    variant === 'table' ? (
      <TableSkeleton rows={n} />
    ) : variant === 'cards' ? (
      <CardsSkeleton rows={n} />
    ) : variant === 'detail' ? (
      <DetailSkeleton />
    ) : variant === 'form' ? (
      <FormSkeleton rows={n} />
    ) : (
      <PlainSkeleton rows={n} />
    )

  return (
    <div
      className={`${padded ? 'p-6' : ''} w-full ${className}`}
      role="status"
      aria-busy="true"
      aria-label="加载中"
    >
      {body}
    </div>
  )
}
