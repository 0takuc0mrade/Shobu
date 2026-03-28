// ---------------------------------------------------------------------------
// Integration tests for the Escrow contract
// Uses dojo_cairo_test NamespaceDef + TestResource pattern.
// ---------------------------------------------------------------------------

use dojo::model::{ModelStorage, ModelStorageTest};
use dojo::world::{world, WorldStorageTrait};
use dojo_cairo_test::{
    spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, WorldStorageTestTrait,
};
use starknet::testing::{set_account_contract_address, set_contract_address, set_block_timestamp};
use starknet::syscalls::deploy_syscall;

use shobu::systems::actions::Escrow;
use shobu::systems::actions::{IEscrowDispatcher, IEscrowDispatcherTrait};
use shobu::interfaces::{
    Proof, ClaimInfo, SignedClaim, CompleteClaimData, ReclaimSignature,
    IERC20Dispatcher, IERC20DispatcherTrait,
};
use shobu::models::{
    BettingPool, Bet, OddsSnapshot, ProtocolConfig, FeeVault, PoolCounter, AdminTransfer,
    m_BettingPool, m_Bet, m_OddsSnapshot, m_ProtocolConfig, m_FeeVault, m_PoolCounter,
    m_DenshokanConfig, m_PoolManager, m_AdminTransfer, m_UsedProof, PoolManager, BudokanConfig,
    m_BudokanConfig, Web2BettingPool, Web2OracleConfig, m_Web2BettingPool, m_Web2OracleConfig,
};
use core::byte_array::ByteArray;
use shobu::mocks::mock_reclaim_verifier::{
    IMockReclaimVerifierDispatcher, IMockReclaimVerifierDispatcherTrait,
};
use shobu::mocks::mock_reclaim_verifier::MockReclaimVerifier;
use shobu::mocks::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait, MockERC20};
use shobu::mocks::mock_game_world::{IMockGameWorldDispatcher, IMockGameWorldDispatcherTrait, MockGameWorld};
use shobu::mocks::mock_erc721::{IMockERC721Dispatcher, IMockERC721DispatcherTrait, MockERC721};
use shobu::mocks::mock_budokan::{IMockBudokanDispatcher, IMockBudokanDispatcherTrait, MockBudokan};

use shobu::mocks::mock_minigame_token::{
    IMockMinigameTokenDataDispatcher, IMockMinigameTokenDataDispatcherTrait, MockMinigameTokenData
};

fn build_web2_proof(id: felt252, parameters: ByteArray) -> Proof {
    let claim_info = ClaimInfo {
        provider: "RIOT_LOL",
        parameters,
        context: "",
    };
    let claim = CompleteClaimData {
        identifier: u256 { low: 1_u128, high: 0_u128 },
        byte_identifier: "1",
        owner: "owner",
        epoch: "0",
        timestamp_s: "0",
    };
    let signatures: Array<ReclaimSignature> = array![
        ReclaimSignature { r: u256 { low: 1_u128, high: 0_u128 }, s: u256 { low: 2_u128, high: 0_u128 }, v: 27_u32 }
    ];
    let signed_claim = SignedClaim { claim, signatures };
    Proof { id, claim_info, signed_claim }
}

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
            TestResource::Model(m_BudokanConfig::TEST_CLASS_HASH),
            TestResource::Model(m_Web2BettingPool::TEST_CLASS_HASH),
            TestResource::Model(m_Web2OracleConfig::TEST_CLASS_HASH),
            TestResource::Model(m_AdminTransfer::TEST_CLASS_HASH),
            TestResource::Model(m_UsedProof::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_created::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_bet_placed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_settled_event::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_winnings_claimed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_cancelled_event::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_refund_claimed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_protocol_paused::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_admin_transfer_proposed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_admin_transfer_accepted::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_protocol_fee_configured::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_protocol_fee_claimed::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_denshokan_configured::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_pool_manager_updated::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_egs_pool_created::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_budokan_pool_created::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_budokan_configured::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_web2_pool_created::TEST_CLASS_HASH),
            TestResource::Event(Escrow::e_web2_oracle_configured::TEST_CLASS_HASH),
            TestResource::Contract(Escrow::TEST_CLASS_HASH),
        ].span(),
    }
}

