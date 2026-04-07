// Carrier store — tracks fleet carrier state from journal events

export interface CarrierState {
  // Identity
  carrierId: number | null;
  callsign: string | null;
  name: string | null;

  // Finances
  carrierBalance: number;
  reserveBalance: number;
  availableBalance: number;
  reservePercent: number;
  taxRate: number;

  // Space usage
  totalCapacity: number;
  cargo: number;
  cargoSpaceReserved: number;
  shipPacks: number;
  modulePacks: number;
  freeSpace: number;
  crewSpace: number;

  // Fuel & jump
  fuelLevel: number;
  jumpRangeCurr: number;
  jumpRangeMax: number;

  // Services (active crew roles)
  activeServices: string[];

  // Pending jump
  pendingJump: { system: string; departureTime: string } | null;

  // Upkeep tracking
  upkeepPerWeek: number; // calculated from active services

  // Income since last login — sum of bank transfers (deposits from trade, etc.)
  incomeThisSession: number;

  // Trade orders summary
  buyOrderCount: number;
  buyOrderTonnage: number;
  sellOrderCount: number;
  sellOrderTonnage: number;

  // Whether we have received CarrierStats data
  hasData: boolean;

  // Timestamp of last CarrierStats event
  lastUpdated: string | null;
}

// Weekly upkeep costs per service (Credits)
// Base carrier upkeep + per-service costs (from ED wiki)
// Weekly upkeep per service — keyed by CrewRole from journal
const SERVICE_UPKEEP: Record<string, number> = {
  Captain: 0, // included in base
  Commodities: 0, // no upkeep
  Refuel: 630_000,
  Repair: 630_000,
  Rearm: 630_000,
  Outfitting: 2_520_000,
  Shipyard: 3_780_000,
  CarrierFuel: 0, // Tritium depot, no upkeep
  VistaGenomics: 630_000,
  PioneerSupplies: 630_000,
  Bartender: 630_000,
  BlackMarket: 1_260_000,
  Exploration: 1_260_000,
  VoucherRedemption: 1_260_000,
};
const BASE_UPKEEP_PER_WEEK = 5_000_000;
const HULL_MAINTENANCE_PER_WEEK = 500_000; // 100k per jump, max 500k/week

