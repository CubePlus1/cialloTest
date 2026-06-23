#!/bin/bash
# 🎓 Ciallo AI 智能刷题系统 - 极速启动脚本

echo -e "\033[1;35m======================================================\033[0m"
echo -e "\033[1;36m🎓 正在为您启动 [Ciallo AI 智能刷题系统] (极光暗黑版)...\033[0m"
echo -e "\033[1;35m======================================================\033[0m"

# 获取脚本所在的绝对路径，确保在任何工作目录下执行都能正确定位文件
CDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$CDIR"

# 自动在默认浏览器中打开页面 (macOS 使用 open 接口)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # 延迟 1 秒等待 Node 服务就绪后平滑开启网页
    (sleep 1 && open "http://localhost:8080") &
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    (sleep 1 && xdg-open "http://localhost:8080") &
fi

# 启动 Node.js 原生服务器
node server.js
