use starknet::ContractAddress;

// ---------------------------------------------------------------------------
// External Dojo game world interface
// Any game that wants to be supported must expose these view functions
// (either directly or via an adapter contract).
// ---------------------------------------------------------------------------

#[starknet::interface]
pub trait IGameWorld<T> {
    /// Returns (state, winner) for a game.
    ///   state: 0 = setup, 1 = playing, 2 = finished
    ///   winner: zero-address while game is in-progress
    fn game_state(self: @T, game_id: u32) -> (u8, ContractAddress);

    /// Returns (player_1, player_2) for a game.
    fn game_players(self: @T, game_id: u32) -> (ContractAddress, ContractAddress);

    /// Returns (wins, losses, experience) from the game's leaderboard.
    fn player_stats(self: @T, player: ContractAddress) -> (u32, u32, u64);
}

// ---------------------------------------------------------------------------
// Denshokan / EGS interfaces (re-exported for composability)
// ---------------------------------------------------------------------------

#[starknet::interface]
pub trait IMinigameTokenData<T> {
    fn score(self: @T, token_id: felt252) -> u64;
    fn game_over(self: @T, token_id: felt252) -> bool;
    fn score_batch(self: @T, token_ids: Span<felt252>) -> Array<u64>;
    fn game_over_batch(self: @T, token_ids: Span<felt252>) -> Array<bool>;
}

#[starknet::interface]
pub trait IMinigameRegistry<T> {
    fn is_game_registered(self: @T, contract_address: ContractAddress) -> bool;
}

#[starknet::interface]
pub trait IERC721<T> {
    fn owner_of(self: @T, token_id: u256) -> ContractAddress;
}

// ---------------------------------------------------------------------------
// Budokan tournament interface (minimal — only the view functions Shobu needs)
// Budokan's current_phase() returns a Phase enum, which serializes as u8:
//   0 = Scheduled, 1 = Registration, 2 = Staging, 3 = Live,
//   4 = Submission, 5 = Finalized
// ---------------------------------------------------------------------------

#[starknet::interface]
pub trait IBudokan<T> {
    fn get_leaderboard(self: @T, tournament_id: u64) -> Array<u64>;
    fn current_phase(self: @T, tournament_id: u64) -> u8;
}

// ---------------------------------------------------------------------------
// Minimal ERC20 interface (transfer / transfer_from / balance_of)
// ---------------------------------------------------------------------------

#[starknet::interface]
pub trait IERC20<T> {
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: T, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn balance_of(self: @T, account: ContractAddress) -> u256;
}
