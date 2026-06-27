/**
 * 规范化为 MySQL DATE 字符串 (YYYY-MM-DD)，不做 UTC 偏移
 */
export function toMySQLDate(value) {
  if (value == null || value === '') return null

  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10)
  }

  const date = value instanceof Date ? value : new Date(str)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date)
}
