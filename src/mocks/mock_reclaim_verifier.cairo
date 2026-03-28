#[starknet::interface]
pub trait IMockReclaimVerifier<T> {
    fn set_valid(ref self: T, valid: bool);
}

#[starknet::contract]
pub mod MockReclaimVerifier {
    use super::{IMockReclaimVerifier};
    use shobu::interfaces::{IReclaim, Proof};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        valid: bool,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.valid.write(false);
    }

    #[abi(embed_v0)]
    impl MockReclaimVerifierImpl of IReclaim<ContractState> {
        fn verify_proof(ref self: ContractState, proof: Proof) {
            assert!(self.valid.read(), "Invalid proof");
        }
    }

    #[abi(embed_v0)]
    impl MockReclaimVerifierAdminImpl of IMockReclaimVerifier<ContractState> {
        fn set_valid(ref self: ContractState, valid: bool) {
            self.valid.write(valid);
        }
    }
}
