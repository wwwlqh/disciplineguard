//+------------------------------------------------------------------+
//| AppPause.mqh                                                     |
//| The pause on MT (EXPERIENCE §9, SPEC §7): canvas card over a     |
//| dimmed chart, Skip this trade as the primary button, Place       |
//| anyway after the wait, fix buttons, type-to-confirm, reason      |
//| chips, skip card. Place anyway only reacts to a mouse click on   |
//| its button; Esc skips; Enter does nothing.                       |
//+------------------------------------------------------------------+
#ifndef DG_APPPAUSE_MQH
#define DG_APPPAUSE_MQH

#include "AppTrades.mqh"

#define DG_PAUSE_TIMEOUT_MS 120000

string DGChips[] = {"Afraid to miss it", "Winning back a loss", "Frustrated", "Bored", "On a roll", "In my plan"};
string DGChipIds[] = {"fomo", "win_back", "frustrated", "bored", "on_a_roll", "in_plan"};

//--- the order a pause is about
string   pzSym = "", pzType = "market";
int      pzSide = 1;
double   pzSize = 0, pzPrice = 0, pzSl = 0, pzTp = 0;

bool     pzOpen = false, pzPractice = false, pzCompact = false;
string   pzId = "";
ulong    pzStartTick = 0, pzUnlockTick = 0;
int      pzWait = 0, pzTc = -1, pzReattempt = -1, pzPlaced = 0, pzTradeNo = 0, pzLastSec = -1;
int      pzChip = -1;
string   pzRules[];
string   pzTitle = "", pzHeadline = "", pzOthers = "", pzWayOut = "";
string   pzKept = "", pzSituation = "", pzToday = "", pzOrderLine = "", pzGrow = "", pzHint = "";
bool     pzFixSize = false, pzFixSl = false;
double   pzFixLots = 0;

DGSurface gBackdrop, gCard, gSkipCard;
int      gCardX, gCardY, gCardW, gCardH, pzYChips, pzYTc, pzYFix, pzYButtons;

bool     gSkipOpen = false;
ulong    gSkipTick = 0;
string   gResult = "";                // the panel's result line

int ChartW() { return (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS); }
int ChartH() { return (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS); }

string SideWord(const int side) { return side > 0 ? "Buy" : "Sell"; }

string PriceStr(const string sym, const double p) { return DoubleToString(p, (int)SymbolInfoInteger(sym, SYMBOL_DIGITS)); }

string OrderLine(const string sym, const int side, const double size, const string type, const double price, const double sl)
  {
   string s = SideWord(side) + (type == "limit" ? " limit " : (type == "stop" ? " stop " : " ")) + DGFmtLots(size) + " " + sym;
   if(type != "market" && price > 0) s += " at " + PriceStr(sym, price);
   s += sl > 0 ? " · SL " + PriceStr(sym, sl) : " · No stop loss";
   return s;
  }

string TodayLine(const long now)
  {
   long t = gM.SafeNow(now);
   string s = "Trade " + IntegerToString(pzTradeNo) + " today";
   int idx[];
   gM.SortedCloses(idx);
   int streak = 0;
   long lastLoss = DG_NONE;
   for(int i = ArraySize(idx) - 1; i >= 0; i--)
     {
      int c = idx[i];
      if(gM.cT[c] > t) continue;
      if(gM.cNet[c] < 0) { if(lastLoss == DG_NONE) lastLoss = gM.cT[c]; }
      break;
     }
   for(int i = ArraySize(idx) - 1; i >= 0; i--)
     {
      int c = idx[i];
      if(gM.cT[c] > t) continue;
      if(gM.cNet[c] < 0) streak++;
      else break;
     }
   if(streak >= 2) s += " · " + IntegerToString(streak) + " losses in a row";
   if(lastLoss != DG_NONE && t - lastLoss < 3 * (long)DG_HOUR)
     {
      int mins = (int)((t - lastLoss) / DG_MIN);
      s += mins < 1 ? " · last loss just now" : " · last loss " + IntegerToString(mins) + " min ago";
     }
   if(pzTitle == "R8")
     {
      bool inL; double loss, lim; long until;
      if(gM.R8Status(gAcctId, t, inL, loss, lim, until)) s += " · Down " + DGFmtMoney(MathMax(0, loss)) + " today";
     }
   return s;
  }

