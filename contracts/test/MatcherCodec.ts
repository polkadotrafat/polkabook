import hre from "hardhat"
import { expect } from "chai"

describe("MatcherCodec", () => {
    let harness: any

    beforeEach(async () => {
        const MatcherCodecHarness = await hre.ethers.getContractFactory("MatcherCodecHarness")
        harness = await MatcherCodecHarness.deploy()
        await harness.waitForDeployment()
    })

    it("encodes the kernel selector and order counts in big-endian format", async () => {
        const bids = [
            {
                orderId: 1n,
                trader: "0x1111111111111111111111111111111111111111",
                price: 1000n,
                quantity: 25n,
                filled: 5n,
                timestamp: 10n,
                side: 0,
            },
        ]

        const asks = [
            {
                orderId: 2n,
                trader: "0x2222222222222222222222222222222222222222",
                price: 1100n,
                quantity: 20n,
                filled: 0n,
                timestamp: 11n,
                side: 1,
            },
        ]

        const encoded = await harness.encodeMatchOrders(bids, asks)

        expect(encoded).to.equal(
            "0xd52a118e" +
                "00000001" +
                "00000001" +
                "0000000000000001" +
                "1111111111111111111111111111111111111111" +
                "000000000000000000000000000003e8" +
                "00000000000000000000000000000019" +
                "00000000000000000000000000000005" +
                "000000000000000a" +
                "00" +
                "0000000000000002" +
                "2222222222222222222222222222222222222222" +
                "0000000000000000000000000000044c" +
                "00000000000000000000000000000014" +
                "00000000000000000000000000000000" +
                "000000000000000b" +
                "01",
        )
    })

    it("decodes packed trades emitted by the kernel", async () => {
        const tradePayload =
            "0x00" +
            "00000002" +
            "0000000000000001" +
            "0000000000000002" +
            "000000000000000000000000000003e8" +
            "0000000000000000000000000000000a" +
            "0000000000000003" +
            "0000000000000004" +
            "0000000000000000000000000000041a" +
            "00000000000000000000000000000005"

        const trades = await harness.decodeTrades(tradePayload)

        expect(trades).to.have.length(2)
        expect(trades[0].bidOrderId).to.equal(1n)
        expect(trades[0].askOrderId).to.equal(2n)
        expect(trades[0].price).to.equal(1000n)
        expect(trades[0].quantity).to.equal(10n)
        expect(trades[1].bidOrderId).to.equal(3n)
        expect(trades[1].askOrderId).to.equal(4n)
        expect(trades[1].price).to.equal(1050n)
        expect(trades[1].quantity).to.equal(5n)
    })

    it("exposes the kernel status without reverting", async () => {
        const tradePayload =
            "0x05" +
            "00000000"

        const result = await harness.decodeMatchResult(tradePayload)

        expect(result.status).to.equal(await harness.statusUnsortedInput())
        expect(result.trades).to.have.length(0)
    })

    it("reverts on non-success kernel statuses when decoding trades", async () => {
        await expect(harness.decodeTrades("0x0500000000")).to.be.revertedWithCustomError(
            harness,
            "MatcherKernelError",
        )
    })

    it("rejects malformed trade payloads", async () => {
        await expect(harness.decodeTrades("0x0000000100")).to.be.revertedWithCustomError(
            harness,
            "InvalidTradePayloadLength",
        )
    })
})
