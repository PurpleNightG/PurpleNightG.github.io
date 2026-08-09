import { Eye, PenLine, Users } from 'lucide-react'
import type { SheetPresenceUser } from '../hooks/useSheetPresence'

function chipClass(editing: boolean, role: string) {
  if (editing) return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/25'
  if (role === 'admin') return 'bg-violet-500/15 text-violet-200 border-violet-500/20'
  return 'bg-white/8 text-gray-300 border-white/10'
}

export default function SheetPresenceBar({
  others,
  othersEditing,
  updatedAtLabel,
  updatedBy,
  dirty,
}: {
  others: SheetPresenceUser[]
  othersEditing: SheetPresenceUser[]
  updatedAtLabel?: string
  updatedBy?: string | null
  dirty?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {others.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <Users size={12} />
            目前只有你在此表格
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
              <Users size={12} />
              在场 {others.length}
            </span>
            {others.slice(0, 8).map((p) => (
              <span
                key={p.key}
                title={p.editing ? '正在编辑' : '正在查看'}
                className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md border ${chipClass(
                  p.editing,
                  p.role
                )}`}
              >
                {p.editing ? <PenLine size={10} /> : <Eye size={10} />}
                <span className="max-w-[6.5rem] truncate">{p.name}</span>
                {p.role === 'admin' && <span className="opacity-60">管</span>}
              </span>
            ))}
            {others.length > 8 && (
              <span className="text-[11px] text-gray-500">+{others.length - 8}</span>
            )}
          </>
        )}
      </div>
      <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5">
        <span>{dirty ? '本地有未保存更改' : '已与服务器同步'}</span>
        {updatedAtLabel && <span>最近保存 {updatedAtLabel}</span>}
        {updatedBy && <span>· {updatedBy}</span>}
      </div>
      {othersEditing.length > 0 && (
        <div className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1">
          {othersEditing.map((p) => p.name).join('、')} 也在编辑。表格非实时协同，请避免同改一处，保存后可点刷新查看对方结果。
        </div>
      )}
    </div>
  )
}