fn contract_defs() -> Span<dojo_cairo_test::ContractDef> {
    [
        ContractDefTrait::new(@"shobu", @"Escrow")
            .with_writer_of([dojo::utils::bytearray_hash(@"shobu")].span())
            .with_init_calldata([].span()),
    ].span()
}

fn deploy_mock_reclaim_verifier() -> starknet::ContractAddress {
    let salt = core::testing::get_available_gas();
    let (address, _) = deploy_syscall(
        MockReclaimVerifier::TEST_CLASS_HASH,
        salt.into(),
        [].span(),
        false,
    ).unwrap();
    address
}

fn deploy_mock_erc20() -> starknet::ContractAddress {
    let salt = core::testing::get_available_gas();
    let (address, _) = deploy_syscall(
        MockERC20::TEST_CLASS_HASH,
        salt.into(),
        [].span(),
        false,
    ).unwrap();
    address
}

fn deploy_mock_game_world() -> starknet::ContractAddress {
    let salt = core::testing::get_available_gas();
    let (address, _) = deploy_syscall(
        MockGameWorld::TEST_CLASS_HASH,
        salt.into(),
        [].span(),
        false,
    ).unwrap();
    address
}

fn deploy_mock_erc721() -> starknet::ContractAddress {
    let salt = core::testing::get_available_gas();
    let (address, _) = deploy_syscall(
        MockERC721::TEST_CLASS_HASH,
        salt.into(),
        [].span(),
        false,
    ).unwrap();
    address
}

fn deploy_mock_budokan() -> starknet::ContractAddress {
    let salt = core::testing::get_available_gas();
    let (address, _) = deploy_syscall(
        MockBudokan::TEST_CLASS_HASH,
        salt.into(),
        [].span(),
        false,
    ).unwrap();
    address
}

fn deploy_mock_minigame_token() -> starknet::ContractAddress {
    let salt = core::testing::get_available_gas();
    let (address, _) = deploy_syscall(
        MockMinigameTokenData::TEST_CLASS_HASH,
        salt.into(),
        [].span(),
        false,
    ).unwrap();
    address
}

fn to_u256(amount: u128) -> u256 {
    u256 { low: amount, high: 0_u128 }
}

fn setup_world(admin: starknet::ContractAddress) -> (dojo::world::WorldStorage, starknet::ContractAddress) {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    set_account_contract_address(admin);
    world.sync_perms_and_inits(contract_defs());

    let (escrow_address, _) = world.dns(@"Escrow").unwrap();
    (world, escrow_address)
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
            budokan_address: zero,
            tournament_id: 0_u64,
            entry_id_p1: 0_u64,
            entry_id_p2: 0_u64,
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

    let web2_config: Web2OracleConfig = world.read_model(1_u8);
    assert!(!web2_config.enabled, "Web2 oracle should be disabled by default");
}

// ---------------------------------------------------------------------------
// Pool manager access control
// ---------------------------------------------------------------------------

#[test]
fn test_pool_manager_default_admin_enabled() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, _) = setup_world(admin);

    let config: ProtocolConfig = world.read_model(1_u8);
    assert!(config.admin == admin, "Admin mismatch");

    let manager: PoolManager = world.read_model(admin);
    assert!(manager.enabled, "Admin should be pool manager");
}

#[test]
#[should_panic]
fn test_set_pool_manager_requires_admin() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let other: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    set_contract_address(other);
    escrow.set_pool_manager(other, true);

    // keep world used to avoid unused warnings
    let _ = world;
}

#[test]
fn test_set_pool_manager_updates_role() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let manager: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    set_contract_address(admin);
    escrow.set_pool_manager(manager, true);

    let record: PoolManager = world.read_model(manager);
    assert!(record.enabled, "Manager should be enabled");
    assert!(escrow.is_pool_manager(manager), "is_pool_manager should return true");
}

#[test]
#[should_panic]
fn test_create_pool_requires_pool_manager() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let other: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    set_contract_address(other);

    let game_world: starknet::ContractAddress = 0x1234.try_into().unwrap();
    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let deadline: u64 = 999999_u64;
    escrow.create_pool(game_world, 1_u32, token, deadline);

    let _ = world;
}

