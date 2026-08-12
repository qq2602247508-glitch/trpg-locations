import type { SceneViewSnapshot } from "../render/SceneRenderer";

export interface BuildingEntrySession {
  buildingId: string;
  view: SceneViewSnapshot;
  lowCameraActive: boolean;
  topCameraActive: boolean;
}

export function createBuildingEntrySession(
  buildingId: string,
  view: SceneViewSnapshot,
  lowCameraActive: boolean,
  topCameraActive: boolean,
): BuildingEntrySession {
  return {
    buildingId,
    view: {
      ...view,
      camera: { ...view.camera },
      target: { ...view.target },
    },
    lowCameraActive,
    topCameraActive,
  };
}
