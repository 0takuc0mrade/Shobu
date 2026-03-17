use shobu::odds::{
    compute_implied_odds, compute_stat_adjusted_odds, compute_payout, mul_div_u128_floor,
};

// ---------------------------------------------------------------------------
// Implied odds tests
// ---------------------------------------------------------------------------

#[test]
fn test_equal_split_odds() {
    let (p1, p2) = compute_implied_odds(5000_u128, 5000_u128);
    assert!(p1 == 5000_u128, "P1 should be 5000 bps");
    assert!(p2 == 5000_u128, "P2 should be 5000 bps");
}

#[test]
fn test_skewed_odds_70_30() {
    let (p1, p2) = compute_implied_odds(7000_u128, 3000_u128);
    assert!(p1 == 7000_u128, "P1 should be 7000 bps");
    assert!(p2 == 3000_u128, "P2 should be 3000 bps");
}

#[test]
fn test_all_on_one_side() {
    let (p1, p2) = compute_implied_odds(10000_u128, 0_u128);
    assert!(p1 == 10000_u128, "P1 should be 10000 bps");
    assert!(p2 == 0_u128, "P2 should be 0 bps");
}

#[test]
fn test_empty_pool_odds() {
    let (p1, p2) = compute_implied_odds(0_u128, 0_u128);
    assert!(p1 == 0_u128, "P1 should be 0");
    assert!(p2 == 0_u128, "P2 should be 0");
}

// ---------------------------------------------------------------------------
// Payout tests
// ---------------------------------------------------------------------------

#[test]
fn test_payout_half_of_winning_pool() {
    // Bettor wagered 500 out of 1000 winning total, distributable is 1800
    let payout = compute_payout(500_u128, 1000_u128, 1800_u128);
    assert!(payout == 900_u128, "Should get half of distributable");
}

#[test]
fn test_payout_full_winning_pool() {
    // Only bettor on winning side
    let payout = compute_payout(1000_u128, 1000_u128, 1800_u128);
    assert!(payout == 1800_u128, "Should get full distributable");
}

#[test]
fn test_payout_zero_winning_total() {
    let payout = compute_payout(100_u128, 0_u128, 1000_u128);
    assert!(payout == 0_u128, "Should be zero when no winners");
}

// ---------------------------------------------------------------------------
// mul_div_u128_floor tests
// ---------------------------------------------------------------------------

#[test]
fn test_mul_div_basic() {
    // (100 * 250) / 10000 = 2 (floor)
    let result = mul_div_u128_floor(100_u128, 250_u128, 10000_u128);
    assert!(result == 2_u128, "Basic mul_div failed");
}

#[test]
fn test_mul_div_large_values() {
    // Test with values near u128 max / 2 to ensure wide multiply works
    let x: u128 = 1_000_000_000_000_000_000_u128; // 1e18
    let y: u128 = 5_000_u128;
    let denom: u128 = 10_000_u128;
    let result = mul_div_u128_floor(x, y, denom);
    assert!(result == 500_000_000_000_000_000_u128, "Large mul_div failed");
}

// ---------------------------------------------------------------------------
// Stat-adjusted odds tests
// ---------------------------------------------------------------------------

#[test]
fn test_stat_adjusted_equal_stats_equal_pool() {
    // Both players have same stats and same pool weight
    let (p1, p2) = compute_stat_adjusted_odds(
        10_u32, 10_u32,  // P1: 50% win rate
        10_u32, 10_u32,  // P2: 50% win rate
        5000_u128, 5000_u128, // equal pool
    );
    assert!(p1 == 5000_u128, "P1 should be 5000");
    assert!(p2 == 5000_u128, "P2 should be 5000");
}

#[test]
fn test_stat_adjusted_better_player_shifts_odds() {
    // P1 has much better stats, but pool is equal
    let (p1, p2) = compute_stat_adjusted_odds(
        80_u32, 20_u32,  // P1: 80% win rate
        20_u32, 80_u32,  // P2: 20% win rate
        5000_u128, 5000_u128, // equal pool
    );
    // Pool contributes 50% * 60% = 3000 bps for P1
    // Stats contribute 80% * 40% = 3200 bps for P1
    // Blended P1 = 6200 bps
    assert!(p1 == 6200_u128, "P1 should benefit from better stats");
    assert!(p2 == 3800_u128, "P2 should be reduced");
}

#[test]
fn test_stat_adjusted_empty_pool_pure_stats() {
    // No pool money — should use pure stats
    let (p1, p2) = compute_stat_adjusted_odds(
        75_u32, 25_u32,  // P1: 75% win rate
        25_u32, 75_u32,  // P2: 25% win rate
        0_u128, 0_u128,  // empty pool
    );
    assert!(p1 == 7500_u128, "Should be pure stat-derived");
    assert!(p2 == 2500_u128, "Should be pure stat-derived");
}

#[test]
fn test_stat_adjusted_no_match_history() {
    // No match history (defaults to 50% each) with skewed pool
    let (p1, p2) = compute_stat_adjusted_odds(
        0_u32, 0_u32,
        0_u32, 0_u32,
        7000_u128, 3000_u128,
    );
    // Pool contributes 70% * 60% = 4200 for P1
    // Stats contribute 50% * 40% = 2000 for P1
    // Blended P1 = 6200
    assert!(p1 == 6200_u128, "No history defaults to 50%");
    assert!(p2 == 3800_u128, "Complement");
}
