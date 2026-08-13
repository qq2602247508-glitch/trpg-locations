import { planSceneProgramLocally } from "../../src/scene-program/localPlanner";

const sceneRequest = process.env.PROMPTFOO_SCENE_REQUEST ?? "";
process.stdout.write(JSON.stringify(planSceneProgramLocally(sceneRequest)));
