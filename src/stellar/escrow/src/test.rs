#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Env,
};

// ── Helpers ──────────────────────────────────────────────────────────────

fn setup_env() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let manager = Address::generate(&env);
    let contract_id = env.register(EscrowContract, ());

    (env, contract_id, admin, manager)
}

fn init_contract(env: &Env, contract_id: &Address, admin: &Address, manager: &Address) {
    let client = EscrowContractClient::new(env, contract_id);
    client.init(admin, manager);
}

fn create_test_token(env: &Env, admin: &Address) -> Address {
    let token_contract_id = env.register_stellar_asset_contract_v2(admin.clone());
    token_contract_id.address()
}

fn mint_tokens(env: &Env, token_address: &Address, admin: &Address, to: &Address, amount: i128) {
    let admin_client = token::StellarAssetClient::new(env, token_address);
    admin_client.mint(to, &amount);
}

// ── Test 1: Initialization ──────────────────────────────────────────────

#[test]
fn test_init() {
    let (env, contract_id, admin, manager) = setup_env();
    let client = EscrowContractClient::new(&env, &contract_id);

    client.init(&admin, &manager);
    assert_eq!(client.pool_count(), 0);
}

#[test]
fn test_init_cannot_reinitialize() {
    let (env, contract_id, admin, manager) = setup_env();
    let client = EscrowContractClient::new(&env, &contract_id);

    client.init(&admin, &manager);
    let result = client.try_init(&admin, &manager);
    assert!(result.is_err());
}

// ── Test 2: Pool Creation ───────────────────────────────────────────────

#[test]
fn test_create_pool() {
    let (env, contract_id, admin, manager) = setup_env();
    init_contract(&env, &contract_id, &admin, &manager);

    let client = EscrowContractClient::new(&env, &contract_id);
    let token = create_test_token(&env, &admin);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    let pool_id = client.create_pool(&token, &player1, &player2, &1000u64);
    assert_eq!(pool_id, 1);
    assert_eq!(client.pool_count(), 1);

    let pool = client.get_pool(&1u32);
    assert_eq!(pool.id, 1);
    assert_eq!(pool.player1, player1);
    assert_eq!(pool.player2, player2);
    assert_eq!(pool.total_pot, 0);
    assert_eq!(pool.status, PoolStatus::Open);

    // Create a second pool
    let pool_id_2 = client.create_pool(&token, &player1, &player2, &2000u64);
    assert_eq!(pool_id_2, 2);
    assert_eq!(client.pool_count(), 2);
}

// ── Test 3: Place Bet → Settle → Claim Winnings ─────────────────────────

#[test]
fn test_full_lifecycle_settle_and_claim() {
    let (env, contract_id, admin, manager) = setup_env();
    init_contract(&env, &contract_id, &admin, &manager);

    let client = EscrowContractClient::new(&env, &contract_id);
    let token = create_test_token(&env, &admin);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let bettor_yes = Address::generate(&env);
    let bettor_no = Address::generate(&env);

    // Set timestamp so deadline isn't expired
    env.ledger().with_mut(|li| li.timestamp = 100);

    let pool_id = client.create_pool(&token, &player1, &player2, &500u64);

    // Fund bettors
    mint_tokens(&env, &token, &admin, &bettor_yes, 1_000_000);
    mint_tokens(&env, &token, &admin, &bettor_no, 500_000);

    // Place bets
    client.place_bet(&pool_id, &bettor_yes, &player1, &1_000_000u128);
    client.place_bet(&pool_id, &bettor_no, &player2, &500_000u128);

    // Verify pool state
    let pool = client.get_pool(&pool_id);
    assert_eq!(pool.total_pot, 1_500_000);
    assert_eq!(pool.total_on_p1, 1_000_000);
    assert_eq!(pool.total_on_p2, 500_000);

    // Verify bet state
    let bet_yes = client.get_bet(&pool_id, &bettor_yes);
    assert_eq!(bet_yes.amount, 1_000_000);
    assert_eq!(bet_yes.predicted_winner, player1);

    // Settle: player1 wins
    client.settle_pool(&pool_id, &player1);
    let settled_pool = client.get_pool(&pool_id);
    assert_eq!(settled_pool.status, PoolStatus::Settled);
    assert_eq!(settled_pool.winning_player, Some(player1.clone()));

    // Claim winnings (bettor_yes backed player1)
    let token_client = token::Client::new(&env, &token);
    let balance_before = token_client.balance(&bettor_yes);
    client.claim_winnings(&pool_id, &bettor_yes);
    let balance_after = token_client.balance(&bettor_yes);

    // Expected payout: 2.5% fee on 1_500_000 pot = 37_500 fee
    // Winning pot: 1_500_000 - 37_500 = 1_462_500
    // bettor_yes share: (1_000_000 * 1_462_500) / 1_000_000 = 1_462_500
    assert_eq!(balance_after - balance_before, 1_462_500);

    // Verify bet is marked as claimed
    let claimed_bet = client.get_bet(&pool_id, &bettor_yes);
    assert!(claimed_bet.claimed);
}

