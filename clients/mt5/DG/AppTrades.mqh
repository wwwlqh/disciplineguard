//+------------------------------------------------------------------+
//| AppTrades.mqh                                                    |
//| What the primary instance reports from the account (SPEC §4.4,   |
//| §5.2, §9.2): outside entries, closes, voided pending orders,     |
//| stop changes, the day-start balance, the loss limit being        |
//| reached, offline heartbeats, and the baseline upload.            |
//+------------------------------------------------------------------+
#ifndef DG_APPTRADES_MQH
#define DG_APPTRADES_MQH

#include "AppModel.mqh"

ulong    gSeen[];
long     gSeenT[];
ulong    gTrackOrders[];
ulong    gPosT[];
double   gPosSl[];
long     gLimitSentDay = DG_NONE;
string   gOutsideCard = "";          // "A trade placed outside DisciplineGuard went past …"
ulong    gOutsideCardTick = 0;

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

/// Which rules an outside fill went past, judged at its fill time with the state before it.
void EvaluateOutside(const ulong d, const long tms, const string sym, const int side, const double vol, string &rules[])
  {
   ArrayResize(rules, 0);
   ulong pos = (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
   BuildModel(tms, pos, vol);
   if(!gCacheOk) return;
   gM.oPlat = "mt5"; gM.oAcct = gAcctId; gM.oSym = sym; gM.oSide = side; gM.oSize = vol; gM.oType = "market";
   double res, ns; bool rev;
   gM.oKind = gM.Classify(gAcctId, "mt5", IsNetting(), sym, side, vol, true, res, ns, rev);
   double sl = HistoryDealGetDouble(d, DEAL_SL);
   if(sl <= 0 && PositionSelectByTicket(pos)) sl = PositionGetDouble(POSITION_SL);
   gM.oHasSl = sl > 0; gM.oSl = sl;
   gM.oHasPrice = true; gM.oPrice = HistoryDealGetDouble(d, DEAL_PRICE);
   SetOrderSpec(sym);
   gM.Evaluate(tms);
   ArrayResize(rules, ArraySize(gM.vRule));
   for(int i = 0; i < ArraySize(gM.vRule); i++) rules[i] = gM.vRule[i];
  }

void ScanHistory()
  {
   if(!Tracking()) return;
   long off = BrokerOffsetSec();
   datetime from = (datetime)((gScanFrom - 60000) / 1000 + off);
   if(!HistorySelect(from, TimeTradeServer() + 86400)) return;
   long magic = Magic();
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
      // Panel fills were reported by the chart that placed them (§4.4).
      if(magic != 0 && HistoryDealGetInteger(d, DEAL_MAGIC) == magic) continue;
      string rules[];
      EvaluateOutside(d, tms, sym, side, vol, rules);
      DGJsonWriter w;
      EvBegin(w, "entry", tms);
      w.Str("ticket", "d" + IntegerToString((long)d));
      w.Str("symbol", sym);
      w.Str("side", side > 0 ? "buy" : "sell");
      w.Num("size", vol);
      w.Str("source", "outside");
      w.Str("label", DealLabel(HistoryDealGetInteger(d, DEAL_REASON)));
      w.BeginArr("violations");
      for(int k = 0; k < ArraySize(rules); k++) w.Str("", rules[k]);
      w.EndArr();
      Enqueue(w);
      if(ArraySize(rules) > 0 && now - tms < 5 * (long)DG_MIN && Enforcing(now))
        {
         gOutsideCard = "A trade placed outside DisciplineGuard went past your '" + DGRuleName(rules[0]) + "'. It counts toward today.";
         gOutsideCardTick = GetTickCount64();
        }
     }
   gScanFrom = maxT;
   PruneSeen(gScanFrom - 120000);
  }

bool IsPendingType(const long t)
  {
   return t == ORDER_TYPE_BUY_LIMIT || t == ORDER_TYPE_SELL_LIMIT || t == ORDER_TYPE_BUY_STOP || t == ORDER_TYPE_SELL_STOP
          || t == ORDER_TYPE_BUY_STOP_LIMIT || t == ORDER_TYPE_SELL_STOP_LIMIT;
  }

