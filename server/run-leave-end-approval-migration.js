import { pool, testConnection } from './config/database.js'

async function main() {
  const ok = await testConnection()
  if (!ok) process.exit(1)
  console.log('迁移检查完成')
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
