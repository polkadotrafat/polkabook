import hre from "hardhat"
import { expect } from "chai"

describe("PairRegistry", () => {
    let owner: any
    let baseToken: any
    let quoteToken: any
    let matcherKernel: any
    let vault: any
    let registry: any

    const wad = (value: string) => hre.ethers.parseUnits(value, 18)
    const minOrderQuantity = wad("1")
    const minOrderNotional = wad("10")

    beforeEach(async () => {
        ;[owner] = await hre.ethers.getSigners()

        const MyToken = await hre.ethers.getContractFactory("MyToken")
        baseToken = await MyToken.deploy(wad("1000000"))
        await baseToken.waitForDeployment()

        quoteToken = await MyToken.deploy(wad("1000000"))
        await quoteToken.waitForDeployment()

        const MatcherKernelMock = await hre.ethers.getContractFactory("MatcherKernelMock")
        matcherKernel = await MatcherKernelMock.deploy()
        await matcherKernel.waitForDeployment()

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
    })

    it("deploys and registers a bucketed order book per pair", async () => {
        const tx = await registry.createPair(
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            minOrderQuantity,
            minOrderNotional,
        )
        const receipt = await tx.wait()

        const pairAddress = await registry.getPair(await baseToken.getAddress(), await quoteToken.getAddress())
        const stored = await registry.pairConfigs(pairAddress)
        const authorized = await vault.authorizedOrderBooks(pairAddress)
        const pairOrderBook = await hre.ethers.getContractAt("OrderBookBuckets", pairAddress)

        expect(pairAddress).to.properAddress
        expect(stored.baseToken).to.equal(await baseToken.getAddress())
        expect(stored.quoteToken).to.equal(await quoteToken.getAddress())
        expect(stored.minOrderQuantity).to.equal(minOrderQuantity)
        expect(stored.minOrderNotional).to.equal(minOrderNotional)
        expect(stored.enabled).to.equal(true)
        expect(authorized).to.equal(true)
        expect(await pairOrderBook.minOrderQuantity()).to.equal(minOrderQuantity)
        expect(await pairOrderBook.minOrderNotional()).to.equal(minOrderNotional)
        expect(await registry.pairCount()).to.equal(1n)
        expect(receipt?.logs.length).to.be.greaterThan(0)
    })

    it("rejects duplicate pairs", async () => {
        await registry.createPair(
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            minOrderQuantity,
            minOrderNotional,
        )

        await expect(
            registry.createPair(
                await baseToken.getAddress(),
                await quoteToken.getAddress(),
                minOrderQuantity,
                minOrderNotional,
            ),
        ).to.be.revertedWithCustomError(registry, "PairAlreadyExists")
    })

    it("updates pair config and enabled status through the registry", async () => {
        await registry.createPair(
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            minOrderQuantity,
            minOrderNotional,
        )

        const pairAddress = await registry.getPair(await baseToken.getAddress(), await quoteToken.getAddress())
        const pairOrderBook = await hre.ethers.getContractAt("OrderBookBuckets", pairAddress)

        await registry.setPairTradingConfig(
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            wad("2"),
            wad("25"),
        )
        await registry.setPairEnabled(await baseToken.getAddress(), await quoteToken.getAddress(), false)

        const stored = await registry.pairConfigs(pairAddress)
        expect(stored.minOrderQuantity).to.equal(wad("2"))
        expect(stored.minOrderNotional).to.equal(wad("25"))
        expect(stored.enabled).to.equal(false)
        expect(await pairOrderBook.minOrderQuantity()).to.equal(wad("2"))
        expect(await pairOrderBook.minOrderNotional()).to.equal(wad("25"))
        expect(await pairOrderBook.tradingEnabled()).to.equal(false)
    })
})
