FROM node:25-alpine
WORKDIR /app
# Source is mounted at runtime via -v; no COPY needed for local dev.
# The image only needs Node/npm — all package installs happen inside
# the mounted workspace so node_modules live on the host volume.
