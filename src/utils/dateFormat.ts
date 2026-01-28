// 日期格式化工具函数

/**
 * 格式化日期为 YYYY-MM-DD 格式
 * @param dateString - ISO日期字符串或null
 * @returns 格式化后的日期字符串，如果为空则返回 '-'
 */
export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return '-'
  
  try {
    // 如果是 YYYY-MM-DD 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString
    }
    
    // 对于带时间的ISO字符串，提取日期部分
    if (dateString.includes('T')) {
      const datePart = dateString.split('T')[0]
      
      // 如果是 UTC 时间（带 Z），需要检查是否跨日
      if (dateString.endsWith('Z') || dateString.includes('+00:00')) {
        const date = new Date(dateString)
        if (isNaN(date.getTime())) return '-'
        
        // 手动添加 8 小时转换为北京时间
        const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
        
        const year = beijingTime.getUTCFullYear()
        const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0')
        const day = String(beijingTime.getUTCDate()).padStart(2, '0')
        
        return `${year}-${month}-${day}`
      }
      
      return datePart
    }
    
    // 其他格式，使用 Date 对象处理
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
 * 格式化日期时间为 YYYY-MM-DD HH:mm:ss 格式
 * @param dateString - ISO日期时间字符串或null
 * @returns 格式化后的日期时间字符串
 */
export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '-'
  
  try {
    // 如果已经是 YYYY-MM-DD HH:mm:ss 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateString)) {
      return dateString
    }
    
    // 检查是否为 UTC 时间（以 Z 结尾）
    // 如果是 UTC 时间，需要手动转换为北京时间（UTC+8）
    if (dateString.endsWith('Z') || dateString.includes('+00:00')) {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return '-'
      
      // 手动添加 8 小时转换为北京时间
      const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
      
      const year = beijingTime.getUTCFullYear()
      const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0')
      const day = String(beijingTime.getUTCDate()).padStart(2, '0')
      const hours = String(beijingTime.getUTCHours()).padStart(2, '0')
      const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0')
      const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0')
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    }
    
    // 对于其他 ISO 格式（已经是本地时间），直接提取
    if (dateString.includes('T')) {
      const parts = dateString.split('T')
      const datePart = parts[0]
      const timePart = parts[1].split('.')[0]
      return `${datePart} ${timePart}`
    }
    
    // 其他格式，使用 Date 对象处理
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
    // 统一使用 Date 对象来处理，确保时区转换正确
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
