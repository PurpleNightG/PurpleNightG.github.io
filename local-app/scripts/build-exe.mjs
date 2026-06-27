import { buildSingleFileExe } from './build-sfx.mjs'
import { fail } from './build-utils.mjs'

buildSingleFileExe().catch((error) => {
  fail(error.message)
})
