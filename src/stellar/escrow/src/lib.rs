#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env};

// -----------------------------------------------------------------------
// Soroban Escrow Contract for Shōbu Prediction Markets
// -----------------------------------------------------------------------

// ── Error Types ──────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    PoolNotOpen = 2,
    DeadlinePassed = 3,
    InvalidWinner = 4,
    PlayersCannotBet = 5,
    ZeroBetAmount = 6,
    CannotSwitchSides = 7,
    PoolNotSettled = 8,
    NoBetPlaced = 9,
    AlreadyClaimed = 10,
    DidNotWin = 11,
    NoWinnersToPay = 12,
    PoolNotCancelled = 13,
    PoolNotFound = 14,
    BetNotFound = 15,
}

// ── Storage Keys ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Manager,
    PoolCounter,
    Pool(u32),
    Bet(u32, Address), // (PoolId, Bettor)
    ProtocolFee(Address), // (Token Address)
}

// ── Data Models ──────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PoolStatus {
    Open = 0,
    Settled = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BettingPool {
    pub id: u32,
    pub token: Address,
    pub status: PoolStatus,
    pub total_pot: u128,
    pub total_on_p1: u128,
    pub total_on_p2: u128,
    pub player1: Address,
    pub player2: Address,
    pub winning_player: Option<Address>,
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bet {
    pub bettor: Address,
    pub predicted_winner: Address,
    pub amount: u128,
    pub claimed: bool,
}

// ── Constants ────────────────────────────────────────────────────────────

const PROTOCOL_FEE_BPS: u128 = 250; // 2.5%
const BPS_DENOM: u128 = 10000;
const PERSISTENT_TTL: u32 = 518_400; // ~30 days in ledgers

// ── Contract ─────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the contract with an admin and manager (agent) address.
    /// Can only be called once.
    pub fn init(env: Env, admin: Address, manager: Address) -> Result<(), EscrowError> {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(EscrowError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Manager, &manager);
        env.storage().instance().set(&DataKey::PoolCounter, &0u32);

        Ok(())
    }

    /// Create a new betting pool. Only the manager can call this.
    /// Returns the new pool ID.
    pub fn create_pool(
        env: Env,
        token: Address,
        player1: Address,
        player2: Address,
        deadline: u64,
    ) -> Result<u32, EscrowError> {
        let manager: Address = env.storage().instance().get(&DataKey::Manager).unwrap();
        manager.require_auth();

        let mut pool_counter: u32 = env.storage().instance().get(&DataKey::PoolCounter).unwrap();
        pool_counter += 1;
        env.storage().instance().set(&DataKey::PoolCounter, &pool_counter);

        let pool = BettingPool {
            id: pool_counter,
            token,
            status: PoolStatus::Open,
            total_pot: 0,
            total_on_p1: 0,
            total_on_p2: 0,
            player1,
            player2,
            winning_player: None,
            deadline,
        };

        let pool_key = DataKey::Pool(pool_counter);
        env.storage().persistent().set(&pool_key, &pool);
        env.storage().persistent().extend_ttl(&pool_key, PERSISTENT_TTL, PERSISTENT_TTL);

        Ok(pool_counter)
    }

    /// Place a bet on a pool.
    /// The bettor must not be a player and cannot switch sides after initial bet.
    pub fn place_bet(
        env: Env,
        pool_id: u32,
        bettor: Address,
        predicted_winner: Address,
        amount: u128,
    ) -> Result<(), EscrowError> {
        bettor.require_auth();

        let pool_key = DataKey::Pool(pool_id);
        let mut pool: BettingPool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .ok_or(EscrowError::PoolNotFound)?;

        if pool.status != PoolStatus::Open {
            return Err(EscrowError::PoolNotOpen);
        }
        if env.ledger().timestamp() > pool.deadline {
            return Err(EscrowError::DeadlinePassed);
        }
        if predicted_winner != pool.player1 && predicted_winner != pool.player2 {
            return Err(EscrowError::InvalidWinner);
        }
        if bettor == pool.player1 || bettor == pool.player2 {
            return Err(EscrowError::PlayersCannotBet);
        }
        if amount == 0 {
            return Err(EscrowError::ZeroBetAmount);
        }

        let bet_key = DataKey::Bet(pool_id, bettor.clone());
        let mut bet = env.storage().persistent().get(&bet_key).unwrap_or(Bet {
            bettor: bettor.clone(),
            predicted_winner: predicted_winner.clone(),
            amount: 0,
            claimed: false,
        });

        if bet.amount > 0 && bet.predicted_winner != predicted_winner {
            return Err(EscrowError::CannotSwitchSides);
        }

        bet.amount += amount;
        pool.total_pot += amount;
        if predicted_winner == pool.player1 {
            pool.total_on_p1 += amount;
        } else {
            pool.total_on_p2 += amount;
        }

        env.storage().persistent().set(&bet_key, &bet);
        env.storage().persistent().extend_ttl(&bet_key, PERSISTENT_TTL, PERSISTENT_TTL);
        env.storage().persistent().set(&pool_key, &pool);
        env.storage().persistent().extend_ttl(&pool_key, PERSISTENT_TTL, PERSISTENT_TTL);

        let token_client = soroban_sdk::token::Client::new(&env, &pool.token);
        let transfer_amount: i128 = amount.try_into().unwrap();
        token_client.transfer(&bettor, &env.current_contract_address(), &transfer_amount);

        Ok(())
    }

    /// Settle a pool with a declared winner. Only the manager can call this.
    pub fn settle_pool(
        env: Env,
        pool_id: u32,
        winner: Address,
    ) -> Result<(), EscrowError> {
        let manager: Address = env.storage().instance().get(&DataKey::Manager).unwrap();
        manager.require_auth();

        let pool_key = DataKey::Pool(pool_id);
        let mut pool: BettingPool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .ok_or(EscrowError::PoolNotFound)?;

        if pool.status != PoolStatus::Open {
            return Err(EscrowError::PoolNotOpen);
        }
        if winner != pool.player1 && winner != pool.player2 {
            return Err(EscrowError::InvalidWinner);
        }

        pool.status = PoolStatus::Settled;
        pool.winning_player = Some(winner.clone());

        let winning_total = if winner == pool.player1 {
            pool.total_on_p1
        } else {
            pool.total_on_p2
        };

        let protocol_fee_amount = if winning_total == 0 {
            pool.total_pot
        } else {
            (pool.total_pot * PROTOCOL_FEE_BPS) / BPS_DENOM
        };

        let fee_key = DataKey::ProtocolFee(pool.token.clone());
        let current_fee: u128 = env.storage().persistent().get(&fee_key).unwrap_or(0);
        env.storage().persistent().set(&fee_key, &(current_fee + protocol_fee_amount));
        env.storage().persistent().extend_ttl(&fee_key, PERSISTENT_TTL, PERSISTENT_TTL);

        env.storage().persistent().set(&pool_key, &pool);
        env.storage().persistent().extend_ttl(&pool_key, PERSISTENT_TTL, PERSISTENT_TTL);

        Ok(())
    }

    /// Claim winnings from a settled pool.
    pub fn claim_winnings(
        env: Env,
        pool_id: u32,
        bettor: Address,
    ) -> Result<(), EscrowError> {
        bettor.require_auth();

        let pool_key = DataKey::Pool(pool_id);
        let pool: BettingPool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .ok_or(EscrowError::PoolNotFound)?;

        if pool.status != PoolStatus::Settled {
            return Err(EscrowError::PoolNotSettled);
        }

        let bet_key = DataKey::Bet(pool_id, bettor.clone());
        let mut bet: Bet = env
            .storage()
            .persistent()
            .get(&bet_key)
            .ok_or(EscrowError::BetNotFound)?;

        if bet.amount == 0 {
            return Err(EscrowError::NoBetPlaced);
        }
        if bet.claimed {
            return Err(EscrowError::AlreadyClaimed);
        }
        if Some(bet.predicted_winner.clone()) != pool.winning_player {
            return Err(EscrowError::DidNotWin);
        }

        let winning_total = if Some(pool.player1.clone()) == pool.winning_player {
            pool.total_on_p1
        } else {
            pool.total_on_p2
        };

        if winning_total == 0 {
            return Err(EscrowError::NoWinnersToPay);
        }

        let protocol_fee_amount = (pool.total_pot * PROTOCOL_FEE_BPS) / BPS_DENOM;
        let winning_pot = pool.total_pot - protocol_fee_amount;
        let payout = (bet.amount * winning_pot) / winning_total;

        bet.claimed = true;
        env.storage().persistent().set(&bet_key, &bet);
        env.storage().persistent().extend_ttl(&bet_key, PERSISTENT_TTL, PERSISTENT_TTL);

        let token_client = soroban_sdk::token::Client::new(&env, &pool.token);
        let transfer_amount: i128 = payout.try_into().unwrap();
        token_client.transfer(&env.current_contract_address(), &bettor, &transfer_amount);

        Ok(())
    }

    /// Cancel an open pool. Only the manager can call this.
    pub fn cancel_pool(env: Env, pool_id: u32) -> Result<(), EscrowError> {
        let manager: Address = env.storage().instance().get(&DataKey::Manager).unwrap();
        manager.require_auth();

        let pool_key = DataKey::Pool(pool_id);
        let mut pool: BettingPool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .ok_or(EscrowError::PoolNotFound)?;

        if pool.status != PoolStatus::Open {
            return Err(EscrowError::PoolNotOpen);
        }

        pool.status = PoolStatus::Cancelled;
        env.storage().persistent().set(&pool_key, &pool);
        env.storage().persistent().extend_ttl(&pool_key, PERSISTENT_TTL, PERSISTENT_TTL);

        Ok(())
    }

    /// Claim a full refund from a cancelled pool.
    pub fn claim_refund(
        env: Env,
        pool_id: u32,
        bettor: Address,
    ) -> Result<(), EscrowError> {
        bettor.require_auth();

        let pool_key = DataKey::Pool(pool_id);
        let pool: BettingPool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .ok_or(EscrowError::PoolNotFound)?;

        if pool.status != PoolStatus::Cancelled {
            return Err(EscrowError::PoolNotCancelled);
        }

        let bet_key = DataKey::Bet(pool_id, bettor.clone());
        let mut bet: Bet = env
            .storage()
            .persistent()
            .get(&bet_key)
            .ok_or(EscrowError::BetNotFound)?;

        if bet.amount == 0 {
            return Err(EscrowError::NoBetPlaced);
        }
        if bet.claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        bet.claimed = true;
        env.storage().persistent().set(&bet_key, &bet);
        env.storage().persistent().extend_ttl(&bet_key, PERSISTENT_TTL, PERSISTENT_TTL);

        let token_client = soroban_sdk::token::Client::new(&env, &pool.token);
        let transfer_amount: i128 = bet.amount.try_into().unwrap();
        token_client.transfer(&env.current_contract_address(), &bettor, &transfer_amount);

        Ok(())
    }

    /// Read the current pool counter (number of pools created).
    pub fn pool_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::PoolCounter).unwrap_or(0)
    }

    /// Read a pool by ID.
    pub fn get_pool(env: Env, pool_id: u32) -> Result<BettingPool, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Pool(pool_id))
            .ok_or(EscrowError::PoolNotFound)
    }

    /// Read a bet by pool ID and bettor address.
    pub fn get_bet(env: Env, pool_id: u32, bettor: Address) -> Result<Bet, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Bet(pool_id, bettor))
            .ok_or(EscrowError::BetNotFound)
    }
}

#[cfg(test)]
mod test;
