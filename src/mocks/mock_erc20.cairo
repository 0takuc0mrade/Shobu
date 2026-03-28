use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockERC20<T> {
    fn mint(ref self: T, to: ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockERC20 {
    use super::IMockERC20;
    use shobu::interfaces::{IERC20};
    use starknet::ContractAddress;
    use starknet::get_caller_address;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
    }

    #[abi(embed_v0)]
    impl ERC20Impl of IERC20<ContractState> {
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            let sender_balance = self.balances.read(sender);
            assert!(sender_balance >= amount, "Insufficient balance");

            let recipient_balance = self.balances.read(recipient);
            self.balances.write(sender, sender_balance - amount);
            self.balances.write(recipient, recipient_balance + amount);
            true
        }

        fn transfer_from(
            ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
        ) -> bool {
            let sender_balance = self.balances.read(sender);
            assert!(sender_balance >= amount, "Insufficient balance");

            let recipient_balance = self.balances.read(recipient);
            self.balances.write(sender, sender_balance - amount);
            self.balances.write(recipient, recipient_balance + amount);
            true
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }
    }

    #[abi(embed_v0)]
    impl MockERC20AdminImpl of IMockERC20<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            let balance = self.balances.read(to);
            self.balances.write(to, balance + amount);
        }
    }
}
