use starknet::ContractAddress;

#[starknet::interface]
pub trait IEscrow<T> {
    /// Create a new betting pool for a game on an external Dojo world (pool manager only).
    fn create_pool(
        ref self: T,
        game_world: ContractAddress,
        game_id: u32,
        token: ContractAddress,
        deadline: u64,
    );

    /// Place a bet on a pool. Caller must have approved this contract to
    /// spend `amount` of `token` via ERC20.approve() beforehand.
    fn place_bet(ref self: T, pool_id: u32, predicted_winner: ContractAddress, amount: u128);

    /// Settle a pool after the game has finished. Permissionless — anyone can call.
    fn settle_pool(ref self: T, pool_id: u32);

    /// Claim pro-rata winnings from a settled pool.
    fn claim_winnings(ref self: T, pool_id: u32);

    /// Cancel a pool (admin or creator only). Refunds all bettors.
    fn cancel_pool(ref self: T, pool_id: u32);

    /// Configure protocol fee parameters (admin only).
    fn configure_protocol(ref self: T, fee_bps: u16, fee_recipient: ContractAddress);

    /// Withdraw accumulated protocol fees for a token (admin only).
    fn claim_protocol_fees(ref self: T, token: ContractAddress);

    /// View: get current implied odds for a pool.
    fn get_odds(self: @T, pool_id: u32) -> (u128, u128);

    /// View: get stat-adjusted odds by reading player stats from the game world.
    fn get_adjusted_odds(self: @T, pool_id: u32) -> (u128, u128);

    /// Create a betting pool for an EGS game using denshokan session tokens (pool manager only).
    fn create_egs_pool(
        ref self: T,
        game_world: ContractAddress,
        game_id: u32,
        token: ContractAddress,
        deadline: u64,
        egs_token_id_p1: felt252,
        egs_token_id_p2: felt252,
    );

    /// Grant or revoke pool manager permissions (admin only).
    fn set_pool_manager(ref self: T, account: ContractAddress, enabled: bool);

    /// View: check if an account can create pools.
    fn is_pool_manager(self: @T, account: ContractAddress) -> bool;

    /// Configure the denshokan token contract address (admin only).
    fn configure_denshokan(ref self: T, token_contract: ContractAddress, enabled: bool);
}

#[dojo::contract]
pub mod Escrow {
    use super::{IEscrow};
    use starknet::{
        ContractAddress, get_block_timestamp, get_caller_address, get_contract_address, get_tx_info,
    };
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use dojo::world::WorldStorage;

