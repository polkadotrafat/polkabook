import { v14 } from "@polkadot-api/substrate-bindings"
import * as fs from "fs"
import * as path from "path"

function fromHex(hex: string): Uint8Array {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex
  const res = new Uint8Array(s.length / 2)
  for (let i = 0; i < res.length; i++) {
    res[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  }
  return res
}

async function main() {
    const metadataPath = path.join(__dirname, "metadata.json")
    const metadataHex = JSON.parse(fs.readFileSync(metadataPath, "utf8"))
    
    // v14.dec expects the metadata bytes without the 4-byte magic number and 1-byte version
    const metadata = v14.dec(fromHex(metadataHex).slice(5))
    
    const pallet100 = metadata.pallets.find((p: any) => p.index === 100)
    if (!pallet100) {
        console.log("Pallet with index 100 not found")
        return
    }

    console.log(`Pallet 100 name: ${pallet100.name}`)

    if (pallet100.errors === undefined) {
        console.log("Pallet 100 has no errors")
        return
    }

    const errorsType = metadata.lookup.find((l: any) => l.id === pallet100.errors)
    if (!errorsType || errorsType.def.tag !== "variant") {
        console.log("Errors type not found or not a variant")
        return
    }

    const error27 = errorsType.def.value.find((v: any) => v.index === 27)
    if (!error27) {
        console.log("Error with index 27 not found in pallet 100")
        return
    }

    console.log(`Error 27 name: ${error27.name}`)
    console.log(`Error 27 docs: ${error27.docs.join("\n")}`)
}

main().catch(console.error)
