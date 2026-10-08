FROM node:24-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json ./
COPY services/runtime-monitor ./services/runtime-monitor
RUN npm ci && npx tsc -p services/runtime-monitor/tsconfig.json

FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV MONITOR_ENABLED=0
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /workspace/dist ./dist
USER node
CMD ["node", "dist/services/runtime-monitor/entrypoint.js"]
