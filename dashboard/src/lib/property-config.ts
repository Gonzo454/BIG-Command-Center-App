/**
 * CRE Property Configuration
 *
 * Per-property asset-class tags, managed-only flags, and archive status.
 * Drives benchmark targets (OER, NOI margin, DSCR, WALT) and status grading.
 *
 * Source: Command Center KPI Build Spec v1, Section 7 & 10
 */

export type AssetClass =
  | "office_fsg"       // Office (full-service gross)
  | "office_mg"        // Office (modified gross)
  | "retail_gross"     // Retail (multi-tenant gross)
  | "retail_nnn"       // Retail (NNN)
  | "industrial"       // Industrial / warehouse
  | "residential"      // Multifamily / residential
  | "land"             // Land lease (e.g., 2172 MPW)
  | "hotel"            // Hotel / hospitality
  | "mgmt_company";   // Management company (BIG) — not a property

export type BusinessEntity =
  | "jrw"           // JRW CRE Portfolio (Joe's direct property investments)
  | "big"           // BIG (Blackdeer Investment Group) — management company
  | "park_vista"    // Park Vista Senior Housing
  | "badger_hotel"  // Badger Hotel Group
  | "badger_realty"; // Badger Realty — brokerage

export interface PropertyConfig {
  assetClass: AssetClass;
  businessEntity: BusinessEntity;
  managedOnly: boolean;
  archived: boolean;
  archiveReason?: string;
  alwaysStable?: boolean;
  zeroVacancyLoss?: boolean;
}

export const PROPERTY_CONFIG: Record<string, PropertyConfig> = {
  "2172 MPW, LLC (Land Leases)": {
    assetClass: "land",
    businessEntity: "jrw",
    managedOnly: false,
    archived: false,
  },
  "CG Silver Badger, LLC": {
    assetClass: "residential",
    businessEntity: "jrw",
    managedOnly: false,
    archived: false,
  },
  "Greywolf Industrial II, LLC CIC Industrial": {
    assetClass: "industrial",
    businessEntity: "jrw",
    managedOnly: false,
    archived: false,
  },
  "HC1 Acquisitions Honey Creek I": {
    assetClass: "office_mg",
    businessEntity: "jrw",
    managedOnly: true,
    archived: true,
    archiveReason: "Sold",
    zeroVacancyLoss: true,
  },
  "Honey Badger, LLC Honey Creek II": {
    assetClass: "office_mg",
    businessEntity: "jrw",
    managedOnly: false,
    archived: false,
    zeroVacancyLoss: true,
  },
  "Honey Creek IV, LLC": {
    assetClass: "office_mg",
    businessEntity: "jrw",
    managedOnly: false,
    archived: true,
    archiveReason: "Sold",
  },
  "Prairie Square": {
    assetClass: "office_mg",
    businessEntity: "big",
    managedOnly: true,
    archived: false,
  },
  "Spooner St": {
    assetClass: "residential",
    businessEntity: "jrw",
    managedOnly: false,
    archived: false,
    alwaysStable: true,
  },
  "Water Tower Place": {
    assetClass: "office_mg",
    businessEntity: "big",
    managedOnly: true,
    archived: false,
  },
  "2080 MPW LLC": {
    assetClass: "office_mg",
    businessEntity: "jrw",
    managedOnly: false,
    archived: false,
  },
  "Greyworks LLC": {
    assetClass: "industrial",
    businessEntity: "jrw",
    managedOnly: false,
    archived: false,
  },
  "Badger Hotel Group": {
    assetClass: "hotel",
    businessEntity: "badger_hotel",
    managedOnly: false,
    archived: false,
  },
  "Blackdeer Investment Group": {
    assetClass: "mgmt_company",
    businessEntity: "big",
    managedOnly: false,
    archived: false,
  },
  "Research Park": {
    assetClass: "office_mg",
    businessEntity: "big",
    managedOnly: true,
    archived: false,
  },
  "Vantage IV": {
    assetClass: "office_mg",
    businessEntity: "big",
    managedOnly: true,
    archived: false,
  },
  // Archived entities
  "Germantown Warhawks": {
    assetClass: "land",
    businessEntity: "jrw",
    managedOnly: false,
    archived: true,
    archiveReason: "Sold",
  },
  "Columbia St Mary's - Red Badger LLC": {
    assetClass: "residential",
    businessEntity: "jrw",
    managedOnly: false,
    archived: true,
    archiveReason: "Sold",
  },
  "Honey Creek III": {
    assetClass: "office_mg",
    businessEntity: "jrw",
    managedOnly: false,
    archived: true,
    archiveReason: "Back to bank",
  },
};

const DEFAULT_CONFIG: PropertyConfig = {
  assetClass: "office_mg",
  businessEntity: "jrw",
  managedOnly: false,
  archived: false,
};

