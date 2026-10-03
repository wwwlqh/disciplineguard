//+------------------------------------------------------------------+
//| AppTrades.mqh                                                    |
//| What the primary instance reports from the account (SPEC §4.4,   |
//| §5.2, §9.2): every entry with the rules it broke, closes, stop   |
//| changes, the day-start balance, the loss limit being reached,    |
//| and offline heartbeats. It never places, changes or closes a     |
//| trade.                                                           |
//+------------------------------------------------------------------+
#ifndef DG_APPTRADES_MQH
#define DG_APPTRADES_MQH

#include "AppModel.mqh"

ulong    gSeen[];
long     gSeenT[];
ulong    gPosT[];
double   gPosSl[];
long     gLimitSentDay = DG_NONE;
string   gBreakCard = "";            // "Trade 4 today. Your limit is 3. It counts toward today."
ulong    gBreakCardTick = 0;

bool Tracking() { return gPrimary && Linked() && gCursorLoaded && gAcctId != "" && gAcctState == "active"; }

bool Seen(const ulong d) { for(int i = 0; i < ArraySize(gSeen); i++) if(gSeen[i] == d) return true; return false; }

void MarkSeen(const ulong d, const long t)
  {
   int n = ArraySize(gSeen);
   ArrayResize(gSeen, n + 1); ArrayResize(gSeenT, n + 1);
   gSeen[n] = d; gSeenT[n] = t;
  }

void PruneSeen(const long before)
  {
   int k = 0;
   for(int i = 0; i < ArraySize(gSeen); i++) if(gSeenT[i] >= before) { gSeen[k] = gSeen[i]; gSeenT[k] = gSeenT[i]; k++; }
   ArrayResize(gSeen, k); ArrayResize(gSeenT, k);
  }

string DealLabel(const long reason)
  {
   if(reason == DEAL_REASON_CLIENT) return "desktop";
   if(reason == DEAL_REASON_MOBILE) return "mobile";
   if(reason == DEAL_REASON_WEB) return "web";
   if(reason == DEAL_REASON_EXPERT) return "ea";
   return "other";
  }

void SetOrderSpec(const string sym)
  {
   gM.oHasSpec = true;
   gM.oTick = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   gM.oTickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(gM.oTickValue <= 0) gM.oTickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   gM.oStep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   gM.oMin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
  }

/// Which rules a fill went past, judged at its fill time with the state before it.
void EvaluateFill(const long tms, const ulong pos, const string sym, const int side, const double vol, const double sl, const double price, string &rules[])
  {
   ArrayResize(rules, 0);
   BuildModel(tms, pos, vol);
   if(!gCacheOk) return;
   gM.oPlat = "mt5"; gM.oAcct = gAcctId; gM.oSym = sym; gM.oSide = side; gM.oSize = vol; gM.oType = "market";
   double res, ns; bool rev;
   gM.oKind = gM.Classify(gAcctId, "mt5", IsNetting(), sym, side, vol, true, res, ns, rev);
   gM.oHasSl = sl > 0; gM.oSl = sl;
   gM.oHasPrice = true; gM.oPrice = price;
   SetOrderSpec(sym);
   gM.Evaluate(tms);
   ArrayResize(rules, ArraySize(gM.vRule));
   for(int i = 0; i < ArraySize(gM.vRule); i++) rules[i] = gM.vRule[i];
  }

/// Which rules a fill broke. Its stop loss is the deal's, or the position's when the deal has none.
void EvaluateDeal(const ulong d, const long tms, const string sym, const int side, const double vol, string &rules[])
  {
   ulong pos = (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
   double sl = HistoryDealGetDouble(d, DEAL_SL);
   if(sl <= 0 && PositionSelectByTicket(pos)) sl = PositionGetDouble(POSITION_SL);
   EvaluateFill(tms, pos, sym, side, vol, sl, HistoryDealGetDouble(d, DEAL_PRICE), rules);
  }

void ScanHistory()
  {
   if(!Tracking()) return;
   long off = BrokerOffsetSec();
   datetime from = (datetime)((gScanFrom - 60000) / 1000 + off);
   if(!HistorySelect(from, TimeTradeServer() + 86400)) return;
   long maxT = gScanFrom;
   long now = NowMs();
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0 || Seen(d)) continue;
      long tms = HistoryDealGetInteger(d, DEAL_TIME_MSC) - off * 1000;
      if(tms < gScanFrom - 60000) continue;
      MarkSeen(d, tms);
      if(tms > maxT) maxT = tms;
      long type = HistoryDealGetInteger(d, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      string sym = HistoryDealGetString(d, DEAL_SYMBOL);
      double vol = HistoryDealGetDouble(d, DEAL_VOLUME);
      int side = type == DEAL_TYPE_BUY ? 1 : -1;
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY || entry == DEAL_ENTRY_INOUT)
        {
         double net = HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_FEE);
         DGJsonWriter w;
         EvBegin(w, "close", tms);
         w.Str("ticket", "d" + IntegerToString((long)d));
         w.Num("net", DGRound8(net));
         w.Num("size", vol);
         Enqueue(w);
         continue;
        }
      if(entry != DEAL_ENTRY_IN) continue;
      string rules[];
      EvaluateDeal(d, tms, sym, side, vol, rules);
      string label = DealLabel(HistoryDealGetInteger(d, DEAL_REASON));
      DGJsonWriter w;
      EvBegin(w, "entry", tms);
      w.Str("ticket", "d" + IntegerToString((long)d));
      w.Str("symbol", sym);
      w.Str("side", side > 0 ? "buy" : "sell");
      w.Num("size", vol);
      w.Str("source", "history");
      w.Str("label", label);
      w.BeginArr("violations");
      for(int k = 0; k < ArraySize(rules); k++) w.Str("", rules[k]);
      w.EndArr();
      Enqueue(w);
      // A recent trade that broke a rule: the card says which, in words (EXPERIENCE §9).
      if(ArraySize(rules) > 0 && now - tms < 5 * (long)DG_MIN && Enforcing(now))
        {
         gBreakCard = DGBreakLine(gM, 0, tms) + " It counts toward today.";
         gBreakCardTick = GetTickCount64();
        }
     }
   gScanFrom = maxT;
   PruneSeen(gScanFrom - 120000);
  }

