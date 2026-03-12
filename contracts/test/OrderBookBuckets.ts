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
        baseToken = await MyToken.deploy(wad("1000000"))
        await baseToken.waitForDeployment()

        quoteToken = await MyToken.deploy(wad("1000000"))
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
            await matcherKernel.getAddress(),
            await vault.getAddress(),
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
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
})
