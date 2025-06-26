#!/bin/bash

# Kiểm tra xem concurrently có được cài đặt không
if ! command -v concurrently &> /dev/null; then
    echo "Installing concurrently globally..."
    npm install -g concurrently
fi

# Kiểm tra backend/.env
if [ ! -f backend/.env ]; then
    echo "Error: backend/.env not found. Please create it with GITHUB_TOKEN and PORT=8002."
    exit 1
fi

# Kiểm tra GITHUB_TOKEN trong backend/.env
if ! grep -q "GITHUB_TOKEN" backend/.env; then
    echo "Error: GITHUB_TOKEN not found in backend/.env."
    exit 1
fi

# Cài đặt dependencies nếu cần
echo "Installing dependencies..."
cd backend && npm install && cd ..
cd dashboard && npm install && cd ..

# Chạy backend và dashboard đồng thời
echo "Starting backend and dashboard..."
concurrently \
    --names "backend,dashboard" \
    --prefix-colors "blue,green" \
    "cd backend && npm start" \
    "cd dashboard && npm run dev"
