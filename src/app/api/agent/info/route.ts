import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";

export const runtime = "nodejs";

const SELF_AGENT_REGISTRY = "0xaC3DF9ABf80d0F5c020C06B04Cced27763355944" as const;

const REGISTRY_ABI = [
  {
    name: "isVerifiedAgent",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs:  [{ name: "agentKey", type: "bytes32" }],
    outputs: [{ name: "",        type: "bool"    }],
  },
  {
    name: "getAgentId",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs:  [{ name: "agentKey", type: "bytes32" }],
    outputs: [{ name: "",        type: "uint256" }],
  },
] as const;

function addressToAgentKey(address: `0x${string}`): `0x${string}` {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export async function GET() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) {
    return NextResponse.json({ error: "AGENT_PRIVATE_KEY not set" }, { status: 503 });
  }

  try {
    const account    = privateKeyToAccount(pk as `0x${string}`);
    const rpcUrl     = process.env.CELO_RPC_URL ?? "https://forno.celo.org";
    const client     = createPublicClient({ chain: celo, transport: http(rpcUrl) });
    const agentKey   = addressToAgentKey(account.address);

    const verified = await client.readContract({
      address: SELF_AGENT_REGISTRY,
      abi:     REGISTRY_ABI,
      functionName: "isVerifiedAgent",
      args:    [agentKey],
    }) as boolean;

    let agentId: bigint | null = null;
    if (verified) {
      try {
        const id = await client.readContract({
          address: SELF_AGENT_REGISTRY,
          abi:     REGISTRY_ABI,
          functionName: "getAgentId",
          args:    [agentKey],
        }) as bigint;
        agentId = id > 0n ? id : null;
      } catch { /* not found */ }
    }

    return NextResponse.json({
      agentAddress: account.address,
      network:      "celo-mainnet",
      erc8004:      verified && agentId !== null
        ? { registered: true,  agentId: agentId.toString() }
        : { registered: false, hint: "Run `npm run register:agent` in ai-agent-service to register." },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
