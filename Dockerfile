FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/gaplab.sqlite
EXPOSE 3000
VOLUME ["/data"]
CMD ["npm", "start"]
