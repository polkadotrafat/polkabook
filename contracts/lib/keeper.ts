import type { OrderBookBuckets, PairRegistry } from "../typechain-types"

import { getTopOfBook, listPairs } from "./polkabookClient"

export type KeeperCandidate = {
    orderBook: string
    bestBidPrice: bigint
    bestAskPrice: bigint
}

export async function getCrossedBookCandidates(
    registry: PairRegistry,
    resolveOrderBook: (address: string) => Promise<OrderBookBuckets>,
): Promise<KeeperCandidate[]> {
    const pairs = await listPairs(registry)
    const candidates: KeeperCandidate[] = []

    for (const pair of pairs) {
        if (!pair.enabled) {
            continue
        }

        const orderBook = await resolveOrderBook(pair.orderBook)
        const top = await getTopOfBook(orderBook)
        if (!top.crossed) {
            continue
        }

        candidates.push({
            orderBook: pair.orderBook,
            bestBidPrice: top.bestBidPrice,
            bestAskPrice: top.bestAskPrice,
        })
    }

    return candidates
}

export async function triggerMatchIfCrossed(orderBook: OrderBookBuckets): Promise<boolean> {
    const top = await getTopOfBook(orderBook)
    if (!top.crossed) {
        return false
    }

    const tx = await orderBook.triggerMatch()
    await tx.wait()
    return true
}
