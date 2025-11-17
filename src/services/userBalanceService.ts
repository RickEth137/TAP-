// User Balance Management System
// Tracks user deposits/withdrawals and balances using localStorage
// Format: { [walletAddress]: { balance: number, deposits: [], withdrawals: [], bets: [] } }

export interface UserDeposit {
  txSignature: string;
  amount: number;
  timestamp: number;
  verified?: boolean; // Track if deposit was verified on-chain
  verifiedAt?: number;
}

export interface UserWithdrawal {
  txSignature: string;
  amount: number;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed';
}

export interface UserBet {
  betId: string;
  amount: number;
  result?: 'win' | 'loss';
  pnl?: number;
  timestamp: number;
}

export interface UserBalance {
  walletAddress: string;
  balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalBets: number;
  totalWinnings: number;
  deposits: UserDeposit[];
  withdrawals: UserWithdrawal[];
  bets: UserBet[];
  lastUpdated: number;
}

const STORAGE_KEY = 'tap_user_balances';
const UNIVERSAL_WALLET = 'AwKkSwLykXo1e8H4sA3ZZhHXWGH5w1Jkt5eVTt7rresB';

export class UserBalanceService {
  private static getData(): Record<string, UserBalance> {
    if (typeof window === 'undefined') return {};
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private static saveData(data: Record<string, UserBalance>): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  static getUserBalance(walletAddress: string): UserBalance {
    const data = this.getData();
    return data[walletAddress] || {
      walletAddress,
      balance: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalBets: 0,
      totalWinnings: 0,
      deposits: [],
      withdrawals: [],
      bets: [],
      lastUpdated: Date.now(),
    };
  }

  static recordDeposit(walletAddress: string, amount: number, txSignature: string): UserBalance {
    const data = this.getData();
    const userBalance = this.getUserBalance(walletAddress);

    userBalance.deposits.push({
      txSignature,
      amount,
      timestamp: Date.now(),
      verified: false, // Will be verified by admin/system
    });
    userBalance.balance += amount;
    userBalance.totalDeposits += amount;
    userBalance.lastUpdated = Date.now();

    data[walletAddress] = userBalance;
    this.saveData(data);

    console.log(`💰 Deposit recorded (pending verification): ${walletAddress} +$${amount}`);
    return userBalance;
  }

  static verifyDeposit(walletAddress: string, txSignature: string): UserBalance {
    const data = this.getData();
    const userBalance = this.getUserBalance(walletAddress);

    const deposit = userBalance.deposits.find(d => d.txSignature === txSignature);
    if (deposit) {
      deposit.verified = true;
      deposit.verifiedAt = Date.now();
      userBalance.lastUpdated = Date.now();
      
      data[walletAddress] = userBalance;
      this.saveData(data);
      
      console.log(`✅ Deposit verified: ${walletAddress} ${txSignature}`);
    }

    return userBalance;
  }

  static recordBet(walletAddress: string, betId: string, amount: number): UserBalance {
    const data = this.getData();
    const userBalance = this.getUserBalance(walletAddress);

    if (userBalance.balance < amount) {
      throw new Error('Insufficient balance');
    }

    userBalance.bets.push({
      betId,
      amount,
      timestamp: Date.now(),
    });
    userBalance.balance -= amount;
    userBalance.totalBets += amount;
    userBalance.lastUpdated = Date.now();

    data[walletAddress] = userBalance;
    this.saveData(data);

    console.log(`🎲 Bet recorded: ${walletAddress} -$${amount} (${betId})`);
    return userBalance;
  }

  static recordBetResult(
    walletAddress: string,
    betId: string,
    result: 'win' | 'loss',
    pnl: number
  ): UserBalance {
    const data = this.getData();
    const userBalance = this.getUserBalance(walletAddress);

    const bet = userBalance.bets.find((b) => b.betId === betId);
    if (bet) {
      bet.result = result;
      bet.pnl = pnl;
    }

    if (result === 'win') {
      userBalance.balance += pnl;
      userBalance.totalWinnings += pnl;
    }

    userBalance.lastUpdated = Date.now();
    data[walletAddress] = userBalance;
    this.saveData(data);

    console.log(`${result === 'win' ? '✅' : '❌'} Bet result: ${walletAddress} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
    return userBalance;
  }

  static requestWithdrawal(walletAddress: string, amount: number): UserBalance {
    const data = this.getData();
    const userBalance = this.getUserBalance(walletAddress);

    if (userBalance.balance < amount) {
      throw new Error('Insufficient balance');
    }

    const txSignature = `withdrawal-pending-${Date.now()}`;
    userBalance.withdrawals.push({
      txSignature,
      amount,
      timestamp: Date.now(),
      status: 'pending',
    });
    userBalance.balance -= amount;
    userBalance.lastUpdated = Date.now();

    data[walletAddress] = userBalance;
    this.saveData(data);

    console.log(`💸 Withdrawal requested: ${walletAddress} -$${amount}`);
    return userBalance;
  }

  static getUniversalWalletAddress(): string {
    return UNIVERSAL_WALLET;
  }

  static getAllUsers(): UserBalance[] {
    const data = this.getData();
    return Object.values(data);
  }

  static getTotalPoolBalance(): number {
    const users = this.getAllUsers();
    return users.reduce((sum, user) => sum + user.balance, 0);
  }
}

export default UserBalanceService;
