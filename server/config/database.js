import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

// 创建数据库连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,  // 减少连接池大小，避免超过服务器限制
  maxIdle: 3,  // 最大空闲连接数
  idleTimeout: 60000,  // 空闲连接60秒后释放
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+08:00'  // 设置时区为中国标准时间（东八区），确保所有环境时间一致
})

// 自动创建缺失的表
async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leave_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      member_id INT NOT NULL COMMENT '成员ID',
      member_name VARCHAR(100) NOT NULL COMMENT '成员昵称',
      qq VARCHAR(20) NOT NULL COMMENT 'QQ号',
      reason TEXT COMMENT '请假原因',
      start_date DATE NOT NULL COMMENT '开始日期',
      end_date DATE NOT NULL COMMENT '结束日期',
      total_days INT NOT NULL COMMENT '总天数',
      status ENUM('待审批', '已批准', '已拒绝') DEFAULT '待审批' COMMENT '审批状态',
      reviewer_id INT COMMENT '审批人ID',
      reviewer_name VARCHAR(100) COMMENT '审批人姓名',
      review_date DATE COMMENT '审批日期',
      review_remark TEXT COMMENT '审批备注',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_member (member_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

// 测试数据库连接
async function testConnection() {
  try {
    const connection = await pool.getConnection()
    console.log('✅ 数据库连接成功!')
    console.log(`📊 数据库: ${process.env.DB_NAME}`)
    console.log(`🔗 主机: ${process.env.DB_HOST}:${process.env.DB_PORT}`)
    connection.release()
    await runMigrations()
    return true
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message)
    return false
  }
}

export { pool, testConnection }