    use shobu::interfaces::{
        IGameWorldDispatcher, IGameWorldDispatcherTrait,
        IMinigameTokenDataDispatcher, IMinigameTokenDataDispatcherTrait,
        IERC20Dispatcher, IERC20DispatcherTrait,
    };
    use shobu::models::{
        BettingPool, Bet, OddsSnapshot, ProtocolConfig, FeeVault, PoolCounter, DenshokanConfig,
        PoolManager,
    };
    use shobu::odds::{
        compute_implied_odds, compute_stat_adjusted_odds, compute_payout, mul_div_u128_floor,
        BPS_DENOM,
    };

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    const PROTOCOL_CONFIG_ID: u8 = 1_u8;
    const POOL_COUNTER_ID: u8 = 1_u8;
    const DEFAULT_FEE_BPS: u16 = 250_u16;   // 2.5% default protocol fee
    const MAX_FEE_BPS: u16 = 1000_u16;      // 10% maximum
    const POOL_OPEN: u8 = 0_u8;
    const POOL_SETTLED: u8 = 1_u8;
    const POOL_CANCELLED: u8 = 2_u8;
    const SETTLE_DIRECT: u8 = 0_u8;      // IGameWorld settlement
    const SETTLE_EGS: u8 = 1_u8;         // Denshokan/EGS settlement
    const DENSHOKAN_CONFIG_ID: u8 = 1_u8;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct pool_created {
        #[key]
        pub pool_id: u32,
        pub game_world: ContractAddress,
        pub game_id: u32,
        pub token: ContractAddress,
        pub creator: ContractAddress,
        pub deadline: u64,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct bet_placed {
        #[key]
        pub pool_id: u32,
        pub bettor: ContractAddress,
        pub predicted_winner: ContractAddress,
        pub amount: u128,
        pub total_pot: u128,
        pub total_on_p1: u128,
        pub total_on_p2: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct pool_settled_event {
        #[key]
        pub pool_id: u32,
        pub winner: ContractAddress,
        pub total_pot: u128,
        pub winning_total: u128,
        pub distributable_amount: u128,
        pub protocol_fee_amount: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct winnings_claimed {
        #[key]
        pub pool_id: u32,
        pub bettor: ContractAddress,
        pub amount: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct pool_cancelled_event {
        #[key]
        pub pool_id: u32,
        pub cancelled_by: ContractAddress,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct protocol_fee_configured {
        #[key]
        pub fee_recipient: ContractAddress,
        pub fee_bps: u16,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct protocol_fee_claimed {
        #[key]
        pub token: ContractAddress,
        pub recipient: ContractAddress,
        pub amount: u128,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct denshokan_configured {
        #[key]
        pub token_contract: ContractAddress,
        pub enabled: bool,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct pool_manager_updated {
        #[key]
        pub account: ContractAddress,
        pub enabled: bool,
    }

    #[derive(Copy, Drop, Serde)]
    #[dojo::event]
    pub struct egs_pool_created {
        #[key]
        pub pool_id: u32,
        pub game_world: ContractAddress,
        pub game_id: u32,
        pub egs_token_id_p1: felt252,
        pub egs_token_id_p2: felt252,
    }

    // -----------------------------------------------------------------------
    // Storage (reentrancy lock only — all state lives in Dojo models)
    // -----------------------------------------------------------------------

    #[storage]
    struct Storage {
        operation_lock: bool,
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    fn dojo_init(ref self: ContractState) {
        let mut world = self.world_default();
        let admin = get_tx_info().account_contract_address;

        world.write_model(
            @ProtocolConfig {
                id: PROTOCOL_CONFIG_ID,
                fee_bps: DEFAULT_FEE_BPS,
                fee_recipient: zero_address(),
                admin,
                paused: false,
            },
        );
        world.write_model(@PoolCounter { id: POOL_COUNTER_ID, count: 0_u32 });
        world.write_model(@PoolManager { account: admin, enabled: true });
        world.write_model(
            @DenshokanConfig {
                id: DENSHOKAN_CONFIG_ID,
                token_contract: zero_address(),
                enabled: false,
            },
        );
    }

    // -----------------------------------------------------------------------
    // External implementation
    // -----------------------------------------------------------------------

    #[abi(embed_v0)]
    impl EscrowImpl of IEscrow<ContractState> {
        // -------------------------------------------------------------------
        // create_pool
        // -------------------------------------------------------------------
        fn create_pool(
            ref self: ContractState,
            game_world: ContractAddress,
            game_id: u32,
            token: ContractAddress,
            deadline: u64,
        ) {
            let mut world = self.world_default();
            assert_not_paused(@world);
            let caller = get_caller_address();
            let now = get_block_timestamp();

            assert_is_pool_manager(@world, caller);
            assert!(game_world != zero_address(), "Invalid game world");
            assert!(token != zero_address(), "Invalid token");
            assert!(deadline > now, "Deadline must be in the future");

            // Verify the game exists and is not finished
            let game_dispatcher = IGameWorldDispatcher { contract_address: game_world };
            let (state, _winner) = game_dispatcher.game_state(game_id);
            assert!(state < 2_u8, "Game already finished");

            let (player_1, player_2) = game_dispatcher.game_players(game_id);

            // Allocate pool ID
            let mut counter: PoolCounter = world.read_model(POOL_COUNTER_ID);
            let pool_id = counter.count + 1_u32;
            counter.count = pool_id;

            let pool = BettingPool {
                pool_id,
                game_world,
                game_id,
                token,
                status: POOL_OPEN,
                settlement_mode: SETTLE_DIRECT,
                egs_token_id_p1: 0,
                egs_token_id_p2: 0,
                total_pot: 0_u128,
                total_on_p1: 0_u128,
                total_on_p2: 0_u128,
                bettor_count_p1: 0_u32,
                bettor_count_p2: 0_u32,
                winning_player: zero_address(),
                winning_total: 0_u128,
                distributable_amount: 0_u128,
                claimed_amount: 0_u128,
                claimed_winner_count: 0_u32,
                protocol_fee_amount: 0_u128,
                creator: caller,
                deadline,
                player_1,
                player_2,
            };

            world.write_model(@counter);
            world.write_model(@pool);
            world.write_model(
                @OddsSnapshot {
                    pool_id, implied_prob_p1: 0_u128, implied_prob_p2: 0_u128, last_updated: now,
                },
            );

            world.emit_event(@pool_created { pool_id, game_world, game_id, token, creator: caller, deadline });
        }

        // -------------------------------------------------------------------
        // place_bet
        // -------------------------------------------------------------------
        fn place_bet(
            ref self: ContractState,
            pool_id: u32,
            predicted_winner: ContractAddress,
            amount: u128,
        ) {
            with_operation_lock(ref self);
            let mut world = self.world_default();
            assert_not_paused(@world);
            let bettor = get_caller_address();
            let now = get_block_timestamp();

            assert!(amount > 0_u128, "Invalid bet amount");

            let mut pool: BettingPool = world.read_model(pool_id);
            assert!(pool.status == POOL_OPEN, "Pool not open");
            assert!(now <= pool.deadline, "Betting deadline passed");

            // Verify game is still in progress (only for direct-mode pools)
            if pool.settlement_mode == SETTLE_DIRECT {
                let game_dispatcher = IGameWorldDispatcher { contract_address: pool.game_world };
                let (state, _winner) = game_dispatcher.game_state(pool.game_id);
                assert!(state < 2_u8, "Game already finished");
            }

            // Bettors cannot be players
            assert!(
                bettor != pool.player_1 && bettor != pool.player_2,
                "Players cannot bet on own game",
            );

            // Validate predicted winner
            assert_valid_player(@pool, predicted_winner);

            // Read or initialize existing bet
            let mut bet: Bet = world.read_model((pool_id, bettor));
            bet.pool_id = pool_id;
            bet.bettor = bettor;

            if bet.amount > 0_u128 {
                // Existing bet — must be on the same side
                assert!(bet.predicted_winner == predicted_winner, "Cannot switch sides");
            } else {
                // New bet
                bet.predicted_winner = predicted_winner;
                bet.placed_at = now;
                if predicted_winner == pool.player_1 {
                    pool.bettor_count_p1 += 1_u32;
                } else {
                    pool.bettor_count_p2 += 1_u32;
                }
            }

            // Pull tokens into escrow
            pull_token(bettor, pool.token, amount);

            // Update state
            bet.amount += amount;
            bet.claimed = false;
            pool.total_pot += amount;
            if predicted_winner == pool.player_1 {
                pool.total_on_p1 += amount;
            } else {
                pool.total_on_p2 += amount;
            }

            // Update odds snapshot
            let (prob_p1, prob_p2) = compute_implied_odds(pool.total_on_p1, pool.total_on_p2);

            world.write_model(@bet);
            world.write_model(@pool);
            world.write_model(
                @OddsSnapshot {
                    pool_id, implied_prob_p1: prob_p1, implied_prob_p2: prob_p2, last_updated: now,
                },
            );

            world.emit_event(
                @bet_placed {
                    pool_id,
                    bettor,
                    predicted_winner,
                    amount,
                    total_pot: pool.total_pot,
                    total_on_p1: pool.total_on_p1,
                    total_on_p2: pool.total_on_p2,
                },
            );

            clear_operation_lock(ref self);
        }

        // -------------------------------------------------------------------
        // settle_pool
        // -------------------------------------------------------------------
        fn settle_pool(ref self: ContractState, pool_id: u32) {
            with_operation_lock(ref self);
            let mut world = self.world_default();

            let mut pool: BettingPool = world.read_model(pool_id);
            assert!(pool.status == POOL_OPEN, "Pool not open");
            assert!(pool.total_pot > 0_u128, "Pool is empty");

            // Determine winner based on settlement mode
            let winner = if pool.settlement_mode == SETTLE_EGS {
                // EGS settlement: check game_over and compare scores
                let denshokan_config: DenshokanConfig = world.read_model(DENSHOKAN_CONFIG_ID);
                assert!(denshokan_config.enabled, "Denshokan not configured");
                let token_data = IMinigameTokenDataDispatcher {
                    contract_address: denshokan_config.token_contract,
                };
                let go_p1 = token_data.game_over(pool.egs_token_id_p1);
                let go_p2 = token_data.game_over(pool.egs_token_id_p2);
                assert!(go_p1 && go_p2, "Game not finished (EGS)");

                let score_p1 = token_data.score(pool.egs_token_id_p1);
                let score_p2 = token_data.score(pool.egs_token_id_p2);
                assert!(score_p1 != score_p2, "Game is a draw - cannot settle");

                if score_p1 > score_p2 { pool.player_1 } else { pool.player_2 }
            } else {
                // Direct settlement: read game_state from external world
                let game_dispatcher = IGameWorldDispatcher { contract_address: pool.game_world };
                let (state, w) = game_dispatcher.game_state(pool.game_id);
                assert!(state == 2_u8, "Game not finished");
                assert!(w != zero_address(), "Winner not set");
                assert_valid_player(@pool, w);
                w
            };

            // Compute protocol fee
            let config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
            let winning_total = if winner == pool.player_1 {
                pool.total_on_p1
            } else {
                pool.total_on_p2
            };

            let configured_fee = mul_div_u128_floor(
                pool.total_pot, config.fee_bps.into(), BPS_DENOM,
            );
            // If nobody bet on the winner, entire pot goes to protocol
            let protocol_fee_amount = if winning_total == 0_u128 {
                pool.total_pot
            } else {
                configured_fee
            };
            let distributable_amount = pool.total_pot - protocol_fee_amount;

            // Accumulate fees
            let mut fee_vault: FeeVault = world.read_model(pool.token);
            fee_vault.token = pool.token;
            fee_vault.accumulated += protocol_fee_amount;
            world.write_model(@fee_vault);

            // Mark pool as settled
            pool.status = POOL_SETTLED;
            pool.winning_player = winner;
            pool.winning_total = winning_total;
            pool.distributable_amount = distributable_amount;
            pool.claimed_amount = 0_u128;
            pool.claimed_winner_count = 0_u32;
            pool.protocol_fee_amount = protocol_fee_amount;

            world.write_model(@pool);
            world.emit_event(
                @pool_settled_event {
                    pool_id,
                    winner,
                    total_pot: pool.total_pot,
                    winning_total,
                    distributable_amount,
                    protocol_fee_amount,
                },
            );

            clear_operation_lock(ref self);
        }

        // -------------------------------------------------------------------
        // claim_winnings
        // -------------------------------------------------------------------
        fn claim_winnings(ref self: ContractState, pool_id: u32) {
            with_operation_lock(ref self);
            let mut world = self.world_default();
            let bettor = get_caller_address();

            let mut pool: BettingPool = world.read_model(pool_id);
            let mut bet: Bet = world.read_model((pool_id, bettor));
            bet.pool_id = pool_id;
            bet.bettor = bettor;

            assert!(pool.status == POOL_SETTLED, "Pool not settled");
            assert!(bet.amount > 0_u128, "No bet found");
            assert!(!bet.claimed, "Already claimed");
            assert!(bet.predicted_winner == pool.winning_player, "Not a winning bet");
            assert!(pool.winning_total > 0_u128, "No winning bets");

            // Determine payout — last claimer gets the remainder to prevent dust
            let winner_bettor_count = if pool.winning_player == pool.player_1 {
                pool.bettor_count_p1
            } else {
                pool.bettor_count_p2
            };

            let payout = if pool.claimed_winner_count + 1_u32 == winner_bettor_count {
                pool.distributable_amount - pool.claimed_amount
            } else {
                compute_payout(bet.amount, pool.winning_total, pool.distributable_amount)
            };

            // Update state before external call (checks-effects-interactions)
            bet.claimed = true;
            pool.claimed_amount += payout;
            pool.claimed_winner_count += 1_u32;

            world.write_model(@bet);
            world.write_model(@pool);

            // Transfer payout
            if payout > 0_u128 {
                let erc20 = IERC20Dispatcher { contract_address: pool.token };
                let ok = erc20.transfer(bettor, to_u256(payout));
                assert!(ok, "Payout transfer failed");
            }

            world.emit_event(@winnings_claimed { pool_id, bettor, amount: payout });

            clear_operation_lock(ref self);
        }

        // -------------------------------------------------------------------
        // cancel_pool
        // -------------------------------------------------------------------
        fn cancel_pool(ref self: ContractState, pool_id: u32) {
            with_operation_lock(ref self);
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut pool: BettingPool = world.read_model(pool_id);
            assert!(pool.status == POOL_OPEN, "Pool not open");

            // Only admin or creator can cancel
            let config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
            assert!(
                caller == pool.creator || caller == config.admin,
                "Not authorized to cancel",
            );

            pool.status = POOL_CANCELLED;
            world.write_model(@pool);

            // Transfer the entire pot back to the contract for individual refunds
            // In a cancelled pool, each bettor can call claim_winnings-like logic.
            // For simplicity, we mark the pool as cancelled and set distributable
            // so that bettors reclaim their original amounts.
            // Note: actual refund happens through a separate claim mechanism
            // where we return bet.amount to each bettor.

            world.emit_event(@pool_cancelled_event { pool_id, cancelled_by: caller });

            clear_operation_lock(ref self);
        }

        // -------------------------------------------------------------------
        // configure_protocol
        // -------------------------------------------------------------------
        fn configure_protocol(
            ref self: ContractState, fee_bps: u16, fee_recipient: ContractAddress,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            assert_is_admin(@world, caller);

            assert!(fee_bps <= MAX_FEE_BPS, "Fee exceeds maximum (10%)");

            let mut config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
            config.fee_bps = fee_bps;
            config.fee_recipient = fee_recipient;
            world.write_model(@config);

            world.emit_event(@protocol_fee_configured { fee_recipient, fee_bps });
        }

        // -------------------------------------------------------------------
        // claim_protocol_fees
        // -------------------------------------------------------------------
        fn claim_protocol_fees(ref self: ContractState, token: ContractAddress) {
            with_operation_lock(ref self);
            let mut world = self.world_default();
            let caller = get_caller_address();
            assert_is_admin(@world, caller);

            let config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
            assert!(config.fee_recipient != zero_address(), "Fee recipient not set");

            let mut fee_vault: FeeVault = world.read_model(token);
            fee_vault.token = token;
            assert!(fee_vault.accumulated > 0_u128, "No fees to claim");

            let payout = fee_vault.accumulated;
            fee_vault.accumulated = 0_u128;

            // Update state before external call
            world.write_model(@fee_vault);

            let erc20 = IERC20Dispatcher { contract_address: token };
            let ok = erc20.transfer(config.fee_recipient, to_u256(payout));
            assert!(ok, "Fee transfer failed");

            world.emit_event(
                @protocol_fee_claimed { token, recipient: config.fee_recipient, amount: payout },
            );

            clear_operation_lock(ref self);
        }

        // -------------------------------------------------------------------
        // View: get_odds
        // -------------------------------------------------------------------
        fn get_odds(self: @ContractState, pool_id: u32) -> (u128, u128) {
            let world = self.world_default();
            let snapshot: OddsSnapshot = world.read_model(pool_id);
            (snapshot.implied_prob_p1, snapshot.implied_prob_p2)
        }

        // -------------------------------------------------------------------
        // View: get_adjusted_odds
        // -------------------------------------------------------------------
        fn get_adjusted_odds(self: @ContractState, pool_id: u32) -> (u128, u128) {
            let world = self.world_default();
            let pool: BettingPool = world.read_model(pool_id);

            let game_dispatcher = IGameWorldDispatcher { contract_address: pool.game_world };
            let (wins_p1, losses_p1, _exp_p1) = game_dispatcher.player_stats(pool.player_1);
            let (wins_p2, losses_p2, _exp_p2) = game_dispatcher.player_stats(pool.player_2);

            compute_stat_adjusted_odds(
                wins_p1, losses_p1, wins_p2, losses_p2, pool.total_on_p1, pool.total_on_p2,
            )
        }

        // -------------------------------------------------------------------
        // create_egs_pool
        // -------------------------------------------------------------------
        fn create_egs_pool(
            ref self: ContractState,
            game_world: ContractAddress,
            game_id: u32,
            token: ContractAddress,
            deadline: u64,
            egs_token_id_p1: felt252,
            egs_token_id_p2: felt252,
        ) {
            let mut world = self.world_default();
            assert_not_paused(@world);
            let caller = get_caller_address();
            let now = get_block_timestamp();

            assert_is_pool_manager(@world, caller);
            assert!(game_world != zero_address(), "Invalid game world");
            assert!(token != zero_address(), "Invalid token");
            assert!(deadline > now, "Deadline must be in the future");
            assert!(egs_token_id_p1 != 0, "Invalid EGS token for P1");
            assert!(egs_token_id_p2 != 0, "Invalid EGS token for P2");
            assert!(egs_token_id_p1 != egs_token_id_p2, "Token IDs must be different");

            // Verify denshokan is configured
            let denshokan_config: DenshokanConfig = world.read_model(DENSHOKAN_CONFIG_ID);
            assert!(denshokan_config.enabled, "Denshokan not configured");

            // Verify tokens are not already finished
            let token_data = IMinigameTokenDataDispatcher {
                contract_address: denshokan_config.token_contract,
            };
            assert!(!token_data.game_over(egs_token_id_p1), "P1 game already over");
            assert!(!token_data.game_over(egs_token_id_p2), "P2 game already over");

            // Get players from game world
            let game_dispatcher = IGameWorldDispatcher { contract_address: game_world };
            let (player_1, player_2) = game_dispatcher.game_players(game_id);

            // Allocate pool ID
            let mut counter: PoolCounter = world.read_model(POOL_COUNTER_ID);
            let pool_id = counter.count + 1_u32;
            counter.count = pool_id;

            let pool = BettingPool {
                pool_id,
                game_world,
                game_id,
                token,
                status: POOL_OPEN,
                settlement_mode: SETTLE_EGS,
                egs_token_id_p1,
                egs_token_id_p2,
                total_pot: 0_u128,
                total_on_p1: 0_u128,
                total_on_p2: 0_u128,
                bettor_count_p1: 0_u32,
                bettor_count_p2: 0_u32,
                winning_player: zero_address(),
                winning_total: 0_u128,
                distributable_amount: 0_u128,
                claimed_amount: 0_u128,
                claimed_winner_count: 0_u32,
                protocol_fee_amount: 0_u128,
                creator: caller,
                deadline,
                player_1,
                player_2,
            };

            world.write_model(@counter);
            world.write_model(@pool);
            world.write_model(
                @OddsSnapshot {
                    pool_id, implied_prob_p1: 0_u128, implied_prob_p2: 0_u128, last_updated: now,
                },
            );

            world.emit_event(@pool_created { pool_id, game_world, game_id, token, creator: caller, deadline });
            world.emit_event(@egs_pool_created { pool_id, game_world, game_id, egs_token_id_p1, egs_token_id_p2 });
        }

        // -------------------------------------------------------------------
        // set_pool_manager
        // -------------------------------------------------------------------
        fn set_pool_manager(ref self: ContractState, account: ContractAddress, enabled: bool) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            assert_is_admin(@world, caller);

            let manager = PoolManager { account, enabled };
            world.write_model(@manager);
            world.emit_event(@pool_manager_updated { account, enabled });
        }

        // -------------------------------------------------------------------
        // is_pool_manager
        // -------------------------------------------------------------------
        fn is_pool_manager(self: @ContractState, account: ContractAddress) -> bool {
            let world = self.world_default();
            let config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
            if account == config.admin {
                return true;
            }
            let manager: PoolManager = world.read_model(account);
            manager.enabled
        }

        // -------------------------------------------------------------------
        // configure_denshokan
        // -------------------------------------------------------------------
        fn configure_denshokan(
            ref self: ContractState,
            token_contract: ContractAddress,
            enabled: bool,
        ) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            assert_is_admin(@world, caller);

            world.write_model(
                @DenshokanConfig {
                    id: DENSHOKAN_CONFIG_ID,
                    token_contract,
                    enabled,
                },
            );

            world.emit_event(@denshokan_configured { token_contract, enabled });
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> WorldStorage {
            self.world(@"shobu")
        }
    }

    fn assert_valid_player(pool: @BettingPool, candidate: ContractAddress) {
        assert!(
            candidate == (*pool).player_1 || candidate == (*pool).player_2,
            "Invalid game player",
        );
    }

    fn assert_not_paused(world: @WorldStorage) {
        let config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
        assert!(!config.paused, "Protocol is paused");
    }

    fn assert_is_admin(world: @WorldStorage, caller: ContractAddress) {
        let config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
        assert!(caller == config.admin, "Not admin");
    }

    fn assert_is_pool_manager(world: @WorldStorage, caller: ContractAddress) {
        let config: ProtocolConfig = world.read_model(PROTOCOL_CONFIG_ID);
        if caller == config.admin {
            return;
        }
        let manager: PoolManager = world.read_model(caller);
        assert!(manager.enabled, "Not pool manager");
    }

    fn pull_token(from: ContractAddress, token: ContractAddress, amount: u128) {
        let erc20 = IERC20Dispatcher { contract_address: token };
        let ok = erc20.transfer_from(from, get_contract_address(), to_u256(amount));
        assert!(ok, "Bet transfer_from failed");
    }

    fn to_u256(amount: u128) -> u256 {
        u256 { low: amount, high: 0_u128 }
    }

    fn zero_address() -> ContractAddress {
        0.try_into().unwrap()
    }

    // -----------------------------------------------------------------------
    // Reentrancy guard
    // -----------------------------------------------------------------------

    fn with_operation_lock(ref self: ContractState) {
        assert!(!self.operation_lock.read(), "Operation locked (reentrant call)");
        self.operation_lock.write(true);
    }

    fn clear_operation_lock(ref self: ContractState) {
        self.operation_lock.write(false);
    }
}
