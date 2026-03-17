#![no_std]
#![no_main]

use core::alloc::{GlobalAlloc, Layout};
use core::ptr::null_mut;
use matcher_kernel::{encode_status_only, handle_call, STATUS_INPUT_TOO_LARGE};

const HEAP_SIZE: usize = 32 * 1024;
const MAX_CALLDATA_SIZE: usize = 10_240;

static mut HEAP: [u8; HEAP_SIZE] = [0; HEAP_SIZE];
static mut HEAP_OFFSET: usize = 0;
static mut CALLDATA_BUFFER: [u8; MAX_CALLDATA_SIZE] = [0; MAX_CALLDATA_SIZE];

struct BumpAllocator;

unsafe impl GlobalAlloc for BumpAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let align = layout.align();
        let mut offset = HEAP_OFFSET;
        let padding = (align - (offset % align)) % align;
        offset += padding;
        
        if offset + layout.size() > HEAP_SIZE {
            return null_mut();
        }
        
        // Use addr_of_mut! to avoid the "mutable static reference" compiler warning
        let ptr = (core::ptr::addr_of_mut!(HEAP) as *mut u8).add(offset);
        HEAP_OFFSET = offset + layout.size();
        ptr
    }

    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {}
}

#[global_allocator]
static ALLOCATOR: BumpAllocator = BumpAllocator;

use pallet_revive_uapi::{HostFn, HostFnImpl, ReturnFlags};
use polkavm_derive::polkavm_export;

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[polkavm_export]
pub extern "C" fn deploy() {}

#[polkavm_export]
pub extern "C" fn call() {
    let size = HostFnImpl::call_data_size() as usize;
    if size > MAX_CALLDATA_SIZE {
        let response = encode_status_only(STATUS_INPUT_TOO_LARGE);
        exit_with_response(&response);
    }

    let input = unsafe {
        let buffer = core::ptr::addr_of_mut!(CALLDATA_BUFFER);
        HostFnImpl::call_data_copy(&mut *buffer, 0);
        core::slice::from_raw_parts((*buffer).as_ptr(), size)
    };

    let response = handle_call(input);
    exit_with_response(&response);
}

#[allow(unreachable_code)]
fn exit_with_response(response: &[u8]) -> ! {
    HostFnImpl::return_value(ReturnFlags::empty(), response);
    loop {}
}
