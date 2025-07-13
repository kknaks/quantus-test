# 다단계 빌드: 빌드 스테이지
FROM node:20-alpine AS builder

WORKDIR /app

# 시스템 의존성 설치
RUN apk add --no-cache libc6-compat

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci

# 애플리케이션 소스 복사
COPY . .

# Next.js 텔레메트리 비활성화
ENV NEXT_TELEMETRY_DISABLED 1

# 프로덕션 빌드
RUN npm run build

# 프로덕션 스테이지
FROM node:20-alpine AS runner

WORKDIR /app

# 시스템 의존성 설치
RUN apk add --no-cache libc6-compat

# 프로덕션 사용자 생성
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# package.json과 필요한 파일들 복사
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public

# 빌드된 애플리케이션 복사
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# 프로덕션 의존성만 설치
RUN npm ci --only=production && npm cache clean --force

# nextjs 유저로 전환
USER nextjs

# 포트 노출
EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# npm start 사용
CMD ["npm", "run", "start"]