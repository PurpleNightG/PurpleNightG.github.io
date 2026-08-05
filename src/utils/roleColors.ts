/** 成员阶段角色徽章：偏紫冷色玻璃底，避免琥珀/橄榄绿发棕 */
export function getRoleColor(role: string): string {
  switch (role) {
    case '未新训':
      return 'bg-rose-500/25 text-rose-100'
    case '新训初期':
      return 'bg-sky-500/25 text-sky-100'
    case '新训一期':
      return 'bg-cyan-500/25 text-cyan-100'
    case '新训二期':
      return 'bg-blue-500/25 text-blue-100'
    case '新训三期':
      return 'bg-violet-500/25 text-violet-100'
    case '新训准考':
      return 'bg-fuchsia-500/25 text-fuchsia-100'

    case '紫夜':
      return 'bg-purple-500/30 text-purple-100'
    case '紫夜尖兵':
      return 'bg-violet-400/28 text-violet-100'
    case '紫夜助教':
      return 'bg-teal-500/28 text-teal-50'

    case '会长':
      return 'bg-fuchsia-400/28 text-fuchsia-50'
    case '执行官':
      return 'bg-pink-500/28 text-pink-100'
    case '人事':
      return 'bg-cyan-400/25 text-cyan-50'
    case '总教':
      return 'bg-emerald-400/25 text-emerald-50'
    case '尖兵教官':
      return 'bg-indigo-400/28 text-indigo-50'
    case '教官':
      return 'bg-purple-400/28 text-purple-50'
    case '工程师':
      return 'bg-violet-500/28 text-violet-50'

    default:
      break
  }

  if (role.includes('新训')) {
    return 'bg-blue-500/25 text-blue-100'
  }
  return 'bg-purple-500/25 text-purple-100'
}
