import MemberAvatar from './MemberAvatar'

/** 表格/列表中：头像 + 昵称 */
export default function MemberNameCell({
  name,
  avatar,
  qq,
  className = '',
  size = 'sm',
}: {
  name?: string | null
  avatar?: string | null
  qq?: string | number | null
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const label = name || '-'
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <MemberAvatar
        avatar={avatar}
        qq={qq}
        name={label === '-' ? '?' : label}
        size={size}
      />
      <span className="truncate">{label}</span>
    </div>
  )
}