export const BUSINESS_ENTITY_LABELS: Record<BusinessEntity, string> = {
  jrw: "JRW CRE Portfolio",
  big: "Blackdeer Investment Group",
  park_vista: "Park Vista Senior Housing",
  badger_hotel: "Badger Hotel Group",
  badger_realty: "Badger Realty",
};

export function getPropertyConfig(name: string): PropertyConfig {
  return PROPERTY_CONFIG[name] || DEFAULT_CONFIG;
}

/**
 * Per-asset-class benchmark targets
 * Source: KPI Build Spec Section 7
 */
export interface BenchmarkTargets {
  oerLow: number;
  oerHigh: number;
  noiMarginLow: number;
  noiMarginHigh: number;
  dscrMin: number;
  dscrTarget: number;
  waltYears: number | null;
  recoveryLow: number | null;
  recoveryHigh: number | null;
  occupancyTarget: number;
}

export const BENCHMARKS: Record<AssetClass, BenchmarkTargets> = {
  office_fsg: {
    oerLow: 45, oerHigh: 55,
    noiMarginLow: 45, noiMarginHigh: 55,
    dscrMin: 1.30, dscrTarget: 1.40,
    waltYears: 5,
    recoveryLow: 0, recoveryHigh: 10,
    occupancyTarget: 90,
  },
  office_mg: {
    oerLow: 35, oerHigh: 45,
    noiMarginLow: 55, noiMarginHigh: 65,
    dscrMin: 1.25, dscrTarget: 1.35,
    waltYears: 5,
    recoveryLow: 40, recoveryHigh: 70,
    occupancyTarget: 85,
  },
  retail_gross: {
    oerLow: 30, oerHigh: 45,
    noiMarginLow: 55, noiMarginHigh: 70,
    dscrMin: 1.25, dscrTarget: 1.40,
    waltYears: 4,
    recoveryLow: null, recoveryHigh: null,
    occupancyTarget: 90,
  },
  retail_nnn: {
    oerLow: 10, oerHigh: 20,
    noiMarginLow: 80, noiMarginHigh: 90,
    dscrMin: 1.30, dscrTarget: 1.40,
    waltYears: 7,
    recoveryLow: 85, recoveryHigh: 95,
    occupancyTarget: 95,
  },
  industrial: {
    oerLow: 20, oerHigh: 35,
    noiMarginLow: 65, noiMarginHigh: 80,
    dscrMin: 1.20, dscrTarget: 1.25,
    waltYears: 4,
    recoveryLow: 80, recoveryHigh: 95,
    occupancyTarget: 90,
  },
  residential: {
    oerLow: 35, oerHigh: 50,
    noiMarginLow: 50, noiMarginHigh: 65,
    dscrMin: 1.20, dscrTarget: 1.25,
    waltYears: null,
    recoveryLow: null, recoveryHigh: null,
    occupancyTarget: 90,
  },
  land: {
    oerLow: 0, oerHigh: 10,
    noiMarginLow: 90, noiMarginHigh: 100,
    dscrMin: 1.0, dscrTarget: 1.25,
    waltYears: null,
    recoveryLow: null, recoveryHigh: null,
    occupancyTarget: 95,
  },
  hotel: {
    oerLow: 55, oerHigh: 70,
    noiMarginLow: 30, noiMarginHigh: 45,
    dscrMin: 1.25, dscrTarget: 1.40,
    waltYears: null,
    recoveryLow: null, recoveryHigh: null,
    occupancyTarget: 65,
  },
  mgmt_company: {
    oerLow: 0, oerHigh: 100,
    noiMarginLow: 0, noiMarginHigh: 100,
    dscrMin: 0, dscrTarget: 0,
    waltYears: null,
    recoveryLow: null, recoveryHigh: null,
    occupancyTarget: 0,
  },
};

export type PropertyStatus = "Strong" | "Stable" | "Review";

/**
 * NOI-based status grading (per Joe's thresholds).
 * Monthly NOI > +$5k → Strong (green)
 * Monthly NOI between −$5k and +$5k → Stable (black)
 * Monthly NOI < −$5k → Review (red)
 *
 * Special: properties with alwaysStable=true → always Stable.
 */
export function gradeProperty(metrics: {
  monthlyNoi: number;
  propertyName?: string;
}): PropertyStatus {
  const cfg = metrics.propertyName ? getPropertyConfig(metrics.propertyName) : undefined;
  if (cfg?.alwaysStable) return "Stable";

  if (metrics.monthlyNoi > 5000) return "Strong";
  if (metrics.monthlyNoi < -5000) return "Review";
  return "Stable";
}

export function formatAssetClass(ac: AssetClass): string {
  const labels: Record<AssetClass, string> = {
    office_fsg: "Office (FSG)",
    office_mg: "Office (MG)",
    retail_gross: "Retail (Gross)",
    retail_nnn: "Retail (NNN)",
    industrial: "Industrial",
    residential: "Residential",
    land: "Land Lease",
    hotel: "Hotel",
    mgmt_company: "Mgmt Co.",
  };
  return labels[ac] || ac;
}
