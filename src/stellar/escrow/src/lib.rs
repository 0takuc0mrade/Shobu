#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

// Soroban smart contract for Shōbu betting pools.
// Ports the logic from Escrow.sol

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Manager, // The Agent
    PoolCounter,
    Pool(u32),
    Bet(u32, Address), // (PoolId, Bettor)
    ProtocolFee(Address), // (Token Address)
}

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

const PROTOCOL_FEE_BPS: u128 = 250; // 2.5%
const BPS_DENOM: u128 = 10000;

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn init(env: Env, admin: Address, manager: Address) {
        admin.require_auth();
        let admin_key = DataKey::Admin;
        if env.storage().instance().has(&admin_key) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&admin_key, &admin);
        env.storage().instance().set(&DataKey::Manager, &manager);
        env.storage().instance().set(&DataKey::PoolCounter, &0u32);
    }

    pub fn create_pool(
        env: Env,
        token: Address,
        player1: Address,
        player2: Address,
        deadline: u64,
    ) -> u32 {
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

        env.storage().instance().set(&DataKey::Pool(pool_counter), &pool);
        pool_counter
    }

    pub fn place_bet(
        env: Env,
        pool_id: u32,
        bettor: Address,
        predicted_winner: Address,
        amount: u128,
    ) {
        bettor.require_auth();
        
        let pool_key = DataKey::Pool(pool_id);
        let mut pool: BettingPool = env.storage().instance().get(&pool_key).unwrap();
        
        if pool.status != PoolStatus::Open {
            panic!("Pool not open");
        }
        if env.ledger().timestamp() > pool.deadline {
            panic!("Betting deadline passed");
        }
        if predicted_winner != pool.player1 && predicted_winner != pool.player2 {
            panic!("Invalid winner prediction");
        }
        if bettor == pool.player1 || bettor == pool.player2 {
            panic!("Players cannot bet");
        }
        if amount == 0 {
            panic!("Zero bet amount");
        }

        let bet_key = DataKey::Bet(pool_id, bettor.clone());
        let mut bet = env.storage().instance().get(&bet_key).unwrap_or(Bet {
            bettor: bettor.clone(),
            predicted_winner: predicted_winner.clone(),
            amount: 0,
            claimed: false,
        });

        if bet.amount > 0 && bet.predicted_winner != predicted_winner {
            panic!("Cannot switch sides");
        }

        bet.amount += amount;
        pool.total_pot += amount;
        if predicted_winner == pool.player1 {
            pool.total_on_p1 += amount;
        } else {
            pool.total_on_p2 += amount;
        }

        env.storage().instance().set(&bet_key, &bet);
        env.storage().instance().set(&pool_key, &pool);

        let token_client = soroban_sdk::token::Client::new(&env, &pool.token);
        // Transfer requires an i128 representing the amount
        let transfer_amount: i128 = amount.try_into().unwrap();
        token_client.transfer(&bettor, &env.current_contract_address(), &transfer_amount);
    }

    pub fn settle_pool(env: Env, pool_id: u32, winner: Address) {
        let manager: Address = env.storage().instance().get(&DataKey::Manager).unwrap();
        manager.require_auth();

        let pool_key = DataKey::Pool(pool_id);
        let mut pool: BettingPool = env.storage().instance().get(&pool_key).unwrap();

        if pool.status != PoolStatus::Open {
            panic!("Pool not open");
        }
        if winner != pool.player1 && winner != pool.player2 {
            panic!("Invalid winner");
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

        // Update protocol fee mapping
        let fee_key = DataKey::ProtocolFee(pool.token.clone());
        let current_fee: u128 = env.storage().instance().get(&fee_key).unwrap_or(0);
        env.storage().instance().set(&fee_key, &(current_fee + protocol_fee_amount));

        env.storage().instance().set(&pool_key, &pool);
    }

    pub fn claim_winnings(env: Env, pool_id: u32, bettor: Address) {
        // Technically, anyone could trigger the claim on behalf of someone as long as it sends to the bettor.
        // We'll require auth to match typical sender pattern.
        bettor.require_auth();

        let pool_key = DataKey::Pool(pool_id);
        let pool: BettingPool = env.storage().instance().get(&pool_key).unwrap();

        if pool.status != PoolStatus::Settled {
            panic!("Pool not settled");
        }

        let bet_key = DataKey::Bet(pool_id, bettor.clone());
        let mut bet: Bet = env.storage().instance().get(&bet_key).unwrap();

        if bet.amount == 0 {
            panic!("No bet placed");
        }
        if bet.claimed {
            panic!("Already claimed");
        }
        if Some(bet.predicted_winner.clone()) != pool.winning_player {
            panic!("Did not win");
        }

        let winning_total = if Some(pool.player1.clone()) == pool.winning_player {
            pool.total_on_p1
        } else {
            pool.total_on_p2
        };

        if winning_total == 0 {
            panic!("No winners to pay");
        }

        let protocol_fee_amount = (pool.total_pot * PROTOCOL_FEE_BPS) / BPS_DENOM;
        let winning_pot = pool.total_pot - protocol_fee_amount;

        let payout = (bet.amount * winning_pot) / winning_total;

        bet.claimed = true;
        env.storage().instance().set(&bet_key, &bet);

        let token_client = soroban_sdk::token::Client::new(&env, &pool.token);
        let transfer_amount: i128 = payout.try_into().unwrap();
        token_client.transfer(&env.current_contract_address(), &bettor, &transfer_amount);
    }
}
