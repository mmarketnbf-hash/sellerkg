FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4050
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --omit=dev --workspace @sellerkg/api --include-workspace-root=false
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
EXPOSE 4050
CMD ["node", "apps/api/dist/main.js"]
