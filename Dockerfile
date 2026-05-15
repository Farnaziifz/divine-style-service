FROM node:20-bullseye-slim AS builder
WORKDIR /app

RUN npm config set registry https://mirror2.chabokan.net/npm/

ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

RUN mkdir -p /root/.cache/prisma
COPY prisma/engine-cache/all_commits/ /root/.cache/prisma/master/

COPY package.json package-lock.json ./
RUN npm install

RUN node - <<'NODE'
const fs = require('fs');
const path = require('path');

async function main() {
  const { enginesVersion } = require('@prisma/engines-version');

  const prismaPkgDir = path.join(process.cwd(), 'node_modules', 'prisma');
  const enginesPkgDir = path.join(process.cwd(), 'node_modules', '@prisma', 'engines');

  const enginesRoot = path.join('/root/.cache/prisma/master', enginesVersion);
  if (!fs.existsSync(enginesRoot)) {
    console.error('Prisma engines cache root not found:', enginesRoot);
    process.exit(1);
  }

  const binaryTargets = fs
    .readdirSync(enginesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (binaryTargets.length === 0) {
    console.error('No Prisma engine binaries found under:', enginesRoot);
    process.exit(1);
  }

  for (const binaryTarget of binaryTargets) {
    const cacheDir = path.join(enginesRoot, binaryTarget);
    const libSrc = path.join(cacheDir, 'libquery-engine');
    const schemaSrc = path.join(cacheDir, 'schema-engine');

    if (!fs.existsSync(libSrc) || !fs.existsSync(schemaSrc)) {
      console.error('Prisma engines incomplete for target:', binaryTarget);
      console.error('expected:', libSrc, schemaSrc);
      process.exit(1);
    }

    const libFileName = `libquery_engine-${binaryTarget}.so.node`;
    const schemaFileName = `schema-engine-${binaryTarget}`;

    if (fs.existsSync(prismaPkgDir)) {
      fs.copyFileSync(libSrc, path.join(prismaPkgDir, libFileName));
      fs.copyFileSync(schemaSrc, path.join(prismaPkgDir, schemaFileName));
      try {
        fs.chmodSync(path.join(prismaPkgDir, schemaFileName), 0o755);
      } catch {}
    }

    if (fs.existsSync(enginesPkgDir)) {
      fs.copyFileSync(libSrc, path.join(enginesPkgDir, libFileName));
      fs.copyFileSync(schemaSrc, path.join(enginesPkgDir, schemaFileName));
      try {
        fs.chmodSync(path.join(enginesPkgDir, schemaFileName), 0o755);
      } catch {}
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

FROM node:20-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

EXPOSE 3005
CMD ["sh", "-c", "if [ \"${PRISMA_SYNC:-}\" = \"migrate\" ]; then npx prisma migrate deploy; elif [ \"${PRISMA_SYNC:-}\" = \"dbpush\" ]; then npx prisma db push; fi; node dist/src/main.js"]
