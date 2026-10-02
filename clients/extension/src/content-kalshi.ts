// The content script on Kalshi: the shared bet guard (bets.ts) with Kalshi's page reader (kalshi.ts).
import { guardBets } from './bets.ts';
import { guardedTarget, KS_BROKER, readAccount, readEquity, readOrder } from './kalshi.ts';

guardBets({ name: KS_BROKER, accountWord: 'account', prefix: 'ks', guardedTarget, readAccount, readEquity, readOrder });