function createCarrierStore() {
  let carrierId = $state<number | null>(null);
  let callsign = $state<string | null>(null);
  let name = $state<string | null>(null);

  let carrierBalance = $state(0);
  let reserveBalance = $state(0);
  let availableBalance = $state(0);
  let reservePercent = $state(0);
  let taxRate = $state(0);

  let totalCapacity = $state(0);
  let cargo = $state(0);
  let cargoSpaceReserved = $state(0);
  let shipPacks = $state(0);
  let modulePacks = $state(0);
  let freeSpace = $state(0);
  let crewSpace = $state(0);

  let fuelLevel = $state(0);
  let jumpRangeCurr = $state(0);
  let jumpRangeMax = $state(0);

  let activeServices = $state<string[]>([]);

  let pendingJump = $state<{ system: string; departureTime: string } | null>(null);

  let incomeThisSession = $state(0);

  let buyOrderCount = $state(0);
  let buyOrderTonnage = $state(0);
  let sellOrderCount = $state(0);
  let sellOrderTonnage = $state(0);

  let hasData = $state(false);
  let lastUpdated = $state<string | null>(null);

  // Track trade orders for tonnage calculation
  const buyOrders = new Map<string, number>(); // commodity -> tons
  const sellOrders = new Map<string, number>();

  function calcUpkeep(services: string[]): number {
    let upkeep = BASE_UPKEEP_PER_WEEK + HULL_MAINTENANCE_PER_WEEK;
    for (const svc of services) {
      upkeep += SERVICE_UPKEEP[svc] ?? 0;
    }
    return upkeep;
  }

  function recalcOrderSummary() {
    buyOrderCount = buyOrders.size;
    buyOrderTonnage = [...buyOrders.values()].reduce((s, v) => s + Math.abs(v), 0);
    sellOrderCount = sellOrders.size;
    sellOrderTonnage = [...sellOrders.values()].reduce((s, v) => s + Math.abs(v), 0);
  }

  return {
    get current(): CarrierState {
      const upkeep = calcUpkeep(activeServices);
      return {
        carrierId,
        callsign,
        name,
        carrierBalance,
        reserveBalance,
        availableBalance,
        reservePercent,
        taxRate,
        totalCapacity,
        cargo,
        cargoSpaceReserved,
        shipPacks,
        modulePacks,
        freeSpace,
        crewSpace,
        fuelLevel,
        jumpRangeCurr,
        jumpRangeMax,
        activeServices,
        pendingJump,
        upkeepPerWeek: upkeep,
        incomeThisSession,
        buyOrderCount,
        buyOrderTonnage,
        sellOrderCount,
        sellOrderTonnage,
        hasData,
        lastUpdated,
      };
    },

    /** Handle CarrierStats event — full snapshot */
    handleStats(data: Record<string, unknown>) {
      carrierId = (data.CarrierID as number) ?? null;
      callsign = (data.Callsign as string) ?? null;
      name = (data.Name as string) ?? null;
      lastUpdated = (data.timestamp as string) ?? null;

      const finance = data.Finance as Record<string, unknown> | undefined;
      if (finance) {
        carrierBalance = (finance.CarrierBalance as number) ?? 0;
        reserveBalance = (finance.ReserveBalance as number) ?? 0;
        availableBalance = (finance.AvailableBalance as number) ?? 0;
        reservePercent = (finance.ReservePercent as number) ?? 0;
        taxRate = (finance.TaxRate as number) ?? 0;
      }

      const space = data.SpaceUsage as Record<string, unknown> | undefined;
      if (space) {
        totalCapacity = (space.TotalCapacity as number) ?? 0;
        cargo = (space.Cargo as number) ?? 0;
        cargoSpaceReserved = (space.CargoSpaceReserved as number) ?? 0;
        shipPacks = (space.ShipPacks as number) ?? 0;
        modulePacks = (space.ModulePacks as number) ?? 0;
        freeSpace = (space.FreeSpace as number) ?? 0;
        crewSpace = (space.Crew as number) ?? 0;
      }

      fuelLevel = (data.FuelLevel as number) ?? 0;
      jumpRangeCurr = (data.JumpRangeCurr as number) ?? 0;
      jumpRangeMax = (data.JumpRangeMax as number) ?? 0;

      // Parse active services from Crew array
      const crew = data.Crew as Array<Record<string, unknown>> | undefined;
      if (crew) {
        activeServices = crew
          .filter(c => c.Activated === true)
          .map(c => c.CrewRole as string);
      }

      // CarrierStats is a full snapshot — clear stale trade order data
      buyOrders.clear();
      sellOrders.clear();
      recalcOrderSummary();

      hasData = true;
    },

    /** Handle CarrierFinance event — balance/tax update */
    handleFinance(data: Record<string, unknown>) {
      carrierBalance = (data.CarrierBalance as number) ?? carrierBalance;
      reserveBalance = (data.ReserveBalance as number) ?? reserveBalance;
      availableBalance = (data.AvailableBalance as number) ?? availableBalance;
      reservePercent = (data.ReservePercent as number) ?? reservePercent;
      taxRate = (data.TaxRate as number) ?? taxRate;
    },

    /** Handle CarrierBankTransfer — track income this session */
    handleBankTransfer(data: Record<string, unknown>) {
      const deposit = (data.Deposit as number) ?? 0;
      const withdraw = (data.Withdraw as number) ?? 0;
      // Deposits are income to carrier, withdrawals are taking from carrier
      incomeThisSession += deposit - withdraw;
      carrierBalance = (data.CarrierBalance as number) ?? carrierBalance;
    },

    /** Handle CarrierTradeOrder — track buy/sell orders */
    handleTradeOrder(data: Record<string, unknown>) {
      const commodity = (data.Commodity as string) ?? "";
      const purchaseOrder = data.PurchaseOrder as number | undefined;
      const saleOrder = data.SaleOrder as number | undefined;

      if (purchaseOrder != null) {
        if (purchaseOrder > 0) {
          buyOrders.set(commodity, purchaseOrder);
        } else {
          buyOrders.delete(commodity);
        }
      }
      if (saleOrder != null) {
        if (saleOrder > 0) {
          sellOrders.set(commodity, saleOrder);
        } else {
          sellOrders.delete(commodity);
        }
      }
      recalcOrderSummary();
    },

    /** Handle CarrierJumpRequest — pending jump */
    handleJumpRequest(data: Record<string, unknown>) {
      const sys = (data.SystemName as string) ?? "";
      const departure = (data.DepartureTime as string) ?? "";
      pendingJump = sys ? { system: sys, departureTime: departure } : null;
    },

    /** Handle CarrierJumpCancelled */
    handleJumpCancelled() {
      pendingJump = null;
    },

    /** Handle CarrierDepositFuel */
    handleDepositFuel(data: Record<string, unknown>) {
      fuelLevel = 0; // We don't know the new level from this event alone
      const total = data.Total as number | undefined;
      if (total != null) fuelLevel = total;
    },

    /** Handle CarrierCrewServices — service activated/deactivated */
    handleCrewServices(data: Record<string, unknown>) {
      const role = (data.CrewRole as string) ?? "";
      const op = (data.Operation as string) ?? "";
      if (op === "Activate" || op === "Resume") {
        if (!activeServices.includes(role)) {
          activeServices = [...activeServices, role];
        }
      } else if (op === "Deactivate" || op === "Pause") {
        activeServices = activeServices.filter(s => s !== role);
      }
    },

    /** Handle CarrierJump — clear pending jump after arrival */
    handleCarrierJump() {
      pendingJump = null;
    },

    /** Check if a station name matches our carrier */
    isOwnCarrier(stationName: string): boolean {
      if (!callsign) return false;
      // Station name for carriers is the callsign (e.g., "K7Q-B2G")
      return stationName === callsign || stationName === name;
    },

    /** Reset session income (e.g., on new login) */
    resetSessionIncome() {
      incomeThisSession = 0;
    },

    /** Serialize for cache */
    toJSON() {
      if (!hasData) return null;
      return {
        carrierId, callsign, name,
        carrierBalance, reserveBalance, availableBalance, reservePercent, taxRate,
        totalCapacity, cargo, cargoSpaceReserved, shipPacks, modulePacks, freeSpace, crewSpace,
        fuelLevel, jumpRangeCurr, jumpRangeMax,
        activeServices,
        pendingJump,
        buyOrderCount, buyOrderTonnage, sellOrderCount, sellOrderTonnage,
        lastUpdated,
      };
    },

    /** Restore from cache */
    seedFromCache(cached: unknown) {
      if (!cached || typeof cached !== "object") return;
      const c = cached as Record<string, unknown>;
      if (c.carrierId == null) return;

      carrierId = (c.carrierId as number) ?? null;
      callsign = (c.callsign as string) ?? null;
      name = (c.name as string) ?? null;
      carrierBalance = (c.carrierBalance as number) ?? 0;
      reserveBalance = (c.reserveBalance as number) ?? 0;
      availableBalance = (c.availableBalance as number) ?? 0;
      reservePercent = (c.reservePercent as number) ?? 0;
      taxRate = (c.taxRate as number) ?? 0;
      totalCapacity = (c.totalCapacity as number) ?? 0;
      cargo = (c.cargo as number) ?? 0;
      cargoSpaceReserved = (c.cargoSpaceReserved as number) ?? 0;
      shipPacks = (c.shipPacks as number) ?? 0;
      modulePacks = (c.modulePacks as number) ?? 0;
      freeSpace = (c.freeSpace as number) ?? 0;
      crewSpace = (c.crewSpace as number) ?? 0;
      fuelLevel = (c.fuelLevel as number) ?? 0;
      jumpRangeCurr = (c.jumpRangeCurr as number) ?? 0;
      jumpRangeMax = (c.jumpRangeMax as number) ?? 0;
      activeServices = Array.isArray(c.activeServices) ? (c.activeServices as string[]) : [];
      pendingJump = (c.pendingJump as { system: string; departureTime: string } | null) ?? null;
      buyOrderCount = (c.buyOrderCount as number) ?? 0;
      buyOrderTonnage = (c.buyOrderTonnage as number) ?? 0;
      sellOrderCount = (c.sellOrderCount as number) ?? 0;
      sellOrderTonnage = (c.sellOrderTonnage as number) ?? 0;
      lastUpdated = (c.lastUpdated as string) ?? null;
      hasData = true;
      // Reset session income on cache restore (new session)
      incomeThisSession = 0;
    },
  };
}

export const carrierStore = createCarrierStore();
