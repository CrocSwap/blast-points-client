
import axios from 'axios';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';

type ChallengeRequest = {
    contractAddress: string;
    operatorAddress: string;
};

type ChallengeResponse = {
    success: boolean;
    challengeData: string;
    message: string;
};

type BearerRequest = {
	challengeData: string; // from challenge response
	signature: string; // ERC-191 signature of `message` from the challenge
};

type BearerResponse = {
	success: boolean;
	bearerToken: string;
};

type BearerToken = {
    token: string;
    expiry: number;
}

type PointType = 'LIQUIDITY' | 'DEVELOPER';
  
type TransferRequest = {
    pointType: PointType
    transfers: PointsTransfer[];
    secondsToFinalize?: number | null;
}

export type PointsTransfer = {
    toAddress: string;
	points: string;
}

type TransferResponse = {
    success: boolean;
    batchId: string;
};

type BearerHeader = {
    headers: {
        Authorization: string;
    }       
}

type PointsResponse = {
	success: boolean;
	balancesByPointType: {
		LIQUIDITY: PointBalances;
		DEVELOPER: PointBalances;
	};
};

type TransferPageResponse = {
    success: boolean;
    batches: TransferBatch[];
    cursor: string | undefined;
};

export type PointBalances = {
	// decimal strings
	available: string;
    pendingSent: string;

    // also decimal strings
    // cumulative so they don't decrease
	// a batch may become finalized before these numbers update
    earnedCumulative: string;
	receivedCumulative: string; // received from transfers (finalized)
	finalizedSentCumulative: string; // sent from transfers (finalized)
};

type TransferQueryResponse = {
    success: boolean;
    batch: TransferBatchList;
};
  
type TransferStatus = 'PENDING' | 'CANCELLED' | 'FINALIZING' | 'FINALIZED';
  
export type TransferBatch = {
    contractAddress: string;
    id: string;
    pointType: PointType;
    createdAt: string; // ISO8601
    updatedAt: string | null; // ISO8601
    status: TransferStatus;
    points: string; // sum of points sent in transfers
    transferCount: number;

};
  
export type TransferBatchList = TransferBatch & {
    transfers: PointsTransfer[];
};

export type PointsBalancesAcross = {
    liquidity: PointBalances;
    developer: PointBalances;
}

export class BlastPointsSession {
    private operatorKey: string
    private contractAddr: string
    private pointsServerUrl: string
    private activeToken: Promise<BearerToken>
    private secondsToFinalize: number | null

    constructor (contractAddr: string, pointsServerUrl: string = BLAST_MAINNET_POINTS_URL) {
        this.operatorKey = pullEnvOperatorKey()
        this.contractAddr = contractAddr
        this.pointsServerUrl = pointsServerUrl
        this.activeToken = this.refreshToken()
        this.secondsToFinalize = null
    }

    setSecondsToFinalize(seconds: number): BlastPointsSession {
        this.secondsToFinalize = seconds
        return this
    }

    async queryPoints(): Promise<PointsBalancesAcross> {
        const endpoint = `${this.pointsServerUrl}/v1/contracts/${this.contractAddr}/point-balances`
    
        const response = await axios.get<PointsResponse>(endpoint, await this.bearerHeader())
        if (!response.data.success) { throw new Error('Error: Point query request failed');}
    
        return { 
            liquidity: response.data.balancesByPointType.LIQUIDITY,
            developer: response.data.balancesByPointType.DEVELOPER
        }
    }

    async cancelTransfer (batchId: string) {
        const endpoint = `${this.pointsServerUrl}/v1/contracts/${this.contractAddr}/batches/${batchId}`
        const response = await axios.delete(endpoint, await this.bearerHeader())
        if (!response.data.success) { throw new Error('Error: Transfer cancel request failed');}
        return response
    }
    
    async queryTransferHistory(): Promise<TransferBatch[]> {
        const fullSet: TransferBatch[] = []

        let page = this.queryTransfersPage()
        fullSet.push(...(await page).batches)
            
        while ((await page).cursor !== null) {
            page = this.queryTransfersPage((await page).cursor)
            fullSet.push(...(await page).batches)
        }
        return fullSet
    }

