import hre from "hardhat"
import { expect } from "chai"

describe("OrderBookBuckets", () => {
    let owner: any
    let makerA: any
    let makerB: any
    let taker: any
    let baseToken: any
    let quoteToken: any
    let vault: any
    let matcherKernel: any
    let orderBook: any

    const wad = (value: string) => hre.ethers.parseUnits(value, 18)

    beforeEach(async () => {
        ;[owner, makerA, makerB, taker] = await hre.ethers.getSigners()

        const MyToken = await hre.ethers.getContractFactory("MyToken")
        baseToken = await MyToken.deploy("Base Token", "BASE", wad("1000000"))
        await baseToken.waitForDeployment()

        quoteToken = await MyToken.deploy("Quote Token", "QUOTE", wad("1000000"))
        await quoteToken.waitForDeployment()

        await baseToken.mint(makerA.address, wad("1000"))
        await baseToken.mint(makerB.address, wad("1000"))
        await quoteToken.mint(taker.address, wad("100000"))

        const Vault = await hre.ethers.getContractFactory("Vault")
        vault = await Vault.deploy(owner.address)
        await vault.waitForDeployment()

        const MatcherKernelMock = await hre.ethers.getContractFactory("MatcherKernelMock")
        matcherKernel = await MatcherKernelMock.deploy()
        await matcherKernel.waitForDeployment()

        const OrderBookBuckets = await hre.ethers.getContractFactory("OrderBookBuckets")
        orderBook = await OrderBookBuckets.deploy(
            owner.address,
            await matcherKernel.getAddress(),
            await vault.getAddress(),
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            wad("1"),
            wad("6"),
        )
        await orderBook.waitForDeployment()

        await vault.setOrderBookAuthorization(await orderBook.getAddress(), true)

        await baseToken.connect(makerA).approve(await vault.getAddress(), wad("1000"))
        await baseToken.connect(makerB).approve(await vault.getAddress(), wad("1000"))
        await quoteToken.connect(taker).approve(await vault.getAddress(), wad("100000"))

        await vault.connect(makerA).deposit(await baseToken.getAddress(), wad("100"))
        await vault.connect(makerB).deposit(await baseToken.getAddress(), wad("100"))
        await vault.connect(taker).deposit(await quoteToken.getAddress(), wad("10000"))

        await matcherKernel.setResponse("0x00000000000000000000000000")
    })

    it("stores unique price levels and keeps FIFO within a level", async () => {
        await orderBook.connect(makerA).placeOrder(wad("10"), wad("2"), 1)
        await orderBook.connect(makerB).placeOrder(wad("10"), wad("3"), 1)
        await orderBook.connect(makerA).placeOrder(wad("9"), wad("1"), 1)

        const levels = await orderBook.getPriceLevels(1)
        expect(levels).to.deep.equal([wad("9"), wad("10")])

        const asks = await orderBook.getTopOrders(1, 10)
        expect(asks).to.have.length(3)
        expect(asks[0].orderId).to.equal(3n)
        expect(asks[1].orderId).to.equal(1n)
        expect(asks[2].orderId).to.equal(2n)
    })

    it("collects bid frontier by best price level first", async () => {
        await orderBook.connect(taker).placeOrder(wad("10"), wad("1"), 0)
        await orderBook.connect(taker).placeOrder(wad("12"), wad("1"), 0)
        await orderBook.connect(taker).placeOrder(wad("11"), wad("1"), 0)

        const levels = await orderBook.getPriceLevels(0)
        expect(levels).to.deep.equal([wad("12"), wad("11"), wad("10")])

        const bids = await orderBook.getTopOrders(0, 10)
        expect(bids[0].price).to.equal(wad("12"))
        expect(bids[1].price).to.equal(wad("11"))
        expect(bids[2].price).to.equal(wad("10"))
    })

    it("applies matched trades and advances within a price level", async () => {
        await orderBook.connect(makerA).placeOrder(wad("10"), wad("2"), 1)
        await orderBook.connect(makerB).placeOrder(wad("10"), wad("3"), 1)

        const tradeResponse =
            "0x00" +
            "00000002" +
            "00000001" +
            "00000001" +
            "0000000000000003" +
            "0000000000000001" +
            "00000000000000008ac7230489e80000" +
            "00000000000000001bc16d674ec80000" +
            "0000000000000003" +
            "0000000000000002" +
            "00000000000000008ac7230489e80000" +
            "00000000000000000de0b6b3a7640000"

        await matcherKernel.setResponse(tradeResponse)
        await orderBook.connect(taker).placeOrder(wad("11"), wad("3"), 0)

        const firstAsk = await orderBook.orders(1)
        const secondAsk = await orderBook.orders(2)
        const bidOrder = await orderBook.orders(3)
        const levelState = await orderBook.getLevelState(1, wad("10"))

        expect(firstAsk.isActive).to.equal(false)
        expect(secondAsk.filled).to.equal(wad("1"))
        expect(bidOrder.isActive).to.equal(false)
        expect(levelState.headIndex).to.equal(1n)
        expect(levelState.totalOpenQuantity).to.equal(wad("2"))
        expect(await vault.balances(taker.address, await baseToken.getAddress())).to.equal(wad("3"))
        expect(await vault.balances(makerA.address, await quoteToken.getAddress())).to.equal(wad("20"))
        expect(await vault.balances(makerB.address, await quoteToken.getAddress())).to.equal(wad("10"))
    })

    it("rejects inconsistent consumed-count metadata from the matcher", async () => {
        await orderBook.connect(makerA).placeOrder(wad("10"), wad("2"), 1)

        const inconsistentResponse =
            "0x00" +
            "00000001" +
            "00000002" +
            "00000001" +
            "0000000000000002" +
            "0000000000000001" +
            "00000000000000008ac7230489e80000" +
            "00000000000000000de0b6b3a7640000"

        await matcherKernel.setResponse(inconsistentResponse)

        await expect(orderBook.connect(taker).placeOrder(wad("11"), wad("1"), 0))
            .to.be.revertedWithCustomError(orderBook, "ConsumedCountMismatch")
            .withArgs(0, 2, 1)
    })

    it("enforces pair-level minimum quantity and notional", async () => {
        await expect(orderBook.connect(makerA).placeOrder(wad("10"), wad("0.5"), 1))
            .to.be.revertedWithCustomError(orderBook, "OrderBelowMinimumQuantity")
            .withArgs(wad("0.5"), wad("1"))

        await expect(orderBook.connect(makerA).placeOrder(wad("5"), wad("1"), 1))
            .to.be.revertedWithCustomError(orderBook, "OrderBelowMinimumNotional")
            .withArgs(wad("5"), wad("6"))
    })

    it("quotes a crossing order through the matcher without mutating state", async () => {
        await orderBook.connect(makerA).placeOrder(wad("10"), wad("2"), 1)
        await matcherKernel.setRecordPayload(false)

        const tradeResponse =
            "0x00" +
            "00000001" +
            "00000001" +
            "00000000" +
            "0000000000000002" +
            "0000000000000001" +
            "00000000000000008ac7230489e80000" +
            "00000000000000000de0b6b3a7640000"
        await matcherKernel.setResponse(tradeResponse)

        const quote = await orderBook.quoteOrder(wad("11"), wad("1"), 0)
        const askOrder = await orderBook.orders(1)

        expect(quote.status).to.equal(0n)
        expect(quote.tradeCount).to.equal(1n)
        expect(quote.executedBaseQuantity).to.equal(wad("1"))
        expect(quote.executedQuoteQuantity).to.equal(wad("10"))
        expect(quote.trades[0].bidOrderId).to.equal(2n)
        expect(quote.trades[0].askOrderId).to.equal(1n)
        expect(askOrder.filled).to.equal(0n)
        expect(await matcherKernel.lastPayload()).to.equal("0x")
    })

    it("fails closed when a better price level is fragmented beyond the tombstone skip limit", async () => {
        await vault.connect(makerA).deposit(await baseToken.getAddress(), wad("400"))

        for (let i = 0; i < 402; i++) {
            await orderBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1)
        }
        await orderBook.connect(makerA).placeOrder(wad("11"), wad("1"), 1)

        for (let orderId = 2; orderId <= 401; orderId++) {
            await orderBook.connect(makerA).cancelOrder(orderId)
        }
        await orderBook.connect(makerA).cancelOrder(1)

        await expect(orderBook.getTopOrders(1, 2))
            .to.be.revertedWithCustomError(orderBook, "TombstoneLimitExceeded")
            .withArgs(1, wad("10"), 200, 200)
    })

    it("makes a reactivated price level visible immediately after prior tombstone churn", async () => {
        await vault.connect(makerA).deposit(await baseToken.getAddress(), wad("200"))

        for (let i = 0; i < 202; i++) {
            await orderBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1)
        }

        for (let orderId = 2; orderId <= 201; orderId++) {
            await orderBook.connect(makerA).cancelOrder(orderId)
        }
        await orderBook.connect(makerA).cancelOrder(1)
        await orderBook.connect(makerA).cancelOrder(202)
        await orderBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1)

        const topOrders = await orderBook.getTopOrders(1, 1)
        const levelState = await orderBook.getLevelState(1, wad("10"))

        expect(topOrders).to.have.length(1)
        expect(topOrders[0].orderId).to.equal(203n)
        expect(levelState.headIndex).to.equal(202n)
    })
})
