import { buildModule } from "@nomicfoundation/hardhat-ignition/modules"

const PolkaBookPairModule = buildModule("PolkaBookPairModule", (m) => {
    const initialOwner = m.getParameter("initialOwner")
    const matcherKernel = m.getParameter("matcherKernel")
    const baseTokenName = m.getParameter("baseTokenName", "PolkaBook Base")
    const baseTokenSymbol = m.getParameter("baseTokenSymbol", "PBASE")
    const baseTokenSupply = m.getParameter("baseTokenSupply", 1_000_000n * 10n ** 18n)
    const quoteTokenName = m.getParameter("quoteTokenName", "PolkaBook Quote")
    const quoteTokenSymbol = m.getParameter("quoteTokenSymbol", "PQUOTE")
    const quoteTokenSupply = m.getParameter("quoteTokenSupply", 1_000_000n * 10n ** 18n)
    const minOrderQuantity = m.getParameter("minOrderQuantity")
    const minOrderNotional = m.getParameter("minOrderNotional")

    const baseToken = m.contract("MyToken", [baseTokenName, baseTokenSymbol, baseTokenSupply], {
        id: "BaseToken",
    })
    const quoteToken = m.contract("MyToken", [quoteTokenName, quoteTokenSymbol, quoteTokenSupply], {
        id: "QuoteToken",
    })
    const vault = m.contract("Vault", [initialOwner], {
        id: "Vault",
    })

    const orderBook = m.contract("OrderBookBuckets", [
        initialOwner,
        matcherKernel,
        vault,
        baseToken,
        quoteToken,
        minOrderQuantity,
        minOrderNotional,
    ], {
        id: "OrderBookBuckets",
    })

    m.call(vault, "setOrderBookAuthorization", [orderBook, true])

    return { baseToken, quoteToken, vault, orderBook }
})

export default PolkaBookPairModule