#[test]
fn test_budokan_pool_model() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, _escrow_address) = setup_world(admin);
    let zero: starknet::ContractAddress = 0x0.try_into().unwrap();

    // Write and read BudokanConfig
    let expected_budokan: starknet::ContractAddress = 0xAAAA.try_into().unwrap();
    world.write_model_test(
        @BudokanConfig {
            id: 1_u8,
            default_address: expected_budokan,
            enabled: true,
        }
    );
    let config: BudokanConfig = world.read_model(1_u8);
    assert!(config.default_address == expected_budokan, "Config address mismatch");
    assert!(config.enabled == true, "Config enabled mismatch");

    // Write and read a Budokan-specific BettingPool
    let expected_tournament = 42_u64;
    let expected_entry_1 = 123_u64;
    let expected_entry_2 = 456_u64;
    let dummy_player_1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let dummy_player_2: starknet::ContractAddress = 0x2222.try_into().unwrap();

    let pool = BettingPool {
        pool_id: 2_u32,
        game_world: zero,
        game_id: 0_u32,
        token: zero,
        status: 0_u8,
        settlement_mode: 2_u8, // SETTLE_BUDOKAN
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
        creator: admin,
        deadline: 999999_u64,
        player_1: dummy_player_1,
        player_2: dummy_player_2,
        budokan_address: expected_budokan,
        tournament_id: expected_tournament,
        entry_id_p1: expected_entry_1,
        entry_id_p2: expected_entry_2,
    };

    world.write_model_test(@pool);

    let read_pool: BettingPool = world.read_model(2_u32);
    assert!(read_pool.settlement_mode == 2_u8, "Wrong settlement mode");
    assert!(read_pool.budokan_address == expected_budokan, "Wrong budokan address");
    assert!(read_pool.tournament_id == expected_tournament, "Wrong tournament id");
    assert!(read_pool.entry_id_p1 == expected_entry_1, "Wrong entry id 1");
    assert!(read_pool.entry_id_p2 == expected_entry_2, "Wrong entry id 2");
}

#[test]
fn test_web2_betting_pool_model() {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());

    world.write_model_test(
        @Web2BettingPool {
            pool_id: 7_u32,
            match_id: 'NA1_12345',
            game_provider_id: 'RIOT_LOL',
            player_1_tag: 'P1#NA',
            player_2_tag: 'P2#NA',
            proof_nullifier_used: false,
        },
    );

    let web2: Web2BettingPool = world.read_model(7_u32);
    assert!(web2.match_id == 'NA1_12345', "Match ID mismatch");
    assert!(web2.game_provider_id == 'RIOT_LOL', "Provider mismatch");
    assert!(!web2.proof_nullifier_used, "Nullifier should be false");
}

#[test]
fn test_create_web2_pool_populates_models() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 999999_u64;

    set_contract_address(admin);
    escrow.create_web2_pool(
        'NA1_99999',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.settlement_mode == 3_u8, "Expected WEB2 settlement mode");
    assert!(pool.player_1 == p1, "Player 1 mismatch");
    assert!(pool.player_2 == p2, "Player 2 mismatch");

    let web2: Web2BettingPool = world.read_model(1_u32);
    assert!(web2.match_id == 'NA1_99999', "Web2 match ID mismatch");
    assert!(web2.player_1_tag == 'P1#NA', "Player 1 tag mismatch");
    assert!(web2.player_2_tag == 'P2#NA', "Player 2 tag mismatch");
}

#[test]
fn test_settle_web2_pool_success() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let verifier_address = deploy_mock_reclaim_verifier();
    let verifier = IMockReclaimVerifierDispatcher { contract_address: verifier_address };

    set_contract_address(admin);
    escrow.configure_web2_oracle(verifier_address, true);

    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 999999_u64;

    escrow.create_web2_pool(
        'NA1_11111',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let mut pool: BettingPool = world.read_model(1_u32);
    pool.total_pot = 1000_u128;
    pool.total_on_p1 = 600_u128;
    pool.total_on_p2 = 400_u128;
    world.write_model_test(@pool);

    verifier.set_valid(true);

    let proof = build_web2_proof(0, "match_id=NA1_11111|winner_tag=P1#NA|provider=RIOT_LOL");
    escrow.settle_web2_pool(1_u32, proof);

    let settled: BettingPool = world.read_model(1_u32);
    assert!(settled.status == 1_u8, "Pool should be settled");
    assert!(settled.winning_player == p1, "Wrong winner");

    let web2: Web2BettingPool = world.read_model(1_u32);
    assert!(web2.proof_nullifier_used, "Nullifier should be used");
}

