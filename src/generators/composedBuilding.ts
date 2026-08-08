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
    const serviceOnWest = context.rng.fork("manor-wing-order").bool();
    const serviceX = serviceOnWest ? 7.5 : 28.5;
    const familyX = serviceOnWest ? 28.5 : 7.5;
    const courtX = 18 + jitter("manor-court-x", 1.4);
    const courtZ = 15 + jitter("manor-court-z", 1.1);
    const rooms: ProgramRoom[] = [
      { ...room("court", "Inner courtyard", 0, courtX, courtZ, 7.5 + jitter("manor-court-width", 0.8), 6.5 + jitter("manor-court-depth", 0.7), "circulation", ["courtyard"]), openAir: true },
      room("great-hall", "Great hall", 0, 18 + jitter("manor-hall-x", 1), 5.5, 13 + jitter("manor-hall-width", 1.5), 7 + jitter("manor-hall-depth", 0.7), "public", ["entrance", "main-block"]),
      room("west-service", "Kitchen and servants' wing", 0, serviceX, 14.5 + jitter("manor-service-z", 1.8), 7 + jitter("manor-service-width", 0.8), 11 + jitter("manor-service-depth", 1.5), "service", [serviceOnWest ? "west-wing" : "east-wing", "service-route"]),
      room("east-family", "Family apartments", 0, familyX, 14 + jitter("manor-family-z", 1.8), 8.5 + jitter("manor-family-width", 1), 10 + jitter("manor-family-depth", 1.4), "private", [serviceOnWest ? "east-wing" : "west-wing"]),
      room("rear-library", "Library and solar", 0, 19 + jitter("manor-library-x", 2.2), 24.5 + jitter("manor-library-z", 0.8), 11.5 + jitter("manor-library-width", 1.3), 6 + jitter("manor-library-depth", 0.6), "private", ["rear-wing"]),
      room("state-rooms", "Upper state rooms", 1, 18 + jitter("manor-state-x", 1.2), 5.5, 11.5 + jitter("manor-state-width", 1), 6, "private", ["upper-main"]),
      room("upper-family", "Upper family wing", 1, familyX, 14 + jitter("manor-upper-family-z", 1.2), 8 + jitter("manor-upper-family-width", 0.8), 9, "private", [serviceOnWest ? "upper-east" : "upper-west"]),
      room("roof-ambush", "Parapet ambush roof", 2, 20 + jitter("manor-roof-x", 1.8), 8, 9 + jitter("manor-roof-width", 1), 5, "combat", ["roof-platform", "high-ground"]),
      { ...room("crypt", "Family burial crypt", 3, 26 + jitter("manor-crypt-x", 2), 25, 8, 6, "combat", ["underground", "secret"]), absoluteElevationFeet: -11 },
    ];
    return { id: "manor", title: "Rookwater Estate Replanned", description: "An asymmetrical courtyard estate assembled from independent room wings, servant circulation, crypt access, and a reachable roof position.", archetype: "manor", seed: context.request.seed, bounds: { x: 38, z: 33 }, rooms, connections: [
      link("hall-court", "great-hall", "court"), link("court-west", "court", "west-service", "service"), link("court-east", "court", "east-family"), link("court-rear", "court", "rear-library"),
      link("hall-state-stair", "great-hall", "state-rooms", "stair", 1.8), link("family-upper-stair", "east-family", "upper-family", "stair", 1.6), link("state-roof-stair", "state-rooms", "roof-ambush", "stair", 1.5), link("library-crypt-secret", "rear-library", "crypt", "secret", 1.2),
    ], requiredFeatures: ["courtyard", "main-block", "west-wing", "east-wing", "service-route", "underground", "roof-platform"], floorHeights: [12, 11, 9, 10], floorLabels: ["1F", "2F", "屋顶", "B1"], floorMaterial: "wood", wallMaterial: "plaster" };
  }

  if (has(text, ["堡垒", "要塞", "fortress", "citadel", "bastion"])) {
    const rooms = [
      room("gate-kill", "Gatehouse kill zone", 0, 22, 5, 10, 7, "combat", ["entrance", "kill-zone", "curtain-wall"]), room("yard", "Defensive courtyard", 0, 22, 16, 14, 10, "circulation", ["courtyard", "curtain-wall"]),
      room("west-tower", "West corner tower", 0, 6, 7, 7, 7, "combat", ["corner-tower", "high-ground"]), room("east-tower", "East corner tower", 0, 38, 7, 7, 7, "combat", ["corner-tower", "high-ground"]),
      room("inner-keep", "Inner keep hall", 0, 23, 29, 15, 10, "private", ["keep"]), { ...room("armory", "Underground armory", 2, 30, 28, 9, 7, "service", ["underground", "armory"]), absoluteElevationFeet: -12 },
      room("wall-walk", "Curtain wall fighting walk", 1, 22, 8, 22, 4, "combat", ["wall-walk", "roof-platform", "high-ground"]),
    ];
    return { id: "fortress", title: "Westreach Bastion Replanned", description: "A gate kill zone, separated corner towers, inner keep, elevated wall walk, and armory route form a defensive combat graph.", archetype: "fortress", seed: context.request.seed, bounds: { x: 46, z: 38 }, floorHeights: [16, 12, 10], floorLabels: ["1F", "墙头", "B1"], rooms, connections: [link("gate-yard", "gate-kill", "yard"), link("yard-west", "yard", "west-tower"), link("yard-east", "yard", "east-tower"), link("yard-keep", "yard", "inner-keep"), link("gate-wall-stair", "gate-kill", "wall-walk", "stair", 2), link("keep-armory-stair", "inner-keep", "armory", "stair", 1.8)], requiredFeatures: ["kill-zone", "corner-tower", "wall-walk", "keep", "armory"], floorMaterial: "stone", wallMaterial: "darkStone" };
  }

  const sacred = has(text, ["教堂", "神殿", "神庙", "church", "temple", "chapel"]);
  if (sacred) {
    const rooms = [room("nave", "Processional nave", 0, 18, 13, 10, 18, "public", ["entrance", "nave"]), room("altar", "Raised central sanctuary", 0, 18, 26, 9, 6, "private", ["altar"]), room("west-prayer", "West prayer chamber", 0, 7.5, 18, 7, 7, "private", ["prayer-room"]), room("east-prayer", "East prayer chamber", 0, 28.5, 18, 7, 7, "private", ["prayer-room"]), room("vestry", "Priests' vestry", 0, 28, 28, 7, 5, "service", ["service-route"]), { ...room("crypt", "Underground crypt", 2, 18, 27, 10, 8, "combat", ["underground", "crypt"]), absoluteElevationFeet: -16 }, room("bell", "Bell tower platform", 1, 7, 7, 7, 7, "combat", ["roof-platform", "high-ground"] )];
    return { id: "sacred", title: "The Broken Bell Sanctuary", description: "A cruciform sacred building with distinct prayer chambers, sanctuary, crypt descent, vestry route, and elevated bell platform.", archetype: has(text, ["教堂", "church", "chapel"]) ? "church" : "temple", seed: context.request.seed, bounds: { x: 37, z: 35 }, floorHeights: [19, 13, 10], floorLabels: ["1F", "钟楼", "B1"], rooms, connections: [link("nave-altar", "nave", "altar"), link("nave-west", "nave", "west-prayer"), link("nave-east", "nave", "east-prayer"), link("altar-vestry", "altar", "vestry", "service"), link("altar-crypt", "altar", "crypt", "stair"), link("west-bell", "west-prayer", "bell", "stair")], requiredFeatures: ["altar", "prayer-room", "crypt", "bell-platform"], floorMaterial: "stone", wallMaterial: "plaster" };
  }

  const police = has(text, ["警察局", "警局", "police", "precinct"]);
  const hospital = has(text, ["医院", "精神病院", "hospital", "sanatorium"]);
  const museum = has(text, ["博物馆", "museum"]);
  const monastery = has(text, ["修道院", "monastery", "abbey"]);
  const radioWeather = has(text, ["无线电", "气象", "radio", "weather", "meteorological"]);
  const bunker = has(text, ["防空洞", "掩体", "bunker", "air-raid shelter"]);
  const antenna = has(text, ["天线", "antenna", "aerial"]);
  const label = police ? "Police precinct" : hospital ? "Coastal sanatorium" : museum ? "Gothic museum" : monastery ? "Weather monastery" : "Civic institution";
  const frontName = police ? "Public desk and waiting" : hospital ? "Reception and admissions" : museum ? "Grand entrance gallery" : monastery ? "Chapel gate and refectory" : "Public reception";
  const westName = police ? "Interview and records wing" : hospital ? "West clinical wing" : museum ? "West exhibition wing" : monastery ? "Cloister and archive wing" : "West functional wing";
  const eastName = police ? "Evidence and detention wing" : hospital ? "East treatment wing" : museum ? "East exhibition wing" : radioWeather ? "Radio and weather wing" : "East functional wing";
  const rearName = police ? "Secure booking and rear sally port" : hospital ? "Ground morgue and therapy core" : museum ? "Archive and staff service" : monastery ? "Kitchen and service cloister" : "Restricted service core";
  const partitionTags = police ? ["room-partition"] : [];
  const evidenceTags = hospital && has(text, ["coc", "克苏鲁", "1920"]) ? ["evidence"] : [];
  let rooms: ProgramRoom[];
  let connections: ProgramConnection[];
  if (police) {
    rooms = [
      room("front", "Public front desk and waiting", 0, 18 + jitter("front"), 5, 12, 6, "public", ["entrance", "front-desk", ...partitionTags]),
      room("open-office", "Open squad office", 0, 18, 12.5, 12, 7, "public", ["open-office", ...partitionTags]),
      room("records", "Records room", 0, 7, 12, 8, 8, "private", ["records", "west-wing", ...partitionTags]),
      room("interview", "Interview room", 0, 7, 22, 8, 6, "private", ["interview", "west-wing", ...partitionTags]),
      room("detention", "Cell block and detention", 0, 29, 14, 8, 12, "private", ["detention", "east-wing", ...partitionTags]),
      room("booking", "Secure booking room", 0, 18, 28.5, 12, 6, "service", ["booking", "rear-core", ...partitionTags]),
      room("sally-port", "Rear alley prisoner sally port", 0, 30, 29, 7, 6, "service", ["rear-entrance", "sally-port", ...partitionTags]),
      room("upper-archives", "Case archives", 1, 9, 14, 10, 12, "private", ["archives", "upper-west", ...partitionTags]),
      room("upper-interrogation", "Interrogation room", 1, 27, 15, 9, 11, "private", ["interrogation", "upper-east", ...partitionTags]),
      { ...room("basement", "Evidence vault", 3, 19, 27, 11, 8, "service", ["underground", "evidence", ...partitionTags]), absoluteElevationFeet: -16 },
      { ...room("roof", "Roof service and escape platform", 2, 18, 8, 12, 6, "combat", ["roof-platform", "high-ground"]), openAir: true },
    ];
    connections = [
      link("front-office", "front", "open-office"), link("office-records", "open-office", "records"), link("records-interview", "records", "interview"),
      link("office-detention", "open-office", "detention"), link("office-booking", "open-office", "booking"), link("booking-sally", "booking", "sally-port", "service"),
      link("records-archives", "records", "upper-archives", "stair"), link("detention-interrogation", "detention", "upper-interrogation", "stair"),
      link("booking-basement", "booking", "basement", "stair"), link("archives-roof", "upper-archives", "roof", "stair"),
    ];
  } else if (hospital) {
    rooms = [
      room("front", "Reception and admissions", 0, 18 + jitter("front"), 5, 13, 7, "public", ["entrance", ...evidenceTags]),
      room("west-ward", "West clinical wing", 0, 7, 16, 9, 18, "public", ["west-wing", "patient-ward"]),
      room("east-ward", "East treatment wing", 0, 29, 16, 9, 18, "private", ["east-wing", "patient-ward"]),
      { ...room("court", "Enclosed therapeutic courtyard", 0, 18, 17, 8, 8, "circulation", ["courtyard", "therapy"]), openAir: true },
      room("treatment", "Treatment and restraint room", 0, 18, 28, 10, 7, "private", ["treatment", "rear-core", ...evidenceTags]),
      room("morgue", "Ground morgue", 0, 30, 29, 7, 6, "service", ["morgue", "rear-core", ...evidenceTags]),
      room("upper-west", "Upper patient ward", 1, 9, 15, 10, 12, "private", ["upper-west", "patient-ward"]),
      room("upper-east", "Isolation and secret research", 1, 27, 16, 9, 11, "private", ["upper-east", "secret-laboratory", ...evidenceTags]),
      { ...room("basement", "Boiler room and secret laboratory", 3, 19, 27, 11, 8, "service", ["underground", "boiler", "secret-laboratory"]), absoluteElevationFeet: -16 },
      { ...room("roof", "Roof service and escape platform", 2, 18, 8, 12, 6, "combat", ["roof-platform", "high-ground"]), openAir: true },
    ];
    connections = [link("front-court", "front", "court"), link("court-west", "court", "west-ward"), link("court-east", "court", "east-ward"), link("court-treatment", "court", "treatment"), link("treatment-morgue", "treatment", "morgue", "service"), link("west-upper", "west-ward", "upper-west", "stair"), link("east-upper", "east-ward", "upper-east", "stair"), link("treatment-basement", "treatment", "basement", "stair"), link("upper-roof", "upper-west", "roof", "stair")];
  } else {
    rooms = [room("front", frontName, 0, 18 + jitter("front"), 6, 13, 7, "public", ["entrance", ...partitionTags, ...evidenceTags]), room("west", westName, 0, 7, 17 + jitter("west"), 8, 15, "public", ["west-wing", monastery ? "cloister" : "functional-wing", ...partitionTags]), room("east", eastName, 0, 29, 17 + jitter("east"), 8, 15, "private", ["east-wing", ...(radioWeather ? ["radio-room", "weather-station"] : []), ...partitionTags]), { ...room("court", monastery ? "Enclosed cloister garden" : "Central circulation court", 0, 18, 16, 8, 8, "circulation", ["courtyard", ...(monastery ? ["cloister"] : [])]), openAir: true }, room("rear", rearName, 0, 18, 28, 13, 7, "service", ["rear-core", ...partitionTags, ...evidenceTags]), room("upper-west", monastery ? "Scriptorium and sealed archive" : "Upper west gallery", 1, 9, 15, 10, 12, "private", ["upper-west", ...partitionTags]), room("upper-east", radioWeather ? "Wireless observation room" : "Upper east gallery", 1, 27, 16, 9, 11, "private", ["upper-east", ...partitionTags]), { ...room("basement", bunker ? "Underground air-raid shelter" : "Underground collection vault", 3, 19, 27, 11, 8, "service", ["underground", ...(bunker ? ["bunker"] : []), ...partitionTags]), absoluteElevationFeet: -16 }, { ...room("roof", museum ? "Glass-dome roof chase" : antenna ? "Antenna maintenance platform" : "Roof service and escape platform", 2, 18, 8, 12, 6, "combat", ["roof-platform", "high-ground", ...(antenna ? ["antenna-platform"] : [])]), openAir: true }];
    connections = [link("front-court", "front", "court"), link("court-west", "court", "west"), link("court-east", "court", "east"), link("court-rear", "court", "rear", "service"), link("west-upper", "west", "upper-west", "stair"), link("east-upper", "east", "upper-east", "stair"), link("rear-basement", "rear", "basement", "stair"), link("upper-roof", "upper-west", "roof", "stair")];
  }
  void s;
  return { id: "institution", title: `${label} Replanned`, description: "An asymmetrical functional institution with public arrival, separate wings, restricted rear circulation, basement service space, and a reachable roof route.", archetype: police ? "police" : hospital ? "hospital" : museum ? "museum" : "warehouse", seed: context.request.seed, bounds: { x: 40, z: 38 }, floorHeights: [13, 12, 11, 10], floorLabels: ["1F", "2F", "屋顶", "B1"], rooms, connections, requiredFeatures: ["public-front", "separate-wings", "restricted-rear", "underground", "roof-route"], detailCount: Math.round(4 + context.request.density * 12), floorMaterial: museum ? "stone" : "wood", wallMaterial: "plaster" };
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