/// R6 limit in money for this account, or -1 when R6 is off or unknown.
double R6Limit()
  {
   int ar = gM.AcctRule(gAcctId);
   if(!gM.r6On || ar < 0 || !gM.arHasR6[ar]) return -1;
   if(!gM.arR6Pct[ar]) return gM.arR6[ar];
   int s = gM.AcctState(gAcctId);
   if(s < 0 || !gM.sHasDsb[s]) return -1;
   return gM.arR6[ar] * gM.sDsb[s] / 100.0;
  }

double RiskAt(const string sym, const double open, const double sl, const double vol)
  {
   double tick = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv <= 0) tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   if(tick <= 0) return 0;
   return MathAbs(open - sl) / tick * tv * vol;
  }

/// Stop removed, or moved so R6 risk goes past the limit. Recorded, never paused (§9.2).
void TrackStops()
  {
   if(!Tracking()) return;
   double limit = R6Limit();
   ulong nt[];
   double ns[];
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      double sl = PositionGetDouble(POSITION_SL);
      int n = ArraySize(nt); ArrayResize(nt, n + 1); ArrayResize(ns, n + 1); nt[n] = tk; ns[n] = sl;
      for(int k = 0; k < ArraySize(gPosT); k++)
        {
         if(gPosT[k] != tk || gPosSl[k] == sl) continue;
         string kind = "";
         if(gPosSl[k] > 0 && sl <= 0) kind = "removed";
         else if(gPosSl[k] > 0 && sl > 0 && limit >= 0)
           {
            string sym = PositionGetString(POSITION_SYMBOL);
            double open = PositionGetDouble(POSITION_PRICE_OPEN), vol = PositionGetDouble(POSITION_VOLUME);
            if(MathAbs(open - sl) > MathAbs(open - gPosSl[k]) && RiskAt(sym, open, sl, vol) > limit + 1e-9 && RiskAt(sym, open, gPosSl[k], vol) <= limit + 1e-9)
               kind = "widened";
           }
         if(kind != "")
           {
            DGJsonWriter w;
            EvBegin(w, "stop_change", NowMs());
            w.Str("ticket", "p" + IntegerToString((long)tk));
            w.Str("kind", kind);
            Enqueue(w);
           }
        }
     }
   ArrayResize(gPosT, ArraySize(nt)); ArrayResize(gPosSl, ArraySize(ns));
   for(int i = 0; i < ArraySize(nt); i++) { gPosT[i] = nt[i]; gPosSl[i] = ns[i]; }
  }

/// Balance at the account's day start: today's balance minus every deal since the reset (§5.2).
void DayStartCheck(const long now)
  {
   if(!Tracking() || !gCacheOk) return;
   long rs[];
   gM.AccountResets(gAcctId, rs);
   long start, end;
   gM.DayOf(rs, now, start, end);
   if(start == LONG_MIN || gLocalDsbDay == start) return;
   int s = gM.AcctState(gAcctId);
   if(s >= 0 && gM.sHasDsb[s]) { gLocalDsbDay = start; gLocalDsb = gM.sDsb[s]; return; }
   long off = BrokerOffsetSec();
   if(!HistorySelect((datetime)(start / 1000 + off), TimeTradeServer() + 86400)) return;
   double sum = 0;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0 || HistoryDealGetInteger(d, DEAL_TIME_MSC) - off * 1000 < start) continue;
      sum += HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_FEE);
     }
   gLocalDsb = DGRound8(AccountInfoDouble(ACCOUNT_BALANCE) - sum);
   gLocalDsbDay = start;
   DGJsonWriter w;
   EvBegin(w, "day_start", now);
   w.Long("dayStart", start);
   w.Num("balance", gLocalDsb);
   Enqueue(w);
  }

void LimitCheck(const long now)
  {
   if(!Tracking() || !gM.r8On) return;
   bool inL; double loss, lim; long until;
   long t = gM.SafeNow(now);
   if(!gM.R8Status(gAcctId, t, inL, loss, lim, until) || !inL) return;
   long rs[];
   gM.AccountResets(gAcctId, rs);
   long start, end;
   gM.DayOf(rs, t, start, end);
   int s = gM.AcctState(gAcctId);
   if(s >= 0 && gM.sLimitAt[s] != DG_NONE && gM.sLimitAt[s] >= start) return;
   if(gLimitSentDay == start) return;
   gLimitSentDay = start;
   gLocalLimitAt = t;
   DGJsonWriter w;
   EvBegin(w, "limit_reached", t);
   w.Long("dayStart", start);
   w.Num("loss", DGRound8(loss));
   w.Num("limit", DGRound8(lim));
   Enqueue(w);
  }

/// While offline, heartbeats queue with their own time so coverage still counts later (§10.6).
void OfflineHeartbeat()
  {
   if(!gPrimary || !gOffline || !Linked() || gAcctId == "") return;
   if(GetTickCount64() - gLastHb < DG_OFFLINE_HB_MS) return;
   gLastHb = GetTickCount64();
   DGJsonWriter w;
   EvBegin(w, "hb", NowMs());
   Enqueue(w, false);
  }

#endif
