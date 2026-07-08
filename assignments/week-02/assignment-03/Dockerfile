# Two stages: build the dependencies, then copy only what's needed to run.
# `bcrypt` is a native addon. If npm can't find a prebuilt binary for this
# platform it compiles from source, which needs a C++ toolchain — so we install
# one in the build stage and leave it behind.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev

# ---

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Copy the already-built node_modules; the toolchain stays in the build stage.
COPY --from=build /app/node_modules ./node_modules
COPY . .
# Don't run as root.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
