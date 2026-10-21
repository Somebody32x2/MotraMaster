# MotraMaster: a static PWA. Build with Node, serve the files with nginx.
# All workout data is parsed and stored in the visitor's browser; the server
# only ever hands out static assets.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Sub-path the app is served under. The proxy strips it before nginx sees the
# request, but the browser still needs it in asset URLs.
ARG BASE_PATH=/MotraMaster/
ENV BASE_PATH=$BASE_PATH
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