    async queryTransfer (batchId: string): Promise<TransferBatchList> {
        const endpoint = `${this.pointsServerUrl}/v1/contracts/${this.contractAddr}/batches/${batchId}`
        const response = await axios.get<TransferQueryResponse>(endpoint, await this.bearerHeader())
        if (!response.data.success) { throw new Error('Error: Transfer query request failed');}
        return response.data.batch
    }
    
    private async queryTransfersPage(cursor?: string): Promise<TransferPageResponse> {
        const endpoint = `${this.pointsServerUrl}/v1/contracts/${this.contractAddr}/batches`
        const urlWithCursor = cursor ? `${endpoint}?cursor=${cursor}` : endpoint;
        const response = await axios.get<TransferPageResponse>(urlWithCursor, await this.bearerHeader())
        if (!response.data.success) { throw new Error('Error: Transfer query request failed');}
        return response.data
    }

    async transferLiqPoints (transfers: PointsTransfer[], batchId?: string): Promise<string> {
        return this.transferRequest({ pointType: 'LIQUIDITY', transfers, secondsToFinalize: this.secondsToFinalize}, batchId)
    }

    async transferDevPoints (transfers: PointsTransfer[], batchId?: string): Promise<string> {
        return this.transferRequest({ pointType: 'DEVELOPER', transfers, secondsToFinalize: this.secondsToFinalize}, batchId)
    }

    private async transferRequest (transfers: TransferRequest, batchIdArg?: string): Promise<string> {

        const batchId = batchIdArg || uuidv4();
        const endpoint = `${this.pointsServerUrl}/v1/contracts/${this.contractAddr}/batches/${batchId}`
    
        const response = await axios.put<TransferResponse>(endpoint, transfers, await this.bearerHeader())
        if (!response.data.success) { throw new Error('Error: Transfer request failed');}
    
        return response.data.batchId
    }

    private async materializeToken(): Promise<BearerToken> {
        if (unixTimeNow() > (await this.activeToken).expiry) {
            this.activeToken = this.refreshToken()
        }
        return this.activeToken
    }

    private async refreshToken(): Promise<BearerToken> {
        let challenge = await this.requestChallenge()
        return await this.obtainBearerToken(challenge)
    }

    private async requestChallenge(): Promise<ChallengeResponse> {
        const endpoint = `${this.pointsServerUrl}/v1/dapp-auth/challenge`
    
        const requestData: ChallengeRequest = {
            contractAddress: this.contractAddr,
            operatorAddress: keyToAddress(this.operatorKey),
        };
        
        const response = await axios.post<ChallengeResponse>(endpoint, requestData);
        if (!response.data.success) { throw new Error('Error: Challenge request failed');}
        return response.data;
    }

    private async obtainBearerToken (challenge: ChallengeResponse): Promise<BearerToken> {
        const endpoint = `${this.pointsServerUrl}/v1/dapp-auth/solve`
    
        const signature = signMessageERC191(challenge.message, this.operatorKey)
    
        const requestData: BearerRequest = {
            challengeData: challenge.challengeData,
            signature: await signature,
        };
    
        const response = await axios.post<BearerResponse>(endpoint, requestData);
        if (!response.data.success) { 
            throw new Error('Error: Obtain bearer failed');
        }
        
        return {
            token: response.data.bearerToken,
            expiry: clockTokenExpiry()
        }
    }

    private async bearerHeader(): Promise<BearerHeader> {
        const token = await this.materializeToken()
        return {
            headers: {
                Authorization: `Bearer ${token.token}`
            }
        }
    }
}

export const BLAST_MAINNET_POINTS_URL = 'https://waitlist-api.prod.blast.io'
export const BLAST_TESTNET_POINTS_URL = 'https://waitlist-api.develop.testblast.io'

function pullEnvOperatorKey(): string {
    const OPERATOR_KEY = process.env.OPERATOR_KEY
    if (!OPERATOR_KEY) {
        throw new Error('Error: Set $OPERATOR_KEY env var');
    }
    return OPERATOR_KEY
}

function keyToAddress(key: string): string {
    return new ethers.Wallet(key).address;
}

function clockTokenExpiry() {
    return unixTimeNow() + 59 * 60 // 60 minute expirty with 1 minute buffer
}

function unixTimeNow() {
    return Math.floor(new Date().getTime() / 1000)
}

async function signMessageERC191 (message: string, operatorKey: string): Promise<string> {
    const wallet = new ethers.Wallet(operatorKey);
    return wallet.signMessage(message);
}
