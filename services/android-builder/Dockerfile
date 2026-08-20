FROM eclipse-temurin:17-jdk

ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"
ENV INPUT_DIR=/in
ENV OUTPUT_DIR=/out
ENV TEMPLATE_ASSETS_ROOT=/workspace/public/template-assets
ENV NODE_OPTIONS=--no-deprecation

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip bash nodejs npm \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "${ANDROID_SDK_ROOT}/cmdline-tools" \
  && curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o /tmp/android-commandline-tools.zip \
  && unzip -q /tmp/android-commandline-tools.zip -d /tmp/android-commandline-tools \
  && mv /tmp/android-commandline-tools/cmdline-tools "${ANDROID_SDK_ROOT}/cmdline-tools/latest" \
  && rm -rf /tmp/android-commandline-tools /tmp/android-commandline-tools.zip

RUN yes | sdkmanager --licenses >/dev/null \
  && sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.json ./
COPY lib ./lib
COPY services/android-builder ./services/android-builder
COPY services/shared ./services/shared
COPY android-sample-theme/apeach-26.1.0-source ./android-sample-theme/apeach-26.1.0-source
COPY public/template-assets ./public/template-assets

RUN npm ci
RUN chmod +x ./android-sample-theme/apeach-26.1.0-source/gradlew
RUN npx tsc -p services/android-builder/tsconfig.json
RUN ANDROID_GRADLE_TIMEOUT_MS=900000 node dist/services/android-builder/warm-gradle-cache.js

ENTRYPOINT ["node", "dist/services/android-builder/entrypoint.js"]
