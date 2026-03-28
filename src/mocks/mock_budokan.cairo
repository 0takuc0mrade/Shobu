#[starknet::interface]
pub trait IMockBudokan<T> {
    fn set_phase(ref self: T, tournament_id: u64, phase: u8);
    fn set_leaderboard(ref self: T, tournament_id: u64, entries: Span<u64>);
}

#[starknet::contract]
pub mod MockBudokan {
    use super::IMockBudokan;
    use shobu::interfaces::{IBudokan};
    use core::array::ArrayTrait;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        phases: Map<u64, u8>,
        leaderboard_len: Map<u64, u32>,
        leaderboard_entry: Map<(u64, u32), u64>,
    }

    #[abi(embed_v0)]
    impl BudokanImpl of IBudokan<ContractState> {
        fn get_leaderboard(self: @ContractState, tournament_id: u64) -> Array<u64> {
            let mut arr: Array<u64> = ArrayTrait::new();
            let len = self.leaderboard_len.read(tournament_id);
            let mut i: u32 = 0;
            loop {
                if i >= len {
                    break;
                }
                arr.append(self.leaderboard_entry.read((tournament_id, i)));
                i += 1;
            };
            arr
        }

        fn current_phase(self: @ContractState, tournament_id: u64) -> u8 {
            self.phases.read(tournament_id)
        }
    }

    #[abi(embed_v0)]
    impl MockBudokanAdminImpl of IMockBudokan<ContractState> {
        fn set_phase(ref self: ContractState, tournament_id: u64, phase: u8) {
            self.phases.write(tournament_id, phase);
        }

        fn set_leaderboard(ref self: ContractState, tournament_id: u64, entries: Span<u64>) {
            self.leaderboard_len.write(tournament_id, entries.len());
            let mut i: u32 = 0;
            loop {
                if i >= entries.len() {
                    break;
                }
                self.leaderboard_entry.write((tournament_id, i), *entries.at(i));
                i += 1;
            };
        }
    }
}
