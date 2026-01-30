import express from 'express'
import { pool } from '../config/database.js'
import bcrypt from 'bcryptjs'

const router = express.Router()

// 获取所有成员列表
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        nickname,
        qq,
        game_id,
        join_date,
        stage_role,
        status,
        last_training_date,
        remarks,
        created_at
      FROM members
      ORDER BY created_at DESC
    `)
    
    res.json({
      success: true,
      data: rows
    })
  } catch (error) {
    console.error('获取成员列表失败:', error)
    res.status(500).json({
      success: false,
      message: '获取成员列表失败'
    })
  }
})

// 获取单个成员信息
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const [rows] = await pool.query(
      'SELECT * FROM members WHERE id = ?',
      [id]
    )
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '成员不存在'
      })
    }
    
    res.json({
      success: true,
      data: rows[0]
    })
  } catch (error) {
    console.error('获取成员信息失败:', error)
    res.status(500).json({
      success: false,
      message: '获取成员信息失败'
    })
  }
})

// 添加新成员
router.post('/', async (req, res) => {
  try {
    const {
      nickname,
      qq,
      game_id,
      join_date,
      stage_role,
      status,
      last_training_date
    } = req.body
    
    // 验证必填字段
    if (!nickname || !qq) {
      return res.status(400).json({
        success: false,
        message: '昵称和QQ号为必填项'
      })
    }
    
    // 用户名使用昵称，密码默认为QQ号
    const username = nickname
    const password = qq
    
    // 检查用户名或QQ是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM members WHERE username = ? OR qq = ?',
      [username, qq]
    )
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '昵称或QQ号已存在'
      })
    }
    
    // 加密密码（使用QQ号）
    const hashedPassword = await bcrypt.hash(password, 10)
    
    // 插入数据库
    const [result] = await pool.query(`
      INSERT INTO members (
        username,
        password,
        nickname,
        qq,
        game_id,
        join_date,
        stage_role,
        status,
        last_training_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      username,
      hashedPassword,
      nickname,
      qq,
      game_id || null,
      join_date || new Date(),
      stage_role || '未新训',
      status || '正常',
      last_training_date || null
    ])
    
    res.json({
      success: true,
      message: '成员添加成功',
      data: {
        id: result.insertId
      }
    })
  } catch (error) {
    console.error('添加成员失败:', error)
    res.status(500).json({
      success: false,
      message: '添加成员失败'
    })
  }
})

// 更新成员信息
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      nickname,
      qq,
      game_id,
      join_date,
      stage_role,
      status,
      last_training_date,
      remarks
    } = req.body
    
    // 检查成员是否存在
    const [existing] = await pool.query(
      'SELECT id FROM members WHERE id = ?',
      [id]
    )
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: '成员不存在'
      })
    }
    
    // 更新数据
    await pool.query(`
      UPDATE members SET
        nickname = ?,
        qq = ?,
        game_id = ?,
        join_date = ?,
        stage_role = ?,
        status = ?,
        last_training_date = ?,
        remarks = ?
      WHERE id = ?
    `, [
      nickname,
      qq,
      game_id,
      join_date,
      stage_role,
      status,
      last_training_date,
      remarks || null,
      id
    ])
    
    res.json({
      success: true,
      message: '成员信息更新成功'
    })
  } catch (error) {
    console.error('更新成员信息失败:', error)
    res.status(500).json({
      success: false,
      message: '更新成员信息失败'
    })
  }
})

// 删除成员
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    // 检查成员是否存在
    const [existing] = await pool.query(
      'SELECT id FROM members WHERE id = ?',
      [id]
    )
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: '成员不存在'
      })
    }
    
    // 删除成员
    await pool.query('DELETE FROM members WHERE id = ?', [id])
    
    res.json({
      success: true,
      message: '成员删除成功'
    })
  } catch (error) {
    console.error('删除成员失败:', error)
    res.status(500).json({
      success: false,
      message: '删除成员失败'
    })
  }
})

// 重置单个成员密码为QQ号
router.put('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params
    
    // 获取成员QQ号
    const [members] = await pool.query(
      'SELECT qq, nickname FROM members WHERE id = ?',
      [id]
    )
    
    if (members.length === 0) {
      return res.status(404).json({
        success: false,
        message: '成员不存在'
      })
    }
    
    const { qq, nickname } = members[0]
    
    // 将密码重置为QQ号
    const hashedPassword = await bcrypt.hash(qq, 10)
    
    await pool.query(
      'UPDATE members SET password = ? WHERE id = ?',
      [hashedPassword, id]
    )
    
    res.json({
      success: true,
      message: `已将 ${nickname} 的密码重置为QQ号`
    })
  } catch (error) {
    console.error('重置密码失败:', error)
    res.status(500).json({
      success: false,
      message: '重置密码失败'
    })
  }
})

