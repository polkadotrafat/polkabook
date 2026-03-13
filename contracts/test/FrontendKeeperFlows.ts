import hre from "hardhat"
import { expect } from "chai"

import { getCrossedBookCandidates, triggerMatchIfCrossed } from "../lib/keeper"
import { attachOrderBook, getTopOfBook, listPairs, quoteOrder } from "../lib/polkabookClient"

describe("Frontend and Keeper Flows", () => {
    let owner: any
    let maker: any
    let taker: any
    let baseToken: any
    let quoteToken: any
    let matcherKernel: any
    let vault: any
    let registry: any
    let orderBook: any

    const wad = (value: string) => hre.ethers.parseUnits(value, 18)

    beforeEach(async () => {
        ;[owner, maker, taker] = await hre.ethers.getSigners()

        const MyToken = await hre.ethers.getContractFactory("MyToken")
        baseToken = await MyToken.deploy(wad("1000000"))
        await baseToken.waitForDeployment()

        quoteToken = await MyToken.deploy(wad("1000000"))
        await quoteToken.waitForDeployment()

        await baseToken.mint(maker.address, wad("1000"))
        await quoteToken.mint(taker.address, wad("100000"))

        const MatcherKernelMock = await hre.ethers.getContractFactory("MatcherKernelMock")
        matcherKernel = await MatcherKernelMock.deploy()
        await matcherKernel.waitForDeployment()
        await matcherKernel.setResponse("0x00000000000000000000000000")

        const PairRegistry = await hre.ethers.getContractFactory("PairRegistry")
        const predictedRegistry = await hre.ethers.getCreateAddress({
            from: owner.address,
            nonce: await hre.ethers.provider.getTransactionCount(owner.address) + 1,
        })

        const Vault = await hre.ethers.getContractFactory("Vault")
        vault = await Vault.deploy(predictedRegistry)
        await vault.waitForDeployment()

        registry = await PairRegistry.deploy(
            owner.address,
            await matcherKernel.getAddress(),
            await vault.getAddress(),
        )
        await registry.waitForDeployment()

        await registry.createPair(
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            wad("1"),
            wad("10"),
        )

        const pairAddress = await registry.getPair(await baseToken.getAddress(), await quoteToken.getAddress())
        orderBook = await hre.ethers.getContractAt("OrderBookBuckets", pairAddress)

        await baseToken.connect(maker).approve(await vault.getAddress(), wad("1000"))
        await quoteToken.connect(taker).approve(await vault.getAddress(), wad("100000"))
        await vault.connect(maker).deposit(await baseToken.getAddress(), wad("100"))
        await vault.connect(taker).deposit(await quoteToken.getAddress(), wad("10000"))
    })

    it("lists pairs and exposes top-of-book and quote helpers", async () => {
        await orderBook.connect(maker).placeOrder(wad("10"), wad("2"), 1)
        await matcherKernel.setRecordPayload(false)
        await matcherKernel.setResponse(
            "0x00" +
                "00000001" +
                "00000001" +
                "00000000" +
                "0000000000000002" +
                "0000000000000001" +
                "00000000000000008ac7230489e80000" +
                "00000000000000000de0b6b3a7640000",
        )

        const pairs = await listPairs(registry)
        const attached = await attachOrderBook(owner, pairs[0].orderBook)
        const top = await getTopOfBook(attached)
        const quote = await quoteOrder(attached, wad("11"), wad("1"), 0)

        expect(pairs).to.have.length(1)
        expect(top.bestAskPrice).to.equal(wad("10"))
        expect(top.crossed).to.equal(false)
        expect(quote.tradeCount).to.equal(1)
        expect(quote.executedQuoteQuantity).to.equal(wad("10"))
    })

    it("finds crossed pairs for keepers and triggers matching only when needed", async () => {
        await orderBook.connect(maker).placeOrder(wad("10"), wad("2"), 1)
        await orderBook.connect(taker).placeOrder(wad("11"), wad("1"), 0)

        const candidates = await getCrossedBookCandidates(registry, async (address) =>
            hre.ethers.getContractAt("OrderBookBuckets", address),
        )

        expect(candidates).to.have.length(1)
        expect(candidates[0].orderBook).to.equal(await orderBook.getAddress())

        await matcherKernel.setResponse(
            "0x00" +
                "00000001" +
                "00000001" +
                "00000000" +
                "0000000000000002" +
                "0000000000000001" +
                "00000000000000008ac7230489e80000" +
                "00000000000000000de0b6b3a7640000",
        )

        const triggered = await triggerMatchIfCrossed(orderBook.connect(owner))

        expect(triggered).to.equal(true)
        const top = await orderBook.getTopOfBook()
        expect(top.crossed).to.equal(false)
    })
})
