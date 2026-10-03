// The content script on Kalshi: the shared bet counter (bets.ts) with Kalshi's page reader (kalshi.ts).
import { countBets } from './bets.ts';
import { orderTarget, KS_BROKER, readAccount, readEquity, readOrder } from './kalshi.ts';

countBets({ name: KS_BROKER, accountWord: 'account', prefix: 'ks', orderTarget, readAccount, readEquity, readOrder });
