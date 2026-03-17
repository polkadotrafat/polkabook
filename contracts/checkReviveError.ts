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
    
    const palletIndex = 100
    const errorIndex = 27

    const pallet = metadata.value.pallets.find(p => p.index === palletIndex)
    if (!pallet) {
        console.log(`Pallet with index ${palletIndex} not found`)
        // List all pallets and their indices
        metadata.value.pallets.forEach(p => console.log(`Pallet: ${p.name}, Index: ${p.index}`))
        return
    }

    console.log(`Pallet: ${pallet.name}, Index: ${pallet.index}`)
    if (pallet.errors === undefined) {
        console.log("No errors for this pallet")
        return
    }

    const errorsType = metadata.value.lookup.find(l => l.id === pallet.errors!)
    if (!errorsType || errorsType.def.tag !== "variant") {
        console.log("Errors type not found or not a variant")
        return
    }

    const error = errorsType.def.value.find(v => v.index === errorIndex)
    if (!error) {
        console.log(`Error with index ${errorIndex} not found in pallet ${pallet.name}`)
        return
    }

    console.log(`Error: ${error.name}`)
    console.log(`Docs: ${error.docs.join(" ")}`)
}

main().catch(console.error)
