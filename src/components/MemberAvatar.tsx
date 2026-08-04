import { useEffect, useState } from 'react'
import { qqAvatarUrl } from '../utils/qqAvatar'

/** 成员头像：自定义 → QQ → 昵称首字 */
export default function MemberAvatar({
  avatar,
  qq,
  name,
  size = 'md',
  className = '',
}: {
  avatar?: string | null
  qq?: string | number | null
  name?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dim =
    size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-9 h-9 text-sm'
  const qqSize = size === 'lg' ? 140 : size === 'sm' ? 40 : 100
  const initial = (name || '?').trim().charAt(0) || '?'
  const custom = avatar?.trim() || null
  const qqSrc = qqAvatarUrl(qq, qqSize)

  const [src, setSrc] = useState<string | null>(custom || qqSrc)
  const [showImg, setShowImg] = useState(!!(custom || qqSrc))

  useEffect(() => {
    const next = custom || qqSrc
    setSrc(next)
    setShowImg(!!next)
  }, [custom, qqSrc])

  const onError = () => {
    if (src && custom && src === custom && qqSrc) {
      setSrc(qqSrc)
      return
    }
    setShowImg(false)
  }

  return (
    <div
      className={`
        ${dim} rounded-full overflow-hidden shrink-0
        flex items-center justify-center
        ${showImg ? 'bg-transparent border-0' : 'bg-purple-600/25 border border-purple-400/25'}
        ${className}
      `}
      title={name || undefined}
    >
      {showImg && src ? (
        <img src={src} alt="" className="w-full h-full object-cover" onError={onError} />
      ) : (
        <span className="font-semibold text-purple-200 leading-none">{initial}</span>
      )}
    </div>
  )
}
