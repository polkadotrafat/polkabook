import { Contract, ContractRunner } from "ethers"

import OrderBookBucketsArtifact from "../artifacts/contracts/OrderBookBuckets.sol/OrderBookBuckets.json"

import type { OrderBookBuckets, PairRegistry } from "../typechain-types"

export type OrderSide = 0 | 1

export type PairSummary = {
    orderBook: string
    baseToken: string
    quoteToken: string
    minOrderQuantity: bigint
    minOrderNotional: bigint
    enabled: boolean
}

export type TopOfBookSnapshot = {
    bestBidPrice: bigint
    bestBidQuantity: bigint
    bestAskPrice: bigint
    bestAskQuantity: bigint
    crossed: boolean
}

export type QuoteSummary = {
    status: number
    tradeCount: number
    consumedBidCount: number
    consumedAskCount: number
    executedBaseQuantity: bigint
    executedQuoteQuantity: bigint
}

export async function listPairs(registry: PairRegistry): Promise<PairSummary[]> {
    const pairs = await registry.getAllPairs()
    return pairs.map((pair) => ({
        orderBook: pair.orderBook,
        baseToken: pair.baseToken,
        quoteToken: pair.quoteToken,
        minOrderQuantity: pair.minOrderQuantity,
        minOrderNotional: pair.minOrderNotional,
        enabled: pair.enabled,
    }))
}

export async function getTopOfBook(orderBook: OrderBookBuckets): Promise<TopOfBookSnapshot> {
    const top = await orderBook.getTopOfBook()
    return {
        bestBidPrice: top.bestBidPrice,
        bestBidQuantity: top.bestBidQuantity,
        bestAskPrice: top.bestAskPrice,
        bestAskQuantity: top.bestAskQuantity,
        crossed: top.crossed,
    }
}

export async function quoteOrder(
    orderBook: OrderBookBuckets,
    price: bigint,
    quantity: bigint,
    side: OrderSide,
): Promise<QuoteSummary> {
    const quote = await orderBook.quoteOrder(price, quantity, side)
    return {
        status: Number(quote.status),
        tradeCount: Number(quote.tradeCount),
        consumedBidCount: Number(quote.consumedBidCount),
        consumedAskCount: Number(quote.consumedAskCount),
        executedBaseQuantity: quote.executedBaseQuantity,
        executedQuoteQuantity: quote.executedQuoteQuantity,
    }
}

export async function attachOrderBook(
    runner: ContractRunner,
    orderBookAddress: string,
): Promise<OrderBookBuckets> {
    return new Contract(orderBookAddress, OrderBookBucketsArtifact.abi, runner) as unknown as OrderBookBuckets
}
