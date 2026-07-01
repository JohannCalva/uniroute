FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/despachos-service/package.json ./packages/despachos-service/
RUN npm install --workspace=packages/despachos-service --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/despachos-service ./packages/despachos-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/despachos-service
EXPOSE 3004
CMD ["node", "packages/despachos-service/dist/index.js"]
