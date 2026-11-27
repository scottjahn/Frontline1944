# Frontline 1944 game server

One container that serves the game and runs multiplayer battles. Players open its address in a browser, pick
**Play together** on the campaign menu, and either host a battle (they get a four-letter code to read out) or join
one with a code. Everyone fights on the Allied side against the computer. Single player keeps working offline.

## Run it

From the repository root:

```sh
docker compose -f server/docker-compose.yml up -d --build
```

The container listens on port **8080**. Check it with `curl http://<host>:8080/health`.

## Put it behind your reverse proxy

Give it a hostname, for example `frontline.goonlab.opik.net`, with a real TLS certificate. The proxy has to pass
**WebSocket upgrades** through on the path `/ws`:

- **Traefik / Caddy**: WebSockets work with no extra settings.
- **Nginx Proxy Manager**: tick *Websockets Support* on the proxy host.
- **Plain nginx**:
  ```nginx
  location / {
      proxy_pass http://frontline:8080;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_read_timeout 1h;
  }
  ```

Players can then either:

- **open `https://frontline.goonlab.opik.net`** (recommended): the game finds its server by itself, and the tablets can
  add it to their home screen like the GitHub Pages version; or
- **keep using the GitHub Pages copy**: type `frontline.goonlab.opik.net` once into *Game server* on the
  *Play together* tab. This only works over `wss://` with a valid certificate, because the page itself is https.

## Settings

| Variable | Default | |
|---|---|---|
| `PORT` | 8080 | Port inside the container |
| `MAX_ROOMS` | 6 | Battles running at once (each uses one CPU thread while players are in it) |

A room closes two minutes after its last player leaves, or 90 seconds after its battle ends.

## Without Docker

```sh
cd server && npm install && node server.js
```

`tools/netcheck.js` connects two pretend players to a running server and checks they end up in the same battle:
`node tools/netcheck.js ws://localhost:8080/ws`.
