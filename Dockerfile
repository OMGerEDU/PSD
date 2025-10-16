FROM node:20-slim
WORKDIR /app

COPY package.json ./
COPY src ./src
COPY template-registry.json ./
COPY .env.example ./

ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "src/index.js"]
