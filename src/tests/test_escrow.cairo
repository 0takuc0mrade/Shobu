// ---------------------------------------------------------------------------
// Integration tests for the Escrow contract
// Uses dojo_cairo_test NamespaceDef + TestResource pattern.
// ---------------------------------------------------------------------------

use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::world::world;
use dojo_cairo_test::{
    spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, WorldStorageTestTrait,
};

use shobu::systems::actions::Escrow;
use shobu::models::{
    BettingPool, Bet, OddsSnapshot, ProtocolConfig, FeeVault, PoolCounter,
    m_BettingPool, m_Bet, m_OddsSnapshot, m_ProtocolConfig, m_FeeVault, m_PoolCounter,
    m_DenshokanConfig, m_PoolManager,
};

fn namespace_def() -> NamespaceDef {
    NamespaceDef {
        namespace: "shobu",
        resources: [
            TestResource::Model(m_BettingPool::TEST_CLASS_HASH),
            TestResource::Model(m_Bet::TEST_CLASS_HASH),
            TestResource::Model(m_OddsSnapshot::TEST_CLASS_HASH),
            TestResource::Model(m_ProtocolConfig::TEST_CLASS_HASH),
            TestResource::Model(m_FeeVault::TEST_CLASS_HASH),
            TestResource::Model(m_PoolCounter::TEST_CLASS_HASH),
            TestResource::Model(m_PoolManager::TEST_CLASS_HASH),
            TestResource::Model(m_DenshokanConfig::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_created::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_bet_placed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_settled_event::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_winnings_claimed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_cancelled_event::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_protocol_fee_configured::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_protocol_fee_claimed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_denshokan_configured::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_manager_updated::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_egs_pool_created::TEST_CLASS_HASH),
            TestResource::Contract(Escrow::TEST_CLASS_HASH),
        ].span(),
    }
}

fn contract_defs() -> Span<dojo_cairo_test::ContractDef> {
    [
        ContractDefTrait::new(@"shobu", @"Escrow")
            .with_writer_of([dojo::utils::bytearray_hash(@"shobu")].span())
            .with_init_calldata([].span())
    ].span()
}

// ---------------------------------------------------------------------------
// Model registration smoke tests
// ---------------------------------------------------------------------------

#[test]
fn test_model_registration() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

    world.write_model_test(@PoolCounter { id: 1_u8, count: 0_u32 });
    let counter: PoolCounter = world.read_model(1_u8);
    assert!(counter.count == 0_u32, "Counter should be 0");
}

#[test]
fn test_protocol_config_model() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

    let admin: starknet::ContractAddress = 0x1234.try_into().unwrap();
    let fee_recipient: starknet::ContractAddress = 0x5678.try_into().unwrap();

    world.write_model_test(
        @ProtocolConfig {
            id: 1_u8,
            fee_bps: 250_u16,
            fee_recipient,
            admin,
            paused: false,
        },
    );

    let config: ProtocolConfig = world.read_model(1_u8);
    assert!(config.fee_bps == 250_u16, "Fee should be 250 bps");
    assert!(config.admin == admin, "Admin mismatch");
    assert!(!config.paused, "Should not be paused");
}

#[test]
fn test_betting_pool_model() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

    let zero: starknet::ContractAddress = 0.try_into().unwrap();
    let game_world: starknet::ContractAddress = 0xABCD.try_into().unwrap();
    let token: starknet::ContractAddress = 0xEEEE.try_into().unwrap();
    let creator: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x3333.try_into().unwrap();

    world.write_model_test(
        @BettingPool {
            pool_id: 1_u32,
            game_world,
            game_id: 42_u32,
            token,
            status: 0_u8,
            settlement_mode: 0_u8,
            egs_token_id_p1: 0,
            egs_token_id_p2: 0,
            total_pot: 0_u128,
            total_on_p1: 0_u128,
            total_on_p2: 0_u128,
            bettor_count_p1: 0_u32,
            bettor_count_p2: 0_u32,
            winning_player: zero,
            winning_total: 0_u128,
            distributable_amount: 0_u128,
            claimed_amount: 0_u128,
            claimed_winner_count: 0_u32,
            protocol_fee_amount: 0_u128,
            creator,
            deadline: 999_u64,
            player_1: p1,
            player_2: p2,
        },
    );

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.game_id == 42_u32, "Game ID mismatch");
    assert!(pool.token == token, "Token mismatch");
    assert!(pool.player_1 == p1, "Player 1 mismatch");
    assert!(pool.player_2 == p2, "Player 2 mismatch");
    assert!(pool.status == 0_u8, "Should be open");
}

#[test]
fn test_bet_model() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    let winner: starknet::ContractAddress = 0xCAFE.try_into().unwrap();

    world.write_model_test(
        @Bet {
            pool_id: 1_u32,
            bettor,
            predicted_winner: winner,
            amount: 1000_u128,
            claimed: false,
            placed_at: 100_u64,
        },
    );

    let bet: Bet = world.read_model((1_u32, bettor));
    assert!(bet.amount == 1000_u128, "Amount mismatch");
    assert!(bet.predicted_winner == winner, "Winner mismatch");
    assert!(!bet.claimed, "Should not be claimed");
}

#[test]
fn test_odds_snapshot_model() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

    world.write_model_test(
        @OddsSnapshot {
            pool_id: 1_u32,
            implied_prob_p1: 7000_u128,
            implied_prob_p2: 3000_u128,
            last_updated: 500_u64,
        },
    );

    let snapshot: OddsSnapshot = world.read_model(1_u32);
    assert!(snapshot.implied_prob_p1 == 7000_u128, "P1 odds mismatch");
    assert!(snapshot.implied_prob_p2 == 3000_u128, "P2 odds mismatch");
}

#[test]
fn test_fee_vault_accumulation() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

    let token: starknet::ContractAddress = 0xEEEE.try_into().unwrap();

    world.write_model_test(@FeeVault { token, accumulated: 0_u128 });
    let vault: FeeVault = world.read_model(token);
    assert!(vault.accumulated == 0_u128, "Should start at 0");

    world.write_model_test(@FeeVault { token, accumulated: 250_u128 });
    let vault2: FeeVault = world.read_model(token);
    assert!(vault2.accumulated == 250_u128, "Should be 250");
}

// ---------------------------------------------------------------------------
// Contract initialization test
// ---------------------------------------------------------------------------

#[test]
fn test_escrow_initialization() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    // After dojo_init, ProtocolConfig and PoolCounter should be set
    let config: ProtocolConfig = world.read_model(1_u8);
    assert!(config.fee_bps == 250_u16, "Default fee should be 250 bps");
    assert!(!config.paused, "Should not be paused");

    let counter: PoolCounter = world.read_model(1_u8);
    assert!(counter.count == 0_u32, "Counter should start at 0");
}