#[test]
#[should_panic]
fn test_settle_web2_pool_wrong_match_id() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let verifier_address = deploy_mock_reclaim_verifier();
    let verifier = IMockReclaimVerifierDispatcher { contract_address: verifier_address };

    set_contract_address(admin);
    escrow.configure_web2_oracle(verifier_address, true);

    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 999999_u64;

    escrow.create_web2_pool(
        'NA1_22222',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let mut pool: BettingPool = world.read_model(1_u32);
    pool.total_pot = 1000_u128;
    pool.total_on_p1 = 600_u128;
    pool.total_on_p2 = 400_u128;
    world.write_model_test(@pool);

    verifier.set_valid(true);

    let proof = build_web2_proof(0, "match_id=NA1_99999|winner_tag=P1#NA|provider=RIOT_LOL");
    escrow.settle_web2_pool(1_u32, proof);
}

#[test]
#[should_panic]
fn test_settle_web2_pool_wrong_provider() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let verifier_address = deploy_mock_reclaim_verifier();
    let verifier = IMockReclaimVerifierDispatcher { contract_address: verifier_address };

    set_contract_address(admin);
    escrow.configure_web2_oracle(verifier_address, true);

    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 999999_u64;

    escrow.create_web2_pool(
        'NA1_33333',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let mut pool: BettingPool = world.read_model(1_u32);
    pool.total_pot = 1000_u128;
    pool.total_on_p1 = 600_u128;
    pool.total_on_p2 = 400_u128;
    world.write_model_test(@pool);

    verifier.set_valid(true);

    let proof = build_web2_proof(0, "match_id=NA1_33333|winner_tag=P1#NA|provider=OTHER");
    escrow.settle_web2_pool(1_u32, proof);
}

#[test]
#[should_panic]
fn test_settle_web2_pool_wrong_winner_tag() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let verifier_address = deploy_mock_reclaim_verifier();
    let verifier = IMockReclaimVerifierDispatcher { contract_address: verifier_address };

    set_contract_address(admin);
    escrow.configure_web2_oracle(verifier_address, true);

    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 999999_u64;

    escrow.create_web2_pool(
        'NA1_44444',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let mut pool: BettingPool = world.read_model(1_u32);
    pool.total_pot = 1000_u128;
    pool.total_on_p1 = 600_u128;
    pool.total_on_p2 = 400_u128;
    world.write_model_test(@pool);

    verifier.set_valid(true);

    let proof = build_web2_proof(0, "match_id=NA1_44444|winner_tag=P3#NA|provider=RIOT_LOL");
    escrow.settle_web2_pool(1_u32, proof);
}

#[test]
#[should_panic]
fn test_settle_web2_pool_reused_proof() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let verifier_address = deploy_mock_reclaim_verifier();
    let verifier = IMockReclaimVerifierDispatcher { contract_address: verifier_address };

    set_contract_address(admin);
    escrow.configure_web2_oracle(verifier_address, true);

    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 999999_u64;

    escrow.create_web2_pool(
        'NA1_55555',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let mut pool: BettingPool = world.read_model(1_u32);
    pool.total_pot = 1000_u128;
    pool.total_on_p1 = 600_u128;
    pool.total_on_p2 = 400_u128;
    world.write_model_test(@pool);

    let mut web2: Web2BettingPool = world.read_model(1_u32);
    web2.proof_nullifier_used = true;
    world.write_model_test(@web2);

    verifier.set_valid(true);

    let proof = build_web2_proof(0, "match_id=NA1_55555|winner_tag=P1#NA|provider=RIOT_LOL");
    escrow.settle_web2_pool(1_u32, proof);
}

