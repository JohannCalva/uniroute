FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/rutas-service/package.json ./packages/rutas-service/
RUN npm install --workspace=packages/rutas-service --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/rutas-service ./packages/rutas-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/rutas-service
EXPOSE 3002
CMD ["node", "packages/rutas-service/dist/index.js"]
