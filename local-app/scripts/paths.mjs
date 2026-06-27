import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const LOCAL_APP_DIR = path.resolve(__dirname, '..')
export const ROOT_DIR = path.resolve(LOCAL_APP_DIR, '..')
export const SERVER_DIR = path.join(ROOT_DIR, 'server')
export const SERVER_ENV = path.join(SERVER_DIR, '.env')
export const SERVER_ENV_EXAMPLE = path.join(SERVER_DIR, '.env.example')

export const BACKEND_PORT = 3000
export const FRONTEND_PORT = 3001
export const API_URL = `http://localhost:${BACKEND_PORT}/api`
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`
