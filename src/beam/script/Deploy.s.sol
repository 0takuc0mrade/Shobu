// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Escrow.sol";

contract DeployEscrow is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address poolManager = vm.envAddress("POOL_MANAGER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        Escrow escrow = new Escrow(poolManager);

        vm.stopBroadcast();

        console.log("Escrow deployed to:", address(escrow));
        console.log("Pool Manager:", poolManager);
    }
}
