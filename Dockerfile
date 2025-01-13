# Sử dụng Node.js LTS làm base image
FROM node:18.19.0

# Thiết lập thư mục làm việc trong container
WORKDIR /app

# Sao chép file package.json và package-lock.json vào container
COPY . .

# Cài đặt dependencies
RUN npm install -g bower
RUN bower install --allow-root
RUN npm install


# Expose port để container có thể giao tiếp
EXPOSE 8001

# Lệnh để chạy ứng dụng
CMD ["npm", "start"]
