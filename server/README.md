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

## Run it next to Caddy

The compose file joins the container to Caddy's Docker network, so Caddy reaches it as `frontline1944:8080` and no
port is opened on the host. Check the network name with `docker network ls` and set it in
`server/docker-compose.yml` (it says `caddy`). Then:

```sh
docker compose -f server/docker-compose.yml pull
docker compose -f server/docker-compose.yml up -d
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

Pull the new image and restart; rooms in progress end, so do it when nobody is playing:

```sh
docker compose -f server/docker-compose.yml pull && docker compose -f server/docker-compose.yml up -d
```

To do it automatically every night at 4 am, add this to the host's crontab (`crontab -e`), with the path to where
the compose file is:

```
0 4 * * * cd /path/to/frontline && docker compose -f server/docker-compose.yml pull -q && docker compose -f server/docker-compose.yml up -d
```

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
