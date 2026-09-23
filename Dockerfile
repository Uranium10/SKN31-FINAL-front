# SKN31-FINAL-front (React + Vite)
#
# 프론트엔드는 API를 전부 상대경로(/api/..., /purchase/...)로 호출하므로
# 빌드 시점에 백엔드 주소를 넣을 필요가 없습니다. 즉 이 이미지 하나를
# 그대로 빌드해서 모든 고객사에 재사용할 수 있고, 실제 백엔드 위치는
# 아래처럼 컨테이너 "실행 시점"에 BACKEND_UPSTREAM 환경변수로 정합니다.
#
# 사용 예)
#   docker run -p 80:80 -e BACKEND_UPSTREAM=backend:8000 <image>

# ---- 1단계: 빌드 ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- 2단계: 정적 파일 서빙 + API 리버스 프록시 ----
FROM nginx:1.27-alpine AS runtime

# 백엔드 컨테이너/서비스 주소의 기본값. docker-compose에서 서비스명을
# "backend"로 쓰는 경우를 가정한 기본값이며, 실제 배포 환경에 맞게
# `docker run -e BACKEND_UPSTREAM=...` 또는 compose의 environment로 덮어쓰세요.
ENV BACKEND_UPSTREAM=backend:8000

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
