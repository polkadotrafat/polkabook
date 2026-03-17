use std::env;
use std::fs;
use std::path::PathBuf;

use polkavm_linker::{program_from_elf, Config, OptLevel, TargetInstructionSet};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let input = PathBuf::from(args.next().ok_or("missing input ELF path")?);
    let output = PathBuf::from(args.next().ok_or("missing output .polkavm path")?);

    if args.next().is_some() {
        return Err("usage: revive-linker <input-elf> <output-polkavm>".into());
    }

    let data = fs::read(&input).map_err(|error| format!("failed to read {input:?}: {error}"))?;

    let mut config = Config::default();
    config.set_strip(false);
    config.set_opt_level(OptLevel::O2);

    let blob = program_from_elf(config, TargetInstructionSet::ReviveV1, &data)
        .map_err(|error| format!("failed to link {input:?} for ReviveV1: {error}"))?;

    fs::write(&output, blob).map_err(|error| format!("failed to write {output:?}: {error}"))?;
    Ok(())
}
