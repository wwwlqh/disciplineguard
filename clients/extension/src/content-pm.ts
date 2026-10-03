// The content script on Polymarket: the shared bet counter (bets.ts) with Polymarket's page reader (pm.ts).
import { countBets } from './bets.ts';
import { orderTarget, PM_BROKER, readAccount, readEquity, readOrder } from './pm.ts';

countBets({ name: PM_BROKER, accountWord: 'wallet', prefix: 'pm', orderTarget, readAccount, readEquity, readOrder });