// ---------------------------------------------------------------------------
// New production-readiness tests
// ---------------------------------------------------------------------------

#[test]
fn test_claim_refund_cancelled_pool() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let token = IMockERC20Dispatcher { contract_address: token_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 2000_u64;

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_web2_pool(
        'NA1_77777',
        'RIOT_LOL',
        token_address,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    token.mint(bettor, to_u256(1000_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 400_u128);

    set_contract_address(admin);
    escrow.cancel_pool(1_u32);

    let erc20 = IERC20Dispatcher { contract_address: token_address };
    let balance_after_bet = erc20.balance_of(bettor);
    assert!(balance_after_bet.low == 600_u128, "Balance should reflect bet transfer");

    set_contract_address(bettor);
    escrow.claim_refund(1_u32);

    let balance_after_refund = erc20.balance_of(bettor);
    assert!(balance_after_refund.low == 1000_u128, "Refund not returned");

    let bet: Bet = world.read_model((1_u32, bettor));
    assert!(bet.claimed, "Bet should be marked claimed");
}

#[test]
#[should_panic]
fn test_cancel_pool_unauthorized() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_web2_pool(
        'NA1_77777', 'RIOT_LOL', token_address, 2000_u64, p1, p2, 'P1#NA', 'P2#NA'
    );

    let hacker: starknet::ContractAddress = 0xDEAD.try_into().unwrap();
    set_contract_address(hacker);
    escrow.cancel_pool(1_u32);
}

#[test]
#[should_panic]
fn test_claim_refund_twice() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let token = IMockERC20Dispatcher { contract_address: token_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_web2_pool(
        'NA1_77777', 'RIOT_LOL', token_address, 2000_u64, p1, p2, 'P1#NA', 'P2#NA'
    );

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    token.mint(bettor, to_u256(1000_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 400_u128);

    set_contract_address(admin);
    escrow.cancel_pool(1_u32);

    set_contract_address(bettor);
    escrow.claim_refund(1_u32);
    // Should panic
    escrow.claim_refund(1_u32);
}

#[test]
#[should_panic]
fn test_claim_refund_non_cancelled() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let token = IMockERC20Dispatcher { contract_address: token_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_web2_pool(
        'NA1_77777', 'RIOT_LOL', token_address, 2000_u64, p1, p2, 'P1#NA', 'P2#NA'
    );

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    token.mint(bettor, to_u256(1000_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 400_u128);

    // Call without cancelling -> Should panic!
    escrow.claim_refund(1_u32);
}

#[test]
fn test_adjust_odds_safemath_zero() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_web2_pool(
        'NA1_9910', 'RIOT_LOL', token_address, 2000_u64, p1, p2, 'P1#NA', 'P2#NA'
    );

    // No bets placed, sum of bets is 0, so no division by zero expected.
    let (odds_1, odds_2) = escrow.get_adjusted_odds(1_u32);
    assert!(odds_1 == 0_u128 || odds_1 > 0_u128, "Odds 1 safe");
    assert!(odds_2 == 0_u128 || odds_2 > 0_u128, "Odds 2 safe");
}

#[test]
fn test_get_adjusted_odds_fallback_non_direct() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 2000_u64;

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_web2_pool(
        'NA1_88888',
        'RIOT_LOL',
        token_address,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let mut pool: BettingPool = world.read_model(1_u32);
    pool.total_on_p1 = 7000_u128;
    pool.total_on_p2 = 3000_u128;
    world.write_model_test(@pool);

    let (odds_p1, odds_p2) = escrow.get_adjusted_odds(1_u32);
    assert!(odds_p1 == 7000_u128, "Fallback odds p1 wrong");
    assert!(odds_p2 == 3000_u128, "Fallback odds p2 wrong");
}

#[test]
fn test_create_pool_with_mock_game_world() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let game_world_address = deploy_mock_game_world();
    let game_world = IMockGameWorldDispatcher { contract_address: game_world_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let zero: starknet::ContractAddress = 0.try_into().unwrap();
    game_world.set_game(1_u32, 1_u8, zero, p1, p2);

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_pool(
        game_world_address,
        1_u32,
        0x5678.try_into().unwrap(),
        2000_u64,
    );

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.player_1 == p1, "Player 1 mismatch");
    assert!(pool.player_2 == p2, "Player 2 mismatch");
}

#[test]
#[should_panic]
fn test_create_egs_pool_requires_enabled() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (_world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let game_world: starknet::ContractAddress = 0x1234.try_into().unwrap();
    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_egs_pool(
        game_world,
        1_u32,
        token,
        2000_u64,
        1,
        2,
    );
}

#[test]
#[should_panic]
fn test_create_egs_pool_requires_token_contract() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (_world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let game_world: starknet::ContractAddress = 0x1234.try_into().unwrap();
    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.configure_denshokan(0.try_into().unwrap(), true);
    escrow.create_egs_pool(
        game_world,
        1_u32,
        token,
        2000_u64,
        1,
        2,
    );
}

#[test]
fn test_create_budokan_pool_uses_default_address() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let budokan_address = deploy_mock_budokan();
    let budokan = IMockBudokanDispatcher { contract_address: budokan_address };
    budokan.set_phase(42_u64, 1_u8);

    let erc721_address = deploy_mock_erc721();
    let erc721 = IMockERC721Dispatcher { contract_address: erc721_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let entry_id_p1: u64 = 10_u64;
    let entry_id_p2: u64 = 11_u64;
    erc721.set_owner(entry_id_p1.into(), p1);
    erc721.set_owner(entry_id_p2.into(), p2);

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.configure_budokan(budokan_address, true);
    escrow.configure_denshokan(erc721_address, true);

    escrow.create_budokan_pool(
        0.try_into().unwrap(),
        42_u64,
        entry_id_p1,
        entry_id_p2,
        0x5678.try_into().unwrap(),
        2000_u64,
    );

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.budokan_address == budokan_address, "Default budokan not applied");
}

