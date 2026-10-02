//+------------------------------------------------------------------+
//| AppPanel.mqh                                                     |
//| The panel (EXPERIENCE §7): connecting, setup checklist, order    |
//| entry with a risk calculator, status and result lines, details   |
//| and menu. Canvas text; native buttons and fields only.           |
//+------------------------------------------------------------------+
#ifndef DG_APPPANEL_MQH
#define DG_APPPANEL_MQH

#include "AppPause.mqh"

//--- remembered setup (panel.json)
string   gType = "market", gLots = "0.10", gRiskMode = "pct", gRisk = "0.5", gUnits = "pips", gSl = "", gTp = "", gPrice = "";
bool     gCollapsed = false, gDetails = false, gSetupDone = false;
int      gTheme = 0;

//--- modes
bool     gMenu = false;
string   gInfo = "";
string   gLastMode = "";
bool     gSetupSent = false;
ulong    gSetupShownTick = 0;

DGSurface gPanel;
int      gPX = 0, gPY = 0, gPW = 0, gPH = 0;
ENUM_BASE_CORNER gCorner = CORNER_RIGHT_UPPER;

void LoadPrefs()
  {
   DGJson j;
   if(!j.Parse(DGRead("panel.json"))) return;
   int r = j.Root();
   gType = j.Str(j.Get(r, "type"), gType); gLots = j.Str(j.Get(r, "lots"), gLots);
   gRiskMode = j.Str(j.Get(r, "riskMode"), gRiskMode); gRisk = j.Str(j.Get(r, "risk"), gRisk);
   gUnits = j.Str(j.Get(r, "units"), gUnits); gSl = j.Str(j.Get(r, "sl"), gSl); gTp = j.Str(j.Get(r, "tp"), gTp); gPrice = j.Str(j.Get(r, "price"), gPrice);
   gCollapsed = j.Bool(j.Get(r, "collapsed")); gDetails = j.Bool(j.Get(r, "details")); gSetupDone = j.Bool(j.Get(r, "setupDone"));
   gTheme = (int)j.Long(j.Get(r, "theme"), 0);
  }

void SavePrefs()
  {
   DGJsonWriter w;
   w.BeginObj();
   w.Str("type", gType); w.Str("lots", gLots); w.Str("riskMode", gRiskMode); w.Str("risk", gRisk);
   w.Str("units", gUnits); w.Str("sl", gSl); w.Str("tp", gTp); w.Str("price", gPrice);
   w.Bool("collapsed", gCollapsed); w.Bool("details", gDetails); w.Bool("setupDone", gSetupDone); w.Long("theme", gTheme);
   w.EndObj();
   DGWrite("panel.json", w.Text());
  }

void SaveEdits()
  {
   if(ObjectFind(0, DG_PFX + "P_LOTS") >= 0) gLots = StringTrimCopy(DGEditText("P_LOTS"));
   if(ObjectFind(0, DG_PFX + "P_RISK") >= 0) gRisk = StringTrimCopy(DGEditText("P_RISK"));
   if(ObjectFind(0, DG_PFX + "P_SL") >= 0) gSl = StringTrimCopy(DGEditText("P_SL"));
   if(ObjectFind(0, DG_PFX + "P_TP") >= 0) gTp = StringTrimCopy(DGEditText("P_TP"));
   if(ObjectFind(0, DG_PFX + "P_PRICE") >= 0) gPrice = StringTrimCopy(DGEditText("P_PRICE"));
  }

//--- setup checklist (SPEC §9.2, EXPERIENCE §7.4) ----------------------------
#define DG_CHECKS 6
string   gCheckName[DG_CHECKS] = {"Algo Trading", "DisciplineGuard app running", "Connected", "Rules loaded", "Account detected", "Quick-trade buttons on this chart"};
bool     gCheckOk[DG_CHECKS];
string   gCheckFix[DG_CHECKS];

