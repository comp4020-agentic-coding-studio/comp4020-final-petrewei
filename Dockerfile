# syntax = docker/dockerfile:1

# Plain Node with no dependencies: it runs the TypeScript in src/ directly
# (Node 24 strips the types), serves public/ and renders README.md at /readme/.
# State is one JSON file on the volume at /data. fly.toml requires the image to
# serve HTTP on 0.0.0.0:$PORT.

FROM docker.io/library/node:24.21.0-alpine
WORKDIR /app
COPY src/ src/
COPY public/ public/
COPY README.md package.json ./
ENV NODE_ENV=production
CMD ["node", "src/server.ts"]
