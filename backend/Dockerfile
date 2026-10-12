ARG NODE_IMAGE=653380732738.dkr.ecr.ap-south-1.amazonaws.com/node-24.18.0-alpine3.24-arm:node-24.18.0-alpine3.24-arm-patch-20260915

FROM ${NODE_IMAGE} AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci --include=dev
COPY backend/ ./
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4545 \
    AWS_REGION=ap-south-1
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY backend/assets ./assets
EXPOSE 4545
USER node
CMD ["node", "--enable-source-maps", "dist/server.js"]