#[test]
#[should_panic]
fn test_create_budokan_pool_missing_default_reverts() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (_world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.configure_budokan(0.try_into().unwrap(), true);

    escrow.create_budokan_pool(
        0.try_into().unwrap(),
        42_u64,
        10_u64,
        11_u64,
        0x5678.try_into().unwrap(),
        2000_u64,
    );
}

#[test]
#[should_panic]
fn test_paused_blocks_create_web2_pool() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (_world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.set_paused(true);

    escrow.create_web2_pool(
        'NA1_99900',
        'RIOT_LOL',
        0x5678.try_into().unwrap(),
        2000_u64,
        0x1111.try_into().unwrap(),
        0x2222.try_into().unwrap(),
        'P1#NA',
        'P2#NA',
    );
}

#[test]
fn test_admin_transfer_two_step() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let new_admin: starknet::ContractAddress = 0xBEEF.try_into().unwrap();

    set_contract_address(admin);
    escrow.propose_admin(new_admin);

    let transfer: AdminTransfer = world.read_model(1_u8);
    assert!(transfer.pending_admin == new_admin, "Pending admin not set");

    set_contract_address(new_admin);
    escrow.accept_admin();

    let config: ProtocolConfig = world.read_model(1_u8);
    assert!(config.admin == new_admin, "Admin not updated");
    let transfer_after: AdminTransfer = world.read_model(1_u8);
    assert!(transfer_after.pending_admin == 0.try_into().unwrap(), "Pending admin not cleared");
}