/// Fills the order fields of the model. Returns the kind: entry, exit or unclassified.
string SetModelOrder(const string sym, const int side, const double size, const string type, const double price, const double sl)
  {
   gM.oPlat = "mt5"; gM.oAcct = gAcctId; gM.oSym = sym; gM.oSide = side; gM.oSize = size; gM.oType = type;
   gM.oHasSl = sl > 0; gM.oSl = sl;
   gM.oHasPrice = true;
   gM.oPrice = type == "market" ? (side > 0 ? SymbolInfoDouble(sym, SYMBOL_ASK) : SymbolInfoDouble(sym, SYMBOL_BID)) : price;
   SetOrderSpec(sym);
   double res, ns; bool rev;
   gM.oKind = gM.Classify(gAcctId, "mt5", IsNetting(), sym, side, size, true, res, ns, rev);
   return gM.oKind;
  }

void PauseTexts(const long now)
  {
   int nv = ArraySize(gM.vRule);
   ArrayResize(pzRules, nv);
   for(int i = 0; i < nv; i++) pzRules[i] = gM.vRule[i];
   pzTitle = gM.planTitle;
   pzHeadline = DGHeadline(gM, nv > 0 ? 0 : -1, now);
   pzOthers = "";
   for(int i = 1; i < nv && i <= 2; i++) pzOthers += (pzOthers == "" ? "Also: " : " · ") + DGRuleName(gM.vRule[i]);
   if(nv > 3) pzOthers += " · +" + IntegerToString(nv - 3) + " more";
   pzWayOut = DGWayOut(gM, nv > 0 ? 0 : -1, now);
   long t = gM.SafeNow(now);
   pzKept = gM.PlacedAnywayCount(t) == 0 ? "Today is a kept day so far." : "";
   pzSituation = "";
   if(pzReattempt >= 0) pzSituation = "You skipped this trade " + IntegerToString(pzReattempt) + " s ago.";
   int pend = gPJ.Get(gPJ.Root(), "pending");
   long first = LONG_MAX;
   for(int c = gPJ.First(pend); c >= 0; c = gPJ.Next(c)) first = MathMin(first, gPJ.Long(gPJ.Get(c, "effectiveAt"), LONG_MAX));
   if(first != LONG_MAX && first > now)
      pzSituation += (pzSituation == "" ? "" : " ") + "Your scheduled rule change starts " + DGFmtTime(gM, first, now) + ".";
   pzToday = TodayLine(now);
   pzOrderLine = OrderLine(pzSym, pzSide, pzSize, pzType, pzPrice, pzSl);
   pzGrow = gM.pGrowOn && pzPlaced > 0 && pzWait > gM.pWait
            ? "Wait today: " + IntegerToString(pzWait) + " s. It grows with each trade placed anyway and resets at your next trading day." : "";
   // Fix buttons: only when the fix is the only thing left (EXPERIENCE §9.1).
   pzFixSize = false; pzFixSl = false; pzFixLots = 0;
   if(pzPractice || nv == 0) return;
   bool allSize = true, allSl = true;
   double fix = DBL_MAX;
   for(int i = 0; i < nv; i++)
     {
      string r = gM.vRule[i];
      bool sizeFix = (r == "R5" || r == "R10" || (r == "R6" && !gM.vFixSl[i])) && gM.vHasFix[i];
      bool slFix = r == "R9" || (r == "R6" && gM.vFixSl[i]);
      if(!sizeFix) allSize = false; else fix = MathMin(fix, gM.vFixSize[i]);
      if(!slFix) allSl = false;
     }
   double vmin = SymbolInfoDouble(pzSym, SYMBOL_VOLUME_MIN);
   if(allSize && fix != DBL_MAX && fix >= vmin - 1e-9 && fix > 0) { pzFixSize = true; pzFixLots = fix; }
   else if(allSl) pzFixSl = true;
  }

//--- drawing -------------------------------------------------------------
int Para(DGSurface &c, const bool draw, const int y, const string text, const double px, const bool bold, const uint clr, const int pad)
  {
   if(text == "") return y;
   c.Font(px, bold);
   int w = gCardW - 2 * pad;
   return y + (draw ? c.Wrap(pad, y, w, text, clr) : c.WrapHeight(w, text));
  }