// ── Test 4: Cancel Pool → Claim Refund ──────────────────────────────────

#[test]
fn test_cancel_and_refund() {
    let (env, contract_id, admin, manager) = setup_env();
    init_contract(&env, &contract_id, &admin, &manager);

    let client = EscrowContractClient::new(&env, &contract_id);
    let token = create_test_token(&env, &admin);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let bettor = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 100);

    let pool_id = client.create_pool(&token, &player1, &player2, &500u64);

    // Fund and bet
    mint_tokens(&env, &token, &admin, &bettor, 1_000_000);
    client.place_bet(&pool_id, &bettor, &player1, &1_000_000u128);

    // Cancel pool
    client.cancel_pool(&pool_id);
    let pool = client.get_pool(&pool_id);
    assert_eq!(pool.status, PoolStatus::Cancelled);

    // Claim refund — should get full amount back
    let token_client = token::Client::new(&env, &token);
    let balance_before = token_client.balance(&bettor);
    client.claim_refund(&pool_id, &bettor);
    let balance_after = token_client.balance(&bettor);
    assert_eq!(balance_after - balance_before, 1_000_000);

    // Verify claim flag
    let bet = client.get_bet(&pool_id, &bettor);
    assert!(bet.claimed);
}

// ── Test 5: Error Cases ─────────────────────────────────────────────────

#[test]
fn test_error_bet_on_closed_pool() {
    let (env, contract_id, admin, manager) = setup_env();
    init_contract(&env, &contract_id, &admin, &manager);

    let client = EscrowContractClient::new(&env, &contract_id);
    let token = create_test_token(&env, &admin);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let bettor = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 100);

    let pool_id = client.create_pool(&token, &player1, &player2, &500u64);
    client.cancel_pool(&pool_id);

    mint_tokens(&env, &token, &admin, &bettor, 1_000_000);
    let result = client.try_place_bet(&pool_id, &bettor, &player1, &100_000u128);
    assert!(result.is_err());
}

#[test]
fn test_error_cannot_switch_sides() {
    let (env, contract_id, admin, manager) = setup_env();
    init_contract(&env, &contract_id, &admin, &manager);

    let client = EscrowContractClient::new(&env, &contract_id);
    let token = create_test_token(&env, &admin);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let bettor = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 100);

    let pool_id = client.create_pool(&token, &player1, &player2, &500u64);
    mint_tokens(&env, &token, &admin, &bettor, 2_000_000);

    // Bet on player1
    client.place_bet(&pool_id, &bettor, &player1, &1_000_000u128);

    // Try to switch to player2 — should fail
    let result = client.try_place_bet(&pool_id, &bettor, &player2, &1_000_000u128);
    assert!(result.is_err());
}

#[test]
fn test_error_double_claim() {
    let (env, contract_id, admin, manager) = setup_env();
    init_contract(&env, &contract_id, &admin, &manager);

    let client = EscrowContractClient::new(&env, &contract_id);
    let token = create_test_token(&env, &admin);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let bettor = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 100);

    let pool_id = client.create_pool(&token, &player1, &player2, &500u64);
    mint_tokens(&env, &token, &admin, &bettor, 1_000_000);
    client.place_bet(&pool_id, &bettor, &player1, &1_000_000u128);
    client.settle_pool(&pool_id, &player1);

    // First claim succeeds
    client.claim_winnings(&pool_id, &bettor);

    // Second claim should fail
    let result = client.try_claim_winnings(&pool_id, &bettor);
    assert!(result.is_err());
}

#[test]
fn test_error_loser_cannot_claim() {
    let (env, contract_id, admin, manager) = setup_env();
    init_contract(&env, &contract_id, &admin, &manager);

    let client = EscrowContractClient::new(&env, &contract_id);
    let token = create_test_token(&env, &admin);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);
    let bettor = Address::generate(&env);

    env.ledger().with_mut(|li| li.timestamp = 100);

    let pool_id = client.create_pool(&token, &player1, &player2, &500u64);
    mint_tokens(&env, &token, &admin, &bettor, 1_000_000);

    // Bet on player1
    client.place_bet(&pool_id, &bettor, &player1, &1_000_000u128);

    // Player2 wins
    client.settle_pool(&pool_id, &player2);

    // bettor backed player1 — should not be able to claim
    let result = client.try_claim_winnings(&pool_id, &bettor);
    assert!(result.is_err());
}