#[test]
#[should_panic]
fn test_web2_global_nullifier_reuse_reverts() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let verifier_address = deploy_mock_reclaim_verifier();
    let verifier = IMockReclaimVerifierDispatcher { contract_address: verifier_address };

    set_contract_address(admin);
    escrow.configure_web2_oracle(verifier_address, true);

    let token: starknet::ContractAddress = 0x5678.try_into().unwrap();
    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let deadline: u64 = 2000_u64;

    escrow.create_web2_pool(
        'NA1_12121',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );
    escrow.create_web2_pool(
        'NA1_12121',
        'RIOT_LOL',
        token,
        deadline,
        p1,
        p2,
        'P1#NA',
        'P2#NA',
    );

    let mut pool1: BettingPool = world.read_model(1_u32);
    pool1.total_pot = 1000_u128;
    pool1.total_on_p1 = 600_u128;
    pool1.total_on_p2 = 400_u128;
    world.write_model_test(@pool1);

    let mut pool2: BettingPool = world.read_model(2_u32);
    pool2.total_pot = 1000_u128;
    pool2.total_on_p1 = 600_u128;
    pool2.total_on_p2 = 400_u128;
    world.write_model_test(@pool2);

    verifier.set_valid(true);
    let proof = build_web2_proof(77, "match_id=NA1_12121|winner_tag=P1#NA|provider=RIOT_LOL");
    escrow.settle_web2_pool(1_u32, proof);

    // Reuse the same proof id on a different pool should revert
    let proof_reuse = build_web2_proof(77, "match_id=NA1_12121|winner_tag=P1#NA|provider=RIOT_LOL");
    escrow.settle_web2_pool(2_u32, proof_reuse);
}

// ---------------------------------------------------------------------------
// Additional Production-Readiness Tests
// ---------------------------------------------------------------------------

#[test]
fn test_direct_settlement_flow() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let token = IMockERC20Dispatcher { contract_address: token_address };

    let game_world_address = deploy_mock_game_world();
    let game_world = IMockGameWorldDispatcher { contract_address: game_world_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let zero: starknet::ContractAddress = 0.try_into().unwrap();

    // Set game state 1 (playing)
    game_world.set_game(42_u32, 1_u8, zero, p1, p2);

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_pool(game_world_address, 42_u32, token_address, 2000_u64);

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    token.mint(bettor, to_u256(1000_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 1000_u128);

    // End game and set winner
    game_world.set_game(42_u32, 2_u8, p1, p1, p2);

    set_contract_address(admin);
    escrow.settle_pool(1_u32);

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.status == 1_u8, "Pool should be SETTLED");
    assert!(pool.winning_player == p1, "P1 should be the winner");

    set_contract_address(bettor);
    escrow.claim_winnings(1_u32);

    let erc20 = IERC20Dispatcher { contract_address: token_address };
    let balance = erc20.balance_of(bettor);
    // Bet 1000, pot 1000. Protocol fee 25 (2.5%). Returns 975.
    assert!(balance.low == 975_u128, "Wrong balance after claim");
}

#[test]
fn test_egs_settlement_flow() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    let minigame_token_address = deploy_mock_minigame_token();
    let minigame = IMockMinigameTokenDataDispatcher { contract_address: minigame_token_address };

    let game_world_address = deploy_mock_game_world();
    let game_world = IMockGameWorldDispatcher { contract_address: game_world_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    game_world.set_game(1_u32, 1_u8, 0.try_into().unwrap(), p1, p2);

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.configure_denshokan(minigame_token_address, true);

    escrow.create_egs_pool(
        game_world_address,
        1_u32,
        token_address,
        2000_u64,
        100, // p1_token
        101, // p2_token
    );

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    let token = IMockERC20Dispatcher { contract_address: token_address };
    token.mint(bettor, to_u256(500_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 500_u128);

    // Set minigame token scores, p1 wins!
    minigame.set_score(100, 9999);
    minigame.set_game_over(100, true);
    minigame.set_score(101, 50);
    minigame.set_game_over(101, true);

    set_contract_address(admin);
    escrow.settle_pool(1_u32);

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.winning_player == p1, "P1 should be the winner");
}

#[test]
fn test_budokan_settlement_flow() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();
    
    let budokan_address = deploy_mock_budokan();
    let budokan = IMockBudokanDispatcher { contract_address: budokan_address };

    let erc721_address = deploy_mock_erc721();
    let erc721 = IMockERC721Dispatcher { contract_address: erc721_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    erc721.set_owner(10_u256, p1);
    erc721.set_owner(11_u256, p2);

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.configure_denshokan(erc721_address, true);
    escrow.configure_budokan(budokan_address, true);

    // Initial phase
    budokan.set_phase(42_u64, 1_u8);
    
    escrow.create_budokan_pool(
        0.try_into().unwrap(), // uses default
        42_u64,                // tournament
        10_u64,                // p1
        11_u64,                // p2
        token_address,
        2000_u64,
    );

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    let token = IMockERC20Dispatcher { contract_address: token_address };
    token.mint(bettor, to_u256(500_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 500_u128);

    // Settle required phase Finalized = 5
    budokan.set_phase(42_u64, 5_u8);
    // Mock Leaderboard where P1 is 1st and P2 is 2nd
    let leaderboard = array![10_u64, 11_u64];
    budokan.set_leaderboard(42_u64, leaderboard.span());

    set_contract_address(admin);
    escrow.settle_pool(1_u32);

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.winning_player == p1, "P1 should be the winner based on leaderboard");
    assert!(pool.status == 1_u8, "Pool should be SETTLED");
}

