FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/websocket-server/package.json ./packages/websocket-server/
RUN npm install --workspace=packages/websocket-server --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/websocket-server ./packages/websocket-server
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/websocket-server
EXPOSE 3003
CMD ["node", "packages/websocket-server/dist/index.js"]
