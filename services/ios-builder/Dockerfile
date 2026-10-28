FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

# Keep the Node 22 security floor explicit when updating the pinned image.
RUN node -e "const [major, minor, patch] = process.versions.node.split('.').map(Number); if (major !== 22 || minor < 23 || (minor === 23 && patch < 4)) process.exit(1)"

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