bool RunChecks()
  {
   gCheckOk[0] = AlgoOk(); gCheckFix[0] = AlgoFix();
   gCheckOk[1] = gBridge.appAlive;
   gCheckFix[1] = "Open DisciplineGuard from the Start menu.";
   gCheckOk[2] = Linked() && !gAuthFail;
   gCheckFix[2] = gAuthFail || gBridge.appState == "signed_out" ? "Sign in to the DisciplineGuard app." : "Tick this MetaTrader in the DisciplineGuard app.";
   gCheckOk[3] = gCacheOk; gCheckFix[3] = gOffline ? "Can't reach DisciplineGuard. Check your internet." : "Loads after connecting.";
   gCheckOk[4] = gAcctState == "active";
   string acct = AccountInfoString(ACCOUNT_COMPANY) + " · " + AccountInfoString(ACCOUNT_SERVER) + " · …" + gLast3;
   gCheckFix[4] = gAcctState == "new" ? acct + ". Protect it?" : (gAcctState == "cap" ? acct + ". The free plan covers 1 account." : (gAcctState == "taken" ? acct + ". Protected under another login." : acct));
   gCheckOk[5] = !ChartGetInteger(0, CHART_SHOW_ONE_CLICK);
   gCheckFix[5] = "They place trades without a pause.";
   bool all = true;
   for(int i = 0; i < DG_CHECKS; i++) if(!gCheckOk[i]) all = false;
   return all;
  }

string PanelMode()
  {
   if(gMenu) return "menu";
   if(gInfo != "") return "info";
   if(!Linked()) return "connect";
   // The checklist only shows while something needs fixing.
   if(!gSetupDone && RunChecks()) { gSetupDone = true; SavePrefs(); }
   if(!gSetupDone) return "setup";
   return "trade";
  }

//--- drawing helpers -----------------------------------------------------------
int PText(const bool draw, const int x, const int y, const int w, const string text, const double px, const bool bold, const uint clr, const int minLines = 0, const int maxLines = 6)
  {
   gPanel.Font(px, bold);
   int lh = gPanel.LineH();
   int h = 0;
   if(text != "") h = draw ? gPanel.Wrap(x, y, w, text, clr, maxLines) : MathMin(gPanel.WrapHeight(w, text), maxLines * lh);
   return y + MathMax(h, minLines * lh);
  }

void Btn(const bool build, const string name, const string text, const int x, const int y, const int w, const int h, const bool primary = false, const bool enabled = true)
  {
   if(build) DGButton(name, text, gPX + x, gPY + y, w, h, primary, enabled, 20);
  }

void Toggle(const bool build, const string name, const string text, const int x, const int y, const int w, const int h, const bool on)
  {
   if(!build) return;
   DGButton(name, text, gPX + x, gPY + y, w, h, false, true, 20);
   if(on)
     {
      ObjectSetInteger(0, DG_PFX + name, OBJPROP_BGCOLOR, DGPal.cBorder);
      ObjectSetInteger(0, DG_PFX + name, OBJPROP_BORDER_COLOR, DGPal.cText);
     }
  }

void Field(const bool build, const bool draw, const string label, const string name, const string value, const int x, const int y, const int labelW, const int w)
  {
   if(draw) { gPanel.Font(11); gPanel.Text(x, y + DGPx(5), label, DGPal.muted); }
   if(build) DGEdit(name, value, gPX + x + labelW, gPY + y, w, DGPx(24), 20);
  }

string Banner()
  {
   if(gOutsideCard != "") return gOutsideCard;
   if(Linked() && gAcctState == "new") return "New account on this terminal: " + AccountInfoString(ACCOUNT_SERVER) + " …" + gLast3 + ". Protect it?";
   return "";
  }

string DetailLines(const long now)
  {
   if(!gCacheOk) return "";
   long t = gM.SafeNow(now);
   string s = "";
   long until;
   int c = gM.r7On ? gM.ActiveCooldown(t, until) : -1;
   s += c >= 0 && t < until ? "Cooldown until " + DGFmtTime(gM, until, now) : "No cooldown";
   int pend = gPJ.Get(gPJ.Root(), "pending");
   int np = gPJ.Size(pend);
   s += "\n" + (np == 0 ? "No scheduled changes" : IntegerToString(np) + " scheduled change" + (np == 1 ? "" : "s"));
   if(PBool("rules.closeOutside")) s += "\nOutside trades that go past a rule are closed";
   long nr = gM.NextReset(gM.userResets, t);
   if(nr != LONG_MAX) s += "\nNext reset " + DGFmtTime(gM, nr, now);
   if(PBool("setupMode")) s += "\nSetup mode: changes apply at once" + (PValid("lockAt") ? " until " + DGFmtTime(gM, PLong("lockAt"), now) : "");
   return s;
  }