int PauseSecondsLeft()
  {
   long left = (long)pzWait * 1000 - (long)(GetTickCount64() - pzStartTick);
   return left <= 0 ? 0 : (int)((left + 999) / 1000);
  }

int CardLayout(const bool draw)
  {
   DGSurface *c = GetPointer(gCard);
   int pad = DGPx(22), gap = DGPx(10);
   int y = DGPx(18);
   if(draw)
     {
      c.Rect(0, 0, gCardW, gCardH, DGPal.surface, DGPal.border);
      c.Dot(pad + DGPx(4), y + DGPx(7), DGPx(4), DGPal.accent);
     }
   c.Font(11, true);
   string label = pzPractice ? "PRACTICE · NOTHING IS SENT" : (pzTitle == "CHECK" ? "PAUSE · YOUR PLAN" : "PAUSE · YOUR RULE");
   if(draw) c.Text(pad + DGPx(14), y, label, DGPal.muted);
   y += c.LineH() + gap;
   y = Para(gCard, draw, y, pzHeadline, 17, true, DGPal.text, pad) + gap;
   if(!pzCompact && pzOthers != "") y = Para(gCard, draw, y, pzOthers, 12, false, DGPal.muted, pad) + gap;
   int left = PauseSecondsLeft();
   if(pzWait > 0 && left > 0)
     {
      if(draw)
        {
         int bw = gCardW - 2 * pad;
         c.Rect(pad, y, bw, DGPx(4), DGPal.surface2);
         int done = (int)MathRound(bw * MathMin(1.0, (double)(GetTickCount64() - pzStartTick) / (pzWait * 1000.0)));
         if(done > 0) c.Rect(pad, y, done, DGPx(4), DGPal.accent);
        }
      y += DGPx(4) + gap;
     }
   if(!pzCompact)
     {
      y = Para(gCard, draw, y, pzWayOut, 13, false, DGPal.text, pad);
      if(pzWayOut != "") y += gap;
      y = Para(gCard, draw, y, pzKept, 12, false, DGPal.muted, pad);
      y = Para(gCard, draw, y, pzSituation, 12, false, DGPal.muted, pad);
      y = Para(gCard, draw, y, pzToday, 12, false, DGPal.faint, pad) + gap / 2;
      c.Font(12, true);
      int ow = MathMin(gCardW - 2 * pad, c.TextW(pzOrderLine) + DGPx(16));
      if(draw)
        {
         c.Rect(pad, y, ow, c.LineH() + DGPx(8), DGPal.surface2);
         c.Text(pad + DGPx(8), y + DGPx(4), pzOrderLine, DGPal.text);
        }
      y += c.LineH() + DGPx(8) + gap;
      y = Para(gCard, draw, y, pzGrow, 11, false, DGPal.muted, pad);
      if(!pzPractice) { pzYChips = y; y += 2 * DGPx(28) + DGPx(6) + gap; }
     }
   if(pzTc > 0)
     {
      pzYTc = y;
      c.Font(12);
      if(draw) c.Text(pad, y + DGPx(7), "Type " + IntegerToString(pzTc) + " to place trade " + IntegerToString(pzTc) + " today", DGPal.text);
      y += DGPx(30) + gap;
     }
   y = Para(gCard, draw, y, pzHint, 12, true, DGPal.amber, pad);
   if(pzHint != "") y += gap / 2;
   if(pzFixSize || pzFixSl) { pzYFix = y; y += DGPx(36) + gap / 2; }
   pzYButtons = y;
   y += DGPx(44) + gap;
   if(!pzCompact) y = Para(gCard, draw, y, DG_FOOTER, 11, false, DGPal.faint, pad);
   return y + DGPx(16);
  }

string PlaceLabel()
  {
   int left = PauseSecondsLeft();
   if(left > 0) return StringFormat("Place anyway · %d:%02d", left / 60, left % 60);
   return "Place " + SideWord(pzSide) + " " + DGFmtLots(pzSize) + " " + pzSym + " anyway";
  }

