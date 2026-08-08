import { generateScene } from "../src/generators";

const prompts = {
  harbor: "深水城港区，有弯曲海岸、六码头、沿岸货运大道、仓储街区、鱼市广场、酒馆巷、公会大厅、神殿、巡逻塔和屋顶走私路线。",
  village: "D&D 河桥边境村庄，以石桥、公共水井和酒馆为三个生长锚点，有铁匠铺、神殿、村长宅邸、磨坊、谷仓、农田、果园和木墙。",
  industrial: "1920年代城市工业街区，有铁路货场、发电站、三栋不同跨度厂房、工人住宅、酒吧、仓库、输送桥、后巷和地下维护设施。",
} as const;

console.log("scene | size | density | bounds | road cells | junctions | blocks | parcels | buildings | coverage | LOD full/facade/mass | avg parcel | open ratio | rooms | routes | primitives | valid");
console.log("--- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---");
for (const [name, prompt] of Object.entries(prompts)) {
  for (const size of ["small", "medium", "large"] as const) {
    for (const density of [0.28, 0.62, 0.94]) {
      const scene = generateScene({ prompt, seed: `r12-matrix-${name}-${size}`, size, density }, "adaptive");
      const site = scene.siteProgram;
      const lod = `${site?.fullInteriorCount ?? 0}/${site?.facadeCount ?? 0}/${site?.massCount ?? 0}`;
      console.log([
        name,
        size,
        Math.round(density * 100),
        `${scene.boundsCells.x}x${scene.boundsCells.z}`,
        site?.roadLengthCells.toFixed(0) ?? "0",
        site?.junctionCount ?? 0,
        site?.blockCount ?? 0,
        site?.parcelCount ?? 0,
        scene.buildingInstances?.length ?? 0,
        site?.buildingCoverage.toFixed(3) ?? "0",
        lod,
        site?.averageParcelArea.toFixed(1) ?? "0",
        site?.openSpaceRatio.toFixed(3) ?? "0",
        scene.rooms.length,
        scene.routes.length,
        scene.primitives.length,
        scene.diagnostics.valid ? "PASS" : "FAIL",
      ].join(" | "));
    }
  }
}