//--- content ----------------------------------------------------------------------
int PanelContent(const bool draw, const bool build)
  {
   int W = gPW, pad = DGPx(12), gap = DGPx(8);
   int inner = W - 2 * pad;
   long now = NowMs();
   int y = DGPx(10);
   if(draw)
     {
      gPanel.Rect(0, 0, W, gPH, DGPal.surface, DGPal.border);
      gPanel.Dot(pad + DGPx(4), y + DGPx(8), DGPx(4), DGPal.accent);
      gPanel.Font(13, true);
      gPanel.Text(pad + DGPx(14), y, "DisciplineGuard", DGPal.text);
     }
   Btn(build, "P_MENU", gMenu ? "×" : "≡", W - pad - DGPx(28), DGPx(7), DGPx(28), DGPx(24));
   Btn(build, "P_COLL", gCollapsed ? "+" : "–", W - pad - DGPx(60), DGPx(7), DGPx(28), DGPx(24));
   y += DGPx(30);
   if(draw) gPanel.Dot(pad + DGPx(4), y + DGPx(8), DGPx(4), StatusColor());
   y = PText(draw, pad + DGPx(14), y, inner - DGPx(14), gStatusText, 11, false, DGPal.text, 2, 2) + DGPx(6);
   if(gCollapsed) return y + DGPx(4);

   string mode = PanelMode();
   string banner = mode == "trade" || mode == "setup" ? Banner() : "";
   if(banner != "")
     {
      int by = y;
      gPanel.Font(11);
      int bh = gPanel.WrapHeight(inner - DGPx(16), banner) + DGPx(12);
      bool protect = gOutsideCard == "" && gAcctState == "new";
      if(draw) gPanel.Rect(pad, by, inner, bh + (protect ? DGPx(32) : DGPx(30)), DGPal.surface2);
      PText(draw, pad + DGPx(8), by + DGPx(6), inner - DGPx(16), banner, 11, false, DGPal.text);
      if(protect) Btn(build, "P_PROTECT", "Protect", pad + DGPx(8), by + bh, DGPx(90), DGPx(26), true);
      else Btn(build, "P_BANNER_OK", "OK", pad + DGPx(8), by + bh, DGPx(60), DGPx(24));
      y = by + bh + DGPx(32) + gap;
     }

   if(mode == "menu")
     {
      string items[] = {"Practice pause", "Take a 15-minute break", "Done for today", "Hide quick-trade buttons on all charts", "Setup check", "Theme: ", "Help", "Report a problem"};
      string themes[] = {"Auto", "Light", "Dark"};
      for(int i = 0; i < ArraySize(items); i++)
        {
         string t = items[i] == "Theme: " ? "Theme: " + themes[gTheme] : items[i];
         Btn(build, "P_M" + IntegerToString(i), t, pad, y, inner, DGPx(26));
         y += DGPx(30);
        }
      return y + DGPx(6);
     }
   if(mode == "info")
     {
      y = PText(draw, pad, y, inner, gInfo, 12, false, DGPal.text, 0, 12) + gap;
      Btn(build, "P_BACK", "Back", pad, y, DGPx(80), DGPx(26));
      return y + DGPx(34);
     }
   if(mode == "connect")
     {
      // Nothing to type here: the Windows app connects this terminal (SPEC §9.5). The status line above already
      // says what to do, so this only explains what that means for orders.
      y = PText(draw, pad, y, inner, "Orders go through normally until connected.", 11, false, DGPal.muted) + gap;
      return y + DGPx(10);
     }
   if(mode == "setup")
     {
      bool all = RunChecks();
      for(int i = 0; i < DG_CHECKS; i++)
        {
         if(draw)
           {
            gPanel.Font(12, true);
            gPanel.Text(pad, y, gCheckOk[i] ? "✓" : "•", gCheckOk[i] ? DGPal.accent : DGPal.amber);
           }
         y = PText(draw, pad + DGPx(16), y, inner - DGPx(16), gCheckName[i], 12, true, DGPal.text);
         if(!gCheckOk[i] || i == 4) y = PText(draw, pad + DGPx(16), y, inner - DGPx(16), gCheckFix[i], 11, false, DGPal.muted, 0, 4);
         if(i == 5 && !gCheckOk[i]) { Btn(build, "P_HIDEQT", "Hide on all charts", pad + DGPx(16), y + DGPx(2), DGPx(150), DGPx(24)); y += DGPx(28); }
         y += DGPx(6);
        }
      y = PText(draw, pad, y, inner, "Trades placed around the panel (F9, one-click, phone) still count.", 11, false, DGPal.faint) + gap;
      if(all)
        {
         y = PText(draw, pad, y, inner, "On. Try a practice pause.", 13, true, DGPal.text) + gap;
         int bw = (inner - gap) / 2;
         Btn(build, "P_PRACTICE", "Practice pause", pad, y, bw, DGPx(30));
         Btn(build, "P_START", "Start trading", pad + bw + gap, y, bw, DGPx(30), true);
         y += DGPx(30) + gap;
        }
      else
        {
         Btn(build, "P_START", "Continue without it", pad, y, inner, DGPx(26));
         y += DGPx(26) + gap;
        }
      return y + DGPx(4);
     }

   //--- trade
   int tw = (inner - 2 * DGPx(6)) / 3;
   Toggle(build, "P_T_MARKET", "Market", pad, y, tw, DGPx(24), gType == "market");
   Toggle(build, "P_T_LIMIT", "Limit", pad + tw + DGPx(6), y, tw, DGPx(24), gType == "limit");
   Toggle(build, "P_T_STOP", "Stop", pad + 2 * (tw + DGPx(6)), y, tw, DGPx(24), gType == "stop");
   y += DGPx(24) + gap;
   int lw = DGPx(46);
   if(gType != "market") { Field(build, draw, "Price", "P_PRICE", gPrice, pad, y, lw, inner - lw); y += DGPx(24) + DGPx(6); }
   Field(build, draw, "Lots", "P_LOTS", gLots, pad, y, lw, DGPx(80));
   y += DGPx(24) + DGPx(6);
   Field(build, draw, "Risk", "P_RISK", gRisk, pad, y, lw, DGPx(64));
   Toggle(build, "P_RMODE", gRiskMode == "pct" ? "%" : AccountInfoString(ACCOUNT_CURRENCY), pad + lw + DGPx(68), y, DGPx(46), DGPx(24), false);
   Btn(build, "P_CALC", "Calc lots", pad + lw + DGPx(118), y, inner - lw - DGPx(118), DGPx(24));
   y += DGPx(24) + DGPx(6);
   int half = (inner - DGPx(52) - DGPx(6)) / 2;
   Field(build, draw, "SL", "P_SL", gSl, pad, y, DGPx(22), half - DGPx(22));
   Field(build, draw, "TP", "P_TP", gTp, pad + half + DGPx(6), y, DGPx(22), half - DGPx(22));
   Toggle(build, "P_UNITS", gUnits == "pips" ? "pips" : "price", W - pad - DGPx(52), y, DGPx(52), DGPx(24), false);
   y += DGPx(24) + gap;
   int bw = (inner - gap) / 2;
   Btn(build, "P_SELL", "Sell", pad, y, bw, DGPx(36));
   Btn(build, "P_BUY", "Buy", pad + bw + gap, y, bw, DGPx(36));
   y += DGPx(36) + DGPx(6);
   Btn(build, "P_CLOSEALL", "Close all on this symbol", pad, y, inner, DGPx(24));
   y += DGPx(24) + gap;
   y = PText(draw, pad, y, inner, gResult, 11, false, DGPal.text, 2, 2) + DGPx(4);
   Btn(build, "P_DETAILS", gDetails ? "Details ▴" : "Details ▾", pad, y, DGPx(90), DGPx(22));
   y += DGPx(22) + DGPx(4);
   if(gDetails)
     {
      string lines[];
      int n = StringSplit(DetailLines(now), '\n', lines);
      for(int i = 0; i < n; i++) y = PText(draw, pad, y, inner, lines[i], 11, false, DGPal.muted);
      y = PText(draw, pad, y, inner, "", 11, false, DGPal.muted, MathMax(0, 4 - n));
     }
   return y + DGPx(8);
  }

