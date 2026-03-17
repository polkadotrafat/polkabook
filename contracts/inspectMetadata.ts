import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { loadLocalEnv } from "./loadEnv";
import path from "node:path";
import { metadata as metadataDecoder } from "@polkadot-api/substrate-bindings";
import { fromHex } from "@polkadot-api/utils";

loadLocalEnv(path.resolve(process.cwd(), ".env"));

const rpcUrl = process.env.POLKADOT_RPC_URL || "wss://asset-hub-paseo-rpc.n.dwellir.com";

async function main() {
  console.log(`Connecting to ${rpcUrl}...`);
  const provider = getWsProvider(rpcUrl);
  const client = createClient(provider);
  
  try {
    const metadataRaw = await client._request<string>("state_getMetadata", []);
    const decodedMetadata = metadataDecoder.dec(fromHex(metadataRaw));
    
    console.log("Decoded metadata keys:", Object.keys(decodedMetadata));
    if ((decodedMetadata as any).tag) console.log("Tag:", (decodedMetadata as any).tag);
    
    const v15 = (decodedMetadata as any).value;
    if (!v15) {
        console.error("No value in decoded metadata. Full metadata:", JSON.stringify(decodedMetadata, (k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 500));
        return;
    }
    const pallets = v15.pallets;
    const lookup = v15.lookup;

    const revivePallet = pallets.find((p: any) => p.name === "Revive");
    if (!revivePallet) {
      console.error("Revive pallet not found. Available pallets:", pallets.map((p: any) => p.name).join(", "));
      return;
    }

    console.log("Found Revive pallet");
    
    const callsTypeId = revivePallet.calls;
    if (callsTypeId === undefined) {
      console.error("Revive pallet has no calls");
      return;
    }

    const callsType = lookup[callsTypeId];
    // The calls type is usually an enum (variant)
    const variants = callsType.def.value.variants;
    const instantiateCall = variants.find((v: any) => 
      v.name === "instantiate_with_code" || 
      v.name === "instantiateWithCode" ||
      v.name === "eth_instantiate_with_code"
    );
    
    if (!instantiateCall) {
      console.error("instantiate_with_code call not found. Available calls:", variants.map((v: any) => v.name).join(", "));
      return;
    }

    console.log(`Call: ${instantiateCall.name}`);
    instantiateCall.fields.forEach((field: any) => {
      const typeId = field.type;
      const typeDef = lookup[typeId];
      const typeName = typeDef.path ? typeDef.path.join("::") : "unknown";
      console.log(`- Argument: ${field.name || 'unnamed'} (Type ID: ${typeId}, Name: ${typeName})`);
    });

    // Find Weight type
    const gasLimitField = instantiateCall.fields.find((f: any) => f.name === "gas_limit" || f.name === "gasLimit");
    if (gasLimitField) {
      const weightTypeId = gasLimitField.type;
      const weightTypeDef = lookup[weightTypeId];
      console.log("\nWeight Type Structure (for gas_limit):");
      console.log(JSON.stringify(weightTypeDef, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    } else {
        console.log("\nGas limit field not found in arguments.");
    }

  } catch (error) {
    console.error("Error inspecting metadata:", error);
  } finally {
    client.destroy();
  }
}

main().catch(console.error);
