/**
 * Joe Wagner Ownership Percentages
 *
 * Source: Joe's February 2025 PFS + confirmed updates from Joe (June 2026)
 * Columns: "Percent Owned Joe Wagner" (personal) + "Percent Owned GST" (trust)
 * Combined = Joe's total economic interest (personal + GST trust)
 *
 * Entities not found in map default to 1.0 (100%).
 */

export interface OwnershipEntry {
  /** Joe's direct personal ownership */
  joePct: number;
  /** GST (Grantor Shelter Trust) ownership */
  gstPct: number;
  /** Combined economic interest (joe + gst) */
  combined: number;
  /** PFS common name for reference */
  pfsName: string;
}

/**
 * Maps GL entity names → ownership percentages.
 * Keys must match the entity strings produced by gl-parser's entity extraction.
 */
export const OWNERSHIP: Record<string, OwnershipEntry> = {
  // JRW Portfolio Properties
  "2172 MPW, LLC (Land Leases)": {
    joePct: 0.01,
    gstPct: 0.99,
    combined: 1.0,
    pfsName: "2172 Miller Parkway",
  },
  "CG Silver Badger, LLC": {
    joePct: 0.01,
    gstPct: 0.99,
    combined: 1.0,
    pfsName: "Cottage Grove Commons",
  },
  "Columbia St Mary's - Red Badger LLC": {
    joePct: 0.0,
    gstPct: 0.0,
    combined: 0.0,
    pfsName: "Columbia Saint Mary's (SOLD)",
  },
  "Germantown Warhawks": {
    joePct: 0.0,
    gstPct: 0.0,
    combined: 0.0,
    pfsName: "Germantown Land (SOLD)",
  },
  "Greywolf Industrial II, LLC CIC Industrial": {
    joePct: 0.63,
    gstPct: 0.0,
    combined: 0.63,
    pfsName: "Madison CIC 2",
  },
  "HC1 Acquisitions Honey Creek I": {
    joePct: 0.0,
    gstPct: 0.0,
    combined: 0.0,
    pfsName: "Honey Creek I (0% per Joe)",
  },
  "Honey Badger, LLC Honey Creek II": {
    joePct: 0.04,
    gstPct: 0.48,
    combined: 0.52,
    pfsName: "Honey Creek II",
  },
  // Honey Creek III — back to bank, 0% ownership
  // Entity name TBD if it appears in AppFolio
  "Honey Creek IV, LLC": {
    joePct: 0.01,
    gstPct: 0.74,
    combined: 0.75,
    pfsName: "Honey Creek IV",
  },

  // BIG Management (corporate entity) — Joe is 100% owner
  "Blackdeer Investment Group": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "Blackdeer Investment Group",
  },

  // Park Vista Senior Housing Management — Joe 51%, Julie Lonegran 49%
  "Park Vista": {
    joePct: 0.51,
    gstPct: 0.0,
    combined: 0.51,
    pfsName: "Park Vista Senior Housing (51% Joe)",
  },

  // Badger Hotel
  "Badger Hotel Group": {
    joePct: 0.65,
    gstPct: 0.0,
    combined: 0.65,
    pfsName: "Comfort Suites",
  },

  // Confirmed by Joe Wagner — June 2026
  "2080 MPW LLC": {
    joePct: 0.70,
    gstPct: 0.0,
    combined: 0.70,
    pfsName: "2080 MPW (70% Joe)",
  },
  "Greyworks LLC": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "Greyworks (assumed 100%)",
  },
  "Prairie Square": {
    joePct: 0.0,
    gstPct: 0.0,
    combined: 0.0,
    pfsName: "Prairie Square (0% per Joe)",
  },
  "Research Park": {
    joePct: 0.0,
    gstPct: 0.0,
    combined: 0.0,
    pfsName: "Research Park (0% per Joe)",
  },
  "Spooner St": {
    joePct: 0.50,
    gstPct: 0.0,
    combined: 0.50,
    pfsName: "Spooner St (50% Joe)",
  },
  "Vantage IV": {
    joePct: 0.0,
    gstPct: 0.0,
    combined: 0.0,
    pfsName: "Vantage IV (0% per Joe)",
  },
  "Water Tower Place": {
    joePct: 0.0,
    gstPct: 0.0,
    combined: 0.0,
    pfsName: "Water Tower Place (0% per Joe)",
  },
};

/** Default ownership for entities not in the map */
const DEFAULT_OWNERSHIP: OwnershipEntry = {
  joePct: 1.0,
  gstPct: 0.0,
  combined: 1.0,
  pfsName: "(unknown entity — defaulting to 100%)",
};

/**
 * Get Joe's combined ownership percentage for a GL entity.
 * Returns a value between 0 and 1.
 */
export function getOwnership(entity: string): number {
  return (OWNERSHIP[entity] || DEFAULT_OWNERSHIP).combined;
}

/**
 * Get detailed ownership breakdown for a GL entity.
 */
export function getOwnershipEntry(entity: string): OwnershipEntry {
  return OWNERSHIP[entity] || DEFAULT_OWNERSHIP;
}