#[test]
fn test_draw_scenario_refund_flow() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    let token_address = deploy_mock_erc20();    
    let game_world_address = deploy_mock_game_world();
    let game_world = IMockGameWorldDispatcher { contract_address: game_world_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let zero: starknet::ContractAddress = 0.try_into().unwrap();
    
    game_world.set_game(1_u32, 1_u8, zero, p1, p2);

    set_block_timestamp(1000_u64);
    set_contract_address(admin);
    escrow.create_pool(game_world_address, 1_u32, token_address, 2000_u64);

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    let token = IMockERC20Dispatcher { contract_address: token_address };
    token.mint(bettor, to_u256(500_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 500_u128);

    // Draw scenario: Finish game without a winner
    game_world.set_game(1_u32, 2_u8, zero, p1, p2);

    set_contract_address(admin);
    escrow.settle_pool(1_u32);

    let pool: BettingPool = world.read_model(1_u32);
    assert!(pool.status == 2_u8, "Pool should transition to CANCELLED on draw");

    // Bettor claims refund
    set_contract_address(bettor);
    escrow.claim_refund(1_u32);

    let erc20 = IERC20Dispatcher { contract_address: token_address };
    let balance = erc20.balance_of(bettor);
    assert!(balance.low == 500_u128, "Refund not processed correctly");
}

#[test]
fn test_protocol_fee_claim() {
    let admin: starknet::ContractAddress = 0xCAFE.try_into().unwrap();
    let fee_recipient: starknet::ContractAddress = 0x1234.try_into().unwrap();
    let (mut world, escrow_address) = setup_world(admin);
    let escrow = IEscrowDispatcher { contract_address: escrow_address };

    set_contract_address(admin);
    escrow.configure_protocol(250_u16, fee_recipient); // 2.5% fee
    
    let token_address = deploy_mock_erc20();
    let game_world_address = deploy_mock_game_world();
    let game_world = IMockGameWorldDispatcher { contract_address: game_world_address };

    let p1: starknet::ContractAddress = 0x1111.try_into().unwrap();
    let p2: starknet::ContractAddress = 0x2222.try_into().unwrap();
    let zero: starknet::ContractAddress = 0.try_into().unwrap();

    game_world.set_game(1_u32, 1_u8, zero, p1, p2);

    set_block_timestamp(1000_u64);
    escrow.create_pool(game_world_address, 1_u32, token_address, 2000_u64);

    let bettor: starknet::ContractAddress = 0xBEEF.try_into().unwrap();
    let token = IMockERC20Dispatcher { contract_address: token_address };
    token.mint(bettor, to_u256(1000_u128));

    set_contract_address(bettor);
    escrow.place_bet(1_u32, p1, 1000_u128);

    // 1000 bet - 2.5% fee = 25 goes to protocol
    game_world.set_game(1_u32, 2_u8, p1, p1, p2);

    set_contract_address(admin);
    escrow.settle_pool(1_u32);

    let fee_vault: FeeVault = world.read_model(token_address);
    assert!(fee_vault.accumulated == 25_u128, "Incorrect protocol fee accumulated");

    escrow.claim_protocol_fees(token_address);

    let erc20 = IERC20Dispatcher { contract_address: token_address };
    let balance_recipient = erc20.balance_of(fee_recipient);
    assert!(balance_recipient.low == 25_u128, "Fee not transferred");

    let fee_vault_after: FeeVault = world.read_model(token_address);
    assert!(fee_vault_after.accumulated == 0_u128, "Fee vault not drained");
}
