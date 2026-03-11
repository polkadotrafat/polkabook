#![no_std]
#![no_main]

extern crate alloc;

use core::alloc::{GlobalAlloc, Layout};
use core::ptr::null_mut;
use alloc::vec::Vec;

const HEAP_SIZE: usize = 32 * 1024;
const MAX_CALLDATA_SIZE: usize = 10_240;
const ORDER_SIZE: usize = 85;
const TRADE_SIZE: usize = 48;
const HEADER_SIZE: usize = 12;
const MATCH_ORDERS_SELECTOR: [u8; 4] = [0xd5, 0x2a, 0x11, 0x8e];
const MAX_ORDERS_PER_SIDE: usize = 32;
const RESPONSE_HEADER_SIZE: usize = 5;

const STATUS_OK: u8 = 0;
const STATUS_INVALID_SELECTOR: u8 = 1;
const STATUS_INVALID_LENGTH: u8 = 2;
const STATUS_TOO_MANY_ORDERS: u8 = 3;
const STATUS_INVALID_ORDER: u8 = 4;
const STATUS_UNSORTED_INPUT: u8 = 5;
const STATUS_INPUT_TOO_LARGE: u8 = 6;

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

#[allow(dead_code)]
#[derive(Clone, Copy)]
struct Order {
    order_id: u64,
    trader: [u8; 20],
    price: u128,
    quantity: u128,
    filled: u128,
    timestamp: u64,
    side: u8,
}

