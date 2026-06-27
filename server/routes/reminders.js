import express from 'express'
import { pool } from '../config/database.js'
import { TRAINING_STAGES, LEAVE_BUFFER_EXISTS, TRAINING_INACTIVITY_THRESHOLD_PER_MEMBER, DAYS_UNTIL_TIMEOUT_SQL, BUFFER_REMAINING_DAYS_SQL } from '../utils/reminderQuery.js'

const router = express.Router()

// 获取催促名单（实时从成员表计算，含请假缓冲成员）
router.get('/', async (req, res) => {
  try {
    const [settingRows] = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['reminder_timeout_days']
    )
    const defaultTimeoutDays = settingRows.length > 0
      ? parseInt(settingRows[0].setting_value)
      : 7

    const stagePlaceholders = TRAINING_STAGES.map(() => '?').join(', ')

    const [rows] = await pool.query(`
      SELECT * FROM (
        SELECT
          m.id AS id,
          m.id AS member_id,
          m.nickname AS member_name,
          m.qq,
          m.stage_role,
          m.last_training_date,
          CASE
            WHEN m.last_training_date IS NOT NULL THEN DATEDIFF(CURDATE(), m.last_training_date)
            ELSE DATEDIFF(CURDATE(), m.join_date)
          END AS days_without_training,
          rl.custom_timeout_days,
          ${BUFFER_REMAINING_DAYS_SQL} AS days_until_timeout,
          1 AS is_leave_buffer,
          ${BUFFER_REMAINING_DAYS_SQL} AS buffer_remaining_days
        FROM members m
        INNER JOIN leave_records lr ON lr.id = (
          SELECT id FROM leave_records
          WHERE member_id = m.id
            AND status = '已结束'
            AND buffer_start_date IS NOT NULL
            AND DATEDIFF(CURDATE(), buffer_start_date) < 7
          ORDER BY buffer_start_date DESC
          LIMIT 1
        )
        LEFT JOIN reminder_list rl ON m.id = rl.member_id
        LEFT JOIN retention_records ret ON m.id = ret.member_id
        WHERE m.status NOT IN ('已退队', '请假中', '其他')
          AND m.stage_role IN (${stagePlaceholders})
          AND ret.id IS NULL
          AND ${TRAINING_INACTIVITY_THRESHOLD_PER_MEMBER}

        UNION ALL

        SELECT
          m.id AS id,
          m.id AS member_id,
          m.nickname AS member_name,
          m.qq,
          m.stage_role,
          m.last_training_date,
          CASE
            WHEN m.last_training_date IS NOT NULL THEN DATEDIFF(CURDATE(), m.last_training_date)
            ELSE DATEDIFF(CURDATE(), m.join_date)
          END AS days_without_training,
          rl.custom_timeout_days,
          ${DAYS_UNTIL_TIMEOUT_SQL} AS days_until_timeout,
          0 AS is_leave_buffer,
          NULL AS buffer_remaining_days
        FROM members m
        LEFT JOIN reminder_list rl ON m.id = rl.member_id
        LEFT JOIN retention_records ret ON m.id = ret.member_id
        WHERE m.status NOT IN ('已退队', '请假中', '其他')
          AND m.stage_role IN (${stagePlaceholders})
          AND ${TRAINING_INACTIVITY_THRESHOLD_PER_MEMBER}
          AND ret.id IS NULL
          AND NOT EXISTS (${LEAVE_BUFFER_EXISTS})
      ) combined
      ORDER BY is_leave_buffer DESC, days_without_training DESC
    `, [
      ...TRAINING_STAGES,
      defaultTimeoutDays,
      defaultTimeoutDays,
      defaultTimeoutDays,
      ...TRAINING_STAGES,
      defaultTimeoutDays,
      defaultTimeoutDays,
    ])

    res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取催促名单失败:', error)
    res.status(500).json({ success: false, message: '获取催促名单失败' })
  }
})

