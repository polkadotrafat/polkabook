import { buildModule } from "@nomicfoundation/hardhat-ignition/modules"

const PolkaBookPairModule = buildModule("PolkaBookPairModule", (m) => {
    const initialOwner = m.getParameter("initialOwner")
    const matcherKernel = m.getParameter("matcherKernel")
    const vault = m.getParameter("vault")
    const baseToken = m.getParameter("baseToken")
    const quoteToken = m.getParameter("quoteToken")
    const minOrderQuantity = m.getParameter("minOrderQuantity")
    const minOrderNotional = m.getParameter("minOrderNotional")

    const orderBook = m.contract("OrderBookBuckets", [
        initialOwner,
        matcherKernel,
        vault,
        baseToken,
        quoteToken,
        minOrderQuantity,
        minOrderNotional,
    ])

    return { orderBook }
})

export default PolkaBookPairModule
