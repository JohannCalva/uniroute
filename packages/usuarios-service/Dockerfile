FROM node:20-alpine
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/usuarios-service/package.json ./packages/usuarios-service/
RUN npm install --workspace=packages/usuarios-service --workspace=packages/shared
COPY packages/shared ./packages/shared
COPY packages/usuarios-service ./packages/usuarios-service
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/usuarios-service
EXPOSE 3001
CMD ["node", "packages/usuarios-service/dist/index.js"]
