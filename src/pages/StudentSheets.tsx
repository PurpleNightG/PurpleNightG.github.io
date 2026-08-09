import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table2, Share2, Lock, Users, ChevronRight, FileSpreadsheet, Pin } from 'lucide-react'
import { sheetAPI } from '../utils/api'
import { toast } from '../utils/toast'
import { formatDateTime } from '../utils/dateFormat'
import PageSkeleton from '../components/Skeleton'

interface WorkbookItem {
  id: number
  title: string
  description: string
  access_mode: 'shared' | 'student_readonly' | 'assigned'
  can_edit?: boolean
  is_pinned?: boolean
  updated_at?: string
  updated_by?: string | null
}

export default function StudentSheets() {
  const navigate = useNavigate()
  const [list, setList] = useState<WorkbookItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sheetAPI
      .studentList()
      .then((res) => setList(res.data || []))
      .catch((e: any) => toast.error(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/20">
            <Table2 className="text-emerald-300" size={22} />
          </span>
          表格文档
        </h1>
        <p className="text-sm text-gray-400 mt-2">查看或协作编辑公会共享表格</p>
      </header>

      {loading ? (
        <PageSkeleton variant="table" padded={false} />
      ) : list.length === 0 ? (
        <div className="student-glass-panel student-glass-panel--tilt-only py-16 px-6 text-center">
          <FileSpreadsheet className="mx-auto text-gray-600 mb-3" size={36} />
          <p className="text-gray-400 text-sm">暂无已发布的表格</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => navigate(`/student/sheets/${item.id}`)}
                className="student-glass-panel student-glass-panel--tilt-only w-full text-left overflow-hidden"
              >
                <div className="flex gap-0">
                  <div
                    className={`w-1 shrink-0 ${
                      item.is_pinned
                        ? 'bg-amber-400/80'
                        : item.can_edit
                          ? item.access_mode === 'assigned'
                            ? 'bg-sky-500/70'
                            : 'bg-blue-500/70'
                          : 'bg-amber-500/50'
                    }`}
                  />
                  <div className="flex-1 min-w-0 p-3.5 sm:p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white truncate">
                          {item.title}
                        </span>
                        {item.is_pinned && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-amber-500/20 text-amber-200 inline-flex items-center gap-0.5">
                            <Pin size={10} /> 置顶
                          </span>
                        )}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 shrink-0 ${
                            item.can_edit
                              ? item.access_mode === 'assigned'
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'bg-blue-500/20 text-blue-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {item.can_edit ? (
                            item.access_mode === 'assigned' ? (
                              <>
                                <Users size={10} /> 指派填写
                              </>
                            ) : (
                              <>
                                <Share2 size={10} /> 可编辑
                              </>
                            )
                          ) : (
                            <>
                              <Lock size={10} /> 只读
                            </>
                          )}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-400 mt-1 line-clamp-1">{item.description}</p>
                      )}
                      <div className="text-[11px] text-gray-500 mt-1.5">
                        更新 {formatDateTime(item.updated_at)}
                        {item.updated_by ? ` · ${item.updated_by}` : ''}
                      </div>
                    </div>
                    <ChevronRight className="text-gray-600 shrink-0" size={18} />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
