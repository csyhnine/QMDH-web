FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines these at build time. Defaults keep Chat「设计助手」visible in production.
ARG VITE_CHAT_AGENT_UI_ENABLED=true
ARG VITE_CHAT_AGENT_MODE_DEFAULT=true
ENV VITE_CHAT_AGENT_UI_ENABLED=$VITE_CHAT_AGENT_UI_ENABLED \
    VITE_CHAT_AGENT_MODE_DEFAULT=$VITE_CHAT_AGENT_MODE_DEFAULT

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
