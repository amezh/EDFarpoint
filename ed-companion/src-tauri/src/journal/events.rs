#![allow(non_snake_case, dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// All journal events we care about, plus a catch-all
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event")]
pub enum JournalEvent {
    Fileheader(FileheaderEvent),
    Commander(CommanderEvent),
    Loadout(LoadoutEvent),
    Location(LocationEvent),
    FSDJump(FSDJumpEvent),
    CarrierJump(CarrierJumpEvent),
    Scan(ScanEvent),
    FSSDiscoveryScan(FSSDiscoveryScanEvent),
    FSSBodySignals(FSSBodySignalsEvent),
    SAASignalsFound(SAASignalsFoundEvent),
    SAAScanComplete(SAAScanCompleteEvent),
    ScanOrganic(ScanOrganicEvent),
    ApproachBody(ApproachBodyEvent),
    LeaveBody(LeaveBodyEvent),
    SupercruiseEntry(SupercruiseEntryEvent),
    Touchdown(TouchdownEvent),
    Liftoff(LiftoffEvent),
    Docked(DockedEvent),
    Undocked(UndockedEvent),
    CarrierStats(CarrierStatsEvent),
    CarrierFinance(CarrierFinanceEvent),
    CarrierBankTransfer(CarrierBankTransferEvent),
    CarrierTradeOrder(CarrierTradeOrderEvent),
    CarrierJumpRequest(CarrierJumpRequestEvent),
    CarrierJumpCancelled(CarrierJumpCancelledEvent),
    CarrierDepositFuel(CarrierDepositFuelEvent),
    CarrierCrewServices(CarrierCrewServicesEvent),
    Shutdown(ShutdownEvent),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileheaderEvent {
    pub timestamp: String,
    pub part: Option<u32>,
    pub language: Option<String>,
    #[serde(default)]
    pub Odyssey: bool,
    pub gameversion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommanderEvent {
    pub timestamp: String,
    pub FID: Option<String>,
    pub Name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadoutEvent {
    pub timestamp: String,
    pub Ship: String,
    pub ShipID: u64,
    pub ShipName: Option<String>,
    pub ShipIdent: Option<String>,
    pub MaxJumpRange: Option<f64>,
    pub FuelCapacity: Option<FuelCapacity>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FuelCapacity {
    pub Main: f64,
    pub Reserve: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationEvent {
    pub timestamp: String,
    pub StarSystem: String,
    pub SystemAddress: u64,
    pub StarPos: [f64; 3],
    pub Body: Option<String>,
    pub BodyID: Option<u32>,
    pub BodyType: Option<String>,
    #[serde(default)]
    pub Docked: bool,
    pub Population: Option<u64>,
    pub SystemAllegiance: Option<String>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FSDJumpEvent {
    pub timestamp: String,
    pub StarSystem: String,
    pub SystemAddress: u64,
    pub StarPos: [f64; 3],
    pub Body: Option<String>,
    pub BodyID: Option<u32>,
    pub BodyType: Option<String>,
    pub JumpDist: f64,
    pub FuelUsed: f64,
    pub FuelLevel: f64,
    pub Population: Option<u64>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierJumpEvent {
    pub timestamp: String,
    pub StarSystem: String,
    pub SystemAddress: u64,
    pub StarPos: [f64; 3],
    pub Body: Option<String>,
    pub BodyID: Option<u32>,
    pub BodyType: Option<String>,
    #[serde(default)]
    pub Docked: bool,
    pub Population: Option<u64>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanEvent {
    pub timestamp: String,
    pub ScanType: String,
    pub BodyName: String,
    pub BodyID: u32,
    pub StarSystem: Option<String>,
    pub SystemAddress: Option<u64>,
    pub DistanceFromArrivalLS: Option<f64>,
    // Star fields
    pub StarType: Option<String>,
    pub Subclass: Option<u32>,
    pub StellarMass: Option<f64>,
    pub SurfaceTemperature: Option<f64>,
    pub Luminosity: Option<String>,
    pub Age_MY: Option<u64>,
    // Planet fields
    pub PlanetClass: Option<String>,
    pub Atmosphere: Option<String>,
    pub AtmosphereType: Option<String>,
    pub AtmosphereComposition: Option<Vec<AtmosphereComponent>>,
    pub Volcanism: Option<String>,
    pub MassEM: Option<f64>,
    pub Radius: Option<f64>,
    pub SurfaceGravity: Option<f64>,
    pub SurfacePressure: Option<f64>,
    pub Landable: Option<bool>,
    pub TerraformState: Option<String>,
    pub TidalLock: Option<bool>,
    pub Materials: Option<Vec<MaterialEntry>>,
    pub Composition: Option<Value>,
    pub Parents: Option<Vec<Value>>,
    pub Rings: Option<Vec<RingInfo>>,
    pub SemiMajorAxis: Option<f64>,
    pub Eccentricity: Option<f64>,
    pub OrbitalInclination: Option<f64>,
    pub OrbitalPeriod: Option<f64>,
    pub RotationPeriod: Option<f64>,
    pub AxialTilt: Option<f64>,
    #[serde(default)]
    pub WasDiscovered: bool,
    #[serde(default)]
    pub WasMapped: bool,
    #[serde(default)]
    pub WasFootfalled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AtmosphereComponent {
    pub Name: String,
    pub Percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialEntry {
    pub Name: String,
    pub Percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RingInfo {
    pub Name: String,
    pub RingClass: String,
    pub MassMT: Option<f64>,
    pub InnerRad: Option<f64>,
    pub OuterRad: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FSSDiscoveryScanEvent {
    pub timestamp: String,
    pub Progress: f64,
    pub BodyCount: u32,
    pub NonBodyCount: u32,
    pub SystemName: String,
    pub SystemAddress: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FSSBodySignalsEvent {
    pub timestamp: String,
    pub BodyName: String,
    pub BodyID: u32,
    pub SystemAddress: u64,
    pub Signals: Vec<SignalEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SAASignalsFoundEvent {
    pub timestamp: String,
    pub BodyName: String,
    pub SystemAddress: u64,
    pub BodyID: u32,
    pub Signals: Vec<SignalEntry>,
    pub Genuses: Option<Vec<GenusEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalEntry {
    pub Type: String,
    pub Type_Localised: Option<String>,
    pub Count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenusEntry {
    pub Genus: String,
    pub Genus_Localised: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SAAScanCompleteEvent {
    pub timestamp: String,
    pub BodyName: String,
    pub SystemAddress: u64,
    pub BodyID: u32,
    pub ProbesUsed: u32,
    pub EfficiencyTarget: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanOrganicEvent {
    pub timestamp: String,
    pub ScanType: String,
    pub Genus: String,
    pub Genus_Localised: Option<String>,
    pub Species: String,
    pub Species_Localised: Option<String>,
    pub Variant: Option<String>,
    pub Variant_Localised: Option<String>,
    pub SystemAddress: u64,
    pub Body: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApproachBodyEvent {
    pub timestamp: String,
    pub StarSystem: String,
    pub SystemAddress: u64,
    pub Body: String,
    pub BodyID: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaveBodyEvent {
    pub timestamp: String,
    pub StarSystem: String,
    pub SystemAddress: u64,
    pub Body: String,
    pub BodyID: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupercruiseEntryEvent {
    pub timestamp: String,
    pub StarSystem: String,
    pub SystemAddress: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TouchdownEvent {
    pub timestamp: String,
    pub StarSystem: Option<String>,
    pub SystemAddress: Option<u64>,
    pub Body: Option<String>,
    pub BodyID: Option<u32>,
    pub Latitude: Option<f64>,
    pub Longitude: Option<f64>,
    #[serde(default)]
    pub PlayerControlled: bool,
    #[serde(default)]
    pub OnPlanet: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiftoffEvent {
    pub timestamp: String,
    pub StarSystem: Option<String>,
    pub SystemAddress: Option<u64>,
    pub Body: Option<String>,
    pub BodyID: Option<u32>,
    pub Latitude: Option<f64>,
    pub Longitude: Option<f64>,
    #[serde(default)]
    pub PlayerControlled: bool,
    #[serde(default)]
    pub OnPlanet: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockedEvent {
    pub timestamp: String,
    pub StationName: String,
    pub StationType: Option<String>,
    pub StarSystem: String,
    pub SystemAddress: u64,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndockedEvent {
    pub timestamp: String,
    pub StationName: String,
    pub StationType: Option<String>,
    pub StarSystem: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierStatsEvent {
    pub timestamp: String,
    pub CarrierID: u64,
    pub Callsign: String,
    pub Name: String,
    pub DockingAccess: Option<String>,
    pub AllowNotorious: Option<bool>,
    pub FuelLevel: Option<u32>,
    pub JumpRangeCurr: Option<f64>,
    pub JumpRangeMax: Option<f64>,
    pub PendingDecommission: Option<bool>,
    pub SpaceUsage: Option<CarrierSpaceUsage>,
    pub Finance: Option<CarrierFinanceData>,
    pub Crew: Option<Vec<CarrierCrewMember>>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierSpaceUsage {
    pub TotalCapacity: u32,
    pub Crew: u32,
    pub Cargo: u32,
    pub CargoSpaceReserved: u32,
    pub ShipPacks: u32,
    pub ModulePacks: u32,
    pub FreeSpace: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierFinanceData {
    pub CarrierBalance: i64,
    pub ReserveBalance: i64,
    pub AvailableBalance: i64,
    pub ReservePercent: Option<f64>,
    pub TaxRate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierCrewMember {
    pub CrewRole: String,
    pub Activated: bool,
    pub Enabled: Option<bool>,
    pub CrewName: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierFinanceEvent {
    pub timestamp: String,
    pub CarrierID: u64,
    pub TaxRate: Option<f64>,
    pub CarrierBalance: i64,
    pub ReserveBalance: i64,
    pub AvailableBalance: i64,
    pub ReservePercent: Option<f64>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierBankTransferEvent {
    pub timestamp: String,
    pub CarrierID: u64,
    pub Deposit: Option<i64>,
    pub Withdraw: Option<i64>,
    pub PlayerBalance: Option<i64>,
    pub CarrierBalance: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierTradeOrderEvent {
    pub timestamp: String,
    pub CarrierID: u64,
    pub BlackMarket: Option<bool>,
    pub Commodity: String,
    pub Commodity_Localised: Option<String>,
    pub PurchaseOrder: Option<i64>,
    pub SaleOrder: Option<i64>,
    pub Price: Option<i64>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierJumpRequestEvent {
    pub timestamp: String,
    pub CarrierID: u64,
    pub SystemName: String,
    pub Body: Option<String>,
    pub SystemAddress: Option<u64>,
    pub DepartureTime: Option<String>,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierJumpCancelledEvent {
    pub timestamp: String,
    pub CarrierID: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierDepositFuelEvent {
    pub timestamp: String,
    pub CarrierID: u64,
    pub Amount: u32,
    pub Total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierCrewServicesEvent {
    pub timestamp: String,
    pub CarrierID: u64,
    pub CrewRole: String,
    pub Operation: String,
    pub CrewName: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShutdownEvent {
    pub timestamp: String,
}
