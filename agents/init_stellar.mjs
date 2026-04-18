import sdk from "@stellar/stellar-sdk";

const { Keypair, rpc: SorobanRpc, TransactionBuilder, Contract, Address, nativeToScVal } = sdk;

const rpcUrl = "https://soroban-testnet.stellar.org:443";
const networkPassphrase = "Test SDF Network ; September 2015";
const escrowId = "CAVMUYF3S54QSPSNWN5LUI3YEPRFIRPFWSULNIWBSHA4IPPPGSSCCOPB";

async function main() {
  const secretKey = "SCAH56S4BKBBQILQBIXMNHYT3WJTWNEOTJPWYAUUTLNQKEECDEHNTMKK";
  const keypair = Keypair.fromSecret(secretKey);
  console.log("Agent:", keypair.publicKey());

  const rpcServer = new SorobanRpc.Server(rpcUrl);
  const accountInfo = await rpcServer.getAccount(keypair.publicKey());
  
  const contract = new Contract(escrowId);
  const tx = new TransactionBuilder(accountInfo, { fee: "10000", networkPassphrase })
    .addOperation(
      contract.call("init", 
        new Address(keypair.publicKey()).toScVal(),
        new Address(keypair.publicKey()).toScVal()
      )
    )
    .setTimeout(30)
    .build();

  const preparedTx = await rpcServer.prepareTransaction(tx);
  preparedTx.sign(keypair);
  
  console.log("Submitting init...");
  const response = await rpcServer.sendTransaction(preparedTx);
  console.log(response);

  if (response.status === "PENDING") {
    let txStatus;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      txStatus = await rpcServer.getTransaction(response.hash);
      if (txStatus.status !== "NOT_FOUND") break;
    }
    console.log("Final:", txStatus);
  }
}

main().catch(err => {
    console.error(err);
    if (err.response) {
      console.error(err.response.data);
    }
});
