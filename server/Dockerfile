# Frontline 1944 game server: the game's web pages plus multiplayer battles on one port.
# Build from the repository root:   docker build -f server/Dockerfile -t frontline1944 .
FROM node:22-alpine
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/server.js server/battle.js server/room.js ./
COPY index.html editor.html manifest.webmanifest sw.js /app/
COPY js /app/js
COPY icons /app/icons
ENV PORT=8080 GAME_ROOT=/app NODE_ENV=production
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.js"]
