import { _injectRegistryAccessor } from "./workflow-marketplace"
import { _getAllAssets } from "./exchange-registry"

// Wire marketplace registry accessor on module load
_injectRegistryAccessor(_getAllAssets)

export * from "./exchange-registry"
export * from "./workflow-marketplace"
export * from "./blueprint-catalog"
export * from "./operator-exchange"
export * from "./package-manager"
export * from "./monetization-engine"
export * from "./workflow-publisher"
export * from "./runtime-packager"
