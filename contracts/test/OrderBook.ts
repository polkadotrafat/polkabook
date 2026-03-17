import hre from "hardhat"
import { expect } from "chai"

describe("OrderBook", () => {
    let owner: any
    let maker: any
    let taker: any
    let baseToken: any
    let quoteToken: any
    let vault: any
    let matcherKernel: any
    let orderBook: any

    const wad = (value: string) => hre.ethers.parseUnits(value, 18)

    beforeEach(async () => {
        ;[owner, maker, taker] = await hre.ethers.getSigners()

        const MyToken = await hre.ethers.getContractFactory("MyToken")
        baseToken = await MyToken.deploy("Base Token", "BASE", wad("1000000"))
        await baseToken.waitForDeployment()

        quoteToken = await MyToken.deploy("Quote Token", "QUOTE", wad("1000000"))
        await quoteToken.waitForDeployment()

        await baseToken.mint(maker.address, wad("1000"))
        await quoteToken.mint(taker.address, wad("100000"))

        const Vault = await hre.ethers.getContractFactory("Vault")
        vault = await Vault.deploy(owner.address)
        await vault.waitForDeployment()

        const MatcherKernelMock = await hre.ethers.getContractFactory("MatcherKernelMock")
        matcherKernel = await MatcherKernelMock.deploy()
        await matcherKernel.waitForDeployment()

        const OrderBook = await hre.ethers.getContractFactory("OrderBook")
        orderBook = await OrderBook.deploy(
            await matcherKernel.getAddress(),
            await vault.getAddress(),
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
        )
        await orderBook.waitForDeployment()

        await vault.setOrderBookAuthorization(await orderBook.getAddress(), true)

        await baseToken.connect(maker).approve(await vault.getAddress(), wad("1000"))
        await quoteToken.connect(taker).approve(await vault.getAddress(), wad("100000"))

        await vault.connect(maker).deposit(await baseToken.getAddress(), wad("100"))
        await vault.connect(taker).deposit(await quoteToken.getAddress(), wad("10000"))

        await matcherKernel.setResponse("0x00000000000000000000000000")
    })

    it("places sorted orders and serializes the frontier for the matcher", async () => {
        await orderBook.connect(maker).placeOrder(wad("10"), wad("2"), 1)
        await orderBook.connect(taker).placeOrder(wad("11"), wad("1"), 0)

        const topBids = await orderBook.getTopOrders(0, 10)
        const topAsks = await orderBook.getTopOrders(1, 10)

        expect(topBids).to.have.length(1)
        expect(topAsks).to.have.length(1)
        expect(topBids[0].price).to.equal(wad("11"))
        expect(topAsks[0].price).to.equal(wad("10"))

        const payload = await matcherKernel.lastPayload()
        expect(payload.slice(0, 10)).to.equal("0xd52a118e")
    })

    it("applies matched trades returned by the kernel", async () => {
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

        const bidOrder = await orderBook.orders(2)
        const askOrder = await orderBook.orders(1)

        expect(bidOrder.filled).to.equal(wad("1"))
        expect(askOrder.filled).to.equal(wad("1"))
        expect(await vault.balances(taker.address, await baseToken.getAddress())).to.equal(wad("1"))
        expect(await vault.balances(maker.address, await quoteToken.getAddress())).to.equal(wad("10"))
    })
})
