/** 成员阶段角色徽章颜色（避开状态色与职位色冲突） */
export function getRoleColor(role: string): string {
  // 紫夜相关 - 紫色
  if (role === '紫夜' || role === '紫夜尖兵') {
    return 'bg-purple-600/20 text-purple-300'
  }
  // 领导层 - 琥珀色
  if (role === '会长' || role === '执行官') {
    return 'bg-amber-600/20 text-amber-300'
  }
  // 教官相关 - 绿色
  if (role === '总教' || role === '尖兵教官' || role === '教官') {
    return 'bg-green-600/20 text-green-300'
  }
  // 人事 - 青色
  if (role === '人事') {
    return 'bg-cyan-600/20 text-cyan-300'
  }
  // 工程师 - 天蓝
  if (role === '工程师') {
    return 'bg-sky-600/20 text-sky-300'
  }

  // 新训阶段：各自独立色相，避开上面职位色与 绿/黄/红 状态色
  switch (role) {
    case '新训初期':
      return 'bg-indigo-600/20 text-indigo-300' // 靛蓝
    case '新训一期':
      return 'bg-teal-600/20 text-teal-300' // 青绿（区别于人事 cyan）
    case '新训二期':
      return 'bg-blue-600/20 text-blue-300' // 蓝色（避开紫夜紫 / 紫罗兰）
    case '新训三期':
      return 'bg-orange-600/20 text-orange-300' // 橙色（区别于会长 amber）
    case '新训准考':
      return 'bg-rose-600/20 text-rose-300' // 玫红，突出准考
    case '未新训':
      return 'bg-gray-600/20 text-gray-300'
    default:
      break
  }

  if (role.includes('新训')) {
    return 'bg-blue-600/20 text-blue-300'
  }
  return 'bg-gray-600/20 text-gray-300'
}
