import hre from "hardhat"
import { expect } from "chai"

describe("OrderBook Benchmarks", () => {
    let owner: any
    let makerA: any
    let makerB: any
    let makerC: any
    let taker: any
    let baseToken: any
    let quoteToken: any
    let vault: any
    let matcherKernel: any
    let sortedBook: any
    let bucketedBook: any

    const wad = (value: string) => hre.ethers.parseUnits(value, 18)
    const zeroMatch = "0x00000000000000000000000000"

    async function gasUsed(txPromise: Promise<any>) {
        const tx = await txPromise
        const receipt = await tx.wait()
        return receipt!.gasUsed
    }

    beforeEach(async () => {
        ;[owner, makerA, makerB, makerC, taker] = await hre.ethers.getSigners()

        const MyToken = await hre.ethers.getContractFactory("MyToken")
        baseToken = await MyToken.deploy(wad("1000000"))
        await baseToken.waitForDeployment()

        quoteToken = await MyToken.deploy(wad("1000000"))
        await quoteToken.waitForDeployment()

        for (const user of [makerA, makerB, makerC]) {
            await baseToken.mint(user.address, wad("1000"))
        }
        await quoteToken.mint(taker.address, wad("100000"))
        await quoteToken.mint(makerA.address, wad("100000"))
        await quoteToken.mint(makerB.address, wad("100000"))
        await quoteToken.mint(makerC.address, wad("100000"))

        const Vault = await hre.ethers.getContractFactory("Vault")
        vault = await Vault.deploy(owner.address)
        await vault.waitForDeployment()

        const MatcherKernelMock = await hre.ethers.getContractFactory("MatcherKernelMock")
        matcherKernel = await MatcherKernelMock.deploy()
        await matcherKernel.waitForDeployment()
        await matcherKernel.setResponse(zeroMatch)

        const OrderBook = await hre.ethers.getContractFactory("OrderBook")
        sortedBook = await OrderBook.deploy(
            await matcherKernel.getAddress(),
            await vault.getAddress(),
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
        )
        await sortedBook.waitForDeployment()

        const OrderBookBuckets = await hre.ethers.getContractFactory("OrderBookBuckets")
        bucketedBook = await OrderBookBuckets.deploy(
            owner.address,
            await matcherKernel.getAddress(),
            await vault.getAddress(),
            await baseToken.getAddress(),
            await quoteToken.getAddress(),
            wad("1"),
            wad("10"),
        )
        await bucketedBook.waitForDeployment()

        await vault.setOrderBookAuthorization(await sortedBook.getAddress(), true)
        await vault.setOrderBookAuthorization(await bucketedBook.getAddress(), true)

        for (const user of [makerA, makerB, makerC, taker]) {
            await baseToken.connect(user).approve(await vault.getAddress(), wad("1000"))
            await quoteToken.connect(user).approve(await vault.getAddress(), wad("100000"))
        }

        for (const user of [makerA, makerB, makerC]) {
            await vault.connect(user).deposit(await baseToken.getAddress(), wad("100"))
            await vault.connect(user).deposit(await quoteToken.getAddress(), wad("10000"))
        }
        await vault.connect(taker).deposit(await quoteToken.getAddress(), wad("10000"))
    })

    it("reports cumulative gas for repeated appends at one price level", async () => {
        await gasUsed(sortedBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1))
        await gasUsed(bucketedBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1))

        let sortedGas = 0n
        let bucketedGas = 0n
        const signers = [makerA, makerB, makerC, makerA, makerB]
        for (const signer of signers) {
            sortedGas += await gasUsed(sortedBook.connect(signer).placeOrder(wad("10"), wad("1"), 1))
            bucketedGas += await gasUsed(bucketedBook.connect(signer).placeOrder(wad("10"), wad("1"), 1))
        }

        expect(sortedGas).to.be.greaterThan(0n)
        expect(bucketedGas).to.be.greaterThan(0n)
        console.log("same-level cumulative gas", {
            sorted: sortedGas.toString(),
            bucketed: bucketedGas.toString(),
        })
    })

    it("uses less gas when appending to an existing price level", async () => {
        await gasUsed(sortedBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1))
        await gasUsed(bucketedBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1))

        const sortedGas = await gasUsed(sortedBook.connect(makerB).placeOrder(wad("10"), wad("1"), 1))
        const bucketedGas = await gasUsed(bucketedBook.connect(makerB).placeOrder(wad("10"), wad("1"), 1))

        expect(bucketedGas).to.be.lessThan(sortedGas)
        console.log("same-level append gas", {
            sorted: sortedGas.toString(),
            bucketed: bucketedGas.toString(),
        })
    })

    it("keeps crossing-order gas comparable while preserving richer structure", async () => {
        await gasUsed(sortedBook.connect(makerA).placeOrder(wad("10"), wad("2"), 1))
        await gasUsed(bucketedBook.connect(makerA).placeOrder(wad("10"), wad("2"), 1))

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

        const sortedGas = await gasUsed(sortedBook.connect(taker).placeOrder(wad("11"), wad("1"), 0))
        const bucketedGas = await gasUsed(bucketedBook.connect(taker).placeOrder(wad("11"), wad("1"), 0))

        expect(bucketedGas).to.be.lessThan(sortedGas + 40_000n)
        console.log("crossing order gas", {
            sorted: sortedGas.toString(),
            bucketed: bucketedGas.toString(),
        })
    })

    it("reports cancel gas at the head of an active level", async () => {
        await gasUsed(sortedBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1))
        await gasUsed(bucketedBook.connect(makerA).placeOrder(wad("10"), wad("1"), 1))

        const sortedGas = await gasUsed(sortedBook.connect(makerA).cancelOrder(1))
        const bucketedGas = await gasUsed(bucketedBook.connect(makerA).cancelOrder(1))
        const levelState = await bucketedBook.getLevelState(1, wad("10"))

        expect(sortedGas).to.be.greaterThan(0n)
        expect(bucketedGas).to.be.greaterThan(0n)
        expect(levelState.headIndex).to.equal(1n)
        console.log("cancel head gas", {
            sorted: sortedGas.toString(),
            bucketed: bucketedGas.toString(),
        })
    })

    it("reports quote gas for a crossing order on the bucketed book", async () => {
        await gasUsed(bucketedBook.connect(makerA).placeOrder(wad("10"), wad("2"), 1))
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

        const quoteGas = await bucketedBook.quoteOrder.estimateGas(wad("11"), wad("1"), 0)

        expect(quoteGas).to.be.greaterThan(0n)
        console.log("quote gas", {
            bucketed: quoteGas.toString(),
        })
    })
})
