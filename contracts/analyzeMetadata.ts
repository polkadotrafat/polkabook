import { v14 } from "@polkadot-api/substrate-bindings"
import * as fs from "fs"

function fromHex(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex
  const res = new Uint8Array(s.length / 2)
  for (let i = 0; i < res.length; i++) {
    res[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  }
  return res
}

async function main() {
    const metadataHex = JSON.parse(fs.readFileSync("metadata.json", "utf8"))
    const metadata = v14.dec(fromHex(metadataHex))
    
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

    console.log(`Arguments for Revive.instantiate_with_code (index ${instantiateCall.index}):`)
    for (const field of instantiateCall.fields) {
        const type = metadata.value.lookup.find(l => l.id === field.type)
        console.log(`- ${field.name}: ${type?.path.join("::") || "unknown"} (id: ${field.type})`)
        if (type?.def.tag === "composite") {
            console.log(`  Composite fields: ${type.def.value.map(f => f.name).join(", ")}`)
        }
        if (type?.def.tag === "variant") {
            console.log(`  Variant options: ${type.def.value.map(v => v.name).join(", ")}`)
        }
    }
}

main().catch(console.error)
