// The content script on Polymarket: the shared bet guard (bets.ts) with Polymarket's page reader (pm.ts).
import { guardBets } from './bets.ts';
import { guardedTarget, PM_BROKER, readAccount, readEquity, readOrder } from './pm.ts';

guardBets({ name: PM_BROKER, accountWord: 'wallet', prefix: 'pm', guardedTarget, readAccount, readEquity, readOrder });