void PlacePanel()
  {
   int cw = ChartW(), ch = ChartH(), m = DGPx(10);
   gPX = (gCorner == CORNER_RIGHT_UPPER || gCorner == CORNER_RIGHT_LOWER) ? cw - gPW - m : m;
   gPY = (gCorner == CORNER_LEFT_LOWER || gCorner == CORNER_RIGHT_LOWER) ? ch - gPH - m : m + DGPx(14);
   if(gPX < 0) gPX = 0;
   if(gPY < 0) gPY = 0;
  }

void RenderPanel(bool rebuild)
  {
   gPW = DGPx(300);
   if(!gPanel.created) gPanel.Open("P_BG", 0, 0, gPW, 100, 10);
   int h = PanelContent(false, false);
   string mode = PanelMode() + (gCollapsed ? "c" : "");
   int oldX = gPX, oldY = gPY;
   if(h != gPH || gPW != gPanel.w || mode != gLastMode) rebuild = true;
   gPH = h;
   gLastMode = mode;
   PlacePanel();
   if(gPX != oldX || gPY != oldY) rebuild = true;
   if(rebuild)
     {
      SaveEdits();
      gPanel.Close();
      DGRemovePrefix("P_");
     }
   gPanel.Open("P_BG", gPX, gPY, gPW, gPH, 10);
   PanelContent(true, rebuild);
   gPanel.Flush();
   if(rebuild)
     {
      // The pause and the skip card stay on top.
      if(pzOpen) { gBackdrop.Close(); gCard.Close(); DGRemovePrefix("PZ_"); RelayoutPause(); }
      if(gSkipOpen) CloseSkipCard();
      UpdateSlLine();
     }
   ChartRedraw();
  }

