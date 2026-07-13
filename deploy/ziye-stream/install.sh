#!/bin/bash
# 紫夜屏幕共享 - ZLMediaKit + Coturn 一键部署（CentOS 7.6）
# 用法: sudo bash install.sh <公网IP> [可选：流媒体域名]
set -e

PUBLIC_IP="${1:-}"
DOMAIN="${2:-}"
ZLM_SECRET="035c73f7-bb6b-4889-a715-d9eb2d1925cc"

if [ -z "$PUBLIC_IP" ]; then
  echo "用法: sudo bash install.sh <公网IP> [域名]"
  echo "示例（仅 IP，HTTP 测试）: sudo bash install.sh 123.45.67.89"
  echo "示例（有域名时加 HTTPS）: sudo bash install.sh 123.45.67.89 stream.你的域名.com"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

compose() {
  if docker compose version &>/dev/null; then
    docker compose "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose "$@"
  else
    echo "错误: 未找到 docker compose，请先安装 Docker"
    exit 1
  fi
}

echo "==> [1/7] 安装 Docker..."
if ! command -v docker &>/dev/null; then
  yum install -y yum-utils device-mapper-persistent-data lvm2 curl
  if ! yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null; then
    echo "yum 安装 Docker 失败，尝试官方脚本..."
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable docker
  systemctl start docker
  if ! docker info &>/dev/null; then
    echo "错误: Docker 安装后仍无法启动，请检查: systemctl status docker"
    exit 1
  fi
  echo "Docker 安装成功: $(docker --version)"
else
  echo "Docker 已安装: $(docker --version)"
fi

if ! docker compose version &>/dev/null && ! command -v docker-compose &>/dev/null; then
  echo "安装 docker-compose..."
  curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

setup_docker_mirrors() {
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io"
  ]
}
EOF
  systemctl daemon-reload
  systemctl restart docker
  sleep 3
}

pull_image_with_fallback() {
  local target="$1"
  shift
  local tried=("$target" "$@")
  for src in "${tried[@]}"; do
    echo "  尝试拉取: $src"
    if docker pull "$src"; then
      if [ "$src" != "$target" ]; then
        docker tag "$src" "$target"
      fi
      echo "  成功: $target"
      return 0
    fi
  done
  echo "  失败: 无法拉取 $target"
  return 1
}

echo "==> [2/8] 写入 Coturn 配置（公网 IP: $PUBLIC_IP）..."
cp coturn/turnserver.conf coturn/turnserver.conf.bak 2>/dev/null || true
sed "s/__PUBLIC_IP__/$PUBLIC_IP/g" coturn/turnserver.conf.bak > coturn/turnserver.conf 2>/dev/null || \
sed "s/__PUBLIC_IP__/$PUBLIC_IP/g" coturn/turnserver.conf > coturn/turnserver.conf.tmp && mv coturn/turnserver.conf.tmp coturn/turnserver.conf

echo "==> [3/8] 配置 Docker 镜像加速（解决 Docker Hub 超时）..."
setup_docker_mirrors

echo "==> [4/8] 开放防火墙端口..."
if systemctl is-active firewalld &>/dev/null; then
  firewall-cmd --permanent --add-port=8080/tcp
  firewall-cmd --permanent --add-port=8000/tcp
  firewall-cmd --permanent --add-port=8000/udp
  firewall-cmd --permanent --add-port=3478/tcp
  firewall-cmd --permanent --add-port=3478/udp
  firewall-cmd --permanent --add-port=49152-65535/udp
  firewall-cmd --reload
  echo "firewalld 端口已开放"
else
  echo "未检测到 firewalld，请手动在云厂商安全组开放: 8080/tcp, 8000/tcp+udp, 3478/tcp+udp, 49152-65535/udp"
fi

echo "==> [5/8] 拉取镜像并启动 ZLMediaKit + Coturn..."
compose down 2>/dev/null || true

pull_image_with_fallback "zlmediakit/zlmediakit:master" \
  "docker.1ms.run/zlmediakit/zlmediakit:master" \
  "docker.m.daocloud.io/zlmediakit/zlmediakit:master" \
  "swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/zlmediakit/zlmediakit:master"

pull_image_with_fallback "coturn/coturn:4.6.2-r8" \
  "docker.1ms.run/coturn/coturn:4.6.2-r8" \
  "docker.m.daocloud.io/coturn/coturn:4.6.2-r8" \
  "swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/coturn/coturn:4.6.2-r8"

compose up -d

echo "==> [6/8] 等待 ZLMediaKit 就绪..."
ZLM_OK=0
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:8080/index/api/version" >/dev/null 2>&1; then
    ZLM_OK=1
    break
  fi
  sleep 2
done

if [ "$ZLM_OK" -ne 1 ]; then
  echo ""
  echo "!!! ZLMediaKit 未在 8080 端口启动，请执行以下命令排查："
  echo "  docker logs ziye-zlm --tail 50"
  echo "  ss -tlnp | grep -E ':8080|:8000'"
  echo ""
  compose ps || true
  compose logs zlmediakit --tail 30 || true
  exit 1
fi

echo "ZLMediaKit 启动成功"

echo "==> [6/8] 配置 WebRTC 公网 IP..."
ZLM_SECRET=$(docker logs ziye-zlm 2>&1 | grep 'modified it to' | tail -1 | sed 's/.*modified it to: \([^,]*\).*/\1/' | tr -d ' ')
if [ -z "$ZLM_SECRET" ]; then
  ZLM_SECRET="035c73f7-bb6b-4889-a715-d9eb2d1925cc"
fi
curl -sf "http://127.0.0.1:8080/index/api/setServerConfig?secret=${ZLM_SECRET}&rtc.externIP=${PUBLIC_IP}" >/dev/null || \
  echo "警告: 设置 externIP 失败，请查看 docker logs ziye-zlm 里的 api.secret 后手动 setServerConfig"

echo "==> [8/8] 配置 HTTPS 反向代理（可选）..."
if [ -n "$DOMAIN" ]; then
  yum install -y epel-release nginx certbot python2-certbot-nginx 2>/dev/null || yum install -y nginx certbot python2-certbot-nginx
  cat > /etc/nginx/conf.d/ziye-stream.conf <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS, DELETE' always;
        add_header Access-Control-Allow-Headers 'Content-Type, Authorization' always;
        if (\$request_method = OPTIONS) { return 204; }
    }
}
NGINX
  systemctl enable nginx
  systemctl restart nginx
  echo "Nginx 已配置，正在申请 SSL 证书..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@$DOMAIN --redirect || echo "SSL 申请失败，请手动运行: certbot --nginx -d $DOMAIN"
  echo ""
  echo "============================================"
  echo "部署完成！请在项目 .env 中添加："
  echo "VITE_ZIYE_SERVER_URL=https://$DOMAIN"
  echo "============================================"
else
  echo ""
  echo "============================================"
  echo "部署完成（HTTP 模式）！请在项目 .env 中添加："
  echo "VITE_ZIYE_SERVER_URL=http://$PUBLIC_IP:8080"
  echo ""
  echo "注意: 官网是 HTTPS 时，浏览器会拦截 HTTP 请求。"
  echo "建议绑定域名后重新运行:"
  echo "  sudo bash install.sh $PUBLIC_IP stream.你的域名.com"
  echo "============================================"
fi

echo ""
echo "验证命令:"
echo "  curl http://127.0.0.1:8080/index/api/version"
echo "  compose ps"
echo "  compose logs -f"
