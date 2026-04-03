// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable protocolAdmin;
    address public poolManager; // OpenServ Agent address

    uint32 private _poolCounter;
    
    // 2.5% protocol fee
    uint16 public constant PROTOCOL_FEE_BPS = 250; 
    uint16 public constant BPS_DENOM = 10000;

    struct BettingPool {
        uint32 id;
        address token;
        uint8 status; // 0=Open, 1=Settled, 2=Cancelled
        uint128 totalPot;
        uint128 totalOnP1;
        uint128 totalOnP2;
        address player1;
        address player2;
        address winningPlayer;
        uint64 deadline;
    }

    struct Bet {
        address bettor;
        address predictedWinner;
        uint128 amount;
        bool claimed;
    }

    mapping(uint32 => BettingPool) public pools;
    mapping(uint32 => mapping(address => Bet)) public bets;
    mapping(address => uint256) public protocolFees;

    event PoolCreated(uint32 indexed poolId, address indexed token, address player1, address player2, uint64 deadline);
    event BetPlaced(uint32 indexed poolId, address indexed bettor, address predictedWinner, uint128 amount);
    event PoolSettled(uint32 indexed poolId, address indexed winner, uint128 distributableAmount, uint128 protocolFeeAmount);
    event WinningsClaimed(uint32 indexed poolId, address indexed bettor, uint128 amount);

    modifier onlyAdmin() {
        require(msg.sender == protocolAdmin, "Escrow: strict admin only");
        _;
    }

    modifier onlyManagerOrAdmin() {
        require(msg.sender == poolManager || msg.sender == protocolAdmin, "Escrow: unauthorized");
        _;
    }

    constructor(address _poolManager) {
        protocolAdmin = msg.sender;
        poolManager = _poolManager;
    }

    function createPool(address token, address player1, address player2, uint64 deadline) external onlyManagerOrAdmin {
        require(token != address(0), "Escrow: zero token");
        require(player1 != address(0) && player2 != address(0), "Escrow: zero player");
        require(deadline > block.timestamp, "Escrow: deadline must be future");
        
        unchecked { _poolCounter++; }
        uint32 poolId = _poolCounter;
        
        pools[poolId] = BettingPool({
            id: poolId,
            token: token,
            status: 0,
            totalPot: 0,
            totalOnP1: 0,
            totalOnP2: 0,
            player1: player1,
            player2: player2,
            winningPlayer: address(0),
            deadline: deadline
        });
        
        emit PoolCreated(poolId, token, player1, player2, deadline);
    }

    function placeBet(uint32 poolId, address predictedWinner, uint128 amount) external nonReentrant {
        BettingPool storage pool = pools[poolId];
        require(pool.status == 0, "Escrow: pool not open");
        require(block.timestamp <= pool.deadline, "Escrow: betting deadline passed");
        require(predictedWinner == pool.player1 || predictedWinner == pool.player2, "Escrow: invalid winner prediction");
        require(msg.sender != pool.player1 && msg.sender != pool.player2, "Escrow: players cannot bet");
        require(amount > 0, "Escrow: zero bet amount");

        Bet storage bet = bets[poolId][msg.sender];
        if (bet.amount > 0) {
            require(bet.predictedWinner == predictedWinner, "Escrow: cannot switch sides");
        } else {
            bet.bettor = msg.sender;
            bet.predictedWinner = predictedWinner;
        }

        // State changes
        bet.amount += amount;
        pool.totalPot += amount;
        if (predictedWinner == pool.player1) {
            pool.totalOnP1 += amount;
        } else {
            pool.totalOnP2 += amount;
        }

        // CEI Pattern (Interaction last)
        IERC20(pool.token).safeTransferFrom(msg.sender, address(this), amount);
        emit BetPlaced(poolId, msg.sender, predictedWinner, amount);
    }

    function settlePool(uint32 poolId, address winner) external onlyManagerOrAdmin {
        BettingPool storage pool = pools[poolId];
        require(pool.status == 0, "Escrow: pool not open");
        require(winner == pool.player1 || winner == pool.player2, "Escrow: invalid winner");

        pool.status = 1;
        pool.winningPlayer = winner;

        uint128 winningTotal = winner == pool.player1 ? pool.totalOnP1 : pool.totalOnP2;
        
        // Fee Calculation (Multiply before Divide for precision retention)
        uint128 protocolFeeAmount = 0;
        if (winningTotal == 0) {
            // Edge Case: Nobody guessed correctly; protocol takes it all to avoid division by 0 later
            protocolFeeAmount = pool.totalPot;
        } else {
            protocolFeeAmount = uint128((uint256(pool.totalPot) * PROTOCOL_FEE_BPS) / BPS_DENOM);
        }
        
        uint128 distributableAmount = pool.totalPot - protocolFeeAmount;
        protocolFees[pool.token] += protocolFeeAmount;

        emit PoolSettled(poolId, winner, distributableAmount, protocolFeeAmount);
    }

    function claimWinnings(uint32 poolId) external nonReentrant {
        BettingPool storage pool = pools[poolId];
        require(pool.status == 1, "Escrow: pool not settled");
        
        Bet storage bet = bets[poolId][msg.sender];
        require(bet.amount > 0, "Escrow: no bet placed");
        require(!bet.claimed, "Escrow: already claimed");
        require(bet.predictedWinner == pool.winningPlayer, "Escrow: did not win");
        
        uint128 winningTotal = pool.winningPlayer == pool.player1 ? pool.totalOnP1 : pool.totalOnP2;
        require(winningTotal > 0, "Escrow: no winners to pay");
        
        uint128 protocolFeeAmount = uint128((uint256(pool.totalPot) * PROTOCOL_FEE_BPS) / BPS_DENOM);
        uint128 winningPot = pool.totalPot - protocolFeeAmount;

        // Payout = (Bet Amount * Distributable Pot) / Winning Total 
        // Multiply first to prevent precision loss!
        uint256 payout = (uint256(bet.amount) * uint256(winningPot)) / uint256(winningTotal);
        
        // Check-Effects-Interactions
        bet.claimed = true;
        IERC20(pool.token).safeTransfer(msg.sender, payout);
        
        emit WinningsClaimed(poolId, msg.sender, uint128(payout));
    }
}
