import fs from "node:fs"
import path from "node:path"

import hre from "hardhat"
import { loadLocalEnv } from "../loadEnv"

loadLocalEnv(path.resolve(process.cwd(), ".env"))

type KernelDeploymentRecord = {
    network: string
    rpcUrl?: string
    deployer: string
    transactionHash: string
    contractAddress: string
    kernelBytecodePath: string
    bytecodeSizeBytes: number
    deployedAt: string
}

function getPrivateKey(): string {
    const privateKey = process.env.PRIVATE_KEY
    if (!privateKey || privateKey.trim().length === 0) {
        throw new Error("PRIVATE_KEY is not set. Add it to contracts/.env or export it before running the deployment script.")
    }

    return privateKey
}

function resolveKernelPath(inputPath?: string): string {
    if (inputPath && inputPath.trim().length > 0) {
        return path.resolve(process.cwd(), inputPath)
    }

    return path.resolve(process.cwd(), "../kernel/matcher.polkavm")
}

function loadKernelBytecode(kernelPath: string): `0x${string}` {
    if (!fs.existsSync(kernelPath)) {
        throw new Error(`Kernel bytecode not found at ${kernelPath}. Run ../kernel/build.sh first.`)
    }

    const bytecode = fs.readFileSync(kernelPath)
    if (bytecode.length === 0) {
        throw new Error(`Kernel bytecode at ${kernelPath} is empty.`)
    }

    if (path.basename(kernelPath) === "matcher_kernel" || path.extname(kernelPath) !== ".polkavm") {
        throw new Error(
            `Kernel deployment expects the linked .polkavm artifact. Use ../kernel/build.sh and deploy ../kernel/matcher.polkavm instead of the raw target executable (${kernelPath}).`,
        )
    }

    return `0x${bytecode.toString("hex")}`
}

function getOutputPath(networkName: string): string {
    return path.resolve(process.cwd(), `../deployments/${networkName}/kernel.json`)
}

async function main() {
    const kernelPath = resolveKernelPath(process.env.KERNEL_BYTECODE_PATH)
    const kernelBytecode = loadKernelBytecode(kernelPath)
    const provider = hre.ethers.provider
    const deployer = new hre.ethers.Wallet(getPrivateKey(), provider)
    const deployerAddress = await deployer.getAddress()

    console.log(`Deploying kernel from ${kernelPath}...`)

    const kernelFactory = new hre.ethers.ContractFactory([], kernelBytecode, deployer)
    const kernel = await kernelFactory.deploy()
    await kernel.waitForDeployment()

    const deploymentTx = kernel.deploymentTransaction()
    if (!deploymentTx) {
        throw new Error("Kernel deployment did not expose a deployment transaction.")
    }

    const contractAddress = await kernel.getAddress()
    const record: KernelDeploymentRecord = {
        network: hre.network.name,
        rpcUrl: "url" in hre.network.config ? hre.network.config.url : undefined,
        deployer: deployerAddress,
        transactionHash: deploymentTx.hash,
        contractAddress,
        kernelBytecodePath: kernelPath,
        bytecodeSizeBytes: (kernelBytecode.length - 2) / 2,
        deployedAt: new Date().toISOString(),
    }

    const outputPath = getOutputPath(hre.network.name)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`)

    console.log(`Kernel deployed to: ${contractAddress}`)
    console.log(`Deployment transaction: ${deploymentTx.hash}`)
    console.log(`Deployment manifest written to: ${outputPath}`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
