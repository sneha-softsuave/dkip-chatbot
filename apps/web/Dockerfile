# Multi-stage: build the SPA, then serve static assets via nginx which also
# reverse-proxies /api to the api service (§13.1).
FROM node:20-alpine AS build
WORKDIR /app
ENV VITE_API_BASE=/api/v1
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL \
    VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT=$VITE_KEYCLOAK_CLIENT
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