// 自动更新催促名单（定时任务）
router.post('/auto-update', async (req, res) => {
  try {
    const { timeoutDays = 7 } = req.body
    
    const trainingStages = TRAINING_STAGES
    
    const [existingSettings] = await pool.query(`
      SELECT member_id, custom_timeout_days 
      FROM reminder_list 
      WHERE custom_timeout_days IS NOT NULL
    `)
    
    const customTimeoutMap = new Map()
    existingSettings.forEach(setting => {
      customTimeoutMap.set(setting.member_id, setting.custom_timeout_days)
    })
    
    const [members] = await pool.query(`
      SELECT 
        m.id,
        m.nickname,
        m.last_training_date,
        m.join_date,
        m.stage_role,
        CASE 
          WHEN m.last_training_date IS NOT NULL THEN DATEDIFF(CURDATE(), m.last_training_date)
          ELSE DATEDIFF(CURDATE(), m.join_date)
        END as days_without_training
      FROM members m
      LEFT JOIN retention_records r ON m.id = r.member_id
      WHERE m.status NOT IN ('已退队', '请假中', '其他')
        AND m.stage_role IN (?, ?, ?, ?, ?, ?)
        AND (
          (m.last_training_date IS NOT NULL AND DATEDIFF(CURDATE(), m.last_training_date) >= GREATEST(? - 7, 0))
          OR (m.last_training_date IS NULL AND m.join_date IS NOT NULL AND DATEDIFF(CURDATE(), m.join_date) >= GREATEST(? - 7, 0))
        )
        AND r.id IS NULL
    `, [...trainingStages, timeoutDays, timeoutDays])
    
    await pool.query('TRUNCATE TABLE reminder_list')
    
    for (const member of members) {
      const customTimeout = customTimeoutMap.get(member.id) || null
      
      await pool.query(`
        INSERT INTO reminder_list (
          member_id,
          member_name,
          stage_role,
          last_training_date,
          days_without_training,
          custom_timeout_days
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        member.id,
        member.nickname,
        member.stage_role,
        member.last_training_date,
        member.days_without_training,
        customTimeout
      ])
    }
    
    res.json({
      success: true,
      message: `催促名单已更新，共 ${members.length} 人（超过 ${timeoutDays} 天未训练）`
    })
  } catch (error) {
    console.error('更新催促名单失败:', error)
    res.status(500).json({
      success: false,
      message: '更新催促名单失败'
    })
  }
})

// 批量更新自定义超时天数（必须在/:id/timeout之前，确保路由正确匹配）
router.put('/batch/timeout', async (req, res) => {
  try {
    const { ids, custom_timeout_days } = req.body
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要修改的成员'
      })
    }
    
    const timeoutValue = custom_timeout_days > 0 ? custom_timeout_days : null
    
    for (const memberId of ids) {
      if (timeoutValue !== null) {
        const [existing] = await pool.query('SELECT id FROM reminder_list WHERE member_id = ?', [memberId])
        if (existing.length > 0) {
          await pool.query('UPDATE reminder_list SET custom_timeout_days = ? WHERE member_id = ?', [timeoutValue, memberId])
        } else {
          await pool.query(`
            INSERT INTO reminder_list (member_id, member_name, stage_role, last_training_date, days_without_training, custom_timeout_days)
            SELECT m.id, m.nickname, m.stage_role, m.last_training_date,
              CASE WHEN m.last_training_date IS NOT NULL
                THEN DATEDIFF(CURDATE(), m.last_training_date)
                ELSE DATEDIFF(CURDATE(), m.join_date)
              END,
              ?
            FROM members m WHERE m.id = ?
          `, [timeoutValue, memberId])
        }
      } else {
        await pool.query('DELETE FROM reminder_list WHERE member_id = ?', [memberId])
      }
    }
    
    res.json({
      success: true,
      message: timeoutValue 
        ? `已为 ${ids.length} 个成员设置自定义超时天数为 ${timeoutValue} 天` 
        : `已为 ${ids.length} 个成员恢复使用全局超时天数设置`
    })
  } catch (error) {
    console.error('批量更新自定义超时天数失败:', error)
    res.status(500).json({
      success: false,
      message: '批量更新自定义超时天数失败'
    })
  }
})

// 更新单个成员的自定义超时天数
router.put('/:id/timeout', async (req, res) => {
  try {
    const { id } = req.params
    const { custom_timeout_days } = req.body
    
    const timeoutValue = custom_timeout_days > 0 ? custom_timeout_days : null
    
    if (timeoutValue !== null) {
      const [existing] = await pool.query('SELECT id FROM reminder_list WHERE member_id = ?', [id])
      if (existing.length > 0) {
        await pool.query('UPDATE reminder_list SET custom_timeout_days = ? WHERE member_id = ?', [timeoutValue, id])
      } else {
        await pool.query(`
          INSERT INTO reminder_list (member_id, member_name, stage_role, last_training_date, days_without_training, custom_timeout_days)
          SELECT m.id, m.nickname, m.stage_role, m.last_training_date,
            CASE WHEN m.last_training_date IS NOT NULL
              THEN DATEDIFF(CURDATE(), m.last_training_date)
              ELSE DATEDIFF(CURDATE(), m.join_date)
            END,
            ?
          FROM members m WHERE m.id = ?
        `, [timeoutValue, id])
      }
    } else {
      await pool.query('DELETE FROM reminder_list WHERE member_id = ?', [id])
    }
    
    res.json({
      success: true,
      message: timeoutValue 
        ? `已设置自定义超时天数为 ${timeoutValue} 天` 
        : '已恢复使用全局超时天数设置'
    })
  } catch (error) {
    console.error('更新自定义超时天数失败:', error)
    res.status(500).json({
      success: false,
      message: '更新自定义超时天数失败'
    })
  }
})

// 从催促名单移除
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    await pool.query('DELETE FROM reminder_list WHERE member_id = ?', [id])
    
    res.json({
      success: true,
      message: '已从催促名单移除'
    })
  } catch (error) {
    console.error('移除催促名单失败:', error)
    res.status(500).json({
      success: false,
      message: '移除催促名单失败'
    })
  }
})

export default router
