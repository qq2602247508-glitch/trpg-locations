import type { GeneratorContext } from "../schema";
import { compileBuildingProgram, type BuildingProgram, type ProgramConnection, type ProgramRoom } from "./buildingProgram";

const has = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));
const room = (id: string, name: string, level: number, x: number, z: number, width: number, depth: number, role: ProgramRoom["role"], tags: string[] = []): ProgramRoom => ({ id, name, level, x, z, width, depth, role, tags });
const link = (id: string, from: string, to: string, kind: ProgramConnection["kind"] = "door", width = 1.6): ProgramConnection => ({ id, from, to, kind, width });

function programFor(context: GeneratorContext): BuildingProgram {
  const text = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const large = context.request.size === "large";
  const s = large ? 1.16 : context.request.size === "small" ? 0.86 : 1;
  const jitter = (key: string, amount = 1.2) => context.rng.fork(key).float(-amount, amount);

  if (has(text, ["庄园", "宅邸", "manor", "mansion", "estate", "villa"])) {
    const rooms: ProgramRoom[] = [
      { ...room("court", "Inner courtyard", 0, 18, 15, 8, 7, "circulation", ["courtyard"]), openAir: true },
      room("great-hall", "Great hall", 0, 18, 5.5, 14, 7, "public", ["entrance", "main-block"]),
      room("west-service", "Kitchen and servants' wing", 0, 7.5, 14.5, 7, 12, "service", ["west-wing", "service-route"]),
      room("east-family", "Family apartments", 0, 28.5, 14, 9, 10, "private", ["east-wing"]),
      room("rear-library", "Library and solar", 0, 19, 24.5, 12, 6, "private", ["rear-wing"]),
      room("state-rooms", "Upper state rooms", 1, 18, 5.5, 12, 6, "private", ["upper-main"]),
      room("upper-family", "Upper family wing", 1, 28.5, 14, 8, 9, "private", ["upper-east"]),
      room("roof-ambush", "Parapet ambush roof", 2, 20, 8, 10, 5, "combat", ["roof-platform", "high-ground"]),
      room("crypt", "Family burial crypt", 0, 26, 25, 8, 6, "combat", ["underground", "secret"]),
    ];
    rooms.find((item) => item.id === "crypt")!.level = 0;
    return { id: "manor", title: "Rookwater Estate Replanned", description: "An asymmetrical courtyard estate assembled from independent room wings, servant circulation, crypt access, and a reachable roof position.", archetype: "manor", seed: context.request.seed, bounds: { x: 38, z: 33 }, floorHeights: [12, 11, 9], rooms, connections: [
      link("hall-court", "great-hall", "court"), link("court-west", "court", "west-service", "service"), link("court-east", "court", "east-family"), link("court-rear", "court", "rear-library"),
      link("hall-state-stair", "great-hall", "state-rooms", "stair", 1.8), link("family-upper-stair", "east-family", "upper-family", "stair", 1.6), link("state-roof-stair", "state-rooms", "roof-ambush", "stair", 1.5), link("library-crypt-secret", "rear-library", "crypt", "secret", 1.2),
    ], requiredFeatures: ["courtyard", "main-block", "west-wing", "east-wing", "service-route", "underground", "roof-platform"], floorMaterial: "wood", wallMaterial: "plaster" };
  }

  if (has(text, ["堡垒", "要塞", "fortress", "citadel", "bastion"])) {
    const rooms = [
      room("gate-kill", "Gatehouse kill zone", 0, 22, 5, 10, 7, "combat", ["entrance", "kill-zone", "curtain-wall"]), room("yard", "Defensive courtyard", 0, 22, 16, 14, 10, "circulation", ["courtyard", "curtain-wall"]),
      room("west-tower", "West corner tower", 0, 6, 7, 7, 7, "combat", ["corner-tower", "high-ground"]), room("east-tower", "East corner tower", 0, 38, 7, 7, 7, "combat", ["corner-tower", "high-ground"]),
      room("inner-keep", "Inner keep hall", 0, 23, 29, 15, 10, "private", ["keep"]), room("armory", "Underground armory", 1, 30, 28, 9, 7, "service", ["underground", "armory"]),
      room("wall-walk", "Curtain wall fighting walk", 1, 22, 8, 22, 4, "combat", ["wall-walk", "roof-platform", "high-ground"]),
    ];
    return { id: "fortress", title: "Westreach Bastion Replanned", description: "A gate kill zone, separated corner towers, inner keep, elevated wall walk, and armory route form a defensive combat graph.", archetype: "fortress", seed: context.request.seed, bounds: { x: 46, z: 38 }, floorHeights: [16, 12], rooms, connections: [link("gate-yard", "gate-kill", "yard"), link("yard-west", "yard", "west-tower"), link("yard-east", "yard", "east-tower"), link("yard-keep", "yard", "inner-keep"), link("gate-wall-stair", "gate-kill", "wall-walk", "stair", 2), link("keep-armory-stair", "inner-keep", "armory", "stair", 1.8)], requiredFeatures: ["kill-zone", "corner-tower", "wall-walk", "keep", "armory"], floorMaterial: "stone", wallMaterial: "darkStone" };
  }

  const sacred = has(text, ["教堂", "神殿", "神庙", "church", "temple", "chapel"]);
  if (sacred) {
    const rooms = [room("nave", "Processional nave", 0, 18, 13, 10, 18, "public", ["entrance", "nave"]), room("altar", "Raised central sanctuary", 0, 18, 26, 9, 6, "private", ["altar"]), room("west-prayer", "West prayer chamber", 0, 7.5, 18, 7, 7, "private", ["prayer-room"]), room("east-prayer", "East prayer chamber", 0, 28.5, 18, 7, 7, "private", ["prayer-room"]), room("vestry", "Priests' vestry", 0, 28, 28, 7, 5, "service", ["service-route"]), room("crypt", "Underground crypt", 1, 18, 27, 10, 8, "combat", ["underground", "crypt"]), room("bell", "Bell tower platform", 1, 7, 7, 7, 7, "combat", ["roof-platform", "high-ground"] )];
    return { id: "sacred", title: "The Broken Bell Sanctuary", description: "A cruciform sacred building with distinct prayer chambers, sanctuary, crypt descent, vestry route, and elevated bell platform.", archetype: has(text, ["教堂", "church", "chapel"]) ? "church" : "temple", seed: context.request.seed, bounds: { x: 37, z: 35 }, floorHeights: [19, 13], rooms, connections: [link("nave-altar", "nave", "altar"), link("nave-west", "nave", "west-prayer"), link("nave-east", "nave", "east-prayer"), link("altar-vestry", "altar", "vestry", "service"), link("altar-crypt", "altar", "crypt", "stair"), link("west-bell", "west-prayer", "bell", "stair")], requiredFeatures: ["altar", "prayer-room", "crypt", "bell-platform"], floorMaterial: "stone", wallMaterial: "plaster" };
  }

  const police = has(text, ["警察局", "警局", "police", "precinct"]);
  const hospital = has(text, ["医院", "精神病院", "hospital", "sanatorium"]);
  const museum = has(text, ["博物馆", "museum"]);
  const label = police ? "Police precinct" : hospital ? "Coastal sanatorium" : museum ? "Gothic museum" : "Civic institution";
  const frontName = police ? "Public desk and waiting" : hospital ? "Reception and admissions" : museum ? "Grand entrance gallery" : "Public reception";
  const westName = police ? "Interview and records wing" : hospital ? "West clinical wing" : museum ? "West exhibition wing" : "West functional wing";
  const eastName = police ? "Evidence and detention wing" : hospital ? "East treatment wing" : museum ? "East exhibition wing" : "East functional wing";
  const rearName = police ? "Secure booking and rear sally port" : hospital ? "Ground morgue and therapy core" : museum ? "Archive and staff service" : "Restricted service core";
  const partitionTags = police ? ["room-partition"] : [];
  const evidenceTags = hospital && has(text, ["coc", "克苏鲁", "1920"]) ? ["evidence"] : [];
  const rooms = [room("front", frontName, 0, 18 + jitter("front"), 6, 13, 7, "public", ["entrance", ...partitionTags, ...evidenceTags]), room("west", westName, 0, 7, 17 + jitter("west"), 8, 15, police ? "private" : "public", ["west-wing", ...partitionTags]), room("east", eastName, 0, 29, 17 + jitter("east"), 8, 15, "private", ["east-wing", ...partitionTags]), { ...room("court", hospital ? "Enclosed therapeutic courtyard" : "Central circulation court", 0, 18, 16, 8, 8, "circulation", ["courtyard"]), openAir: true }, room("rear", rearName, 0, 18, 28, 13, 7, "service", ["rear-core", ...partitionTags, ...evidenceTags]), room("upper-west", police ? "Case archives" : hospital ? "Upper patient ward" : "Upper west gallery", 1, 9, 15, 10, 12, "private", ["upper-west", ...partitionTags]), room("upper-east", police ? "Interrogation room" : hospital ? "Isolation and research" : "Upper east gallery", 1, 27, 16, 9, 11, "private", ["upper-east", ...partitionTags]), room("basement", police ? "Evidence vault" : hospital ? "Boiler room and secret laboratory" : "Underground collection vault", 2, 19, 27, 11, 8, "service", ["underground", ...partitionTags]), { ...room("roof", museum ? "Glass-dome roof chase" : "Roof service and escape platform", 2, 18, 8, 12, 6, "combat", ["roof-platform", "high-ground"]), openAir: true }];
  void s;
  return { id: "institution", title: `${label} Replanned`, description: "An asymmetrical functional institution with public arrival, separate wings, restricted rear circulation, basement service space, and a reachable roof route.", archetype: police ? "police" : hospital ? "hospital" : museum ? "museum" : "warehouse", seed: context.request.seed, bounds: { x: 40, z: 38 }, floorHeights: [13, 12, 11], rooms, connections: [link("front-court", "front", "court"), link("court-west", "court", "west"), link("court-east", "court", "east"), link("court-rear", "court", "rear", "service"), link("west-upper", "west", "upper-west", "stair"), link("east-upper", "east", "upper-east", "stair"), link("rear-basement", "rear", "basement", "stair"), link("upper-roof", "upper-west", "roof", "stair")], requiredFeatures: ["public-front", "separate-wings", "restricted-rear", "underground", "roof-route"], detailCount: Math.round(4 + context.request.density * 12), floorMaterial: museum ? "stone" : "wood", wallMaterial: "plaster" };
}

export function generateComposedBuilding(context: GeneratorContext) {
  const source = programFor(context);
  const scale = context.request.size === "small" ? 0.86 : context.request.size === "large" ? 1.18 : 1;
  if (scale !== 1) {
    const cx = source.bounds.x / 2;
    const cz = source.bounds.z / 2;
    source.bounds = { x: Math.round(source.bounds.x * scale), z: Math.round(source.bounds.z * scale) };
    source.rooms = source.rooms.map((item) => ({ ...item, x: cx + (item.x - cx) * scale, z: cz + (item.z - cz) * scale, width: item.width * scale, depth: item.depth * scale }));
  }
  return compileBuildingProgram(source);
}
