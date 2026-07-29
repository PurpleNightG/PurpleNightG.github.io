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
  timezone: '+08:00',  // 设置时区为中国标准时间（东八区），确保所有环境时间一致
  dateStrings: true,   // DATE/DATETIME 以字符串返回，避免 JSON 序列化时区偏移
})

// 自动创建缺失的表与字段
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

  const [cols] = await pool.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'leave_records'
      AND COLUMN_NAME = 'buffer_start_date'
  `)
  if (cols.length === 0) {
    await pool.query(`
      ALTER TABLE leave_records
        MODIFY COLUMN status ENUM('请假中', '待结束审批', '已结束') DEFAULT '请假中' COMMENT '状态',
        ADD COLUMN buffer_start_date DATE NULL COMMENT '结束审批通过日期（缓冲期起点）' AFTER status,
        ADD COLUMN end_approver_name VARCHAR(100) NULL COMMENT '结束审批人' AFTER buffer_start_date
    `)
    console.log('✅ leave_records 结束审批字段迁移完成')
  }

  const [assistantCol] = await pool.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'members'
      AND COLUMN_NAME = 'is_assistant'
  `)
  if (assistantCol.length === 0) {
    await pool.query(`
      ALTER TABLE members
        ADD COLUMN is_assistant TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为屏幕共享助教' AFTER remarks,
        ADD COLUMN screen_share_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '助教是否允许使用声网/火山共享' AFTER is_assistant,
        ADD COLUMN screen_share_quota INT NULL COMMENT '助教声网/火山共享次数上限，NULL为不限' AFTER screen_share_enabled,
        ADD COLUMN screen_share_used INT NOT NULL DEFAULT 0 COMMENT '助教已使用声网/火山共享次数' AFTER screen_share_quota
    `)
    console.log('✅ members 屏幕共享助教字段迁移完成')
  }

  const [assessmentIdCol] = await pool.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'public_videos'
      AND COLUMN_NAME = 'assessment_id'
  `)
  if (assessmentIdCol.length === 0) {
    await pool.query(`
      ALTER TABLE public_videos
        ADD COLUMN assessment_id INT NULL COMMENT '关联考核报告ID' AFTER created_by
    `)
    await pool.query(`
      ALTER TABLE public_videos
        ADD UNIQUE INDEX idx_public_videos_assessment_id (assessment_id)
    `)
    await pool.query(`
      ALTER TABLE public_videos
        ADD CONSTRAINT fk_public_videos_assessment
        FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE SET NULL
    `)
    console.log('✅ public_videos assessment_id 字段迁移完成')
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS surveys (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(200) NOT NULL COMMENT '标题',
      description TEXT NULL COMMENT '说明',
      fields_json JSON NOT NULL COMMENT '题目定义',
      is_anonymous TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否匿名',
      start_at DATETIME NULL COMMENT '开始时间',
      end_at DATETIME NULL COMMENT '结束时间',
      status ENUM('draft','published','closed') NOT NULL DEFAULT 'draft' COMMENT '状态',
      audience_roles_json JSON NULL COMMENT '可填阶段角色，空=全体',
      created_by VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_survey_status (status),
      INDEX idx_survey_time (start_at, end_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='填表/调查问卷'
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS survey_claims (
      id INT PRIMARY KEY AUTO_INCREMENT,
      survey_id INT NOT NULL,
      member_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME NULL,
      UNIQUE KEY uk_survey_member (survey_id, member_id),
      UNIQUE KEY uk_token_hash (token_hash),
      INDEX idx_survey_claim (survey_id),
      CONSTRAINT fk_survey_claims_survey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='匿名填表领取凭证'
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id INT PRIMARY KEY AUTO_INCREMENT,
      survey_id INT NOT NULL,
      answers_json JSON NOT NULL,
      member_id INT NULL COMMENT '实名时填写，匿名必须为空',
      token_hash VARCHAR(64) NULL COMMENT '匿名防重复，管理端不展示',
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_survey_resp (survey_id),
      UNIQUE KEY uk_survey_member_resp (survey_id, member_id),
      UNIQUE KEY uk_survey_token_resp (survey_id, token_hash),
      CONSTRAINT fk_survey_responses_survey FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='填表答卷'
  `)

  try {
    await pool.query(`
      ALTER TABLE surveys
      ADD COLUMN subjects_json JSON NULL COMMENT '满意度评价对象（教官等）' AFTER fields_json
    `)
    console.log('✅ surveys.subjects_json 字段迁移完成')
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') throw e
  }

  console.log('✅ surveys 相关表迁移完成')
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
