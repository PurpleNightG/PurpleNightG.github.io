import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 生成版本信息
const versionInfo = {
  timestamp: Date.now(),
  buildTime: new Date().toISOString(),
  version: Date.now().toString()
};

// 写入 public 目录
const publicPath = path.join(__dirname, '../public/version.json');
fs.writeFileSync(publicPath, JSON.stringify(versionInfo, null, 2));

console.log('✅ 版本文件已生成:', versionInfo);
