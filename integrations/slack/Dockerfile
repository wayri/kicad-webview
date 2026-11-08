FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY engine ./engine
COPY scripts ./scripts
COPY examples ./examples
COPY fixtures ./fixtures
COPY docs ./docs
COPY licenses ./licenses
COPY README.md LICENSE LICENSING.md THIRD-PARTY-NOTICES.md SOURCE-PROVENANCE.json ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production SLACK_BIND_HOST=0.0.0.0 PORT=10000
COPY --from=build /app/dist/embed.html /app/dist/embed.mjs /app/dist/kivi-viewer.js /app/dist/LICENSE /app/dist/LICENSING.md /app/dist/THIRD-PARTY-NOTICES.md /app/dist/THREE-LICENSE /app/dist/FZSTD-LICENSE /app/dist/SPIKE-ENGINE-NOTICE.md ./dist/
COPY --from=build /app/dist/licenses ./dist/licenses
COPY integrations/slack/adapter.mjs integrations/slack/service.mjs integrations/slack/server.mjs ./integrations/slack/
COPY integrations/shared/embed-url.mjs ./integrations/shared/
USER node
EXPOSE 10000
CMD ["node", "integrations/slack/server.mjs"]
