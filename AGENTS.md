# Project notes

## Docker deployment architecture

The deployment target is **Linux AMD64**. Whenever building and pushing Docker images for deployment, explicitly target `linux/amd64` (for example, with `docker buildx build --platform linux/amd64 ... --push`). Do not rely on the build machine's native platform. Apply this to both the app and migrator images when rebuilding them.

After building the app image, push it with:

```sh
docker push hokusaik/travel-planner-app:latest
```