void PauseButtons()
  {
   int pad = DGPx(22), gap = DGPx(10);
   int bw = (gCardW - 2 * pad - gap) / 2;
   int x0 = gCardX + pad, y0 = gCardY;
   DGButton("PZ_SKIP", "Skip this trade", x0, y0 + pzYButtons, bw, DGPx(44), true, true, 40);
   bool unlocked = PauseSecondsLeft() == 0;
   DGButton("PZ_PLACE", PlaceLabel(), x0 + bw + gap, y0 + pzYButtons, bw, DGPx(44), false, unlocked, 40);
   if(pzFixSize) DGButton("PZ_FIX", "Place at " + DGFmtLots(pzFixLots) + " lots", x0, y0 + pzYFix, gCardW - 2 * pad, DGPx(34), false, true, 40);
   else if(pzFixSl) DGButton("PZ_FIX", "Add stop loss", x0, y0 + pzYFix, gCardW - 2 * pad, DGPx(34), false, true, 40);
   if(pzTc > 0) DGEdit("PZ_TC", "", gCardX + gCardW - pad - DGPx(90), y0 + pzYTc, DGPx(90), DGPx(28), 40);
   if(!pzCompact && !pzPractice)
     {
      int cw = (gCardW - 2 * pad - 2 * DGPx(6)) / 3;
      for(int i = 0; i < 6; i++)
        {
         int col = i % 3, row = i / 3;
         DGButton("PZ_CHIP" + IntegerToString(i), (pzChip == i ? "✓ " : "") + DGChips[i], x0 + col * (cw + DGPx(6)), y0 + pzYChips + row * (DGPx(28) + DGPx(6)), cw, DGPx(28), false, true, 40);
        }
     }
  }

void DrawPause()
  {
   if(!pzOpen) return;
   gCard.Open("PZ_CARD", gCardX, gCardY, gCardW, gCardH, 30);
   CardLayout(true);
   gCard.Flush();
  }

/// Opens the pause for the order already in the model (Evaluate and PlanPause done).
void OpenPause(const bool practice)
  {
   long now = NowMs();
   pzPractice = practice;
   pzOpen = true;
   gBridge.pauseOpen = true;
   pzId = NewId("pz");
   pzStartTick = GetTickCount64();
   pzUnlockTick = 0;
   pzWait = gM.planWait;
   pzTc = practice ? -1 : gM.planTypeConfirm;
   pzReattempt = practice ? -1 : gM.planReattempt;
   pzPlaced = gM.planPlaced;
   pzTradeNo = gM.planTradeNumber;
   pzChip = -1;
   pzHint = "";
   pzLastSec = -1;
   PauseTexts(now);
   // Recreate on top of everything else on the chart.
   DGRemovePrefix("PZ_");
   gBackdrop.Close(); gCard.Close();
   int cw = ChartW(), ch = ChartH();
   gCardW = MathMin(DGPx(500), cw - DGPx(24));
   pzCompact = cw < DGPx(440) || ch < DGPx(460);
   gBackdrop.Open("PZ_BACK", 0, 0, cw, ch, 25);
   gBackdrop.Rect(0, 0, cw, ch, DGPal.backdrop);
   gBackdrop.Flush();
   gCardH = 50;
   gCard.Open("PZ_CARD", 0, 0, gCardW, gCardH, 30);
   gCardH = CardLayout(false);
   if(gCardH > ch - DGPx(16) && !pzCompact) { pzCompact = true; gCardH = CardLayout(false); }
   gCardX = (cw - gCardW) / 2;
   gCardY = MathMax(DGPx(8), (ch - gCardH) / 2);
   DrawPause();
   PauseButtons();
   ChartRedraw();
  }

void ClosePause()
  {
   pzOpen = false;
   gBridge.pauseOpen = false;
   gBridge.Touch();
   DGRemovePrefix("PZ_");
   gCard.Close();
   gBackdrop.Close();
   ChartRedraw();
  }

