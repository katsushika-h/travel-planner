import { useSyncExternalStore } from "react";

const ignoreUrlChanges = () => () => {};
const wants3dMap = () => new URLSearchParams(window.location.search).get("map") === "3d";

/** Whether the URL asks for the 3D map proof of concept (`?map=3d`, docs/work/3d-map-poc.md); false on the server. */
export function useRequested3dMap() {
  return useSyncExternalStore(ignoreUrlChanges, wants3dMap, () => false);
}
