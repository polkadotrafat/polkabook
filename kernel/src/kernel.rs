#![no_std]

extern crate alloc;

use alloc::vec::Vec;

pub const ORDER_SIZE: usize = 85;
pub const TRADE_SIZE: usize = 48;
pub const HEADER_SIZE: usize = 12;
pub const RESPONSE_HEADER_SIZE: usize = 13;
pub const MATCH_ORDERS_SELECTOR: [u8; 4] = [0xd5, 0x2a, 0x11, 0x8e];
pub const MAX_ORDERS_PER_SIDE: usize = 32;

pub const STATUS_OK: u8 = 0;
pub const STATUS_INVALID_SELECTOR: u8 = 1;
pub const STATUS_INVALID_LENGTH: u8 = 2;
pub const STATUS_TOO_MANY_ORDERS: u8 = 3;
pub const STATUS_INVALID_ORDER: u8 = 4;
pub const STATUS_UNSORTED_INPUT: u8 = 5;
pub const STATUS_INPUT_TOO_LARGE: u8 = 6;

#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Order {
    pub order_id: u64,
    pub trader: [u8; 20],
    pub price: u128,
    pub quantity: u128,
    pub filled: u128,
    pub timestamp: u64,
    pub side: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Trade {
    pub bid_order_id: u64,
    pub ask_order_id: u64,
    pub price: u128,
    pub quantity: u128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MatchReport {
    pub trades: Vec<Trade>,
    pub consumed_bid_count: u32,
    pub consumed_ask_count: u32,
}

pub fn handle_call(input: &[u8]) -> Vec<u8> {
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

    let report = match_orders(&mut bids, &mut asks);
    encode_report(&report)
}

pub fn parse_order(bytes: &[u8]) -> Option<Order> {
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

pub fn encode_report(report: &MatchReport) -> Vec<u8> {
    let mut out = Vec::with_capacity(RESPONSE_HEADER_SIZE + (report.trades.len() * TRADE_SIZE));
    out.push(STATUS_OK);
    out.extend_from_slice(&(report.trades.len() as u32).to_be_bytes());
    out.extend_from_slice(&report.consumed_bid_count.to_be_bytes());
    out.extend_from_slice(&report.consumed_ask_count.to_be_bytes());

    for trade in &report.trades {
        out.extend_from_slice(&trade.bid_order_id.to_be_bytes());
        out.extend_from_slice(&trade.ask_order_id.to_be_bytes());
        out.extend_from_slice(&trade.price.to_be_bytes());
        out.extend_from_slice(&trade.quantity.to_be_bytes());
    }

    out
}

pub fn encode_status_only(status: u8) -> Vec<u8> {
    let mut out = Vec::with_capacity(RESPONSE_HEADER_SIZE);
    out.push(status);
    out.extend_from_slice(&0u32.to_be_bytes());
    out.extend_from_slice(&0u32.to_be_bytes());
    out.extend_from_slice(&0u32.to_be_bytes());
    out
}

pub fn match_orders(bids: &mut [Order], asks: &mut [Order]) -> MatchReport {
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

    MatchReport {
        trades,
        consumed_bid_count: bid_index as u32,
        consumed_ask_count: ask_index as u32,
    }
}

pub fn are_bids_sorted(orders: &[Order]) -> bool {
    is_sorted_by(orders, |left, right| {
        left.price > right.price
            || (left.price == right.price
                && (left.timestamp < right.timestamp
                    || (left.timestamp == right.timestamp && left.order_id <= right.order_id)))
    })
}

pub fn are_asks_sorted(orders: &[Order]) -> bool {
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

pub fn read_u32_be(bytes: &[u8]) -> u32 {
    let mut out = [0u8; 4];
    out.copy_from_slice(bytes);
    u32::from_be_bytes(out)
}

pub fn read_u64_be(bytes: &[u8]) -> u64 {
    let mut out = [0u8; 8];
    out.copy_from_slice(bytes);
    u64::from_be_bytes(out)
}

pub fn read_u128_be(bytes: &[u8]) -> u128 {
    let mut out = [0u8; 16];
    out.copy_from_slice(bytes);
    u128::from_be_bytes(out)
}

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod tests {
    use super::*;

    const SIDE_BID: u8 = 0;
    const SIDE_ASK: u8 = 1;

    fn encode_order(order: Order) -> Vec<u8> {
        let mut out = Vec::with_capacity(ORDER_SIZE);
        out.extend_from_slice(&order.order_id.to_be_bytes());
        out.extend_from_slice(&order.trader);
        out.extend_from_slice(&order.price.to_be_bytes());
        out.extend_from_slice(&order.quantity.to_be_bytes());
        out.extend_from_slice(&order.filled.to_be_bytes());
        out.extend_from_slice(&order.timestamp.to_be_bytes());
        out.push(order.side);
        out
    }

    fn sample_order(order_id: u64, price: u128, quantity: u128, timestamp: u64, side: u8) -> Order {
        Order {
            order_id,
            trader: [0u8; 20],
            price,
            quantity,
            filled: 0,
            timestamp,
            side,
        }
    }

    fn build_input(bids: &[Order], asks: &[Order]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&MATCH_ORDERS_SELECTOR);
        out.extend_from_slice(&(bids.len() as u32).to_be_bytes());
        out.extend_from_slice(&(asks.len() as u32).to_be_bytes());
        for order in bids {
            out.extend_from_slice(&encode_order(*order));
        }
        for order in asks {
            out.extend_from_slice(&encode_order(*order));
        }
        out
    }

    #[test]
    fn matches_multiple_orders_and_reports_consumed_counts() {
        let mut bids = [sample_order(10, 12, 5, 1, SIDE_BID), sample_order(11, 11, 3, 2, SIDE_BID)];
        let mut asks = [sample_order(20, 10, 2, 3, SIDE_ASK), sample_order(21, 11, 4, 4, SIDE_ASK)];

        let report = match_orders(&mut bids, &mut asks);

        assert_eq!(report.trades.len(), 3);
        assert_eq!(report.consumed_bid_count, 1);
        assert_eq!(report.consumed_ask_count, 2);
        assert_eq!(report.trades[0].price, 12);
        assert_eq!(report.trades[1].price, 12);
        assert_eq!(report.trades[2].price, 11);
    }

    #[test]
    fn rejects_unsorted_input() {
        let bids = [sample_order(10, 10, 5, 1, SIDE_BID), sample_order(11, 12, 3, 2, SIDE_BID)];
        let asks = [sample_order(20, 11, 2, 3, SIDE_ASK)];

        let response = handle_call(&build_input(&bids, &asks));

        assert_eq!(response[0], STATUS_UNSORTED_INPUT);
        assert_eq!(&response[1..RESPONSE_HEADER_SIZE], &[0; 12]);
    }

    #[test]
    fn rejects_invalid_orders() {
        let mut bytes = build_input(&[sample_order(10, 10, 5, 1, SIDE_BID)], &[]);
        let invalid_side_offset = HEADER_SIZE + ORDER_SIZE - 1;
        bytes[invalid_side_offset] = 2;

        let response = handle_call(&bytes);

        assert_eq!(response[0], STATUS_INVALID_ORDER);
    }

    #[test]
    fn encodes_status_and_match_report_header() {
        let bids = [sample_order(10, 12, 2, 1, SIDE_BID)];
        let asks = [sample_order(20, 10, 2, 2, SIDE_ASK)];

        let response = handle_call(&build_input(&bids, &asks));

        assert_eq!(response[0], STATUS_OK);
        assert_eq!(read_u32_be(&response[1..5]), 1);
        assert_eq!(read_u32_be(&response[5..9]), 1);
        assert_eq!(read_u32_be(&response[9..13]), 1);
    }
}