/// Called by the timer: countdown, unlock, timeout.
void PauseTick()
  {
   if(!pzOpen) return;
   ulong el = GetTickCount64() - pzStartTick;
   if(el >= DG_PAUSE_TIMEOUT_MS) { DecidePause("timeout"); return; }
   int left = PauseSecondsLeft();
   if(left == 0 && pzUnlockTick == 0) pzUnlockTick = GetTickCount64();
   int sec = (int)(el / 1000);
   if(sec != pzLastSec)
     {
      pzLastSec = sec;
      DrawPause();
      DGButton("PZ_PLACE", PlaceLabel(), (int)ObjectGetInteger(0, DG_PFX + "PZ_PLACE", OBJPROP_XDISTANCE), (int)ObjectGetInteger(0, DG_PFX + "PZ_PLACE", OBJPROP_YDISTANCE),
               (int)ObjectGetInteger(0, DG_PFX + "PZ_PLACE", OBJPROP_XSIZE), DGPx(44), false, left == 0, 40);
      ChartRedraw();
     }
  }

//--- skip card (EXPERIENCE §9.3) -------------------------------------------
void OpenSkipCard(const bool kept)
  {
   gSkipOpen = true;
   gSkipTick = GetTickCount64();
   int cw = ChartW(), ch = ChartH();
   int w = MathMin(DGPx(420), cw - DGPx(24));
   int pad = DGPx(20);
   gSkipCard.Close();
   gSkipCard.Open("SK_CARD", 0, 0, w, 50, 30);
   string l1 = kept ? "Trade skipped. Today is still a kept day." : "Trade skipped.";
   gSkipCard.Font(15, true);
   int h = pad + gSkipCard.WrapHeight(w - 2 * pad, l1);
   int yb = h + DGPx(14);
   h = yb + DGPx(36) * 2 + DGPx(8) + pad;
   int x = (cw - w) / 2, y = MathMax(DGPx(8), (ch - h) / 2);
   gSkipCard.Open("SK_CARD", x, y, w, h, 30);
   gSkipCard.Rect(0, 0, w, h, DGPal.surface, DGPal.border);
   gSkipCard.Font(15, true);
   gSkipCard.Wrap(pad, pad, w - 2 * pad, l1, DGPal.text);
   gSkipCard.Flush();
   int bw = (w - 2 * pad - DGPx(8)) / 2;
   DGButton("SK_BREAK", "Take a 15-minute break", x + pad, y + yb, bw, DGPx(36), false, true, 40);
   DGButton("SK_DONE", "Done for today", x + pad + bw + DGPx(8), y + yb, bw, DGPx(36), false, true, 40);
   DGButton("SK_CLOSE", "Close", x + pad, y + yb + DGPx(44), w - 2 * pad, DGPx(36), false, true, 40);
   ChartRedraw();
  }

void CloseSkipCard()
  {
   gSkipOpen = false;
   DGRemovePrefix("SK_");
   gSkipCard.Close();
   ChartRedraw();
  }

void TakeBreak(const bool doneToday)
  {
   long now = NowMs();
   long until;
   if(doneToday)
     {
      BuildModel(now);
      until = gM.NextReset(gM.userResets, gM.SafeNow(now));
      if(until == LONG_MAX) return;
     }
   else until = now + 15 * (long)DG_MIN;
   DGJsonWriter w;
   EvBegin(w, doneToday ? "done_today" : "break", now, false);
   w.Long("until", until);
   Enqueue(w);
   BuildModel(now);
   gResult = doneToday ? "Done for today. Your trading day resets " + DGFmtTime(gM, until, now) + "." : "On a break until " + DGFmtTime(gM, until, now) + ".";
  }

