import { createClient } from "polkadot-api"
import { getWsProvider } from "polkadot-api/ws-provider/web"
import { v14 } from "@polkadot-api/substrate-bindings"
import * as path from "path"
import * as fs from "fs"

async function main() {
    const rpcUrl = "wss://asset-hub-paseo-rpc.n.dwellir.com"
    const client = createClient(getWsProvider(rpcUrl))
    const metadataHex = await client._request<string>("state_getMetadata", [])
    client.destroy()

    const metadata = v14.decode(metadataHex)
    const revivePallet = metadata.value.pallets.find(p => p.name === "Revive")
    if (!revivePallet) {
        console.log("Revive pallet not found")
        return
    }

    const callsType = metadata.value.lookup.find(l => l.id === revivePallet.calls!)
    if (!callsType || callsType.def.tag !== "variant") {
        console.log("Calls not found or not a variant")
        return
    }

    const instantiateCall = callsType.def.value.find(v => v.name === "instantiate_with_code")
    if (!instantiateCall) {
        console.log("instantiate_with_code not found")
        return
    }

    console.log("Arguments for Revive.instantiate_with_code:")
    for (const field of instantiateCall.fields) {
        const type = metadata.value.lookup.find(l => l.id === field.type)
        console.log(`- ${field.name}: ${type?.path.join("::") || "unknown"} (id: ${field.type})`)
    }
}

main().catch(console.error)