// 批量重置密码为QQ号
router.put('/batch/reset-password', async (req, res) => {
  try {
    const { ids } = req.body
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要重置密码的成员'
      })
    }
    
    // 批量重置
    for (const id of ids) {
      const [members] = await pool.query(
        'SELECT qq FROM members WHERE id = ?',
        [id]
      )
      
      if (members.length > 0) {
        const { qq } = members[0]
        const hashedPassword = await bcrypt.hash(qq, 10)
        
        await pool.query(
          'UPDATE members SET password = ? WHERE id = ?',
          [hashedPassword, id]
        )
      }
    }
    
    res.json({
      success: true,
      message: `已为 ${ids.length} 个成员重置密码为QQ号`
    })
  } catch (error) {
    console.error('批量重置密码失败:', error)
    res.status(500).json({
      success: false,
      message: '批量重置密码失败'
    })
  }
})

// 自动同步成员阶段
router.post('/sync-stage', async (req, res) => {
  try {
    const { memberIds } = req.body
    
    // 定义不需要自动调整阶段的特殊职位
    const specialRoles = ['新训准考', '紫夜', '紫夜尖兵', '会长', '执行官', '人事', '总教', '尖兵教官', '教官', '工程师']
    
    let updatedCount = 0
    let skippedCount = 0
    const updatedMemberIds = []  // 记录被更新的成员ID
    const warningMembers = []  // 记录新训准考但课程进度不足的成员
    
    // 获取所有课程，按code排序
    const [courses] = await pool.query(`
      SELECT id, code FROM courses ORDER BY code
    `)
    
    // 按课程部分分组（1.X, 2.X, 3.X, 4.X等）
    const courseParts = {
      '1': courses.filter(c => c.code.startsWith('1.')),
      '2': courses.filter(c => c.code.startsWith('2.')),
      '3': courses.filter(c => c.code.startsWith('3.')),
      '4': courses.filter(c => c.code.startsWith('4.'))
    }
    
    // 如果没有提供memberIds，则处理所有非特殊职位的成员
    let membersToProcess
    if (memberIds && memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(',')
      const [members] = await pool.query(
        `SELECT id, nickname, stage_role FROM members WHERE id IN (${placeholders}) AND stage_role NOT IN (${specialRoles.map(() => '?').join(',')})`,
        [...memberIds, ...specialRoles]
      )
      membersToProcess = members
    } else {
      const [members] = await pool.query(
        `SELECT id, nickname, stage_role FROM members WHERE stage_role NOT IN (${specialRoles.map(() => '?').join(',')}) AND status != '已退队'`,
        specialRoles
      )
      membersToProcess = members
    }
    
    for (const member of membersToProcess) {
      // 获取该成员的所有课程进度
      const [progress] = await pool.query(`
        SELECT course_id, progress
        FROM student_course_progress
        WHERE member_id = ? AND progress > 0
      `, [member.id])
      
      // 如果一节课都没上过，跳过
      if (progress.length === 0) {
        skippedCount++
        continue
      }
      
      // 计算各部分完成情况
      let newStage = '未新训'
      let hasAnyProgress = false
      
      // 检查是否有任何课程进度
      for (const p of progress) {
        if (p.progress > 0) {
          hasAnyProgress = true
          break
        }
      }
      
      if (hasAnyProgress) {
        // 至少上过一节课，最低为新训初期
        newStage = '新训初期'
        
        // 检查第一部分是否全部完成
        const part1Completed = courseParts['1'].every(course => {
          const courseProgress = progress.find(p => p.course_id === course.id)
          return courseProgress && courseProgress.progress === 100
        })
        
        if (part1Completed && courseParts['1'].length > 0) {
          newStage = '新训一期'
          
          // 检查第二部分是否全部完成
          const part2Completed = courseParts['2'].every(course => {
            const courseProgress = progress.find(p => p.course_id === course.id)
            return courseProgress && courseProgress.progress === 100
          })
          
          if (part2Completed && courseParts['2'].length > 0) {
            newStage = '新训二期'
            
            // 检查第三部分是否全部完成
            const part3Completed = courseParts['3'].every(course => {
              const courseProgress = progress.find(p => p.course_id === course.id)
              return courseProgress && courseProgress.progress === 100
            })
            
            if (part3Completed && courseParts['3'].length > 0) {
              newStage = '新训三期'
            }
          }
        }
      }
      
      // 如果阶段发生变化，则更新
      if (member.stage_role !== newStage) {
        await pool.query(
          'UPDATE members SET stage_role = ? WHERE id = ?',
          [newStage, member.id]
        )
        updatedCount++
        updatedMemberIds.push(member.id)  // 记录被更新的成员ID
      } else {
        skippedCount++
      }
    }
    
    // 检查所有"新训准考"成员的课程完成情况
    let examCandidateMembers = []
    if (memberIds && memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(',')
      const [members] = await pool.query(
        `SELECT id, nickname FROM members WHERE id IN (${placeholders}) AND stage_role = '新训准考'`,
        memberIds
      )
      examCandidateMembers = members
    } else {
      const [members] = await pool.query(
        `SELECT id, nickname FROM members WHERE stage_role = '新训准考' AND status != '已退队'`
      )
      examCandidateMembers = members
    }
    
    // 检查每个新训准考成员的课程完成情况
    for (const member of examCandidateMembers) {
      const [progress] = await pool.query(`
        SELECT course_id, progress
        FROM student_course_progress
        WHERE member_id = ?
      `, [member.id])
      
      // 检查前四部分是否全部完成
      const part1Completed = courseParts['1'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      const part2Completed = courseParts['2'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      const part3Completed = courseParts['3'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      const part4Completed = courseParts['4'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      // 如果前四部分没有全部完成，记录警告
      if (!part1Completed || !part2Completed || !part3Completed || !part4Completed) {
        warningMembers.push({
          id: member.id,
          nickname: member.nickname
        })
      }
    }
    
    res.json({
      success: true,
      message: `同步完成：更新 ${updatedCount} 人，跳过 ${skippedCount} 人`,
      data: {
        updated: updatedCount,
        skipped: skippedCount,
        updatedMemberIds: updatedMemberIds,  // 返回被更新的成员ID列表
        warningMembers: warningMembers  // 返回新训准考但课程进度不足的成员
      }
    })
  } catch (error) {
    console.error('同步阶段失败:', error)
    res.status(500).json({
      success: false,
      message: '同步阶段失败: ' + error.message
    })
  }
})

// 检测达到准考标准的成员（完成前四部分）
router.get('/exam-candidates', async (req, res) => {
  try {
    // 获取所有课程，按code排序
    const [courses] = await pool.query(`
      SELECT id, code FROM courses ORDER BY code
    `)
    
    // 按课程部分分组（1.X, 2.X, 3.X, 4.X）
    const courseParts = {
      '1': courses.filter(c => c.code.startsWith('1.')),
      '2': courses.filter(c => c.code.startsWith('2.')),
      '3': courses.filter(c => c.code.startsWith('3.')),
      '4': courses.filter(c => c.code.startsWith('4.'))
    }
    
    // 获取所有新训三期的成员（不包括新训准考和特殊职位）
    const [members] = await pool.query(`
      SELECT id, nickname, qq, stage_role, join_date 
      FROM members 
      WHERE stage_role = '新训三期' AND status != '已退队'
      ORDER BY join_date DESC
    `)
    
    const qualifiedMembers = []
    
    // 检查每个成员的课程完成情况
    for (const member of members) {
      const [progress] = await pool.query(`
        SELECT course_id, progress
        FROM student_course_progress
        WHERE member_id = ?
      `, [member.id])
      
      // 检查前四部分是否全部完成
      const part1Completed = courseParts['1'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      const part2Completed = courseParts['2'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      const part3Completed = courseParts['3'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      const part4Completed = courseParts['4'].every(course => {
        const courseProgress = progress.find(p => p.course_id === course.id)
        return courseProgress && courseProgress.progress === 100
      })
      
      // 如果前四部分全部完成，添加到合格列表
      if (part1Completed && part2Completed && part3Completed && part4Completed) {
        qualifiedMembers.push({
          id: member.id,
          nickname: member.nickname,
          qq: member.qq,
          stage_role: member.stage_role,
          join_date: member.join_date
        })
      }
    }
    
    res.json({
      success: true,
      data: qualifiedMembers
    })
  } catch (error) {
    console.error('检测准考标准成员失败:', error)
    res.status(500).json({
      success: false,
      message: '检测准考标准成员失败: ' + error.message
    })
  }
})

export default router
