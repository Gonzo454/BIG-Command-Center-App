/**
 * Joe-owned Park Vista buildings.
 *
 * Joe's 51% stake in Park Vista Senior Housing Management (the management
 * company) is tracked separately in ownership.ts ("Park Vista"). This table
 * covers the PV *buildings* Joe owns directly — those appear as real estate
 * holdings in the JRW section, weighted by his equity share.
 *
 * Keys must match property_name values in the PV AppFolio database:
 * Camanche, Legacy, Legacy at Noel Manor, Legacy of DeForest, Noel Manor,
 * North Hill, Regency Retirement Residence of Clinton, Waupaca, Willow Lane
 */

export interface PvBuildingEntry {
  /** Joe's equity share of the building, 0–1 */
  pct: number;
  /** Display label override (defaults to the property name) */
  label?: string;
}

// TODO: confirm with Joe/Carrie which building(s) he owns and at what %.
// Until then this is empty and no PV building appears in the JRW holdings.
export const JOE_PV_BUILDINGS: Record<string, PvBuildingEntry> = {};

export function isJoePvBuilding(propertyName: string): boolean {
  return propertyName in JOE_PV_BUILDINGS;
}
