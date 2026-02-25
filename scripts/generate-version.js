import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 计算文档文件夹的哈希值
function calculateDocsHash() {
  const docsDir = path.join(__dirname, '../public/docs');
  const hash = crypto.createHash('md5');
  
  try {
    // 读取所有文档文件并排序（确保顺序一致）
    const files = fs.readdirSync(docsDir)
      .filter(file => file.endsWith('.md') || file.endsWith('.json'))
      .sort();
    
    // 将所有文件内容合并计算哈希
    files.forEach(file => {
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      hash.update(file + content);
    });
    
    return hash.digest('hex').substring(0, 12);
  } catch (error) {
    console.warn('⚠️ 无法读取docs目录，使用时间戳作为版本号');
    return Date.now().toString();
  }
}

// 生成版本信息
const versionInfo = {
  timestamp: Date.now(),
  buildTime: new Date().toISOString(),
  version: calculateDocsHash()
};

// 写入 public 目录
const publicPath = path.join(__dirname, '../public/version.json');
fs.writeFileSync(publicPath, JSON.stringify(versionInfo, null, 2));

console.log('✅ 版本文件已生成:', versionInfo);
