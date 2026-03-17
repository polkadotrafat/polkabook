#!/bin/bash
set -e

echo "Building the Rust kernel for RISC-V..."
cargo +nightly build \
  -Z build-std=core,alloc \
  -Z json-target-spec \
  --release \
  --target riscv64emac-unknown-none-polkavm.json

echo "Linking into Revive-compatible .polkavm bytecode..."
cargo run --quiet --manifest-path ../tools/revive-linker/Cargo.toml -- \
    target/riscv64emac-unknown-none-polkavm/release/matcher_kernel \
    matcher.polkavm

echo "Done! Final binary size:"
ls -lh matcher.polkavm
