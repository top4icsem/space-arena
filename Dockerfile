# Stage 1: install/build with dev tooling; never ship it in the final image.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci --include=optional
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY tsconfig.json vite.config.js ./
RUN npm run build
RUN npm prune --omit=dev --workspaces --include-workspace-root

# Stage 2: minimal, non-root runtime. Node is PID 1, so SIGTERM reaches it.
FROM alpine:3.22 AS node-strip
RUN apk add --no-cache binutils
COPY --from=build /usr/local/bin/node /usr/local/bin/node
RUN strip --strip-unneeded /usr/local/bin/node

FROM alpine:3.22 AS runtime
ARG BUILD_SHA=local
ENV BUILD_SHA=${BUILD_SHA}
ENV HOST=0.0.0.0
RUN apk add --no-cache libstdc++ libgcc
COPY --from=node-strip /usr/local/bin/node /usr/local/bin/node
RUN addgroup -S node && adduser -S node -G node
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/src ./server/src
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "--disable-warning=ExperimentalWarning", "--experimental-strip-types", "server/src/index.ts"]