/// Panel pending orders count when placed; one cancelled or expired with nothing filled is voided (§4.4).
void TrackPendingOrders()
  {
   if(!Tracking()) return;
   long magic = Magic();
   if(magic == 0) return;
   ulong open[];
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0 || OrderGetInteger(ORDER_MAGIC) != magic || !IsPendingType(OrderGetInteger(ORDER_TYPE))) continue;
      int n = ArraySize(open); ArrayResize(open, n + 1); open[n] = t;
      bool known = false;
      for(int k = 0; k < ArraySize(gTrackOrders); k++) if(gTrackOrders[k] == t) known = true;
      if(!known) { int m = ArraySize(gTrackOrders); ArrayResize(gTrackOrders, m + 1); gTrackOrders[m] = t; }
     }
   int keep = 0;
   for(int k = 0; k < ArraySize(gTrackOrders); k++)
     {
      ulong t = gTrackOrders[k];
      bool still = false;
      for(int i = 0; i < ArraySize(open); i++) if(open[i] == t) still = true;
      if(still) { gTrackOrders[keep++] = t; continue; }
      if(!HistoryOrderSelect(t)) { gTrackOrders[keep++] = t; continue; } // history not loaded yet
      long st = HistoryOrderGetInteger(t, ORDER_STATE);
      double filled = HistoryOrderGetDouble(t, ORDER_VOLUME_INITIAL) - HistoryOrderGetDouble(t, ORDER_VOLUME_CURRENT);
      if((st == ORDER_STATE_CANCELED || st == ORDER_STATE_EXPIRED || st == ORDER_STATE_REJECTED) && filled <= 1e-9)
        {
         DGJsonWriter w;
         EvBegin(w, "entry_void", NowMs());
         w.Str("ticket", "o" + IntegerToString((long)t));
         Enqueue(w);
        }
     }
   ArrayResize(gTrackOrders, keep);
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

//--- baseline (SPEC §14): last 90 days, once, with consent ---------------
string   gBase[];
int      gBaseIdx = -1;
int      gBaseEnd = 0;

void BuildBaseline()
  {
   ArrayResize(gBase, 0);
   long off = BrokerOffsetSec();
   long now = NowMs();
   long magic = Magic();
   if(!HistorySelect((datetime)((now - 90 * (long)DG_DAY) / 1000 + off), TimeTradeServer() + 86400)) return;
   int n = HistoryDealsTotal();
   for(int i = 0; i < n; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      long type = HistoryDealGetInteger(d, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      long tms = HistoryDealGetInteger(d, DEAL_TIME_MSC) - off * 1000;
      DGJsonWriter w;
      w.BeginObj();
      w.Str("ticket", "d" + IntegerToString((long)d));
      w.Long("t", tms);
      if(entry == DEAL_ENTRY_IN)
        {
         w.Str("kind", "entry");
         w.Str("symbol", HistoryDealGetString(d, DEAL_SYMBOL));
         w.Str("side", type == DEAL_TYPE_BUY ? "buy" : "sell");
         w.Num("size", HistoryDealGetDouble(d, DEAL_VOLUME));
         w.Str("source", magic != 0 && HistoryDealGetInteger(d, DEAL_MAGIC) == magic ? "panel" : DealLabel(HistoryDealGetInteger(d, DEAL_REASON)));
        }
      else
        {
         w.Str("kind", "close");
         w.Num("net", DGRound8(HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_FEE)));
         w.Num("size", HistoryDealGetDouble(d, DEAL_VOLUME));
        }
      w.EndObj();
      int k = ArraySize(gBase); ArrayResize(gBase, k + 1); gBase[k] = w.Text();
     }
   gBaseIdx = 0;
  }

/// Sends one chunk. Returns true when a request went to the app.
bool BaselineTick()
  {
   if(!gPrimary || !Linked() || gAcctState != "active" || !gBridge.baseline) return false;
   string done = "baseline_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".done";
   if(DGExists(done)) return false;
   if(!gBridge.MayCall()) return false;
   if(gBaseIdx < 0) BuildBaseline();
   int end = MathMin(ArraySize(gBase), gBaseIdx + 500);
   DGJsonWriter w;
   w.BeginObj();
   w.BeginObj("account");
   w.Str("platform", "mt5");
   w.Str("server", AccountInfoString(ACCOUNT_SERVER));
   w.Str("login", IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)));
   w.EndObj();
   w.BeginArr("items");
   for(int i = gBaseIdx; i < end; i++) w.Raw("", gBase[i]);
   w.EndArr();
   w.Bool("done", end >= ArraySize(gBase));
   w.EndObj();
   if(!gBridge.Send("/v1/baseline", w.Text())) return false;
   gBaseEnd = end;
   return true;
  }

void OnBaselineReply(const int code)
  {
   string done = "baseline_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".done";
   if(code == 200)
     {
      gBaseIdx = gBaseEnd;
      if(gBaseIdx >= ArraySize(gBase)) { DGWrite(done, "1"); ArrayResize(gBase, 0); gBaseIdx = -1; }
     }
   else if(code == 404 || code == 400) DGWrite(done, "1");
  }

#endif
