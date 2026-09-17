# NAS deployment

This deployment runs three containers:

- `app`: the Next.js travel planner
- `postgres`: the private PostgreSQL database
- `migrate`: a short-lived job that applies Prisma migrations before the app starts

## Requirements

Your NAS needs Docker Engine with Docker Compose v2. The published application
images target `linux/amd64`, which matches the Intel processor in the UGREEN
DXP4800 Plus.

## First deployment

1. Create a folder for the app on the NAS and copy `docker-compose.nas.yml` plus
   the `deploy` folder into it.
2. Open a terminal in the project folder.
3. Create the private environment file:

   ```bash
   cp deploy/.env.example deploy/.env
   ```

4. Edit `deploy/.env`. Replace `CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD` in both
   places with the same long, random password. Use letters and numbers only so
   it does not need URL encoding.
5. Pull and start everything:

   ```bash
   docker compose --env-file deploy/.env -f docker-compose.nas.yml pull
   docker compose --env-file deploy/.env -f docker-compose.nas.yml up -d
   ```

6. Check the containers and migration result:

   ```bash
   docker compose --env-file deploy/.env -f docker-compose.nas.yml ps
   docker compose --env-file deploy/.env -f docker-compose.nas.yml logs migrate
   docker compose --env-file deploy/.env -f docker-compose.nas.yml logs app
   ```

7. Open `http://YOUR-NAS-IP:3000` on a device connected to your home network.
   Change `APP_PORT` in `deploy/.env` if port 3000 is already used.

## Updating the app

When new images are published to Docker Hub, run:

```bash
docker compose --env-file deploy/.env -f docker-compose.nas.yml pull
docker compose --env-file deploy/.env -f docker-compose.nas.yml up -d
```

The migration job safely applies pending database migrations before the new app
starts.

## Routine commands

Stop the app without deleting data:

```bash
docker compose --env-file deploy/.env -f docker-compose.nas.yml stop
```

Start it again:

```bash
docker compose --env-file deploy/.env -f docker-compose.nas.yml start
```

Remove the containers while keeping the database volume:

```bash
docker compose --env-file deploy/.env -f docker-compose.nas.yml down
```

Do not add `-v` to the `down` command unless you intentionally want to delete
the database.

## Database backup

Run this from the project folder on the NAS:

```bash
docker compose --env-file deploy/.env -f docker-compose.nas.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > travelplanner-backup.sql
```

Copy the resulting backup somewhere outside the Docker volume, ideally to a
second device or your NAS backup system.

## Access and security

This POC has no login screen. Keep port 3000 restricted to your trusted local
network. Do not expose it directly to the public internet. For remote access,
use a VPN such as Tailscale or your NAS vendor's VPN feature; authentication
should be implemented before public exposure.

Trip and itinerary records are stored in PostgreSQL. A few interface preferences
(such as theme and active-trip selection) are currently stored in each browser's
local storage, so they will not automatically follow you to another device.
