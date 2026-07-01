FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api-gateway/package.json ./packages/api-gateway/
RUN npm install --workspace=packages/api-gateway --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/api-gateway ./packages/api-gateway
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/api-gateway
EXPOSE 3000
CMD ["node", "packages/api-gateway/dist/index.js"]