#[derive(Clone, Copy)]
struct Trade {
    bid_order_id: u64,
    ask_order_id: u64,
    price: u128,
    quantity: u128,
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[polkavm_export]
pub extern "C" fn call() {
    let size = HostFnImpl::call_data_size() as usize;
    if size > MAX_CALLDATA_SIZE {
        let response = encode_status_only(STATUS_INPUT_TOO_LARGE);
        HostFnImpl::return_value(ReturnFlags::empty(), &response);
    }

    let input = unsafe {
        let buffer = core::ptr::addr_of_mut!(CALLDATA_BUFFER);
        HostFnImpl::call_data_copy(&mut *buffer, 0);
        core::slice::from_raw_parts((*buffer).as_ptr(), size)
    };

    let response = handle_call(input);
    HostFnImpl::return_value(ReturnFlags::empty(), &response);
}

fn handle_call(input: &[u8]) -> Vec<u8> {
    if input.len() < HEADER_SIZE {
        return encode_status_only(STATUS_INVALID_LENGTH);
    }

    if input[0..4] != MATCH_ORDERS_SELECTOR {
        return encode_status_only(STATUS_INVALID_SELECTOR);
    }

    let bid_count = read_u32_be(&input[4..8]) as usize;
    let ask_count = read_u32_be(&input[8..12]) as usize;
    if bid_count > MAX_ORDERS_PER_SIDE || ask_count > MAX_ORDERS_PER_SIDE {
        return encode_status_only(STATUS_TOO_MANY_ORDERS);
    }

    let expected_size = HEADER_SIZE + ((bid_count + ask_count) * ORDER_SIZE);
    if input.len() != expected_size {
        return encode_status_only(STATUS_INVALID_LENGTH);
    }

    let mut cursor = HEADER_SIZE;
    let mut bids = Vec::with_capacity(bid_count);
    let mut asks = Vec::with_capacity(ask_count);

    for _ in 0..bid_count {
        let order = match parse_order(&input[cursor..cursor + ORDER_SIZE]) {
            Some(order) => order,
            None => return encode_status_only(STATUS_INVALID_ORDER),
        };
        bids.push(order);
        cursor += ORDER_SIZE;
    }

    for _ in 0..ask_count {
        let order = match parse_order(&input[cursor..cursor + ORDER_SIZE]) {
            Some(order) => order,
            None => return encode_status_only(STATUS_INVALID_ORDER),
        };
        asks.push(order);
        cursor += ORDER_SIZE;
    }

    if !are_bids_sorted(&bids) || !are_asks_sorted(&asks) {
        return encode_status_only(STATUS_UNSORTED_INPUT);
    }

    let trades = match_orders(&mut bids, &mut asks);
    encode_trades(&trades)
}

fn parse_order(bytes: &[u8]) -> Option<Order> {
    if bytes.len() != ORDER_SIZE {
        return None;
    }

    let mut trader = [0u8; 20];
    trader.copy_from_slice(&bytes[8..28]);

    let order = Order {
        order_id: read_u64_be(&bytes[0..8]),
        trader,
        price: read_u128_be(&bytes[28..44]),
        quantity: read_u128_be(&bytes[44..60]),
        filled: read_u128_be(&bytes[60..76]),
        timestamp: read_u64_be(&bytes[76..84]),
        side: bytes[84],
    };

    if order.side > 1 || order.quantity == 0 || order.filled > order.quantity {
        return None;
    }

    Some(order)
}

fn encode_trades(trades: &[Trade]) -> Vec<u8> {
    let mut out = Vec::with_capacity(RESPONSE_HEADER_SIZE + (trades.len() * TRADE_SIZE));
    out.push(STATUS_OK);
    out.extend_from_slice(&(trades.len() as u32).to_be_bytes());

    for trade in trades {
        out.extend_from_slice(&trade.bid_order_id.to_be_bytes());
        out.extend_from_slice(&trade.ask_order_id.to_be_bytes());
        out.extend_from_slice(&trade.price.to_be_bytes());
        out.extend_from_slice(&trade.quantity.to_be_bytes());
    }

    out
}

fn encode_status_only(status: u8) -> Vec<u8> {
    let mut out = Vec::with_capacity(RESPONSE_HEADER_SIZE);
    out.push(status);
    out.extend_from_slice(&0u32.to_be_bytes());
    out
}

fn match_orders(bids: &mut [Order], asks: &mut [Order]) -> Vec<Trade> {
    let max_trades = if bids.is_empty() || asks.is_empty() {
        0
    } else {
        bids.len() + asks.len() - 1
    };
    let mut trades = Vec::with_capacity(max_trades);
    let mut bid_index = 0usize;
    let mut ask_index = 0usize;

    while bid_index < bids.len() && ask_index < asks.len() {
        let bid = &mut bids[bid_index];
        let ask = &mut asks[ask_index];

        if bid.side != 0 || ask.side != 1 {
            break;
        }

        if bid.price < ask.price {
            break;
        }

        let bid_remaining = bid.quantity.saturating_sub(bid.filled);
        let ask_remaining = ask.quantity.saturating_sub(ask.filled);
        if bid_remaining == 0 {
            bid_index += 1;
            continue;
        }
        if ask_remaining == 0 {
            ask_index += 1;
            continue;
        }

        let fill_quantity = if bid_remaining < ask_remaining {
            bid_remaining
        } else {
            ask_remaining
        };

        let execution_price = if bid.timestamp <= ask.timestamp {
            bid.price
        } else {
            ask.price
        };

        bid.filled = bid.filled.saturating_add(fill_quantity);
        ask.filled = ask.filled.saturating_add(fill_quantity);

        trades.push(Trade {
            bid_order_id: bid.order_id,
            ask_order_id: ask.order_id,
            price: execution_price,
            quantity: fill_quantity,
        });

        if bid.filled >= bid.quantity {
            bid_index += 1;
        }

        if ask.filled >= ask.quantity {
            ask_index += 1;
        }
    }

    trades
}

fn are_bids_sorted(orders: &[Order]) -> bool {
    is_sorted_by(orders, |left, right| {
        left.price > right.price
            || (left.price == right.price
                && (left.timestamp < right.timestamp
                    || (left.timestamp == right.timestamp && left.order_id <= right.order_id)))
    })
}

fn are_asks_sorted(orders: &[Order]) -> bool {
    is_sorted_by(orders, |left, right| {
        left.price < right.price
            || (left.price == right.price
                && (left.timestamp < right.timestamp
                    || (left.timestamp == right.timestamp && left.order_id <= right.order_id)))
    })
}

fn is_sorted_by<F>(orders: &[Order], mut in_order: F) -> bool
where
    F: FnMut(&Order, &Order) -> bool,
{
    let mut i = 1usize;
    while i < orders.len() {
        if !in_order(&orders[i - 1], &orders[i]) {
            return false;
        }
        i += 1;
    }
    true
}

fn read_u32_be(bytes: &[u8]) -> u32 {
    let mut out = [0u8; 4];
    out.copy_from_slice(bytes);
    u32::from_be_bytes(out)
}

fn read_u64_be(bytes: &[u8]) -> u64 {
    let mut out = [0u8; 8];
    out.copy_from_slice(bytes);
    u64::from_be_bytes(out)
}

fn read_u128_be(bytes: &[u8]) -> u128 {
    let mut out = [0u8; 16];
    out.copy_from_slice(bytes);
    u128::from_be_bytes(out)
}
