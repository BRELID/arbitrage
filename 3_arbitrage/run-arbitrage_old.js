require("dotenv").config();
const Web3 = require("web3");

const { ChainId, TokenAmount, Fetcher } = require("@uniswap/sdk");

const abis = require("./abis");
const { mainnet: addresses } = require("./addresses");

// create the connection to the blockchain
const web3 = new Web3(
  new Web3.providers.WebsocketProvider(process.env.INFURA_URL)
);

// Connect to the kyber smartcontract
const kyber = new web3.eth.Contract(
  abis.kyber.kyberNetworkProxy,
  addresses.kyber.kyberNetworkProxy
);

const AMOUNT_ETH = 1;
const RECENT_ETH_PRICE = 1294;
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString());
const AMOUNT_DAI_WEI = web3.utils.toWei(
  (AMOUNT_ETH * RECENT_ETH_PRICE).toString()
);

//listen new block arrival
const init = async () => {
  // Connect to uniswap
  const [dai, weth] = await Promise.all(
    [addresses.tokens.dai, addresses.tokens.weth].map((tokenAddress) =>
      Fetcher.fetchTokenData(ChainId.MAINNET, tokenAddress)
    )
  );
  // To interact with uniswap
  const daiWeth = await Fetcher.fetchPairData(dai, weth);

  web3.eth
    .subscribe("newBlockHeaders")
    .on("data", async (block) => {
      console.log(`New block received, N° ${block.number}`);

      //First method: Get ETH with DAI - call: to send the method to the network
      //Second ETH to DAI
      const kyberResults = await Promise.all([
        kyber.methods
          .getExpectedRate(
            addresses.tokens.dai,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            AMOUNT_DAI_WEI
          )
          .call(),
        kyber.methods
          .getExpectedRate(
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            addresses.tokens.dai,
            AMOUNT_ETH_WEI
          )
          .call(),
      ]);

      //console.log(kyberResults);

      const kyberRates = {
        buy: parseFloat(1 / (kyberResults[0].expectedRate / 10 ** 18)),
        sell: parseFloat(kyberResults[1].expectedRate / 10 ** 18),
      };
      console.log(`Kyber ETH/DAI`);
      console.log(kyberRates);

      const uniswapResults = await Promise.all([
        daiWeth.getOutputAmount(new TokenAmount(dai, AMOUNT_DAI_WEI)),
        daiWeth.getOutputAmount(new TokenAmount(weth, AMOUNT_ETH_WEI)),
      ]);
      //console.log(uniswapResults);
      const uniswapRates = {
        buy: parseFloat(
          AMOUNT_DAI_WEI / (uniswapResults[0][0].toExact() * 10 ** 18)
        ),
        sell: parseFloat(uniswapResults[1][0].toExact() / AMOUNT_ETH),
      };

      console.log("Uniswap ETH/DAI");
      console.log(uniswapRates);

      // Get the gas price
      const gasPrice = await web3.eth.getGasPrice();

      // Transaction cost
      const txCost = 200000 * parseInt(gasPrice);

      // Determine the current ETH price
      const currentEthPrice = (uniswapRates.buy + uniswapRates.sell) / 2;
      // Profit in dollars
      const profit1 =
        parseInt(AMOUNT_ETH_WEI / 10 ** 18) *
          (uniswapRates.sell - kyberRates.buy) -
        (txCost / 10 ** 18) * currentEthPrice;
      const profit2 =
        parseInt(AMOUNT_ETH_WEI / 10 ** 18) *
          (kyberRates.sell - uniswapRates.buy) -
        (txCost / 10 ** 18) * currentEthPrice;

      if (profit1 > 0) {
        console.log('ARBITRAGE OPPORTUNIY FOUND!')
        console.log(`Buy ETH on Kyber at ${kyberRates.buy} dai`);
        console.log(`Sell ETH on Uniswap at ${uniswapRates.sell} dai`);
        console.log(`Expected profit: ${profit1} dai`)
      }else if (profit2 > 0){
        console.log('ARBITRAGE OPPORTUNIY FOUND!')
        console.log(`Buy ETH on Uniswap at ${uniswapRates.buy} dai`);
        console.log(`Sell ETH on Kyber at ${kyberRates.sell} dai`);
        console.log(`Expected profit: ${profit2} dai`)
      }
    })
    .on("error", (error) => {
      console.log(error);
    });
};
init();
