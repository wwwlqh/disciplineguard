//+------------------------------------------------------------------+
//| AppTrades.mqh                                                    |
//| What the primary instance reports from the account (SPEC §4.4,   |
//| §5.2, §9.2): outside entries, closes, voided pending orders,     |
//| stop changes, the day-start balance, the loss limit being        |
//| reached, and offline heartbeats. With "Close outside trades" on, |
//| it also closes an outside trade that goes past a rule.           |
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

/// Which rules an outside fill went past. Its stop loss is the deal's, or the position's when the deal has none.
void EvaluateOutside(const ulong d, const long tms, const string sym, const int side, const double vol, string &rules[])
  {
   ulong pos = (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
   double sl = HistoryDealGetDouble(d, DEAL_SL);
   if(sl <= 0 && PositionSelectByTicket(pos)) sl = PositionGetDouble(POSITION_SL);
   EvaluateFill(tms, pos, sym, side, vol, sl, HistoryDealGetDouble(d, DEAL_PRICE), rules);
  }

//--- "Close outside trades" (SPEC §9.2) -------------------------------------
// Opt-in. A trade placed by hand outside DisciplineGuard (phone, web, the terminal's own order window) that goes
// past a rule is closed right after its fill. A missing stop loss alone gets DG_SL_GRACE_MS to be added. Only the
// position that outside order opened is ever closed: on a netting account, a fill that added to an open position
// is reported as usual and never touched. Jobs live in a file, so a reload doesn't drop one that is waiting.
#define DG_CLOSE_WINDOW_MS  120000   // only fills this recent are closed
#define DG_SL_GRACE_MS      60000    // a missing stop loss alone: time to add one
#define DG_CLOSE_LATE_MS    300000   // never close a fill older than this
#define DG_CLOSE_TRIES      3
#define DG_JOBS_FILE        "closing.txt"

struct DGCloseJob
  {
   ulong             deal;           // the outside entry deal
   ulong             pos;            // the position it opened
   string            sym;
   int               side;
   double            vol;
   double            price;
   long              t;              // fill time, UTC ms
   long              due;            // DG_NONE: close now. Otherwise the stop-loss deadline
   string            rules;          // comma-separated rule ids
   string            label;          // desktop, mobile or web
   int               tries;
  };

DGCloseJob gJobs[];
bool       gJobsLoaded = false;

bool CloseOutsideOn(const long now) { return PBool("rules.closeOutside") && Enforcing(now); }

/// Placed by hand: the terminal, the phone app or the web terminal. Never another EA's trades.
bool ByHand(const string label) { return label == "desktop" || label == "mobile" || label == "web"; }

/// The only rules gone past are about the missing stop loss (R9, or R6 without a stop).
bool OnlyNoStop(const string &rules[], const bool hasSl)
  {
   if(hasSl) return false;
   for(int i = 0; i < ArraySize(rules); i++) if(rules[i] != "R9" && rules[i] != "R6") return false;
   return ArraySize(rules) > 0;
  }

string JoinRules(const string &rules[])
  {
   string s = "";
   for(int i = 0; i < ArraySize(rules); i++) s += (i ? "," : "") + rules[i];
   return s;
  }

string PlacedWhere(const string label)
  {
   if(label == "mobile") return "on your phone";
   if(label == "web") return "on the web terminal";
   if(label == "desktop") return "in MetaTrader's order window";
   return "outside DisciplineGuard";
  }

void SaveCloseJobs()
  {
   string s = "";
   for(int i = 0; i < ArraySize(gJobs); i++)
      s += gKey + "\t" + IntegerToString((long)gJobs[i].deal) + "\t" + IntegerToString((long)gJobs[i].pos) + "\t" + gJobs[i].sym + "\t"
           + IntegerToString(gJobs[i].side) + "\t" + DoubleToString(gJobs[i].vol, 8) + "\t" + DoubleToString(gJobs[i].price, 10) + "\t"
           + IntegerToString(gJobs[i].t) + "\t" + IntegerToString(gJobs[i].due) + "\t" + gJobs[i].rules + "\t" + gJobs[i].label + "\t"
           + IntegerToString(gJobs[i].tries) + "\n";
   if(s == "") DGDelete(DG_JOBS_FILE);
   else DGWrite(DG_JOBS_FILE, s);
  }

/// Jobs of this account from the file: the instance that does the counting may have changed.
void EnsureCloseJobs()
  {
   if(gJobsLoaded) return;
   gJobsLoaded = true;
   ArrayResize(gJobs, 0);
   string lines[];
   int n = StringSplit(DGRead(DG_JOBS_FILE), '\n', lines);
   for(int i = 0; i < n; i++)
     {
      string f[];
      if(StringSplit(lines[i], '\t', f) != 12 || f[0] != gKey) continue;
      int k = ArraySize(gJobs);
      ArrayResize(gJobs, k + 1);
      gJobs[k].deal = (ulong)StringToInteger(f[1]); gJobs[k].pos = (ulong)StringToInteger(f[2]); gJobs[k].sym = f[3];
      gJobs[k].side = (int)StringToInteger(f[4]); gJobs[k].vol = StringToDouble(f[5]); gJobs[k].price = StringToDouble(f[6]);
      gJobs[k].t = StringToInteger(f[7]); gJobs[k].due = StringToInteger(f[8]); gJobs[k].rules = f[9]; gJobs[k].label = f[10];
      gJobs[k].tries = (int)StringToInteger(f[11]);
     }
  }

void AddCloseJob(const ulong deal, const ulong pos, const string sym, const int side, const double vol, const double price, const long t, const long due, const string &rules[], const string label)
  {
   EnsureCloseJobs();
   for(int i = 0; i < ArraySize(gJobs); i++) if(gJobs[i].deal == deal) return; // seen again after a reload
   int k = ArraySize(gJobs);
   ArrayResize(gJobs, k + 1);
   gJobs[k].deal = deal; gJobs[k].pos = pos; gJobs[k].sym = sym; gJobs[k].side = side; gJobs[k].vol = vol; gJobs[k].price = price;
   gJobs[k].t = t; gJobs[k].due = due; gJobs[k].rules = JoinRules(rules); gJobs[k].label = label; gJobs[k].tries = 0;
   SaveCloseJobs();
  }

/// Selects the position the job's outside order opened: false when it is closed, reversed or replaced.
bool SelectJobPosition(const DGCloseJob &j)
  {
   if(IsNetting())
     {
      if(!PositionSelect(j.sym) || (ulong)PositionGetInteger(POSITION_IDENTIFIER) != j.pos) return false;
     }
   else if(!PositionSelectByTicket(j.pos)) return false;
   return ((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) == (j.side > 0);
  }

/// Netting: no other order added to the position since. Hedging: a position is always one order.
bool OnlyThatOrder(const ulong pos)
  {
   if(!IsNetting()) return true;
   if(!HistorySelectByPosition((long)pos)) return false;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      long e = HistoryDealGetInteger(d, DEAL_ENTRY);
      if((e == DEAL_ENTRY_IN || e == DEAL_ENTRY_INOUT) && (ulong)HistoryDealGetInteger(d, DEAL_ORDER) != pos) return false;
     }
   return true;
  }

/// Closes the job's position. "closed", "gone" (closed already), "failed" (why says why), or "" to try again.
string CloseJobPosition(DGCloseJob &j, string &why)
  {
   why = "";
   if(!OnlyThatOrder(j.pos)) { why = "the position holds other trades now"; return SelectJobPosition(j) ? "failed" : "gone"; }
   if(!SelectJobPosition(j)) return "gone";
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)) { why = "this login can't trade"; return "failed"; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
     { why = "Algo Trading is off"; return "failed"; }
   ulong tk = (ulong)PositionGetInteger(POSITION_TICKET);
   gTrade.SetExpertMagicNumber((ulong)Magic());
   gTrade.SetAsyncMode(false);
   gTrade.SetDeviationInPoints(50);
   bool ok = gTrade.PositionClose(tk);
   uint rc = gTrade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED)) return "closed";
   if(rc == TRADE_RETCODE_POSITION_CLOSED || !SelectJobPosition(j)) return "gone";
   j.tries++;
   why = rc == TRADE_RETCODE_DONE_PARTIAL ? "only part of it closed" : (rc == 0 ? "MetaTrader refused the order" : gTrade.ResultRetcodeDescription());
   bool hopeless = rc == TRADE_RETCODE_MARKET_CLOSED || rc == TRADE_RETCODE_TRADE_DISABLED || rc == TRADE_RETCODE_CLIENT_DISABLES_AT || rc == TRADE_RETCODE_SERVER_DISABLES_AT;
   return hopeless || j.tries >= DG_CLOSE_TRIES ? "failed" : "";
  }

