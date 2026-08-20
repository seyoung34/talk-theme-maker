FROM node:22-bookworm-slim

ENV INPUT_DIR=/in
ENV OUTPUT_DIR=/out
ENV TEMPLATE_ASSETS_ROOT=/workspace/public/template-assets
ENV NODE_OPTIONS=--no-deprecation

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.json ./
COPY lib ./lib
COPY services/ios-builder ./services/ios-builder
COPY services/shared ./services/shared
COPY public/template-assets ./public/template-assets

RUN npm ci
RUN npx tsc -p services/ios-builder/tsconfig.json

ENTRYPOINT ["node", "dist/services/ios-builder/entrypoint.js"]
