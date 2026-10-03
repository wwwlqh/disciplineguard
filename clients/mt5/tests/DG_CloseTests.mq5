//+------------------------------------------------------------------+
//| DG_CloseTests.mq5                                                |
//| "Close outside trades" (SPEC §9.2) against simulated positions   |
//| in the Strategy Tester. It refuses to run anywhere else, so it   |
//| never touches a real account. Prints "DGTEST ok|FAIL" lines;     |
//| tests/close-tests.ps1 compiles and runs it.                      |
//+------------------------------------------------------------------+
#property strict
#include "../DG/AppPanel.mqh"

CTrade gPhone;              // stands in for the phone app: magic 0
int    gStep = 0, gChecks = 0, gFails = 0;
ulong  gWaitPos = 0;
long   gWaitUntil = 0;

void Check(const bool ok, const string what)
  {
   gChecks++;
   if(!ok) gFails++;
   Print("DGTEST ", ok ? "ok   " : "FAIL ", what);
  }

/// A signed payload as the server sends it, with only what these tests need.
void Rules(const bool closeOutside, const int r1Max = 0)
  {
   long now = NowMs(), day = 86400000;
   string resets = "[" + IntegerToString(now - day) + "," + IntegerToString(now + day) + "," + IntegerToString(now + 2 * day) + "]";
   string r1 = r1Max > 0 ? "{\"on\":true,\"max\":" + IntegerToString(r1Max) + "}" : "{\"on\":false,\"max\":5}";
   gCacheOk = gPJ.Parse("{\"v\":1,\"magic\":700000001,"
                        + "\"rules\":{\"R1\":" + r1 + ",\"R9\":{\"on\":true},\"accounts\":{},\"countOnce\":false,\"closeOutside\":" + (closeOutside ? "true" : "false") + "},"
                        + "\"popup\":{\"show\":\"breaks\",\"wait\":5},"
                        + "\"time\":{\"userResets\":" + resets + ",\"accountResets\":{},\"offsets\":[[0,0]]},"
                        + "\"accounts\":{\"a1\":{\"platform\":\"mt5\",\"last3\":\"001\",\"enforced\":true}},"
                        + "\"license\":{\"state\":\"free\",\"validUntil\":0,\"enforcing\":true}}");
  }

/// An outside trade, like one from the phone: magic 0. Gets its position and deal.
bool Outside(ulong &pos, ulong &deal)
  {
   gPhone.SetExpertMagicNumber(0);
   if(!gPhone.Buy(0.1, _Symbol)) return false;
   deal = gPhone.ResultDeal();
   if(deal == 0 || !HistoryDealSelect(deal)) return false;
   pos = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
   return pos > 0;
  }

void Job(const ulong pos, const ulong deal, const long t, const long due, const string rule)
  {
   string rules[1];
   rules[0] = rule;
   AddCloseJob(deal, pos, _Symbol, 1, 0.1, SymbolInfoDouble(_Symbol, SYMBOL_ASK), t, due, rules, "mobile");
  }

bool   IsOpen(const ulong pos) { return PositionSelectByTicket(pos); }
string Last() { return ArraySize(gQueue) > 0 ? gQueue[ArraySize(gQueue) - 1] : ""; }
bool   Reported(const string result) { return StringFind(Last(), "\"type\":\"auto_close\"") >= 0 && StringFind(Last(), "\"result\":\"" + result + "\"") >= 0; }

int OnInit()
  {
   if(!MQLInfoInteger(MQL_TESTER))
     {
      Print("DGTEST FAIL DG_CloseTests runs only in the Strategy Tester");
      return INIT_FAILED;
     }
   gKey = AccountKey(); gAcctId = "a1"; gAcctState = "active"; gConn = "c1"; gPrimary = true; gCursorLoaded = true;
   gQueueFile = "queue_test.txt";
   DGDelete(DG_JOBS_FILE);
   Rules(true);
   return gCacheOk ? INIT_SUCCEEDED : INIT_FAILED;
  }

