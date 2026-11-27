# Frontline 1944 game server

One container that serves the game and runs multiplayer battles. Players open its address in a browser, pick
**Play together** on the campaign menu, and either host a battle (they get a four-letter code to read out) or join
one with a code. Everyone fights on the Allied side against the computer. Single player keeps working offline.

## Where the image comes from

Every push to `main` that changes the game or the server makes GitHub build the image and publish it as
`ghcr.io/scottjahn/frontline1944:latest` (see `.github/workflows/server-image.yml`; it takes a few minutes and shows
under the repository's **Actions** tab). The lab only needs the compose file, not the code.

The first time it is published the package is **private**. Either make it public (GitHub → your profile →
**Packages** → `frontline1944` → *Package settings* → *Change visibility*), or log the lab in once with a personal
access token that has the `read:packages` scope:

```sh
echo <token> | docker login ghcr.io -u scottjahn --password-stdin
```

## Run it in Caddy's compose file

Add the game as one more service in the `docker-compose.yml` that already runs Caddy. Services in one compose file
share a network, so Caddy reaches the game as `frontline1944:8080` and no port is opened on the host:

```yaml
services:
  caddy:
    # ... your existing Caddy service, unchanged ...

  frontline1944:
    image: ghcr.io/scottjahn/frontline1944:latest
    container_name: frontline1944
    restart: unless-stopped
    environment:
      - MAX_ROOMS=6
```

Then, in that folder:

```sh
docker compose pull frontline1944
docker compose up -d
```

In the Caddyfile:

```caddy
frontline.goonlab.opik.net {
    reverse_proxy frontline1944:8080
}
```

Caddy passes WebSocket connections (the game uses `/ws`) through on its own, and gets the TLS certificate itself as
long as the name is in public DNS. The certificate must be one the tablets trust, so `tls internal` will not work.

Players then open `https://frontline.goonlab.opik.net`, and the game finds its server by itself. The GitHub Pages
copy works too: type `frontline.goonlab.opik.net` once into *Game server* on the *Play together* tab.

## Updating

Pull the new image and restart the game; rooms in progress end, so do it when nobody is playing. In Caddy's
compose folder:

```sh
docker compose pull frontline1944 && docker compose up -d frontline1944
```

Naming the service updates only the game and leaves Caddy as it is. To do it automatically every night at 4 am,
add this to the host's crontab (`crontab -e`), with the path to Caddy's compose folder:

```
0 4 * * * cd /path/to/caddy && docker compose pull -q frontline1944 && docker compose up -d frontline1944
```

## Running it on its own instead

`server/docker-compose.yml` in this repository runs the game as a separate compose project that joins Caddy's
network from outside. Set `name:` under `networks` to Caddy's network as `docker network ls` shows it (a compose
project's network is usually its folder name plus `_default`, such as `caddy_default`), and start Caddy first.

## Settings

| Variable | Default | |
|---|---|---|
| `PORT` | 8080 | Port inside the container |
| `MAX_ROOMS` | 6 | Battles running at once (each uses one CPU thread while players are in it) |

A room closes two minutes after its last player leaves, or 90 seconds after its battle ends.

## Building it yourself

From the repository root: `docker build -f server/Dockerfile -t ghcr.io/scottjahn/frontline1944:latest .`
Or without Docker: `cd server && npm install && node server.js` (listens on 8080).

`tools/netcheck.js` connects two pretend players to a running server and checks they end up in the same battle:
`node tools/netcheck.js ws://localhost:8080/ws`.
