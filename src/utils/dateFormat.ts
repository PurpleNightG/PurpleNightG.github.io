// 日期格式化工具函数

/**
 * 格式化日期为 YYYY-MM-DD 格式
 * @param dateString - ISO日期字符串或null
 * @returns 格式化后的日期字符串，如果为空则返回 '-'
 */
export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-'
  
  try {
    // 如果是纯日期格式（YYYY-MM-DD），直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString
    }
    
    const date = new Date(dateString)
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) return '-'
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    return `${year}-${month}-${day}`
  } catch (error) {
    return '-'
  }
}

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm:ss 格式（北京时间）
 * @param dateString - ISO日期时间字符串或null
 * @returns 格式化后的日期时间字符串
 */
export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '-'
  
  try {
    // 如果已经是标准格式（YYYY-MM-DD HH:mm:ss），直接返回
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
      return dateString
    }
    
    // 手动解析时间字符串，强制当作本地时间（北京时间）
    // 支持格式：YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm:ss
    const normalizedStr = dateString.replace('T', ' ').replace('Z', '').split('.')[0]
    const match = normalizedStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
    
    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }
    
    // 如果匹配失败，尝试用Date对象
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '-'
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  } catch (error) {
    return '-'
  }
}

/**
 * 将日期转换为用于input[type="date"]的格式 (YYYY-MM-DD)
 * 使用 Date 对象进行时区转换，确保与显示一致
 * @param dateString - ISO日期字符串或Date对象
 * @returns YYYY-MM-DD 格式的字符串
 */
export const toInputDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return ''
  
  try {
    const dateStr = typeof dateString === 'string' ? dateString : dateString.toISOString()
    
    // 如果是纯日期格式（YYYY-MM-DD），直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr
    }
    
    // 统一使用 Date 对象来处理
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    
    if (isNaN(date.getTime())) return ''
    
    // 使用本地时区的日期
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    return `${year}-${month}-${day}`
  } catch (error) {
    return ''
  }
}

/**
 * 计算两个日期之间的天数差
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @returns 天数差
 */
export const daysBetween = (startDate: string | Date, endDate: string | Date): number => {
  try {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate
    
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    return diffDays
  } catch (error) {
    return 0
  }
}
