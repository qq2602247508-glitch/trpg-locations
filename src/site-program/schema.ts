import type { BuildingProgramSummary, GenerationRequest, SettlementBuildingKind, Vec2 } from "../schema";

export type SiteType = "harbor-district" | "city-district" | "town" | "village" | "mining-settlement" | "wilderness-site";
export type DistrictRole = "civic" | "commercial" | "residential" | "industrial" | "sacred" | "harbor" | "agricultural" | "service";
export type RoadHierarchy = "arterial" | "street" | "lane" | "trail" | "quay" | "bridge";
export type BuildingLod = "full-interior" | "facade" | "mass";

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
}

export interface ParcelProgram {
  id: string;
  districtId: string;
  center: Vec2;
  size: Vec2;
  rotationY: number;
  frontageRoadId: string;
  entrance: Vec2;
  buildingKind: SettlementBuildingKind;
  buildingSeed: string;
  lod: BuildingLod;
  floors: { min: number; max: number };
  state: "active" | "abandoned" | "flooded" | "temporary";
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
  bounds: Vec2;
  terrain: SiteTerrainProgram;
  districts: DistrictProgram[];
  roads: RoadProgram[];
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
    districtCount: number;
  };
}

export interface SiteProgramSummary {
  version: 1;
  siteType: SiteType;
  districtCount: number;
  roadCount: number;
  parcelCount: number;
  fullInteriorCount: number;
  facadeCount: number;
  massCount: number;
  roadLengthCells: number;
  parcelCoverage: number;
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
    parcelCount: program.parcels.length,
    fullInteriorCount: program.lodPolicy.fullInteriorCount,
    facadeCount: program.lodPolicy.facadeCount,
    massCount: program.lodPolicy.massCount,
    roadLengthCells: program.diagnostics.roadLengthCells,
    parcelCoverage: program.diagnostics.parcelCoverage,
  };
}
