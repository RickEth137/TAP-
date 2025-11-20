
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

export interface UserDeposit {
  txSignature: string;
  amount: number;
  timestamp: number;
  verified: boolean;
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
  txSignature?: string;
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

interface DatabaseSchema {
  users: Record<string, UserBalance>;
}

// Initialize DB if not exists
if (!fs.existsSync(DB_PATH)) {
  const initialData: DatabaseSchema = { users: {} };
  fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
}

export class Database {
  private static read(): DatabaseSchema {
    try {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Database read error:', error);
      return { users: {} };
    }
  }

  private static write(data: DatabaseSchema): void {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Database write error:', error);
    }
  }

  static getUser(walletAddress: string): UserBalance {
    const db = this.read();
    if (!db.users[walletAddress]) {
      db.users[walletAddress] = {
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
      this.write(db);
    }
    return db.users[walletAddress];
  }

  static updateUser(walletAddress: string, updates: Partial<UserBalance>): UserBalance {
    const db = this.read();
    const user = db.users[walletAddress] || this.getUser(walletAddress);
    
    const updatedUser = { ...user, ...updates, lastUpdated: Date.now() };
    db.users[walletAddress] = updatedUser;
    this.write(db);
    
    return updatedUser;
  }

  static getAllUsers(): UserBalance[] {
    const db = this.read();
    return Object.values(db.users);
  }
}
