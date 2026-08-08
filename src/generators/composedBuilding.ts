import type { GeneratorContext } from "../schema";
import { compileBuildingProgram, type BuildingProgram, type BuildingState, type ProgramConnection, type ProgramRoom } from "./buildingProgram";

const has = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));
const room = (id: string, name: string, level: number, x: number, z: number, width: number, depth: number, role: ProgramRoom["role"], tags: string[] = []): ProgramRoom => ({ id, name, level, x, z, width, depth, role, tags });
const link = (id: string, from: string, to: string, kind: ProgramConnection["kind"] = "door", width = 1.6): ProgramConnection => ({ id, from, to, kind, width });

function programFor(context: GeneratorContext): BuildingProgram {
  const text = context.request.prompt.normalize("NFKC").toLocaleLowerCase("en-US");
  const large = context.request.size === "large";
  const s = large ? 1.16 : context.request.size === "small" ? 0.86 : 1;
  const jitter = (key: string, amount = 1.2) => context.rng.fork(key).float(-amount, amount);
  const states: BuildingState[] = [
    ...(has(text, ["破败", "ruined"]) ? ["ruined" as const] : []),
    ...(has(text, ["废弃", "abandoned"]) ? ["abandoned" as const] : []),
    ...(has(text, ["坍塌", "collapsed"]) ? ["collapsed" as const] : []),
    ...(has(text, ["火灾", "燃烧", "burning", "fire-damaged"]) ? ["fire" as const] : []),
    ...(has(text, ["淹没", "洪水", "flooded"]) ? ["flooded" as const] : []),
    ...(has(text, ["植物侵入", "overgrown"]) ? ["overgrown" as const] : []),
    ...(has(text, ["阿弗纳斯", "地狱", "avernus", "infernal"]) ? ["infernal" as const] : []),
    ...(has(text, ["战争损坏", "war-damaged"]) ? ["war-damaged" as const] : []),
    ...(has(text, ["封锁", "sealed"]) ? ["sealed" as const] : []),
  ];

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
      { ...room("roof-ambush", "Parapet ambush roof", 2, 20 + jitter("manor-roof-x", 1.8), 8, 9 + jitter("manor-roof-width", 1), 5, "combat", ["roof-platform", "high-ground"]), openAir: true },
      { ...room("crypt", "Family burial crypt", 3, 26 + jitter("manor-crypt-x", 2), 25, 8, 6, "combat", ["underground", "secret"]), absoluteElevationFeet: -11 },
    ];
    return { id: "manor", title: "Rookwater Estate Replanned", description: "An asymmetrical courtyard estate assembled from independent room wings, servant circulation, crypt access, and a reachable roof position.", archetype: "manor", seed: context.request.seed, bounds: { x: 38, z: 33 }, rooms, connections: [
      link("hall-court", "great-hall", "court"), link("court-west", "court", "west-service", "service"), link("court-east", "court", "east-family"), link("court-rear", "court", "rear-library"),
      link("hall-state-stair", "great-hall", "state-rooms", "stair", 1.8), link("family-upper-stair", "east-family", "upper-family", "stair", 1.6), link("state-roof-stair", "state-rooms", "roof-ambush", "stair", 1.5), link("library-crypt-secret", "rear-library", "crypt", "secret", 1.2),
    ], requiredFeatures: ["courtyard", "main-block", "west-wing", "east-wing", "service-route", "underground", "roof-platform"], floorHeights: [12, 11, 9, 10], floorLabels: ["1F", "2F", "屋顶", "B1"], floorMaterial: "wood", wallMaterial: "plaster", states, exteriorStyle: "estate-drive", facadeStyle: "domestic" };
  }

  if (has(text, ["堡垒", "要塞", "fortress", "citadel", "bastion"])) {
    const infernal = states.includes("infernal");
    const rooms = [
      room("gate-kill", "Gatehouse kill zone", 0, 22, 5, 10, 7, "combat", ["entrance", "kill-zone", "curtain-wall"]), room("yard", "Defensive courtyard", 0, 22, 16, 14, 10, "circulation", ["courtyard", "curtain-wall"]),
      room("west-tower", "West corner tower", 0, 6, 7, 7, 7, "combat", ["corner-tower", "high-ground"]), room("east-tower", "East corner tower", 0, 38, 7, 7, 7, "combat", ["corner-tower", "high-ground"]),
      room("inner-keep", "Inner keep hall", 0, 23, 29, 15, 10, "private", ["keep"]), { ...room("armory", "Underground armory", 2, 30, 28, 9, 7, "service", ["underground", "armory"]), absoluteElevationFeet: -12 },
      { ...room("wall-walk", "Curtain wall fighting walk", 1, 22, 8, 22, 4, "combat", ["wall-walk", "roof-platform", "high-ground"]), openAir: true },
      ...(infernal ? [
        room("war-machine", "War machine foundry", 0, 9, 26, 11, 9, "service", ["war-machine-workshop", "industrial"]),
        room("prison-cages", "Infernal cage yard", 0, 36, 24, 9, 11, "combat", ["prison", "cages"]),
        { ...room("ritual-core", "Demonic ritual core", 2, 22, 29, 11, 8, "combat", ["underground", "ritual-core"]), absoluteElevationFeet: -18 },
        { ...room("chain-lift", "Chain lift platform", 1, 36, 12, 7, 7, "circulation", ["chain-lift", "roof-platform", "high-ground"]), openAir: true },
      ] : []),
    ];
    const connections = [link("gate-yard", "gate-kill", "yard"), link("yard-west", "yard", "west-tower"), link("yard-east", "yard", "east-tower"), link("yard-keep", "yard", "inner-keep"), link("gate-wall-stair", "gate-kill", "wall-walk", "stair", 2), link("keep-armory-stair", "inner-keep", "armory", "stair", 1.8), ...(infernal ? [link("yard-machine", "yard", "war-machine", "service"), link("yard-prison", "yard", "prison-cages"), link("armory-ritual", "armory", "ritual-core", "secret"), link("prison-lift", "prison-cages", "chain-lift", "stair")] : [])];
    return { id: "fortress", title: infernal ? "The Black Chain Citadel" : "Westreach Bastion Replanned", description: infernal ? "An infernal fortress organized around a black-iron gate, lava-divided kill court, war-machine foundry, cage yard, chain lift, and buried ritual core." : "A gate kill zone, separated corner towers, inner keep, elevated wall walk, and armory route form a defensive combat graph.", archetype: "fortress", seed: context.request.seed, bounds: { x: 46, z: 38 }, floorHeights: [16, 12, 10], floorLabels: ["1F", "墙头", "B1"], rooms, connections, requiredFeatures: infernal ? ["kill-zone", "corner-tower", "wall-walk", "war-machine-workshop", "prison", "chain-lift", "ritual-core"] : ["kill-zone", "corner-tower", "wall-walk", "keep", "armory"], floorMaterial: "stone", wallMaterial: "darkStone", states, exteriorStyle: "defensive-approach", facadeStyle: "fortified" };
  }

  const sacred = has(text, ["教堂", "神殿", "神庙", "church", "temple", "chapel"]);
  if (sacred) {
    const rooms = [room("nave", "Processional nave", 0, 18, 13, 10, 18, "public", ["entrance", "nave"]), room("altar", "Raised central sanctuary", 0, 18, 26, 9, 6, "private", ["altar"]), room("west-prayer", "West prayer chamber and transept", 0, 7.5, 18, 7, 7, "private", ["prayer-room", ...(states.includes("collapsed") ? ["collapsed-transept"] : [])]), room("east-prayer", "East prayer chamber and transept", 0, 28.5, 18, 7, 7, "private", ["prayer-room"]), room("vestry", "Priests' vestry", 0, 28, 28, 7, 5, "service", ["service-route"]), { ...room("crypt", "Underground crypt", 2, 18, 27, 10, 8, "combat", ["underground", "crypt"]), absoluteElevationFeet: -16 }, room("bell", "Bell tower platform", 1, 7, 7, 7, 7, "combat", ["roof-platform", "high-ground"] )];
    return { id: "sacred", title: "The Broken Bell Sanctuary", description: "A cruciform sacred building with distinct prayer chambers, sanctuary, crypt descent, vestry route, and elevated bell platform.", archetype: has(text, ["教堂", "church", "chapel"]) ? "church" : "temple", seed: context.request.seed, bounds: { x: 37, z: 35 }, floorHeights: [19, 13, 10], floorLabels: ["1F", "钟楼", "B1"], rooms, connections: [link("nave-altar", "nave", "altar"), link("nave-west", "nave", "west-prayer"), link("nave-east", "nave", "east-prayer"), link("altar-vestry", "altar", "vestry", "service"), link("altar-crypt", "altar", "crypt", "stair"), link("west-bell", "west-prayer", "bell", "stair")], requiredFeatures: ["altar", "prayer-room", "crypt", "bell-platform"], floorMaterial: "stone", wallMaterial: "plaster", states, exteriorStyle: "sacred-close", facadeStyle: "sacred" };
  }

  const mageAcademy = has(text, ["法师学院", "魔法学院", "mage academy", "wizard academy", "arcane academy"]);
  if (mageAcademy) {
    const mirrored = context.rng.fork("academy-variant").bool();
    const westX = mirrored ? 33 : 8;
    const eastX = mirrored ? 8 : 33;
    const rooms: ProgramRoom[] = [
      room("lecture", "Central arcane lecture hall", 0, 20.5, 10, 15, 10, "public", ["entrance", "lecture-hall", "main-block"]),
      room("alchemy", "Alchemy laboratory wing", 0, westX, 20, 9, 13, "service", ["alchemy-lab", "wing"]),
      room("library", "Restricted spell library", 0, eastX, 20, 9, 13, "private", ["library", "wing"]),
      { ...room("court", "Arcane demonstration court", 0, 20.5, 22, 9, 8, "combat", ["courtyard", "ritual-circle"]), openAir: true },
      room("west-tower", "West research tower", 1, 7, 10, 7, 7, "private", ["research-tower", "high-ground"]),
      room("east-tower", "East research tower", 1, 34, 10, 7, 7, "private", ["research-tower", "high-ground"]),
      room("professor", "Secret professor passage", 1, 20.5, 17, 4, 15, "service", ["secret-passage"]),
      { ...room("roof-bridge", "Roof bridge and duel route", 2, 20.5, 10, 22, 3.5, "combat", ["roof-platform", "roof-bridge", "high-ground"]), openAir: true },
      { ...room("summoning", "Underground summoning chamber", 3, 20.5, 27, 12, 10, "combat", ["underground", "summoning-circle", "ritual-core"]), absoluteElevationFeet: -18 },
    ];
    return { id: "mage-academy", title: "The Collegium of Twin Stars", description: "A non-rectangular arcane campus with a public lecture block, two research towers, split laboratory and library wings, a concealed professor route, roof bridge, and buried summoning hall.", archetype: "school", seed: context.request.seed, bounds: { x: 43, z: 38 }, floorHeights: [16, 14, 10, 12], floorLabels: ["1F", "2F研究塔", "屋顶连桥", "B1"], rooms, connections: [link("lecture-court", "lecture", "court"), link("court-alchemy", "court", "alchemy"), link("court-library", "court", "library"), link("alchemy-west-tower", "alchemy", "west-tower", "stair"), link("library-east-tower", "library", "east-tower", "stair"), link("tower-secret", "west-tower", "professor", "secret"), link("secret-east", "professor", "east-tower", "secret"), link("west-bridge", "west-tower", "roof-bridge", "stair"), link("east-bridge", "east-tower", "roof-bridge", "stair"), link("lecture-summoning", "lecture", "summoning", "secret")], requiredFeatures: ["lecture-hall", "research-tower", "alchemy-lab", "library", "summoning-circle", "roof-bridge", "secret-passage"], detailCount: Math.round(10 + context.request.density * 18), floorMaterial: "stone", wallMaterial: "plaster", states, exteriorStyle: "academy-court", facadeStyle: "academic" };
  }

  const stationAlchemy = has(text, ["火车站", "railway station", "train station"]) && has(text, ["炼金", "alchemy", "alchemical"]);
  if (stationAlchemy) {
    const rooms: ProgramRoom[] = [
      room("station-hall", "Converted platform concourse", 0, 21, 10, 22, 9, "public", ["entrance", "station-hall", "main-block"]),
      room("lab-workshop", "Alchemical experiment workshop", 0, 9, 21, 10, 12, "service", ["alchemy-lab", "industrial"]),
      room("archive-car", "Archive railway carriage", 0, 33, 22, 6, 15, "private", ["archive-carriage", "rail-car"]),
      room("freight-office", "Freight office and reagent store", 0, 21, 25, 10, 7, "service", ["freight", "storage"]),
      room("clock-tower", "Station clock tower", 1, 8, 8, 7, 7, "combat", ["clock-tower", "high-ground"]),
      { ...room("roof-conveyor", "Roof reagent conveyor bridge", 2, 21, 12, 21, 3, "combat", ["roof-platform", "roof-bridge", "conveyor"]), openAir: true },
      { ...room("freight-tunnel", "Underground freight tunnel", 3, 21, 31, 9, 18, "circulation", ["underground", "freight-tunnel"]), absoluteElevationFeet: -15 },
    ];
    return { id: "station-alchemy", title: "The Transmuter's Terminus", description: "A rail terminus converted into an alchemical guild: concourse, working laboratory, archive carriage, clock tower, roof conveyor, and subterranean freight route retain the station's linear logic.", archetype: "workshop", seed: context.request.seed, bounds: { x: 44, z: 42 }, floorHeights: [15, 13, 10, 11], floorLabels: ["1F", "钟楼", "屋顶输送桥", "B1"], rooms, connections: [link("hall-lab", "station-hall", "lab-workshop"), link("hall-archive", "station-hall", "archive-car", "corridor"), link("hall-freight", "station-hall", "freight-office", "service"), link("hall-clock", "station-hall", "clock-tower", "stair"), link("clock-conveyor", "clock-tower", "roof-conveyor", "stair"), link("lab-conveyor", "lab-workshop", "roof-conveyor", "stair"), link("freight-tunnel", "freight-office", "freight-tunnel", "stair")], requiredFeatures: ["station-hall", "alchemy-lab", "archive-carriage", "freight-tunnel", "clock-tower", "roof-bridge"], detailCount: Math.round(12 + context.request.density * 20), floorMaterial: "stone", wallMaterial: "plaster", states: [...states, "temporary-conversion"], exteriorStyle: "station-platform", facadeStyle: "industrial" };
  }

  const powerStation = has(text, ["发电站", "power station", "power plant", "电厂"]);
  if (powerStation) {
    const rooms: ProgramRoom[] = [
      room("turbine", "Turbine hall", 0, 18, 15, 18, 16, "combat", ["entrance", "turbine-hall", "industrial"]),
      room("boiler", "Boiler house", 0, 36, 16, 11, 17, "service", ["boiler", "industrial"]),
      room("control", "Raised control room", 1, 12, 8, 9, 7, "private", ["control-room", "high-ground"]),
      room("conveyor", "Coal conveyor bridge", 1, 28, 8, 22, 3.5, "combat", ["conveyor", "catwalk", "high-ground"]),
      { ...room("maintenance", "Maintenance catwalk network", 2, 20, 21, 24, 3.5, "circulation", ["roof-platform", "catwalk", "high-ground"]), openAir: true },
      { ...room("cable", "Underground cable level", 3, 19, 26, 15, 10, "service", ["underground", "cable-level"]), absoluteElevationFeet: -15 },
      { ...room("flood-pit", "Flooded equipment pit", 3, 34, 27, 8, 8, "combat", ["underground", "equipment-pit"]), absoluteElevationFeet: -21 },
    ];
    return { id: "power-station", title: "Blackwater Generating Station", description: "A tall turbine nave, separate boiler mass, glazed control room, conveyor bridge, maintenance catwalks and submerged cable basement create an industrial vertical battlefield.", archetype: "workshop", seed: context.request.seed, bounds: { x: 46, z: 39 }, floorHeights: [20, 15, 12, 11], floorLabels: ["1F", "控制层", "猫道", "B1"], rooms, connections: [link("turbine-boiler", "turbine", "boiler", "service"), link("turbine-control", "turbine", "control", "stair"), link("control-conveyor", "control", "conveyor"), link("conveyor-maintenance", "conveyor", "maintenance", "stair"), link("turbine-cable", "turbine", "cable", "stair"), link("cable-pit", "cable", "flood-pit")], requiredFeatures: ["turbine-hall", "control-room", "boiler", "conveyor", "catwalk", "cable-level", "equipment-pit"], detailCount: Math.round(16 + context.request.density * 24), floorMaterial: "stone", wallMaterial: "darkStone", states: [...states, "flooded"], exteriorStyle: "service-yard", facadeStyle: "industrial" };
  }

  const hotelOrTavern = has(text, ["酒店", "hotel", "酒馆", "旅店", "tavern", "inn"]);
  if (hotelOrTavern) {
    const tavern = has(text, ["酒馆", "tavern", "inn"]);
    const roomCount = context.request.size === "large" ? 7 : context.request.size === "small" ? 3 : 5;
    const rooms: ProgramRoom[] = [
      room("lobby", tavern ? "Public taproom" : "Grand lobby", 0, 18, 7, 15, 9, "public", ["entrance", tavern ? "taproom" : "lobby"]),
      room("dining", tavern ? "Dining alcove and stage" : "Restaurant", 0, 8, 17, 9, 10, "public", ["dining"]),
      room("ballroom", tavern ? "Private guild hall" : "Ballroom", 0, 28, 18, 12, 11, "combat", ["ballroom"]),
      room("kitchen", "Kitchen and scullery", 0, 18, 25, 10, 7, "service", ["kitchen", "service-route"]),
      room("staff-stair", "Staff stair and linen room", 0, 33, 27, 6, 6, "service", ["service-stair"]),
      ...Array.from({ length: roomCount }, (_, index) => room(`guest-2-${index}`, `Second-floor guest room ${index + 1}`, 1, 7 + (index % 3) * 10.5, 8 + Math.floor(index / 3) * 10, 7.5, 7, "private", ["guest-room"])),
      ...Array.from({ length: Math.max(2, roomCount - 2) }, (_, index) => room(`guest-3-${index}`, tavern ? `Attic chamber ${index + 1}` : `Third-floor suite ${index + 1}`, 2, 10 + (index % 3) * 9, 10 + Math.floor(index / 3) * 9, 7, 6.5, "private", [tavern ? "attic" : "suite"])),
      { ...room("roof-chase", "Broken roof chase route", 3, 19, 9, 17, 5, "combat", ["roof-platform", "roof-route", "high-ground"]), openAir: true },
      { ...room("cellar", tavern ? "Wine cellar" : "Boiler room and wine cellar", 4, 20, 26, 12, 8, "service", ["underground", tavern ? "wine-cellar" : "boiler"]), absoluteElevationFeet: -13 },
      { ...room("stable", tavern ? "Rear courtyard stable" : "Rear delivery garage", 0, 35, 31, 8, 9, "service", [tavern ? "stable" : "garage", "rear-entrance"]), openAir: true },
    ];
    const upperCount = Math.max(2, roomCount - 2);
    const upperLinks = Array.from({ length: upperCount - 1 }, (_, index) => index).filter((index) => index % 3 !== 2).map((index) => link(`guest3-${index}`, `guest-3-${index}`, `guest-3-${index + 1}`, "corridor"));
    if (upperCount > 3) upperLinks.push(link("guest3-row-link", "guest-3-0", "guest-3-3", "corridor"));
    const connections: ProgramConnection[] = [link("lobby-dining", "lobby", "dining"), link("lobby-ballroom", "lobby", "ballroom"), link("dining-kitchen", "dining", "kitchen", "service"), link("kitchen-staff", "kitchen", "staff-stair", "service"), link("staff-stable", "staff-stair", "stable", "service"), link("lobby-upper", "lobby", "guest-2-0", "stair"), link("staff-upper", "staff-stair", `guest-2-${roomCount - 1}`, "stair"), ...Array.from({ length: roomCount - 1 }, (_, index) => link(`guest2-${index}`, `guest-2-${index}`, `guest-2-${index + 1}`, "corridor")), link("upper-attic", "guest-2-0", "guest-3-0", "stair"), ...upperLinks, link("attic-roof", "guest-3-0", "roof-chase", "stair"), link("kitchen-cellar", "kitchen", "cellar", "stair")];
    return { id: tavern ? "tavern-inn" : "hotel", title: tavern ? "The Copper Griffin Inn" : "The Grand Meridian Hotel", description: "A hospitality building with independent public rooms, a service spine, changing guest-floor footprints, basement plant space, rear deliveries, and an accessible roof pursuit route.", archetype: "hotel", seed: context.request.seed, bounds: { x: 41, z: 38 }, floorHeights: [12, 11, 9, 9, 10], floorLabels: ["1F", "2F", "3F", "屋顶", "B1"], rooms, connections, requiredFeatures: ["lobby", "dining", "kitchen", "service-route", "guest-room", "underground", "roof-route", tavern ? "stable" : "garage"], detailCount: Math.round(14 + context.request.density * 22), floorMaterial: "wood", wallMaterial: "plaster", states, exteriorStyle: "institutional-street", facadeStyle: "domestic" };
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
      room("garage", "Patrol garage", 0, 37, 24, 8, 10, "service", ["garage", "rear-entrance", ...partitionTags]),
      room("chief-office", "Chief's private office", 1, 18, 8, 8, 7, "private", ["chief-office", ...partitionTags]),
      room("upper-archives", "Case archives", 1, 9, 14, 10, 12, "private", ["archives", "upper-west", ...partitionTags]),
      room("upper-interrogation", "Interrogation room", 1, 27, 15, 9, 11, "private", ["interrogation", "upper-east", ...partitionTags]),
      { ...room("basement", "Evidence vault", 3, 13, 27, 9, 8, "service", ["underground", "evidence", ...partitionTags]), absoluteElevationFeet: -16 },
      { ...room("sealed-store", "Sealed evidence annex", 3, 25, 27, 8, 7, "private", ["underground", "evidence", "sealed", ...partitionTags]), absoluteElevationFeet: -16 },
      { ...room("roof", "Roof service and escape platform", 2, 18, 8, 12, 6, "combat", ["roof-platform", "high-ground"]), openAir: true },
    ];
    connections = [
      link("front-office", "front", "open-office"), link("office-records", "open-office", "records"), link("records-interview", "records", "interview"),
      link("office-detention", "open-office", "detention"), link("office-booking", "open-office", "booking"), link("booking-sally", "booking", "sally-port", "service"),
      link("sally-garage", "sally-port", "garage", "service"), link("office-chief", "open-office", "chief-office", "stair"), link("records-archives", "records", "upper-archives", "stair"), link("detention-interrogation", "detention", "upper-interrogation", "stair"),
      link("booking-basement", "booking", "basement", "stair"), link("basement-sealed", "basement", "sealed-store", "secret"), link("archives-roof", "upper-archives", "roof", "stair"),
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
      { ...room("basement", "Underground boiler room", 3, 13, 27, 9, 8, "service", ["underground", "boiler"]), absoluteElevationFeet: -16 },
      { ...room("secret-surgery", "Secret surgical theatre", 3, 25, 27, 9, 8, "private", ["underground", "secret-laboratory", "operating-room"]), absoluteElevationFeet: -16 },
      { ...room("roof", "Roof service and escape platform", 2, 18, 8, 12, 6, "combat", ["roof-platform", "high-ground"]), openAir: true },
    ];
    connections = [link("front-court", "front", "court"), link("court-west", "court", "west-ward"), link("court-east", "court", "east-ward"), link("court-treatment", "court", "treatment"), link("treatment-morgue", "treatment", "morgue", "service"), link("west-upper", "west-ward", "upper-west", "stair"), link("east-upper", "east-ward", "upper-east", "stair"), link("treatment-basement", "treatment", "basement", "stair"), link("basement-surgery", "basement", "secret-surgery", "secret"), link("upper-roof", "upper-west", "roof", "stair")];
  } else {
    rooms = [room("front", frontName, 0, 18 + jitter("front"), 6, 13, 7, "public", ["entrance", ...partitionTags, ...evidenceTags]), room("west", westName, 0, 7, 17 + jitter("west"), 8, 15, "public", ["west-wing", monastery ? "cloister" : "functional-wing", ...partitionTags]), room("east", eastName, 0, 29, 17 + jitter("east"), 8, 15, "private", ["east-wing", ...(radioWeather ? ["radio-room", "weather-station"] : []), ...partitionTags]), { ...room("court", monastery ? "Enclosed cloister garden" : "Central circulation court", 0, 18, 16, 8, 8, "circulation", ["courtyard", ...(monastery ? ["cloister"] : [])]), openAir: true }, room("rear", rearName, 0, 18, 28, 13, 7, "service", ["rear-core", ...partitionTags, ...evidenceTags]), room("upper-west", monastery ? "Scriptorium and sealed archive" : "Upper west gallery", 1, 9, 15, 10, 12, "private", ["upper-west", ...partitionTags]), room("upper-east", radioWeather ? "Wireless observation room" : "Upper east gallery", 1, 27, 16, 9, 11, "private", ["upper-east", ...partitionTags]), { ...room("basement", bunker ? "Underground air-raid shelter" : "Underground collection vault", 3, 19, 27, 11, 8, "service", ["underground", ...(bunker ? ["bunker"] : []), ...partitionTags]), absoluteElevationFeet: -16 }, { ...room("roof", museum ? "Glass-dome roof chase" : antenna ? "Antenna maintenance platform" : "Roof service and escape platform", 2, 18, 8, 12, 6, "combat", ["roof-platform", "high-ground", ...(antenna ? ["antenna-platform"] : [])]), openAir: true }];
    connections = [link("front-court", "front", "court"), link("court-west", "court", "west"), link("court-east", "court", "east"), link("court-rear", "court", "rear", "service"), link("west-upper", "west", "upper-west", "stair"), link("east-upper", "east", "upper-east", "stair"), link("rear-basement", "rear", "basement", "stair"), link("upper-roof", "upper-west", "roof", "stair")];
  }
  void s;
  return { id: "institution", title: `${label} Replanned`, description: "An asymmetrical functional institution with public arrival, separate wings, restricted rear circulation, basement service space, and a reachable roof route.", archetype: police ? "police" : hospital ? "hospital" : museum ? "museum" : "warehouse", seed: context.request.seed, bounds: { x: 42, z: 40 }, floorHeights: [13, 12, 11, 10], floorLabels: ["1F", "2F", "屋顶", "B1"], rooms, connections, requiredFeatures: ["public-front", "separate-wings", "restricted-rear", "underground", "roof-route"], detailCount: Math.round(8 + context.request.density * 16), floorMaterial: museum ? "stone" : "wood", wallMaterial: "plaster", states, exteriorStyle: hospital && has(text, ["海崖", "sea cliff", "coastal cliff"]) ? "coastal-cliff" : "institutional-street", facadeStyle: museum ? "sacred" : "civic" };
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
