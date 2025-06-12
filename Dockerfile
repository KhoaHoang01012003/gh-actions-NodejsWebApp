# Sử dụng Node.js LTS làm base image
FROM node:18.19.0

# Thiết lập thư mục làm việc trong container
WORKDIR /app

RUN npm install -g bower --silent
COPY package*.json bower.json ./
RUN npm install --silent
RUN npm install express --save --silent
COPY . .
RUN bower install --allow-root --silent




# Expose port để container có thể giao tiếp
EXPOSE 8001

# Lệnh để chạy ứng dụng
CMD ["npm", "start"]