//--- orders ------------------------------------------------------------------
/// Checks and sends a panel order. result gets the result line.
bool SendOrder(const string sym, const int side, double size, const string type, double price, double sl, double tp, string &result, string &ticket, bool &pending)
  {
   ticket = ""; pending = false;
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), vmax = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   size = DGFloorToStep(size, step);
   if(size < vmin - 1e-9) { result = "Not placed: size below the minimum " + DGFmtLots(vmin) + " lots"; return false; }
   if(size > vmax + 1e-9) { result = "Not placed: size above the maximum " + DGFmtLots(vmax) + " lots"; return false; }
   double ask = SymbolInfoDouble(sym, SYMBOL_ASK), bid = SymbolInfoDouble(sym, SYMBOL_BID);
   double ref = type == "market" ? (side > 0 ? ask : bid) : price;
   if(type != "market" && price <= 0) { result = "Not placed: enter a price for the " + type + " order"; return false; }
   price = NormalizeDouble(price, digits); sl = sl > 0 ? NormalizeDouble(sl, digits) : 0; tp = tp > 0 ? NormalizeDouble(tp, digits) : 0;
   double lvl = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) * point;
   if(sl > 0)
     {
      if((side > 0 && sl >= ref) || (side < 0 && sl <= ref)) { result = "Not placed: stop loss is on the wrong side of the price"; return false; }
      double exitRef = type == "market" ? (side > 0 ? bid : ask) : price;
      if(MathAbs(exitRef - sl) < lvl) { result = "Not placed: stop loss too close to price"; return false; }
     }
   if(tp > 0 && ((side > 0 && tp <= ref) || (side < 0 && tp >= ref))) { result = "Not placed: take profit is on the wrong side of the price"; return false; }
   gTrade.SetExpertMagicNumber((ulong)Magic());
   gTrade.SetTypeFillingBySymbol(sym);
   gTrade.SetAsyncMode(false);
   gTrade.SetDeviationInPoints(20);
   bool ok;
   if(type == "limit") ok = side > 0 ? gTrade.BuyLimit(size, price, sym, sl, tp, ORDER_TIME_GTC, 0, "") : gTrade.SellLimit(size, price, sym, sl, tp, ORDER_TIME_GTC, 0, "");
   else if(type == "stop") ok = side > 0 ? gTrade.BuyStop(size, price, sym, sl, tp, ORDER_TIME_GTC, 0, "") : gTrade.SellStop(size, price, sym, sl, tp, ORDER_TIME_GTC, 0, "");
   else ok = side > 0 ? gTrade.Buy(size, sym, 0, sl, tp, "") : gTrade.Sell(size, sym, 0, sl, tp, "");
   uint rc = gTrade.ResultRetcode();
   if(!ok || (rc != TRADE_RETCODE_DONE && rc != TRADE_RETCODE_PLACED && rc != TRADE_RETCODE_DONE_PARTIAL))
     {
      result = "Not placed: " + gTrade.ResultRetcodeDescription();
      return false;
     }
   if(type == "market")
     {
      ulong deal = gTrade.ResultDeal();
      ticket = deal > 0 ? "d" + IntegerToString((long)deal) : "o" + IntegerToString((long)gTrade.ResultOrder());
      double px = gTrade.ResultPrice() > 0 ? gTrade.ResultPrice() : ref;
      result = "Placed: " + SideWord(side) + " " + DGFmtLots(size) + " " + sym + " at " + PriceStr(sym, px);
     }
   else
     {
      pending = true;
      ticket = "o" + IntegerToString((long)gTrade.ResultOrder());
      result = "Placed: " + SideWord(side) + " " + type + " " + DGFmtLots(size) + " " + sym + " at " + PriceStr(sym, price);
     }
   return true;
  }

void PanelEntryEvent(const string ticket, const string sym, const int side, const double size, const bool pending, const string &rules[], const string pauseId)
  {
   DGJsonWriter w;
   EvBegin(w, "entry", NowMs());
   w.Str("ticket", ticket);
   w.Str("symbol", sym);
   w.Str("side", side > 0 ? "buy" : "sell");
   w.Num("size", size);
   w.Str("source", "panel");
   w.Str("label", "panel");
   w.Bool("pending", pending);
   w.BeginArr("violations");
   for(int i = 0; i < ArraySize(rules); i++) w.Str("", rules[i]);
   w.EndArr();
   if(pauseId != "") w.Str("pauseId", pauseId);
   Enqueue(w);
  }

