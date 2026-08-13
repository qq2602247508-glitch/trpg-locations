import { describe, expect, it } from "vitest";
import type { SceneViewSnapshot } from "../src/render/SceneRenderer";
import { createBuildingEntrySession } from "../src/ui/buildingEntrySession";

describe("building entry session", () => {
  it("captures the non-no-op transparency and focus return contract", () => {
    const overview = {
      floorView: "roof" as const,
      cameraMode: "perspective" as const,
      buildingTransparency: false,
      camera: { x: 40, y: 20, z: 15 },
      target: { x: 10, y: 0, z: 10 },
      near: 0.1,
      far: 300,
    };
    const session = createBuildingEntrySession("guild-hall", overview, true, false);
    const entered = {
      ...session.view,
      floorView: 0 as const,
      buildingTransparency: true,
    };

    expect(entered).not.toEqual(session.view);
    expect(entered.floorView).toBe(0);
    expect(entered.buildingTransparency).toBe(true);
    expect(session.view).toEqual(overview);
    expect(session.lowCameraActive).toBe(true);
    expect(session.topCameraActive).toBe(false);
  });

  it("preserves the complete pre-entry view without retaining mutable vector references", () => {
    const view: SceneViewSnapshot = {
      floorView: 3,
      cameraMode: "perspective",
      buildingTransparency: true,
      camera: { x: 12, y: 8, z: -4 },
      target: { x: 3, y: 1, z: 7 },
      near: 0.1,
      far: 420,
    };
    const session = createBuildingEntrySession("archive", view, true, false);
    view.camera.x = 999;
    view.target.z = 999;
    expect(session).toEqual({
      buildingId: "archive",
      view: {
        floorView: 3,
        cameraMode: "perspective",
        buildingTransparency: true,
        camera: { x: 12, y: 8, z: -4 },
        target: { x: 3, y: 1, z: 7 },
        near: 0.1,
        far: 420,
      },
      lowCameraActive: true,
      topCameraActive: false,
    });
  });

  it("preserves top-view mode independently of the perspective camera coordinates", () => {
    const session = createBuildingEntrySession("facade-inn", {
      floorView: "cut",
      cameraMode: "top",
      buildingTransparency: false,
      camera: { x: 40, y: 20, z: 15 },
      target: { x: 10, y: 0, z: 10 },
      near: 0.1,
      far: 300,
    }, false, true);
    expect(session.view.cameraMode).toBe("top");
    expect(session.view.floorView).toBe("cut");
    expect(session.topCameraActive).toBe(true);
  });
});
