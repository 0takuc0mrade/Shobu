pub mod interfaces;
pub mod models;
pub mod odds;

pub mod focg {
    pub mod pistols_adapter;
}

pub mod systems {
    pub mod actions;
}

#[cfg(test)]
pub mod mocks {
    pub mod mock_reclaim_verifier;
    pub mod mock_erc20;
    pub mod mock_game_world;
    pub mod mock_erc721;
    pub mod mock_budokan;
    pub mod mock_minigame_token;
}

#[cfg(test)]
mod tests {
    mod test_odds;
    mod test_escrow;
}
