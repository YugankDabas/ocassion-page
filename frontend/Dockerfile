ARG NODE_IMAGE=653380732738.dkr.ecr.ap-south-1.amazonaws.com/node-24.18.0-alpine3.24-arm:node-24.18.0-alpine3.24-arm-patch-20260915
ARG VITE_API_BASE_URL=https://api-occasion-admin.gyftr.net

FROM ${NODE_IMAGE} AS build
ARG VITE_API_BASE_URL
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev
COPY frontend/ ./
COPY backend/src/contracts/ /app/backend/src/contracts/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4546
WORKDIR /app
COPY --from=build /app/frontend/dist ./dist
COPY frontend/server.mjs ./server.mjs
EXPOSE 4546
USER node
CMD ["node", "server.mjs"]
