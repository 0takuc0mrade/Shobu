use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockERC721<T> {
    fn set_owner(ref self: T, token_id: u256, owner: ContractAddress);
}

#[starknet::contract]
pub mod MockERC721 {
    use super::IMockERC721;
    use shobu::interfaces::{IERC721};
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        owners: Map<u256, ContractAddress>,
    }

    #[abi(embed_v0)]
    impl ERC721Impl of IERC721<ContractState> {
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.owners.read(token_id)
        }
    }

    #[abi(embed_v0)]
    impl MockERC721AdminImpl of IMockERC721<ContractState> {
        fn set_owner(ref self: ContractState, token_id: u256, owner: ContractAddress) {
            self.owners.write(token_id, owner);
        }
    }
}
