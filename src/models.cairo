use starknet::ContractAddress;

// ---------------------------------------------------------------------------
// Pool counter (singleton)
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct PoolCounter {
    #[key]
    pub id: u8,
    pub count: u32,
}

// ---------------------------------------------------------------------------
// Protocol configuration (singleton)
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct ProtocolConfig {
    #[key]
    pub id: u8,
    pub fee_bps: u16,
    pub fee_recipient: ContractAddress,
    pub admin: ContractAddress,
    pub paused: bool,
}

// ---------------------------------------------------------------------------
// Pool manager allowlist (per-account)
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct PoolManager {
    #[key]
    pub account: ContractAddress,
    pub enabled: bool,
}

// ---------------------------------------------------------------------------
// Denshokan / EGS configuration (singleton)
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct DenshokanConfig {
    #[key]
    pub id: u8,
    pub token_contract: ContractAddress,  // denshokan session token contract
    pub enabled: bool,
}

// ---------------------------------------------------------------------------
// Fee vault — accumulated protocol fees per token
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct FeeVault {
    #[key]
    pub token: ContractAddress,
    pub accumulated: u128,
}

// ---------------------------------------------------------------------------
// Betting pool
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct BettingPool {
    #[key]
    pub pool_id: u32,

    // External game reference
    pub game_world: ContractAddress,
    pub game_id: u32,
    pub token: ContractAddress,

    // Pool lifecycle: 0 = open, 1 = settled, 2 = cancelled
    pub status: u8,

    // Settlement mode: 0 = IGameWorld (direct), 1 = EGS (denshokan tokens)
    pub settlement_mode: u8,
    pub egs_token_id_p1: felt252,
    pub egs_token_id_p2: felt252,

    // Aggregate amounts
    pub total_pot: u128,
    pub total_on_p1: u128,
    pub total_on_p2: u128,
    pub bettor_count_p1: u32,
    pub bettor_count_p2: u32,

    // Settlement data
    pub winning_player: ContractAddress,
    pub winning_total: u128,
    pub distributable_amount: u128,
    pub claimed_amount: u128,
    pub claimed_winner_count: u32,
    pub protocol_fee_amount: u128,

    // Metadata
    pub creator: ContractAddress,
    pub deadline: u64,
    pub player_1: ContractAddress,
    pub player_2: ContractAddress,
}

// ---------------------------------------------------------------------------
// Individual bet
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct Bet {
    #[key]
    pub pool_id: u32,
    #[key]
    pub bettor: ContractAddress,

    pub predicted_winner: ContractAddress,
    pub amount: u128,
    pub claimed: bool,
    pub placed_at: u64,
}

// ---------------------------------------------------------------------------
// Cached odds snapshot
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde, Debug)]
#[dojo::model]
pub struct OddsSnapshot {
    #[key]
    pub pool_id: u32,

    pub implied_prob_p1: u128,
    pub implied_prob_p2: u128,
    pub last_updated: u64,
}
