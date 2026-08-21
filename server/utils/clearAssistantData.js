/**
 * 撤销助教时：清除该成员作为助教产生的全部归属与申请数据。
 * 学员退队时：解除其作为学员的归属关系。
 */

async function safeExec(connOrPool, sql, params = []) {
  try {
    await connOrPool.query(sql, params)
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') return
    throw e
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} assistantMemberId
 */
export async function clearAssistantRoleData(pool, assistantMemberId) {
  const id = Number(assistantMemberId)
  if (!id) return

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await safeExec(conn, 'DELETE FROM assistant_student_assignments WHERE assistant_member_id = ?', [id])
    await safeExec(conn, 'DELETE FROM assistant_daily_assignments WHERE assistant_member_id = ?', [id])
    await safeExec(conn, 'DELETE FROM assistant_permissions WHERE assistant_member_id = ?', [id])
    await safeExec(conn, 'DELETE FROM pending_member_creates WHERE assistant_member_id = ?', [id])
    await safeExec(conn, 'DELETE FROM pending_stage_promotions WHERE assistant_member_id = ?', [id])
    await safeExec(conn, 'DELETE FROM pending_member_edits WHERE assistant_member_id = ?', [id])
    await safeExec(conn, 'DELETE FROM pending_black_points WHERE assistant_member_id = ?', [id])
    await safeExec(conn, 'DELETE FROM pending_leaves WHERE assistant_member_id = ?', [id])
    await safeExec(
      conn,
      'UPDATE quit_approvals SET source_assistant_id = NULL WHERE source_assistant_id = ?',
      [id]
    )

    await conn.commit()
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

/**
 * 学员退队：解除长期归属（标为已解除）并删除当日临时分配。
 * 不删成员档案；恢复进队后需重新分配助教。
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} poolOrConn
 * @param {number} studentMemberId
 * @param {{ adminId?: number|null }} [opts]
 */
export async function releaseAssignmentsForStudent(poolOrConn, studentMemberId, opts = {}) {
  const id = Number(studentMemberId)
  if (!id) return
  const adminId = opts.adminId != null ? Number(opts.adminId) : null

  await safeExec(
    poolOrConn,
    `UPDATE assistant_student_assignments
     SET status = '已解除',
         reviewed_by_admin_id = COALESCE(?, reviewed_by_admin_id),
         reviewed_at = NOW(),
         hidden_from_approval = 0
     WHERE student_member_id = ? AND status IN ('已通过', '待审批')`,
    [adminId, id]
  )
  await safeExec(poolOrConn, 'DELETE FROM assistant_daily_assignments WHERE student_member_id = ?', [id])
}

/**
 * 修复历史：已退队学员仍挂着有效归属的，一并解除
 * @param {import('mysql2/promise').Pool} pool
 */
export async function cleanupAssignmentsForRetiredStudents(pool) {
  await safeExec(
    pool,
    `UPDATE assistant_student_assignments a
     INNER JOIN members m ON m.id = a.student_member_id
     SET a.status = '已解除', a.reviewed_at = NOW(), a.hidden_from_approval = 0
     WHERE m.status = '已退队' AND a.status IN ('已通过', '待审批')`
  )
  await safeExec(
    pool,
    `DELETE d FROM assistant_daily_assignments d
     INNER JOIN members m ON m.id = d.student_member_id
     WHERE m.status = '已退队'`
  )
}

/**
 * 清理「已不是助教」但仍残留的归属 / 申请（修复历史撤销未清数据）
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} assistantRoleName 阶段名「紫夜助教」
 */
export async function cleanupOrphanedAssistantData(pool, assistantRoleName = '紫夜助教') {
  const notAsst = `(COALESCE(m.is_ziye_assistant, 0) = 0 AND m.stage_role <> ?)`
  const join = `INNER JOIN members m ON m.id = t.assistant_member_id WHERE ${notAsst}`

  await safeExec(
    pool,
    `DELETE t FROM assistant_student_assignments t ${join}`,
    [assistantRoleName]
  )
  await safeExec(
    pool,
    `DELETE t FROM assistant_daily_assignments t ${join}`,
    [assistantRoleName]
  )
  await safeExec(
    pool,
    `DELETE t FROM assistant_permissions t ${join}`,
    [assistantRoleName]
  )
  await safeExec(
    pool,
    `DELETE t FROM pending_member_creates t ${join}`,
    [assistantRoleName]
  )
  await safeExec(
    pool,
    `DELETE t FROM pending_stage_promotions t ${join}`,
    [assistantRoleName]
  )
  await safeExec(
    pool,
    `DELETE t FROM pending_member_edits t ${join}`,
    [assistantRoleName]
  )
  await safeExec(
    pool,
    `DELETE t FROM pending_black_points t ${join}`,
    [assistantRoleName]
  )
  await safeExec(
    pool,
    `DELETE t FROM pending_leaves t ${join}`,
    [assistantRoleName]
  )
}