/// Reports what happened to a job, on the panel and to the server (the Windows app shows the alert).
void CloseJobDone(const DGCloseJob &j, const string result, const string why)
  {
   string rules[];
   int n = StringSplit(j.rules, ',', rules);
   DGJsonWriter w;
   EvBegin(w, "auto_close", NowMs());
   w.Str("ticket", "d" + IntegerToString((long)j.deal));
   w.Str("symbol", j.sym);
   w.Str("side", j.side > 0 ? "buy" : "sell");
   w.Num("size", j.vol);
   w.Str("label", j.label);
   w.BeginArr("violations");
   for(int k = 0; k < n; k++) w.Str("", rules[k]);
   w.EndArr();
   w.Str("result", result);
   if(why != "") w.Str("reason", why);
   Enqueue(w);
   string rule = n > 0 ? DGRuleName(rules[0]) : "Check your plan";
   string where = PlacedWhere(j.label);
   if(result == "closed") gOutsideCard = "Closed a trade placed " + where + ". It went past your '" + rule + "'.";
   else if(result == "failed") gOutsideCard = "Couldn't close a trade placed " + where + " (" + why + "). It went past your '" + rule + "'. Close it yourself.";
   else if(result == "kept") gOutsideCard = "Stop loss added in time. The trade stays open and counts toward today.";
   else if(result == "off") gOutsideCard = "A trade placed " + where + " went past your '" + rule + "'. It counts toward today.";
   else gOutsideCard = "";
   gOutsideCardTick = GetTickCount64();
  }