/// Rebuilds the pause's objects without changing its state (chart resized, panel rebuilt).
void RelayoutPause()
  {
   int cw = ChartW(), ch = ChartH();
   gCardW = MathMin(DGPx(500), cw - DGPx(24));
   pzCompact = cw < DGPx(440) || ch < DGPx(460);
   gBackdrop.Open("PZ_BACK", 0, 0, cw, ch, 25);
   gBackdrop.Rect(0, 0, cw, ch, DGPal.backdrop);
   gBackdrop.Flush();
   gCard.Open("PZ_CARD", 0, 0, gCardW, 50, 30);
   gCardH = CardLayout(false);
   if(gCardH > ch - DGPx(16) && !pzCompact) { pzCompact = true; gCardH = CardLayout(false); }
   gCardX = (cw - gCardW) / 2;
   gCardY = MathMax(DGPx(8), (ch - gCardH) / 2);
   DrawPause();
   PauseButtons();
  }

//--- SL line (price mode) ---------------------------------------------------------
#define DG_SLLINE "DG_SLLINE"

void UpdateSlLine()
  {
   double v = StringToDouble(gSl);
   if(PanelMode() != "trade" || gCollapsed || gUnits != "price" || v <= 0) { ObjectDelete(0, DG_SLLINE); return; }
   if(ObjectFind(0, DG_SLLINE) < 0)
     {
      ObjectCreate(0, DG_SLLINE, OBJ_HLINE, 0, 0, v);
      ObjectSetInteger(0, DG_SLLINE, OBJPROP_COLOR, DGPal.cMuted);
      ObjectSetInteger(0, DG_SLLINE, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, DG_SLLINE, OBJPROP_SELECTABLE, true);
      ObjectSetInteger(0, DG_SLLINE, OBJPROP_SELECTED, true);
      ObjectSetInteger(0, DG_SLLINE, OBJPROP_HIDDEN, true);
      ObjectSetString(0, DG_SLLINE, OBJPROP_TOOLTIP, "Stop loss (drag to move)");
     }
   else ObjectSetDouble(0, DG_SLLINE, OBJPROP_PRICE, v);
  }

//--- order entry ----------------------------------------------------------------------
double Pip(const string sym)
  {
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double p = SymbolInfoDouble(sym, SYMBOL_POINT);
   return (d == 3 || d == 5) ? p * 10 : p;
  }

double EntryRef(const string sym, const int side)
  {
   if(gType != "market") return StringToDouble(gPrice);
   return side > 0 ? SymbolInfoDouble(sym, SYMBOL_ASK) : SymbolInfoDouble(sym, SYMBOL_BID);
  }

/// SL or TP as a price. isSl: below entry for buys; TP above.
double LevelPrice(const string sym, const int side, const string v, const bool isSl)
  {
   double x = StringToDouble(v);
   if(x <= 0) return 0;
   if(gUnits == "price") return x;
   double ref = EntryRef(sym, side);
   double d = x * Pip(sym);
   return isSl ? (side > 0 ? ref - d : ref + d) : (side > 0 ? ref + d : ref - d);
  }