void OnTick()
  {
   long now = NowMs();
   ulong pos = 0, deal = 0, other = 0, od = 0;
   switch(gStep)
     {
      case 0:
        {
         Check(Outside(pos, deal), "an outside trade opens");
         // ScanHistory only closes a fill whose order opened its position: true for every new hedging trade.
         Check((ulong)HistoryDealGetInteger(deal, DEAL_ORDER) == pos, "its order is the position it opened");
         Job(pos, deal, now, DG_NONE, "R1");
         ProcessCloseJobs();
         Check(!IsOpen(pos), "a trade that breaks a rule is closed at once");
         Check(ArraySize(gJobs) == 0 && Reported("closed"), "it is reported as closed");
         bool magic = false;
         if(HistorySelectByPosition((long)pos))
            for(int i = 0; i < HistoryDealsTotal(); i++)
              {
               ulong d = HistoryDealGetTicket(i);
               if(HistoryDealGetInteger(d, DEAL_ENTRY) == DEAL_ENTRY_OUT) magic = HistoryDealGetInteger(d, DEAL_MAGIC) == Magic();
              }
         Check(magic, "the closing deal carries the trader's own magic number");
         break;
        }
      case 1:
        {
         Check(Outside(pos, deal), "a trade with no stop loss opens");
         Job(pos, deal, now, now + DG_SL_GRACE_MS, "R9");
         ProcessCloseJobs();
         Check(IsOpen(pos) && ArraySize(gJobs) == 1, "it waits for a stop loss");
         Check(gPhone.PositionModify(pos, NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_BID) - 300 * _Point, _Digits), 0), "a stop loss is added");
         ProcessCloseJobs();
         Check(IsOpen(pos) && ArraySize(gJobs) == 0 && Reported("kept"), "with a stop loss added in time it stays open");
         gPhone.PositionClose(pos);
         break;
        }
      case 2:
        {
         Check(Outside(pos, deal), "another trade with no stop loss opens");
         Job(pos, deal, now, now + DG_SL_GRACE_MS, "R9");
         ProcessCloseJobs();
         Check(IsOpen(pos), "it stays open inside the 60 seconds");
         // A reload of the EA keeps the waiting job.
         gJobsLoaded = false;
         ArrayResize(gJobs, 0);
         EnsureCloseJobs();
         Check(ArraySize(gJobs) == 1 && gJobs[0].pos == pos && gJobs[0].deal == deal && gJobs[0].due == now + DG_SL_GRACE_MS
               && gJobs[0].rules == "R9" && gJobs[0].label == "mobile" && gJobs[0].sym == _Symbol, "a waiting job survives a reload");
         gWaitPos = pos;
         gWaitUntil = now + DG_SL_GRACE_MS;
         break;
        }
      case 3:
        {
         ProcessCloseJobs();
         if(now < gWaitUntil)
           {
            if(IsOpen(gWaitPos)) return;
            Check(false, "closed before the 60 seconds were up");
            break;
           }
         Check(!IsOpen(gWaitPos) && ArraySize(gJobs) == 0 && Reported("closed"), "with no stop loss after 60 seconds it is closed");
         break;
        }
      case 4:
        {
         Check(Outside(pos, deal) && Outside(other, od), "two trades open; the trader closes the first");
         gPhone.PositionClose(pos);
         Job(pos, deal, now, DG_NONE, "R1");
         ProcessCloseJobs();
         Check(ArraySize(gJobs) == 0 && Reported("gone") && IsOpen(other), "a trade closed first is reported gone, and nothing else is touched");
         gPhone.PositionClose(other);
         break;
        }
      case 5:
        {
         Check(Outside(pos, deal), "a fill from more than 5 minutes ago");
         Job(pos, deal, now - DG_CLOSE_LATE_MS - 1000, DG_NONE, "R1");
         ProcessCloseJobs();
         Check(IsOpen(pos) && ArraySize(gJobs) == 0 && Reported("failed") && StringFind(Last(), "wasn't running in time") >= 0, "it is never closed late");
         gPhone.PositionClose(pos);
         break;
        }
      case 6:
        {
         Rules(false);
         Check(Outside(pos, deal), "a trade with the setting off");
         Job(pos, deal, now, DG_NONE, "R1");
         ProcessCloseJobs();
         Check(IsOpen(pos) && ArraySize(gJobs) == 0 && Reported("off"), "with the setting off nothing is closed");
         gPhone.PositionClose(pos);
         break;
        }
      case 7:
        {
         // Through the history scan: another EA's trade past a rule is reported, never closed.
         Rules(true, 1);
         gScanFrom = now - 1000;
         Check(Outside(pos, deal) && Outside(other, od), "two trades from another EA, the second past 'Max trades per day'");
         ScanHistory();
         ProcessCloseJobs();
         Check(StringFind(Last(), "\"label\":\"ea\"") >= 0 && StringFind(Last(), "\"R1\"") >= 0, "the second is reported past the rule");
         Check(StringFind(Last(), "autoClose") < 0 && ArraySize(gJobs) == 0 && IsOpen(pos) && IsOpen(other), "and never closed");
         gPhone.PositionClose(pos);
         gPhone.PositionClose(other);
         break;
        }
      case 8:
         Print("DGTEST done ", gChecks - gFails, "/", gChecks, gFails == 0 ? " passed" : " FAILED");
         break;
      default:
         return;
     }
   gStep++;
  }

void OnDeinit(const int reason)
  {
   if(gStep < 9) Print("DGTEST FAIL stopped at step ", gStep);
   DGDelete(DG_JOBS_FILE);
  }