/// Every timer cycle, after the history scan: waits for stop losses, closes, retries and reports.
void ProcessCloseJobs()
  {
   if(!Tracking()) { gJobsLoaded = false; return; }
   EnsureCloseJobs();
   if(ArraySize(gJobs) == 0) return;
   long now = NowMs();
   bool changed = false;
   for(int i = 0; i < ArraySize(gJobs); i++)
     {
      string result = "", why = "";
      if(!CloseOutsideOn(now)) result = "off";
      else if(gJobs[i].due != DG_NONE)
        {
         // Waiting for a stop loss: added in time and nothing else broken, it stays.
         if(!SelectJobPosition(gJobs[i])) result = "gone";
         else
           {
            double sl = PositionGetDouble(POSITION_SL);
            if(sl > 0)
              {
               string rules[];
               EvaluateFill(gJobs[i].t, gJobs[i].pos, gJobs[i].sym, gJobs[i].side, gJobs[i].vol, sl, gJobs[i].price, rules);
               if(ArraySize(rules) == 0) result = "kept";
               else if(!OnlyNoStop(rules, true)) { gJobs[i].rules = JoinRules(rules); gJobs[i].due = DG_NONE; changed = true; }
              }
            else if(now >= gJobs[i].due) { gJobs[i].due = DG_NONE; changed = true; }
           }
        }
      if(result == "" && gJobs[i].due == DG_NONE)
        {
         if(now - gJobs[i].t <= DG_CLOSE_LATE_MS) result = CloseJobPosition(gJobs[i], why);
         else if(!SelectJobPosition(gJobs[i])) result = "gone";
         else { result = "failed"; why = "DisciplineGuard wasn't running in time"; }
         changed = true;
        }
      if(result == "") continue;
      CloseJobDone(gJobs[i], result, why);
      for(int k = i; k < ArraySize(gJobs) - 1; k++) gJobs[k] = gJobs[k + 1];
      ArrayResize(gJobs, ArraySize(gJobs) - 1);
      i--;
      changed = true;
     }
   if(changed) SaveCloseJobs();
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
      string label = DealLabel(HistoryDealGetInteger(d, DEAL_REASON));
      ulong pos = (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
      // "Close outside trades": a fill placed by hand just now that opened its own position (always so on hedging).
      bool closeIt = ArraySize(rules) > 0 && ByHand(label) && now - tms < DG_CLOSE_WINDOW_MS
                     && (ulong)HistoryDealGetInteger(d, DEAL_ORDER) == pos && CloseOutsideOn(now);
      bool waitSl = closeIt && OnlyNoStop(rules, gM.oHasSl);
      DGJsonWriter w;
      EvBegin(w, "entry", tms);
      w.Str("ticket", "d" + IntegerToString((long)d));
      w.Str("symbol", sym);
      w.Str("side", side > 0 ? "buy" : "sell");
      w.Num("size", vol);
      w.Str("source", "outside");
      w.Str("label", label);
      w.BeginArr("violations");
      for(int k = 0; k < ArraySize(rules); k++) w.Str("", rules[k]);
      w.EndArr();
      if(closeIt) w.Bool("autoClose", true);
      Enqueue(w);
      if(closeIt)
        {
         AddCloseJob(d, pos, sym, side, vol, HistoryDealGetDouble(d, DEAL_PRICE), tms, waitSl ? tms + DG_SL_GRACE_MS : DG_NONE, rules, label);
         if(waitSl)
           {
            gOutsideCard = "A trade placed " + PlacedWhere(label) + " has no stop loss. Add one within " + IntegerToString(DG_SL_GRACE_MS / 1000) + " seconds or DisciplineGuard closes it.";
            gOutsideCardTick = GetTickCount64();
           }
        }
      else if(ArraySize(rules) > 0 && now - tms < 5 * (long)DG_MIN && Enforcing(now))
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

#endif
