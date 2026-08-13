import type { SceneViewSnapshot } from "../render/SceneRenderer";
import type { GeneratedScene } from "../schema";

export interface BuildingEntrySession {
  buildingId: string;
  settlementScene?: GeneratedScene;
  view: SceneViewSnapshot;
  lowCameraActive: boolean;
  topCameraActive: boolean;
}

export function createBuildingEntrySession(
  buildingId: string,
  view: SceneViewSnapshot,
  lowCameraActive: boolean,
  topCameraActive: boolean,
): BuildingEntrySession;
export function createBuildingEntrySession(
  buildingId: string,
  settlementScene: GeneratedScene,
  view: SceneViewSnapshot,
  lowCameraActive: boolean,
  topCameraActive: boolean,
): BuildingEntrySession;
export function createBuildingEntrySession(
  buildingId: string,
  sceneOrView: GeneratedScene | SceneViewSnapshot,
  viewOrLowCamera: SceneViewSnapshot | boolean,
  lowCameraOrTopCamera: boolean,
  topCameraMaybe?: boolean,
): BuildingEntrySession {
  const hasScene = typeof topCameraMaybe === "boolean";
  const settlementScene = hasScene ? sceneOrView as GeneratedScene : undefined;
  const view = (hasScene ? viewOrLowCamera : sceneOrView) as SceneViewSnapshot;
  const lowCameraActive = hasScene ? lowCameraOrTopCamera : viewOrLowCamera as boolean;
  const topCameraActive = hasScene ? topCameraMaybe : lowCameraOrTopCamera;
  return {
    buildingId,
    ...(settlementScene ? { settlementScene } : {}),
    view: {
      ...view,
      camera: { ...view.camera },
      target: { ...view.target },
    },
    lowCameraActive,
    topCameraActive,
  };
}
