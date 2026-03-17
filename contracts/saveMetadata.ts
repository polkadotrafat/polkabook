import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import fs from "node:fs";

const rpcUrl = "wss://asset-hub-paseo-rpc.n.dwellir.com";

async function main() {
  console.log(`Connecting to ${rpcUrl}...`);
  const provider = getWsProvider(rpcUrl);
  const client = createClient(provider);
  
  try {
    console.log("Fetching metadata...");
    const metadataRaw = await client._request<string>("state_getMetadata", []);
    
    fs.writeFileSync("metadata.json", JSON.stringify(metadataRaw, null, 2));
    console.log("Metadata saved to metadata.json");
  } catch (error) {
    console.error("Error fetching metadata:", error);
  } finally {
    client.destroy();
  }
}

main().catch(console.error);
