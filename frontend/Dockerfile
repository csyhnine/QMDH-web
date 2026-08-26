FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines these at build time. Chat「设计助手」 stays hidden until explicitly enabled.
ARG VITE_CHAT_AGENT_UI_ENABLED=false
ARG VITE_CHAT_AGENT_MODE_DEFAULT=false
ENV VITE_CHAT_AGENT_UI_ENABLED=$VITE_CHAT_AGENT_UI_ENABLED \
    VITE_CHAT_AGENT_MODE_DEFAULT=$VITE_CHAT_AGENT_MODE_DEFAULT

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
