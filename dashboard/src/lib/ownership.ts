/**
 * Joe Wagner Ownership Percentages
 *
 * Source: Joe's February 2025 Personal Financial Statement (PFS)
 * Columns: "Percent Owned Joe Wagner" (personal) + "Percent Owned GST" (trust)
 * Combined = Joe's total economic interest (personal + GST trust)
 *
 * Entities not found in PFS default to 1.0 (100%) — these are assumed
 * to be fully owned until confirmed otherwise.
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
    joePct: 0.0075,
    gstPct: 0.7425,
    combined: 0.75,
    pfsName: "Columbia Saint Mary's",
  },
  "Germantown Warhawks": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "Germantown Land",
  },
  "Greywolf Industrial II, LLC CIC Industrial": {
    joePct: 0.6287,
    gstPct: 0.0,
    combined: 0.6287,
    pfsName: "Madison CIC 2",
  },
  "HC1 Acquisitions Honey Creek I": {
    joePct: 0.0075,
    gstPct: 0.7425,
    combined: 0.75,
    pfsName: "Honey Creek I",
  },
  "Honey Badger, LLC Honey Creek II": {
    joePct: 0.0398,
    gstPct: 0.478,
    combined: 0.5178,
    pfsName: "Honey Creek II",
  },
  "Honey Creek IV, LLC": {
    joePct: 0.0079,
    gstPct: 0.7425,
    combined: 0.7504,
    pfsName: "Honey Creek IV",
  },

  // BIG Management (corporate entity) — Joe is 100% owner
  "Blackdeer Investment Group": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "Blackdeer Investment Group",
  },

  // Badger Hotel
  "Badger Hotel Group": {
    joePct: 0.64637,
    gstPct: 0.0,
    combined: 0.64637,
    pfsName: "Comfort Suites",
  },

  // Entities not in PFS — defaulting to 100% until confirmed
  // TODO: Confirm ownership with Joe Wagner
  "2080 MPW LLC": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "(not in PFS — assumed 100%)",
  },
  "Greyworks LLC": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "(not in PFS — assumed 100%)",
  },
  "Prairie Square": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "(not in PFS — assumed 100%)",
  },
  "Research Park": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "(not in PFS — assumed 100%)",
  },
  "Spooner St": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "(not in PFS — assumed 100%)",
  },
  "Vantage IV": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "(not in PFS — assumed 100%)",
  },
  "Water Tower Place": {
    joePct: 1.0,
    gstPct: 0.0,
    combined: 1.0,
    pfsName: "(not in PFS — assumed 100%)",
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
