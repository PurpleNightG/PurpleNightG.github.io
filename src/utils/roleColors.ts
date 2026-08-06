/** 成员阶段角色徽章：新训/尖兵保留彩色，管理与教职用黑金属系列 */
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
      return 'role-tint-green'
    case '新训准考':
      return 'role-tint-yellow'

    case '紫夜':
      return 'bg-purple-500/30 text-purple-100'
    case '紫夜尖兵':
      return 'bg-violet-400/28 text-violet-100'

    case '紫夜助教':
      return 'tag-color-metal tag-color-blackemerald'
    case '会长':
      return 'tag-color-metal tag-color-blackgold'
    case '执行官':
      return 'tag-color-metal tag-color-blackcopper'
    case '人事':
      return 'tag-color-metal tag-color-blacksilver'
    case '总教':
      return 'tag-color-metal tag-color-blackrose'
    case '尖兵教官':
      return 'tag-color-metal tag-color-blackviolet'
    case '教官':
      return 'tag-color-metal tag-color-blackcopper'
    case '工程师':
      return 'tag-color-metal tag-color-blackice'

    default:
      break
  }

  if (role.includes('新训')) {
    return 'bg-blue-500/25 text-blue-100'
  }
  return 'bg-purple-500/25 text-purple-100'
}
