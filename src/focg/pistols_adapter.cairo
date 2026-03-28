use starknet::ContractAddress;

// We use the exact primitive layout of Pistols Challenge model up to `winner`.
// Dojo Model data serialization returns the values in flat sequence.
#[derive(Introspect, Copy, Drop, Serde)]
pub struct PistolsChallengeModel {
    pub duel_type: u8,
    pub premise: u8,
    pub lives_staked: u8,
    pub address_a: ContractAddress,
    pub address_b: ContractAddress,
    pub duelist_id_a: u128,
    pub duelist_id_b: u128,
    pub state: u8,
    pub season_id: u32,
    pub winner: u8,
    pub start_timestamp: u64,
    pub end_timestamp: u64,
}

#[dojo::contract]
pub mod pistols_adapter {
    use super::PistolsChallengeModel;
    use dojo::world::{IWorldDispatcher, IWorldDispatcherTrait};
    use dojo::meta::Introspect;
    use dojo::model::definition::ModelIndex;
    use starknet::{ContractAddress};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use shobu::interfaces::IGameWorld;
    use core::num::traits::Zero;

    #[storage]
    struct Storage {
        pistols_world_address: ContractAddress,
    }

    #[abi(embed_v0)]
    impl PistolsAdapterImpl of IGameWorld<ContractState> {
        // ... (we'll also add a config method below)

        fn game_state(self: @ContractState, game_id: u32) -> (u8, ContractAddress) {
            let pistols_world = IWorldDispatcher { 
                contract_address: self.pistols_world_address.read() 
            };
            
            let mut keys = array![];
            let duel_id: u128 = game_id.into();
            duel_id.serialize(ref keys);

            let challenge_selector = dojo::utils::bytearray_hash(@"pistols-Challenge");
            let index = ModelIndex::Keys(keys.span());
            let layout = Introspect::<PistolsChallengeModel>::layout();
            let mut data_span = pistols_world.entity(challenge_selector, index, layout);

            // Deserialize the raw felts into our primitive struct mapping
            let challenge: PistolsChallengeModel = Serde::deserialize(ref data_span).expect('Failed to decode FOCG Challenge');

            let shobu_state = if challenge.state == 6_u8 || challenge.state == 7_u8 {
                2_u8 // Finished
            } else if challenge.state == 5_u8 {
                1_u8 // Playing
            } else {
                0_u8 // Setup
            };

            let winner = if challenge.winner == 1_u8 {
                challenge.address_a
            } else if challenge.winner == 2_u8 {
                challenge.address_b
            } else {
                Zero::zero()
            };

            (shobu_state, winner)
        }

        fn game_players(self: @ContractState, game_id: u32) -> (ContractAddress, ContractAddress) {
            let pistols_world = IWorldDispatcher { 
                contract_address: self.pistols_world_address.read() 
            };
            
            let mut keys = array![];
            let duel_id: u128 = game_id.into();
            duel_id.serialize(ref keys);

            let challenge_selector = dojo::utils::bytearray_hash(@"pistols-Challenge");
            let index = ModelIndex::Keys(keys.span());
            let layout = Introspect::<PistolsChallengeModel>::layout();
            let mut data_span = pistols_world.entity(challenge_selector, index, layout);
            let challenge: PistolsChallengeModel = Serde::deserialize(ref data_span).expect('Failed to decode game players');

            (challenge.address_a, challenge.address_b)
        }

        fn player_stats(self: @ContractState, player: ContractAddress) -> (u32, u32, u64) {
            (0, 0, 0)
        }
    }

    #[generate_trait]
    #[abi(per_item)]
    impl AdapterAdminImpl of AdapterAdminTrait {
        #[external(v0)]
        fn set_pistols_world_address(ref self: ContractState, address: ContractAddress) {
            self.pistols_world_address.write(address);
        }
    }
}
