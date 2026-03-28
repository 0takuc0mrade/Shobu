use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockGameWorld<T> {
    fn set_game(
        ref self: T,
        game_id: u32,
        state: u8,
        winner: ContractAddress,
        player_1: ContractAddress,
        player_2: ContractAddress,
    );
    fn set_player_stats(ref self: T, player: ContractAddress, wins: u32, losses: u32, exp: u64);
}

#[starknet::contract]
pub mod MockGameWorld {
    use super::IMockGameWorld;
    use shobu::interfaces::{IGameWorld};
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        game_state: Map<u32, u8>,
        game_winner: Map<u32, ContractAddress>,
        game_player_1: Map<u32, ContractAddress>,
        game_player_2: Map<u32, ContractAddress>,
        stats_wins: Map<ContractAddress, u32>,
        stats_losses: Map<ContractAddress, u32>,
        stats_exp: Map<ContractAddress, u64>,
    }

    #[abi(embed_v0)]
    impl GameWorldImpl of IGameWorld<ContractState> {
        fn game_state(self: @ContractState, game_id: u32) -> (u8, ContractAddress) {
            let state = self.game_state.read(game_id);
            let winner = self.game_winner.read(game_id);
            (state, winner)
        }

        fn game_players(self: @ContractState, game_id: u32) -> (ContractAddress, ContractAddress) {
            let p1 = self.game_player_1.read(game_id);
            let p2 = self.game_player_2.read(game_id);
            (p1, p2)
        }

        fn player_stats(self: @ContractState, player: ContractAddress) -> (u32, u32, u64) {
            let wins = self.stats_wins.read(player);
            let losses = self.stats_losses.read(player);
            let exp = self.stats_exp.read(player);
            (wins, losses, exp)
        }
    }

    #[abi(embed_v0)]
    impl MockGameWorldAdminImpl of IMockGameWorld<ContractState> {
        fn set_game(
            ref self: ContractState,
            game_id: u32,
            state: u8,
            winner: ContractAddress,
            player_1: ContractAddress,
            player_2: ContractAddress,
        ) {
            self.game_state.write(game_id, state);
            self.game_winner.write(game_id, winner);
            self.game_player_1.write(game_id, player_1);
            self.game_player_2.write(game_id, player_2);
        }

        fn set_player_stats(
            ref self: ContractState,
            player: ContractAddress,
            wins: u32,
            losses: u32,
            exp: u64,
        ) {
            self.stats_wins.write(player, wins);
            self.stats_losses.write(player, losses);
            self.stats_exp.write(player, exp);
        }
    }
}
