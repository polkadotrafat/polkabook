import hre from "hardhat"
import { expect } from "chai"

describe("Registry Integration", () => {
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

    it("creates, configures, and trades through a registry-deployed pair", async () => {
        await orderBook.connect(maker).placeOrder(wad("10"), wad("2"), 1)

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

        await orderBook.connect(taker).placeOrder(wad("11"), wad("1"), 0)

        const askOrder = await orderBook.orders(1)
        const bidOrder = await orderBook.orders(2)

        expect(askOrder.filled).to.equal(wad("1"))
        expect(bidOrder.filled).to.equal(wad("1"))
        expect(await vault.balances(taker.address, await baseToken.getAddress())).to.equal(wad("1"))
        expect(await vault.balances(maker.address, await quoteToken.getAddress())).to.equal(wad("10"))
    })

    it("enforces registry-configured limits and disabled status", async () => {
        await expect(orderBook.connect(maker).placeOrder(wad("10"), wad("0.5"), 1))
            .to.be.revertedWithCustomError(orderBook, "OrderBelowMinimumQuantity")
            .withArgs(wad("0.5"), wad("1"))

        await registry.setPairTradingConfig(
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            wad("2"),
            wad("25"),
        )

        await expect(orderBook.connect(maker).placeOrder(wad("10"), wad("2"), 1))
            .to.be.revertedWithCustomError(orderBook, "OrderBelowMinimumNotional")
            .withArgs(wad("20"), wad("25"))

        await registry.setPairEnabled(await baseToken.getAddress(), await quoteToken.getAddress(), false)

        await expect(orderBook.connect(maker).placeOrder(wad("20"), wad("2"), 1))
            .to.be.revertedWithCustomError(orderBook, "TradingDisabled")
    })

    it("quotes through the registry-deployed order book", async () => {
        await orderBook.connect(maker).placeOrder(wad("10"), wad("2"), 1)
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

        expect(quote.tradeCount).to.equal(1n)
        expect(quote.executedBaseQuantity).to.equal(wad("1"))
        expect(quote.executedQuoteQuantity).to.equal(wad("10"))
    })
})
