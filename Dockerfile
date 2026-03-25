FROM node:20-bullseye-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

FROM node:20-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3005
CMD ["sh", "-c", "if [ \"${PRISMA_SYNC:-}\" = \"migrate\" ]; then npx prisma migrate deploy; elif [ \"${PRISMA_SYNC:-}\" = \"dbpush\" ]; then npx prisma db push; fi; node dist/src/main.js"]
