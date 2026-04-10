// -----------------------------------------------------------------------
// Dojo model names (namespace-ModelName format required by ToriiQueryBuilder)
// -----------------------------------------------------------------------

export const MODELS = {
  BettingPool: 'shobu-BettingPool',
  Web2BettingPool: 'shobu-Web2BettingPool',
  Bet: 'shobu-Bet',
  OddsSnapshot: 'shobu-OddsSnapshot',
  ProtocolConfig: 'shobu-ProtocolConfig',
  PoolCounter: 'shobu-PoolCounter',
  PoolManager: 'shobu-PoolManager',
  DenshokanConfig: 'shobu-DenshokanConfig',
  BudokanConfig: 'shobu-BudokanConfig',
  FeeVault: 'shobu-FeeVault',
} as const

// -----------------------------------------------------------------------
// Escrow contract entrypoints
// -----------------------------------------------------------------------

export const ENTRYPOINTS = {
  createPool: 'create_pool',
  createEgsPool: 'create_egs_pool',
  createBudokanPool: 'create_budokan_pool',
  createWeb2Pool: 'create_web2_pool',
  settlePool: 'settle_pool',
  settleWeb2Pool: 'settle_web2_pool',
  cancelPool: 'cancel_pool',
  placeBet: 'place_bet',
  claimWinnings: 'claim_winnings',
  getOdds: 'get_odds',
  getAdjustedOdds: 'get_adjusted_odds',
  setPoolManager: 'set_pool_manager',
  isPoolManager: 'is_pool_manager',
  configureProtocol: 'configure_protocol',
  configureDenshokan: 'configure_denshokan',
  configureBudokan: 'configure_budokan',
  configureWeb2Oracle: 'configure_web2_oracle',
  claimProtocolFees: 'claim_protocol_fees',
} as const

// -----------------------------------------------------------------------
// Pool status values (mirrors contract constants)
// -----------------------------------------------------------------------

export const POOL_STATUS = {
  OPEN: 0,
  SETTLED: 1,
  CANCELLED: 2,
} as const

// -----------------------------------------------------------------------
// Settlement modes
// -----------------------------------------------------------------------

export const SETTLEMENT_MODE = {
  DIRECT: 0,    // IGameWorld settlement
  EGS: 1,       // Denshokan/EGS settlement
  BUDOKAN: 2,   // Budokan tournament settlement
  WEB2_ZKTLS: 3, // Web2 zkTLS settlement
  VISION_AI: 4, // AI Vision Oracle consensus settlement
} as const

// -----------------------------------------------------------------------
// Default Sepolia addresses (from sepolia_config.json)
// -----------------------------------------------------------------------

export const SEPOLIA_DEFAULTS = {
  worldAddress:
    '0x06d1f1bc162ec84e592e4e2e3a69978440f8611224a61b88d8855ff4718c3aca',
  rpcUrl: 'https://api.cartridge.gg/x/starknet/sepolia',
  chainId: 'SN_SEPOLIA',
  strkToken:
    '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
} as const
