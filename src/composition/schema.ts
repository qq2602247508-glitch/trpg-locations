export type CapabilityStatus = "planned" | "prototype" | "validated" | "production-ready";
export type CapabilityCategory = "terrain" | "water" | "route" | "ecology" | "structure" | "tactical" | "state" | "style";

export interface SpatialPort {
  id: string;
  kind: "route" | "water" | "support" | "vertical" | "boundary";
  direction: "in" | "out" | "bidirectional";
  elevationBand?: number;
}

export interface GeometryPrimitiveDefinition {
  id: string;
  status: CapabilityStatus;
  description: string;
  builder: string;
  supportsGrid: boolean;
  supportsBatching: boolean;
}

export interface AtomParameterDefinition {
  id: string;
  kind: "number" | "integer" | "boolean" | "enum";
  min?: number;
  max?: number;
  values?: string[];
  defaultValue: number | boolean | string;
}

/**
 * Serializable contract for one reusable spatial atom. Geometry is still
 * authored deterministically in TypeScript; the contract exposes how the atom
 * can be composed, traversed, supported, rendered and audited.
 */
export interface SpatialAtomDefinition {
  id: string;
  version: 1;
  status: CapabilityStatus;
  category: CapabilityCategory;
  label: string;
  description: string;
  tags: string[];
  parameters: AtomParameterDefinition[];
  footprintCells: { min: [number, number]; max: [number, number] };
  elevationFeet: { min: number; max: number };
  ports: SpatialPort[];
  inputPorts: SpatialPort[];
  outputPorts: SpatialPort[];
  supportSurfaces: string[];
  walkableSurfaces: string[];
  blockedVolumes: string[];
  clearanceVolumes: string[];
  traversal: Array<"walk" | "climb" | "jump" | "swim" | "fly">;
  adjacencyConditions: string[];
  placementConstraints: string[];
  constraints: string[];
  tacticalEffects: Array<"cover" | "high-ground" | "hazard" | "chokepoint" | "alternate-route" | "objective">;
  gridRule: "surface" | "none" | "water-edge";
  geometryBuilder: string;
  lod: "instanced" | "batched" | "unique";
  instancingStrategy: "none" | "transform-instance" | "merged-batch";
  performanceBudget: { maxTriangles: number; maxDrawCalls: number };
  validation: string[];
  visualFixtures: string[];
  failureConditions: string[];
}

export interface CapabilityCard {
  id: string;
  label: string;
  description: string;
  status: CapabilityStatus;
  tags: string[];
  atomIds: string[];
  environments?: string[];
  inputPorts?: string[];
  outputPorts?: string[];
  constraints?: string[];
  recommendedWith?: string[];
  qualityGrade?: "planned" | "C" | "B" | "A";
  incompatibilities?: string[];
}

export interface FunctionalModule {
  id: string;
  label: string;
  capabilityIds: string[];
  requiredPorts: string[];
  realizedTags: string[];
}

export interface DesignerMotif {
  id: string;
  label: string;
  domain: string;
  status?: CapabilityStatus;
  moduleIds: string[];
  requiredCapabilities: string[];
  structuralRules: string[];
  identityChecks: string[];
}

export interface CompositionGrammar {
  id: string;
  label: string;
  domain: string;
  status?: CapabilityStatus;
  allowedMotifs: string[];
  orderingRules: string[];
  topologyChecks: string[];
}

export interface LayeredSeeds {
  root: string;
  macro: string;
  meso: string;
  tactical: string;
  building: string;
  ecology: string;
  micro: string;
  style: string;
}

export interface DomainDensityProfile {
  domain: "forest" | "swamp" | "river" | "volcanic" | "crater" | "rift" | "ice" | "floating" | "cave" | "generic";
  normalized: number;
  structuralComplexity: number;
  routeComplexity: number;
  hazardFrequency: number;
  ecologicalCoverage: number;
  landmarkFrequency: number;
  detailFrequency: number;
}

export interface StyleProgram {
  era: "fantasy-medieval" | "historic" | "modern" | "timeless";
  climate: string;
  materialFamily: string[];
  paletteTags: string[];
  silhouetteTags: string[];
  forbiddenTags: string[];
}

export interface SemanticRequirement {
  id: string;
  sourcePhrase: string;
  requiredTags: string[];
  importance: "critical" | "major" | "minor";
}

export interface SemanticCoverageItem extends SemanticRequirement {
  realizedTags: string[];
  capabilityIds: string[];
  coverageRatio: number;
  lowConfidence: boolean;
  covered: boolean;
}

export interface SemanticCoverageReport {
  score: number;
  coveredCritical: number;
  totalCritical: number;
  items: SemanticCoverageItem[];
  missing: string[];
  lowConfidence: string[];
  degraded: string[];
}

export interface SceneCompositionProgram {
  version: 1;
  source: "local" | "bge" | "ollama";
  primaryDomain: string;
  grammarId: string;
  motifIds: string[];
  capabilityIds: string[];
  seeds: LayeredSeeds;
  density: DomainDensityProfile;
  style: StyleProgram;
  requirements: SemanticRequirement[];
}

export interface SceneCompositionProgramSummary {
  version: 1;
  source: SceneCompositionProgram["source"];
  primaryDomain: string;
  grammarId: string;
  motifIds: string[];
  capabilityIds: string[];
  density: DomainDensityProfile;
  style: StyleProgram;
  semanticCoverage?: SemanticCoverageReport;
}
