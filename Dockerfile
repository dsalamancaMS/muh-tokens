FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN NEXT_STANDALONE=1 npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=4817 \
    MUH_TOKENS_COPILOT_DIR=/copilot \
    MUH_TOKENS_DB=/data/muh-tokens.db
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4817
CMD ["node", "server.js"]
