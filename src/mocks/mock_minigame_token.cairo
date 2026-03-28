#[starknet::interface]
pub trait IMockMinigameTokenData<T> {
    fn set_score(ref self: T, token_id: felt252, score: u64);
    fn set_game_over(ref self: T, token_id: felt252, game_over: bool);
}

#[starknet::contract]
pub mod MockMinigameTokenData {
    use super::IMockMinigameTokenData;
    use shobu::interfaces::{IMinigameTokenData};
    use core::array::ArrayTrait;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        scores: Map<felt252, u64>,
        game_overs: Map<felt252, bool>,
    }

    #[abi(embed_v0)]
    impl MinigameTokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            self.scores.read(token_id)
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            self.game_overs.read(token_id)
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let mut arr: Array<u64> = ArrayTrait::new();
            let mut i: usize = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                arr.append(self.scores.read(*token_ids.at(i)));
                i += 1;
            };
            arr
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let mut arr: Array<bool> = ArrayTrait::new();
            let mut i: usize = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                arr.append(self.game_overs.read(*token_ids.at(i)));
                i += 1;
            };
            arr
        }
    }

    #[abi(embed_v0)]
    impl MockMinigameTokenDataAdminImpl of IMockMinigameTokenData<ContractState> {
        fn set_score(ref self: ContractState, token_id: felt252, score: u64) {
            self.scores.write(token_id, score);
        }

        fn set_game_over(ref self: ContractState, token_id: felt252, game_over: bool) {
            self.game_overs.write(token_id, game_over);
        }
    }
}
