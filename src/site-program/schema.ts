import type { BuildingProgramSummary, GenerationRequest, SettlementBuildingKind, Vec2 } from "../schema";

export type SiteType = "harbor-district" | "city-district" | "town" | "village" | "mining-settlement" | "wilderness-site";
export type DistrictRole = "civic" | "commercial" | "residential" | "industrial" | "sacred" | "harbor" | "agricultural" | "service";
export type RoadHierarchy = "arterial" | "street" | "lane" | "trail" | "quay" | "bridge" | "rail" | "elevated" | "maintenance";
export type BuildingLod = "full-interior" | "facade" | "mass";

export interface SettlementMorphologyProgram {
  era: "ancient" | "medieval" | "1920s" | "modern" | "future" | "timeless";
  growth: "organic" | "planned" | "military" | "industrial" | "vertical";
  roadPattern: "harbor-spine" | "anchor-web" | "radial-ring" | "contour" | "canal-banks" | "rectilinear";
  constraints: string[];
  anchors: Array<{ id: string; kind: "gate" | "market" | "harbor" | "sacred" | "industry" | "terrain"; point: SitePoint }>;
}

export interface SitePoint extends Vec2 {
  y?: number;
}

export interface SiteTerrainProgram {
  kind: "coast" | "river" | "rolling" | "valley" | "forest-clearing" | "urban";
  buildableRatio: number;
  elevationBandsFeet: number[];
  waterEdge?: SitePoint[];
}

export interface DistrictProgram {
  id: string;
  label: string;
  role: DistrictRole;
  center: Vec2;
  size: Vec2;
  density: number;
}

export interface RoadProgram {
  id: string;
  hierarchy: RoadHierarchy;
  widthCells: number;
  points: SitePoint[];
  purpose: "crowd" | "cargo" | "service" | "patrol" | "rural";
  levelFeet?: number;
  nodeIds: string[];
}

export interface RoadNodeProgram {
  id: string;
  point: SitePoint;
  levelFeet: number;
  roadIds: string[];
  kind: "entry" | "junction" | "terminus" | "grade-separated";
}

export interface BlockProgram {
  id: string;
  districtId: string;
  boundary: SitePoint[];
  center: Vec2;
  size: Vec2;
  frontageRoadIds: string[];
  setbackCells: number;
  openSpaceRatio: number;
}

export interface ParcelProgram {
  id: string;
  districtId: string;
  center: Vec2;
  size: Vec2;
  buildingSize: Vec2;
  rotationY: number;
  blockId: string;
  frontageRoadId: string;
  entrance: Vec2;
  buildingKind: SettlementBuildingKind;
  buildingSeed: string;
  lod: BuildingLod;
  floors: { min: number; max: number };
  state: "active" | "abandoned" | "flooded" | "temporary";
  boundary?: SitePoint[];
  shapeSignature?: string;
  buildingProgram?: BuildingProgramSummary;
}

export interface OpenSpaceProgram {
  id: string;
  kind: "plaza" | "market" | "farm" | "orchard" | "yard" | "quay" | "clearing";
  center: Vec2;
  size: Vec2;
}

export interface EncounterZoneProgram {
  id: string;
  kind: "chokepoint" | "cover" | "high-ground" | "hazard" | "entrance";
  center: Vec2;
  radiusCells: number;
}

export interface SiteProgram {
  version: 1;
  id: string;
  seed: string;
  siteType: SiteType;
  morphology: SettlementMorphologyProgram;
  bounds: Vec2;
  terrain: SiteTerrainProgram;
  districts: DistrictProgram[];
  roadNodes: RoadNodeProgram[];
  roads: RoadProgram[];
  blocks: BlockProgram[];
  parcels: ParcelProgram[];
  openSpaces: OpenSpaceProgram[];
  encounterZones: EncounterZoneProgram[];
  requiredFeatures: string[];
  lodPolicy: {
    fullInteriorCount: number;
    facadeCount: number;
    massCount: number;
  };
  diagnostics: {
    roadLengthCells: number;
    parcelCoverage: number;
    buildingCoverage: number;
    districtCount: number;
    junctionCount: number;
    blockCount: number;
    averageParcelArea: number;
    openSpaceRatio: number;
    curvedRoadRatio: number;
    nonRectangularBlockRatio: number;
  };
}

export interface SiteProgramSummary {
  version: 1;
  siteType: SiteType;
  districtCount: number;
  roadCount: number;
  junctionCount: number;
  blockCount: number;
  parcelCount: number;
  fullInteriorCount: number;
  facadeCount: number;
  massCount: number;
  roadLengthCells: number;
  parcelCoverage: number;
  buildingCoverage: number;
  averageParcelArea: number;
  openSpaceRatio: number;
  roadPattern: SettlementMorphologyProgram["roadPattern"];
  curvedRoadRatio: number;
  nonRectangularBlockRatio: number;
}

export interface SitePlanningInput {
  request: GenerationRequest;
  archetype: "village" | "town" | "city" | "harbor";
}

export function summarizeSiteProgram(program: SiteProgram): SiteProgramSummary {
  return {
    version: 1,
    siteType: program.siteType,
    districtCount: program.districts.length,
    roadCount: program.roads.length,
    junctionCount: program.roadNodes.filter((node) => node.kind === "junction").length,
    blockCount: program.blocks.length,
    parcelCount: program.parcels.length,
    fullInteriorCount: program.lodPolicy.fullInteriorCount,
    facadeCount: program.lodPolicy.facadeCount,
    massCount: program.lodPolicy.massCount,
    roadLengthCells: program.diagnostics.roadLengthCells,
    parcelCoverage: program.diagnostics.parcelCoverage,
    buildingCoverage: program.diagnostics.buildingCoverage,
    averageParcelArea: program.diagnostics.averageParcelArea,
    openSpaceRatio: program.diagnostics.openSpaceRatio,
    roadPattern: program.morphology.roadPattern,
    curvedRoadRatio: program.diagnostics.curvedRoadRatio,
    nonRectangularBlockRatio: program.diagnostics.nonRectangularBlockRatio,
  };
}
