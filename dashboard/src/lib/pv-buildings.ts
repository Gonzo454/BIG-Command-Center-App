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

// Joe owns 51% of Park Vista Senior Housing Management, which operates all
// 14 communities. Per Joe (June 2026): JRW should reflect ownership in ALL
// real estate including the senior buildings. Using 51% (PVSHM ownership)
// as the equity proxy for each building.
export const JOE_PV_BUILDINGS: Record<string, PvBuildingEntry> = {
  "Arborcreek Apartments": { pct: 0.51, label: "Arborcreek Apartments" },
  "Arborview Court": { pct: 0.51, label: "Arborview Court" },
  "Arborwood Lodge": { pct: 0.51, label: "Arborwood Lodge" },
  "Camanche": { pct: 0.51, label: "Camanche" },
  "Legacy": { pct: 0.51, label: "Legacy" },
  "Legacy at Noel Manor": { pct: 0.51, label: "Legacy at Noel Manor" },
  "Legacy of DeForest": { pct: 0.51, label: "Legacy of DeForest" },
  "Noel Manor": { pct: 0.51, label: "Noel Manor" },
  "North Hill": { pct: 0.51, label: "North Hill" },
  "Regency Retirement Residence of Clinton": { pct: 0.51, label: "Regency Retirement Residence of Clinton" },
  "The Lodge at Whispering Pines": { pct: 0.51, label: "The Lodge at Whispering Pines" },
  "Waupaca": { pct: 0.51, label: "Waupaca" },
  "Whispering Pines": { pct: 0.51, label: "Whispering Pines" },
  "Willow Lane": { pct: 0.51, label: "Willow Lane" },
};

export function isJoePvBuilding(propertyName: string): boolean {
  return propertyName in JOE_PV_BUILDINGS;
}