void CalcLots()
  {
   SaveEdits();
   string sym = _Symbol;
   double r = StringToDouble(gRisk);
   double money = gRiskMode == "pct" ? AccountInfoDouble(ACCOUNT_BALANCE) * r / 100.0 : r;
   double slv = StringToDouble(gSl);
   if(money <= 0 || slv <= 0) { gResult = "Enter a risk and a stop loss to estimate the size."; return; }
   double mid = gType != "market" && StringToDouble(gPrice) > 0 ? StringToDouble(gPrice) : (SymbolInfoDouble(sym, SYMBOL_ASK) + SymbolInfoDouble(sym, SYMBOL_BID)) / 2;
   double dist = gUnits == "pips" ? slv * Pip(sym) : MathAbs(mid - slv);
   double tick = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv <= 0) tv = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   if(dist <= 0 || tick <= 0 || tv <= 0) { gResult = "Can't estimate the size for this symbol."; return; }
   double lots = DGFloorToStep(money / (dist / tick * tv), SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP));
   lots = MathMin(lots, SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX));
   gLots = DGFmtLots(lots);
   DGSetEditText("P_LOTS", gLots);
   gResult = "Lot size estimate: " + gLots + " lots. Check it before you trade.";
   SavePrefs();
  }

void TradeClick(const int side)
  {
   SaveEdits();
   SavePrefs();
   if(gBridge.ClickPossiblyDelayed())
     {
      DGJsonWriter w;
      EvBegin(w, "delayed_click", NowMs(), false);
      w.Long("ms", 0);
      Enqueue(w, false);
     }
   string sym = _Symbol;
   double size = StringToDouble(gLots);
   double price = gType == "market" ? 0 : StringToDouble(gPrice);
   double sl = LevelPrice(sym, side, gSl, true), tp = LevelPrice(sym, side, gTp, false);
   if(size <= 0) { gResult = "Not placed: enter a size in lots"; return; }
   if(!AlgoOk()) { gResult = "Not placed: " + AlgoFix(); return; }
   long now = NowMs();
   string rules[];
   if(Enforcing(now))
     {
      RefreshSnapshotFromDisk();
      BuildModel(now);
      string kind = SetModelOrder(sym, side, size, gType, price, sl);
      if(kind == "entry")
        {
         gM.Evaluate(now);
         gM.PlanPause(now);
         if(gM.planShow)
           {
            pzSym = sym; pzSide = side; pzSize = size; pzType = gType; pzPrice = price; pzSl = sl; pzTp = tp;
            OpenPause(false);
            return;
           }
        }
      string result, ticket; bool pending;
      bool ok = SendOrder(sym, side, size, gType, price, sl, tp, result, ticket, pending);
      gResult = result;
      if(ok && kind == "entry") PanelEntryEvent(ticket, sym, side, size, pending, rules, "");
      return;
     }
   string result, ticket; bool pending;
   SendOrder(sym, side, size, gType, price, sl, tp, result, ticket, pending);
   gResult = result;
  }

/// Exits are never paused (SPEC §1.3). Logged so the safety check can count them.
void CloseAll()
  {
   string sym = _Symbol;
   int closed = 0, failed = 0;
   string first = "", why = "";
   gTrade.SetExpertMagicNumber((ulong)Magic());
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || PositionGetString(POSITION_SYMBOL) != sym) continue;
      if(gTrade.PositionClose(tk)) { closed++; if(first == "") first = IntegerToString((long)tk); }
      else { failed++; why = gTrade.ResultRetcodeDescription(); }
     }
   if(closed == 0 && failed == 0) { gResult = "No open positions on " + sym + "."; return; }
   gResult = failed == 0 ? StringFormat("Closed %d position%s on %s.", closed, closed == 1 ? "" : "s", sym)
             : StringFormat("Closed %d, not closed %d: %s", closed, failed, why);
   if(closed > 0 && Linked())
     {
      DGJsonWriter w;
      EvBegin(w, "exit", NowMs());
      w.Str("ticket", "x" + first);
      w.Str("kind", "close_all");
      Enqueue(w);
     }
  }

void HideQuickTradeAll()
  {
   for(long c = ChartFirst(); c >= 0; c = ChartNext(c)) ChartSetInteger(c, CHART_SHOW_ONE_CLICK, false);
  }