void PauseEvent(const string decision, const bool sent, const string variant)
  {
   DGJsonWriter w;
   EvBegin(w, "pause", NowMs());
   w.Str("pauseId", pzId);
   w.BeginArr("rules");
   for(int i = 0; i < ArraySize(pzRules); i++) w.Str("", pzRules[i]);
   w.EndArr();
   w.Str("title", pzTitle);
   w.Str("decision", decision);
   w.Num("shownSec", MathRound((GetTickCount64() - pzStartTick) / 100.0) / 10.0);
   w.Long("waitSec", pzWait);
   w.Bool("typed", pzTc > 0 && decision == "place");
   if(decision == "place") w.Long("placedAnyway", pzPlaced + (sent ? 1 : 0));
   w.Bool("reattempt", pzReattempt >= 0);
   if(decision == "place" && pzUnlockTick > 0) w.Long("unlockToClickMs", (long)(GetTickCount64() - pzUnlockTick));
   w.Str("symbol", pzSym);
   w.Str("side", pzSide > 0 ? "buy" : "sell");
   w.Num("size", pzSize);
   w.Bool("sent", sent);
   if(pzChip >= 0) w.Str("reason", DGChipIds[pzChip]);
   if(variant != "") w.Str("variant", variant);
   Enqueue(w);
  }

/// skip | place | timeout | reinit | fix
void DecidePause(const string decision)
  {
   if(!pzOpen) return;
   if(pzPractice)
     {
      ClosePause();
      gResult = decision == "place" ? "Practice: nothing was sent." : "Practice pause closed.";
      return;
     }
   if(decision == "place")
     {
      if(PauseSecondsLeft() > 0) return;
      if(pzTc > 0 && StringTrimCopy(DGEditText("PZ_TC")) != IntegerToString(pzTc))
        {
         pzHint = "Type " + IntegerToString(pzTc) + " first.";
         DrawPause();
         ChartRedraw();
         return;
        }
      ClosePause();
      string result, ticket; bool pending;
      bool ok = SendOrder(pzSym, pzSide, pzSize, pzType, pzPrice, pzSl, pzTp, result, ticket, pending);
      gResult = result;
      PauseEvent("place", ok, "");
      if(ok) PanelEntryEvent(ticket, pzSym, pzSide, pzSize, pending, pzRules, pzId);
      return;
     }
   if(decision == "fix")
     {
      ClosePause();
      if(pzFixSl)
        {
         PauseEvent("skip", false, "fix_sl");
         gResult = "Add a stop loss, then place the trade again.";
         return;
        }
      PauseEvent("skip", false, "fix_size");
      // The smaller order must pass on its own.
      BuildModel(NowMs());
      SetModelOrder(pzSym, pzSide, pzFixLots, pzType, pzPrice, pzSl);
      gM.Evaluate(NowMs());
      if(ArraySize(gM.vRule) > 0) { gResult = "Not placed: " + DGHeadline(gM, 0, NowMs()); return; }
      string result, ticket; bool pending;
      string none[];
      if(SendOrder(pzSym, pzSide, pzFixLots, pzType, pzPrice, pzSl, pzTp, result, ticket, pending)) PanelEntryEvent(ticket, pzSym, pzSide, pzFixLots, pending, none, pzId);
      gResult = result;
      return;
     }
   // skip, timeout, reinit
   BuildModel(NowMs());
   bool kept = gM.PlacedAnywayCount(gM.SafeNow(NowMs())) == 0;
   PauseEvent(decision, false, "");
   bool card = decision == "skip" && gM.pSkipCard;
   ClosePause();
   if(decision == "timeout") gResult = "Pause closed after 2 minutes. Trade not placed.";
   else if(decision == "skip") gResult = "Trade skipped.";
   if(card) OpenSkipCard(kept);
  }

string StringTrimCopy(string s) { StringTrimLeft(s); StringTrimRight(s); return s; }

/// The practice pause: same layout, an example order, nothing sent or counted (EXPERIENCE §9.4).
void OpenPractice()
  {
   BuildModel(NowMs());
   pzSym = _Symbol; pzSide = 1; pzType = "market"; pzPrice = 0; pzTp = 0;
   pzSize = MathMax(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), 0.5);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   pzSl = bid > 0 ? bid - 100 * SymbolInfoDouble(_Symbol, SYMBOL_POINT) * 10 : 0;
   gM.ClearViolations();
   gM.planShow = true;
   gM.planTitle = "CHECK";
   gM.planWait = gCacheOk ? MathMax(3, gM.pWait) : 5;
   gM.planTypeConfirm = -1;
   gM.planReattempt = -1;
   gM.planPlaced = 0;
   gM.planTradeNumber = gCacheOk ? gM.EntriesToday(gM.SafeNow(NowMs())) + 1 : 1;
   OpenPause(true);
  }

#endif
