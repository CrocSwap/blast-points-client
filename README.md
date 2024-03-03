# blast-points-client
Typescript library for interacting with Blast points API

## Quickstart

To add the project to your project run the following command in your NPM package directory:

    yarn add @crocswap-libs/blast-points-client

To use the library you need to set an env variable corresponding to the private key of your
contract's point operator address. (Note this key is highly sensitive and should never be
committed to any code)

    export OPERATOR_KEY=[POINTS_OPERATOR_KEY]

Once the package is install you can use the points client in any Javascript or Typescript code
with the following lines:

    import { BlastPointsSession } from "@crocswap-libs/blast-points-client"

    const blast = new BlastPointsSession([CONTRACT_ADDRESS])

## Querying 

A contract's current Blast points can be queries with:

    import { BlastPointsSession } from "@crocswap-libs/blast-points-client"

    const blast = new BlastPointsSession([CONTRACT_ADDRESS])
    let points = await blast.queryPoints()

The full history of a contract's points transfers can be queries:

    import { BlastPointsSession } from "@crocswap-libs/blast-points-client"

    const blast = new BlastPointsSession([CONTRACT_ADDRESS])
    let hist = blast.queryTransferHistory()

The distribution of any specific transfer can be queries with:

    import { BlastPointsSession } from "@crocswap-libs/blast-points-client"

    const blast = new BlastPointsSession([CONTRACT_ADDRESS])

    const batchId = [BATCH_UUID]
    let transfers = blast.queryTransfer(batchId)

## Transfer

To initiate a Blast bridge liquidity points transfer:

    import { BlastPointsSession } from "@crocswap-libs/blast-points-client"

    const blast = new BlastPointsSession([CONTRACT_ADDRESS])

    blast.transferLiqPoints([
        { 
            toAddress: "0x000000000000000000000000000000000000dEaD",
            points: "0.1"
        },
        { 
            toAddress: "0x0000000000000000000000000000000000000000",
            points: "0.5"
        },
    ])

And similarly for Blast gold dev points:

    import { BlastPointsSession } from "@crocswap-libs/blast-points-client"

    const blast = new BlastPointsSession([CONTRACT_ADDRESS])

    blast.transferDevPoints([
        { 
            toAddress: "0x000000000000000000000000000000000000dEaD",
            points: "0.1"
        },
        { 
            toAddress: "0x0000000000000000000000000000000000000000",
            points: "0.5"
        },
    ])

Finally to cancel a non-finalized transfer:

    import { BlastPointsSession } from "@crocswap-libs/blast-points-client"

    const blast = new BlastPointsSession([CONTRACT_ADDRESS])

    blast.cancelTransfer([BATCH_ID])

## CLI Tools

Users can directly query their contract's accumulated Blast points by running the query script:

    export OPERATOR_KEY=[POINTS_OPERATOR_KEY]
    yarn query [CONTRACT ADDRESS]
