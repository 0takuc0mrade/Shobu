// ---------------------------------------------------------------------------
// Odds Engine — pure functions for parimutuel odds & payout computation
// ---------------------------------------------------------------------------

use core::integer::u512_safe_div_rem_by_u256;
use core::num::traits::WideMul;
use core::traits::TryInto;

/// Basis-points denominator (100.00%)
pub const BPS_DENOM: u128 = 10_000_u128;

/// Weight for pool-derived odds in the blended calculation (60%)
const POOL_WEIGHT: u128 = 6_000_u128;

/// Weight for stat-derived odds in the blended calculation (40%)
const STAT_WEIGHT: u128 = 4_000_u128;

// ---------------------------------------------------------------------------
// Implied odds from pool totals
// ---------------------------------------------------------------------------

/// Returns implied probability for each player in basis points (0–10000).
/// If the pool is empty, returns (0, 0).
pub fn compute_implied_odds(total_on_p1: u128, total_on_p2: u128) -> (u128, u128) {
    let total = total_on_p1 + total_on_p2;
    if total == 0_u128 {
        return (0_u128, 0_u128);
    }

    let prob_p1 = mul_div_u128_floor(total_on_p1, BPS_DENOM, total);
    let prob_p2 = BPS_DENOM - prob_p1;
    (prob_p1, prob_p2)
}

// ---------------------------------------------------------------------------
// Stat-adjusted odds (blended pool + player win-rates)
// ---------------------------------------------------------------------------

/// Blends pool-derived implied odds with on-chain player statistics.
/// Uses a 60% pool-weight + 40% stat-weight blend.
///
/// Win-rate for a player = wins / (wins + losses), expressed in basis points.
/// If a player has zero matches, their stat-derived odds are set to 5000 bps (50%).
pub fn compute_stat_adjusted_odds(
    wins_p1: u32,
    losses_p1: u32,
    wins_p2: u32,
    losses_p2: u32,
    total_on_p1: u128,
    total_on_p2: u128,
) -> (u128, u128) {
    let (pool_prob_p1, _pool_prob_p2) = compute_implied_odds(total_on_p1, total_on_p2);

    // Stat-derived win rates
    let stat_prob_p1 = compute_win_rate(wins_p1, losses_p1);
    let stat_prob_p2 = compute_win_rate(wins_p2, losses_p2);

    // Normalize stat probabilities so they sum to BPS_DENOM
    let stat_total = stat_prob_p1 + stat_prob_p2;
    let (norm_stat_p1, _norm_stat_p2) = if stat_total == 0_u128 {
        (BPS_DENOM / 2_u128, BPS_DENOM / 2_u128)
    } else {
        let n1 = mul_div_u128_floor(stat_prob_p1, BPS_DENOM, stat_total);
        (n1, BPS_DENOM - n1)
    };

    // If the pool is empty, use pure stat-derived odds
    let total_pool = total_on_p1 + total_on_p2;
    if total_pool == 0_u128 {
        return (norm_stat_p1, BPS_DENOM - norm_stat_p1);
    }

    // Blend: 60% pool + 40% stats
    let blended_p1 = mul_div_u128_floor(pool_prob_p1, POOL_WEIGHT, BPS_DENOM)
        + mul_div_u128_floor(norm_stat_p1, STAT_WEIGHT, BPS_DENOM);
    let blended_p2 = BPS_DENOM - blended_p1;
    (blended_p1, blended_p2)
}

// ---------------------------------------------------------------------------
// Payout calculation
// ---------------------------------------------------------------------------

/// Pro-rata payout for a winning bettor.
pub fn compute_payout(bet_amount: u128, winning_total: u128, distributable: u128) -> u128 {
    if winning_total == 0_u128 {
        return 0_u128;
    }
    mul_div_u128_floor(distributable, bet_amount, winning_total)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Win-rate in basis points. Returns 5000 (50%) if no matches played.
fn compute_win_rate(wins: u32, losses: u32) -> u128 {
    let total: u128 = wins.into() + losses.into();
    if total == 0_u128 {
        return BPS_DENOM / 2_u128; // 50% default
    }
    mul_div_u128_floor(wins.into(), BPS_DENOM, total)
}

/// Safe wide-multiply then floor-divide: (x * y) / denom
/// Identical to the dark-waters implementation for cross-compatibility.
pub fn mul_div_u128_floor(x: u128, y: u128, denominator: u128) -> u128 {
    let lhs = to_u256(x);
    let rhs = to_u256(y);
    let denom_nz: NonZero<u256> = to_u256(denominator).try_into().expect('Division by 0');
    let product = lhs.wide_mul(rhs);
    let (quotient, _) = u512_safe_div_rem_by_u256(product, denom_nz);
    let quotient: u256 = quotient.try_into().expect('mul_div quotient > u256');
    assert!(quotient.high == 0_u128, "mul_div overflow");
    quotient.low
}

fn to_u256(amount: u128) -> u256 {
    u256 { low: amount, high: 0_u128 }
}
