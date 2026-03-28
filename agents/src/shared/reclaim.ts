import { CallData, CairoByteArray, uint256, hash } from 'starknet'
import { getConfig } from './config.js'
import { getRiotWinnerTag } from './riot.js'

type ReclaimClaimData = {
  provider: string
  parameters: string
  context: string
  owner: string
  epoch: string | number
  timestampS: string | number
}

export type ReclaimProof = {
  identifier: string
  claimData: ReclaimClaimData
  signatures: string[]
}

export type ReclaimProofResult = {
  calldata: string[]
  winnerTag: string
}

function parseSignature(signature: string) {
  const rHex = `0x${signature.slice(2, 66)}`
  const sHex = `0x${signature.slice(66, 130)}`
  const vHex = signature.slice(130, 132)
  let v = parseInt(vHex, 16)
  if (v < 27) v += 27
  return { r: rHex, s: sHex, v }
}

function toUint256(value: string | number) {
  const big = BigInt(value)
  return uint256.bnToUint256(big)
}

function transformProofForStarknet(proof: ReclaimProof) {
  return {
    id: hash.starknetKeccak(proof.identifier).toString(),
    claim_info: {
      provider: new CairoByteArray(proof.claimData.provider),
      parameters: new CairoByteArray(proof.claimData.parameters),
      context: new CairoByteArray(proof.claimData.context ?? ''),
    },
    signed_claim: {
      claim: {
        identifier: toUint256(proof.identifier),
        byte_identifier: new CairoByteArray(proof.identifier),
        owner: new CairoByteArray(proof.claimData.owner),
        epoch: new CairoByteArray(String(proof.claimData.epoch)),
        timestamp_s: new CairoByteArray(String(proof.claimData.timestampS)),
      },
      signatures: proof.signatures.map((sig) => {
        const parsed = parseSignature(sig)
        return {
          r: toUint256(parsed.r),
          s: toUint256(parsed.s),
          v: parsed.v,
        }
      }),
    },
  }
}

export async function generateRiotReclaimProof(
  matchId: string,
  player1Tag: string,
  player2Tag: string
): Promise<ReclaimProofResult> {
  const config = getConfig()
  if (!config.RECLAIM_PROVIDER_ID) {
    throw new Error('RECLAIM_PROVIDER_ID is required to generate proofs')
  }
  if (!config.RECLAIM_PROVER_URL) {
    throw new Error('RECLAIM_PROVER_URL is required to generate proofs')
  }

  const winnerTag = await getRiotWinnerTag(matchId, player1Tag, player2Tag)
  const parameters = `match_id=${matchId}|winner_tag=${winnerTag}|provider=RIOT_LOL`

  const res = await fetch(`${config.RECLAIM_PROVER_URL}/prove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: config.RECLAIM_PROVIDER_ID,
      parameters,
      context: `shobu:${matchId}`,
      appId: config.RECLAIM_APP_ID,
      appSecret: config.RECLAIM_APP_SECRET,
      region: config.RIOT_REGION || 'americas',
    }),
  })

  if (!res.ok) {
    throw new Error(`Reclaim prover error: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  const proof: ReclaimProof =
    json?.proof ?? json?.data?.proof ?? json?.result?.proof
  if (!proof?.claimData || !proof?.signatures) {
    throw new Error('Reclaim prover response missing proof data')
  }

  const transformed = transformProofForStarknet(proof)
  const calldata = CallData.compile(transformed)
  return { calldata: calldata.map((v: any) => String(v)), winnerTag }
}