//--- clicks -------------------------------------------------------------------------------
/// The help article for the current status (web/src/pages/Help.tsx).
string HelpSlug()
  {
   if(gStatusCode == "vps") return "vps";
   if(gStatusCode == "setting_up")
     {
      if(!gBridge.appAlive) return "open-app";
      if(gBridge.appState == "signed_out") return "sign-in-app";
      if(gBridge.appState == "not_protected") return "tick-terminal";
      return "connecting";
     }
   if(gStatusCode == "attention") return gAuthFail ? "sign-in-app" : "algo-trading";
   if(gStatusCode == "offline") return "offline";
   if(gStatusCode == "off")
     {
      if(gOffReason != "") return "signed-out";
      if(gCacheOk && !PBool("license.enforcing")) return "plan-ended";
      if(PlanExpired(NowMs())) return "cant-confirm-plan";
      if(gAcctState == "taken") return "account-taken";
      if(gAcctState == "cap" || gAcctState == "new") return "new-account";
      return "signed-out";
     }
   return gPrimary ? "outside-trades" : "panel-only";
  }

string HelpText()
  {
   return "Help: " + DG_SITE + "/help/" + HelpSlug() + "\n"
          "New trades from this panel can be paused. Closing, SL/TP and cancelling never are. "
          "Trades placed elsewhere (F9, one-click, phone) still count.";
  }

string ReportText()
  {
   return "Report it on the website (Account). Include: MT5 " + DG_VERSION + " · " + (gConn != "" ? gConn : "not connected") + " · " + gStatusCode + ".";
  }

void MenuClick(const int i)
  {
   gMenu = false;
   switch(i)
     {
      case 0: OpenPractice(); break;
      case 1: if(Linked()) TakeBreak(false); break;
      case 2: if(Linked()) TakeBreak(true); break;
      case 3: HideQuickTradeAll(); gResult = "Quick-trade buttons hidden on all charts."; break;
      case 4: gSetupDone = false; SavePrefs(); break;
      case 5: gTheme = (gTheme + 1) % 3; DGSetPalette(gTheme); SavePrefs(); break;
      case 6: gInfo = HelpText(); break;
      case 7: gInfo = ReportText(); break;
     }
  }

/// Returns true when the click was handled.
bool PanelClick(const string name)
  {
   if(StringFind(name, DG_PFX + "P_") != 0) return false;
   string n = StringSubstr(name, StringLen(DG_PFX));
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
   gBridge.Touch();
   gLastActive = GetTickCount64();
   if(pzOpen) return true;
   if(n == "P_MENU") { gMenu = !gMenu; gInfo = ""; }
   else if(n == "P_COLL") { gCollapsed = !gCollapsed; SavePrefs(); }
   else if(StringFind(n, "P_M") == 0 && StringLen(n) <= 5) MenuClick((int)StringToInteger(StringSubstr(n, 3)));
   else if(n == "P_BACK") gInfo = "";
   else if(n == "P_HIDEQT") HideQuickTradeAll();
   else if(n == "P_PRACTICE") OpenPractice();
   else if(n == "P_START") { gSetupDone = true; SavePrefs(); }
   else if(n == "P_PROTECT") { gProtect = true; gNextSync = 0; gResult = "Protecting this account…"; }
   else if(n == "P_BANNER_OK") gOutsideCard = "";
   else if(n == "P_T_MARKET") { SaveEdits(); gType = "market"; SavePrefs(); }
   else if(n == "P_T_LIMIT") { SaveEdits(); gType = "limit"; SavePrefs(); }
   else if(n == "P_T_STOP") { SaveEdits(); gType = "stop"; SavePrefs(); }
   else if(n == "P_RMODE") { SaveEdits(); gRiskMode = gRiskMode == "pct" ? "amt" : "pct"; SavePrefs(); }
   else if(n == "P_UNITS") { SaveEdits(); gUnits = gUnits == "pips" ? "price" : "pips"; gSl = ""; gTp = ""; SavePrefs(); }
   else if(n == "P_CALC") CalcLots();
   else if(n == "P_BUY") TradeClick(1);
   else if(n == "P_SELL") TradeClick(-1);
   else if(n == "P_CLOSEALL") CloseAll();
   else if(n == "P_DETAILS") { gDetails = !gDetails; SavePrefs(); }
   else return true;
   // A pause or a mode change redraws; the pause keeps its own objects on top.
   BuildModel(NowMs());
   ComputeStatus(NowMs());
   RenderPanel(true);
   return true;
  }

#endif
