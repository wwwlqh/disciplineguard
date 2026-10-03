//+------------------------------------------------------------------+
//| AppPanel.mqh                                                     |
//| The panel (EXPERIENCE §7): connecting, setup checklist, today's  |
//| counts, rule-break card, break and done-for-today, details and   |
//| menu. Trades are placed the usual way in MetaTrader; this panel  |
//| never places, holds or closes one. Canvas text; native buttons.  |
//+------------------------------------------------------------------+
#ifndef DG_APPPANEL_MQH
#define DG_APPPANEL_MQH

#include "AppTrades.mqh"

//--- remembered view (panel.json)
bool     gCollapsed = false, gDetails = false, gSetupDone = false;
int      gTheme = 0;

//--- modes
bool     gMenu = false;
string   gInfo = "";
string   gLastMode = "";
string   gResult = "";                // the panel's result line, e.g. "On a break until 10:30."

DGSurface gPanel;
int      gPX = 0, gPY = 0, gPW = 0, gPH = 0;
ENUM_BASE_CORNER gCorner = CORNER_RIGHT_UPPER;

int ChartW() { return (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS); }
int ChartH() { return (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS); }

void LoadPrefs()
  {
   DGJson j;
   if(!j.Parse(DGRead("panel.json"))) return;
   int r = j.Root();
   gCollapsed = j.Bool(j.Get(r, "collapsed")); gDetails = j.Bool(j.Get(r, "details")); gSetupDone = j.Bool(j.Get(r, "setupDone"));
   gTheme = (int)j.Long(j.Get(r, "theme"), 0);
  }

void SavePrefs()
  {
   DGJsonWriter w;
   w.BeginObj();
   w.Bool("collapsed", gCollapsed); w.Bool("details", gDetails); w.Bool("setupDone", gSetupDone); w.Long("theme", gTheme);
   w.EndObj();
   DGWrite("panel.json", w.Text());
  }

//--- setup checklist (SPEC §9.2, EXPERIENCE §7.4) ----------------------------
#define DG_CHECKS 4
string   gCheckName[DG_CHECKS] = {"DisciplineGuard app running", "Connected", "Rules loaded", "Account detected"};
bool     gCheckOk[DG_CHECKS];
string   gCheckFix[DG_CHECKS];

bool RunChecks()
  {
   gCheckOk[0] = gBridge.appAlive;
   gCheckFix[0] = "Open DisciplineGuard from the Start menu.";
   gCheckOk[1] = Linked() && !gAuthFail;
   gCheckFix[1] = gAuthFail || gBridge.appState == "signed_out" ? "Sign in to the DisciplineGuard app." : "Tick this MetaTrader in the DisciplineGuard app.";
   gCheckOk[2] = gCacheOk; gCheckFix[2] = gOffline ? "Can't reach DisciplineGuard. Check your internet." : "Loads after connecting.";
   gCheckOk[3] = gAcctState == "active";
   string acct = AccountInfoString(ACCOUNT_COMPANY) + " · " + AccountInfoString(ACCOUNT_SERVER) + " · …" + gLast3;
   gCheckFix[3] = gAcctState == "new" ? acct + ". Count it?" : (gAcctState == "cap" ? acct + ". The free plan covers 1 account." : (gAcctState == "taken" ? acct + ". Counted under another login." : acct));
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
   return "status";
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

string Banner()
  {
   if(gBreakCard != "") return gBreakCard;
   if(Linked() && gAcctState == "new") return "New account on this terminal: " + AccountInfoString(ACCOUNT_SERVER) + " …" + gLast3 + ". Count its trades?";
   return "";
  }

/// Today's numbers, one per line.
string TodayLines(const long now)
  {
   if(!gCacheOk || !Enforcing(now)) return "";
   long t = gM.SafeNow(now);
   int n = gM.EntriesToday(t);
   string s = gM.r1On ? StringFormat("Trades today: %d of %d", n, gM.r1Max) : StringFormat("Trades today: %d", n);
   bool inL; double loss, lim; long until;
   if(gM.r8On && gM.R8Status(gAcctId, t, inL, loss, lim, until) && lim > 0)
      s += "\n" + (inL ? "Daily loss limit reached" : "Loss today: " + DGFmtMoney(MathMax(0, loss)) + " of " + DGFmtMoney(lim));
   long cdUntil;
   if(gM.r7On && gM.ActiveCooldown(t, cdUntil) >= 0 && t < cdUntil) s += "\nCooldown until " + DGFmtTime(gM, cdUntil, now);
   if(gM.doneUntil != DG_NONE && t < gM.doneUntil) s += "\nDone for today";
   else if(gM.breakUntil != DG_NONE && t < gM.breakUntil) s += "\nOn a break until " + DGFmtTime(gM, gM.breakUntil, now);
   return s;
  }

string DetailLines(const long now)
  {
   if(!gCacheOk) return "";
   long t = gM.SafeNow(now);
   string s = "Every trade on this account counts: this terminal, F9, one-click, phone and web terminal.";
   int pend = gPJ.Get(gPJ.Root(), "pending");
   int np = gPJ.Size(pend);
   s += "\n" + (np == 0 ? "No scheduled changes" : IntegerToString(np) + " scheduled change" + (np == 1 ? "" : "s"));
   long nr = gM.NextReset(gM.userResets, t);
   if(nr != LONG_MAX) s += "\nNext reset " + DGFmtTime(gM, nr, now);
   if(PBool("setupMode")) s += "\nSetup mode: changes apply at once" + (PValid("lockAt") ? " until " + DGFmtTime(gM, PLong("lockAt"), now) : "");
   return s;
  }

int Lines(const bool draw, int y, const int x, const int w, const string text, const double px, const uint clr)
  {
   string lines[];
   int n = StringSplit(text, '\n', lines);
   for(int i = 0; i < n; i++) y = PText(draw, x, y, w, lines[i], px, false, clr);
   return y;
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
   string banner = mode == "status" || mode == "setup" ? Banner() : "";
   if(banner != "")
     {
      int by = y;
      gPanel.Font(11);
      int bh = gPanel.WrapHeight(inner - DGPx(16), banner) + DGPx(12);
      bool protect = gBreakCard == "" && gAcctState == "new";
      if(draw) gPanel.Rect(pad, by, inner, bh + DGPx(32), DGPal.surface2);
      PText(draw, pad + DGPx(8), by + DGPx(6), inner - DGPx(16), banner, 11, false, DGPal.text);
      if(protect) Btn(build, "P_PROTECT", "Count it", pad + DGPx(8), by + bh, DGPx(90), DGPx(26), true);
      else Btn(build, "P_BANNER_OK", "OK", pad + DGPx(8), by + bh, DGPx(60), DGPx(24));
      y = by + bh + DGPx(32) + gap;
     }

   if(mode == "menu")
     {
      string items[] = {"Take a 15-minute break", "Done for today", "Setup check", "Theme: ", "Help", "Report a problem"};
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
      // Nothing to type here: the Windows app connects this terminal (SPEC §9.5).
      y = PText(draw, pad, y, inner, "Trades aren't counted until connected.", 11, false, DGPal.muted) + gap;
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
         if(!gCheckOk[i] || i == 3) y = PText(draw, pad + DGPx(16), y, inner - DGPx(16), gCheckFix[i], 11, false, DGPal.muted, 0, 4);
         y += DGPx(6);
        }
      if(all) y = PText(draw, pad, y, inner, "On. Every trade on this account is counted.", 13, true, DGPal.text) + gap;
      Btn(build, "P_START", all ? "Done" : "Continue without it", pad, y, inner, DGPx(26), all);
      return y + DGPx(26) + gap + DGPx(4);
     }

   //--- status
   string today = TodayLines(now);
   if(today != "") y = Lines(draw, y, pad, inner, today, 12, DGPal.text) + gap;
   if(Enforcing(now))
     {
      int bw = (inner - gap) / 2;
      Btn(build, "P_BREAK", "15 min break", pad, y, bw, DGPx(28));
      Btn(build, "P_DONE", "Done for today", pad + bw + gap, y, bw, DGPx(28));
      y += DGPx(28) + gap;
     }
   if(gResult != "") y = PText(draw, pad, y, inner, gResult, 11, false, DGPal.muted, 0, 2) + DGPx(4);
   Btn(build, "P_DETAILS", gDetails ? "Details ▴" : "Details ▾", pad, y, DGPx(90), DGPx(22));
   y += DGPx(22) + DGPx(4);
   if(gDetails) y = Lines(draw, y, pad, inner, DetailLines(now), 11, DGPal.muted);
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
   gPW = DGPx(280);
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
      gPanel.Close();
      DGRemovePrefix("P_");
     }
   gPanel.Open("P_BG", gPX, gPY, gPW, gPH, 10);
   PanelContent(true, rebuild);
   gPanel.Flush();
   ChartRedraw();
  }

//--- break and done for today (EXPERIENCE §6.3) ----------------------------------------
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
   gResult = doneToday ? "Done for today. A trade before " + DGFmtTime(gM, until, now) + " is marked as past your rule."
             : "On a break until " + DGFmtTime(gM, until, now) + ". A trade before then is marked as past your rule.";
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
   if(gStatusCode == "attention") return "sign-in-app";
   if(gStatusCode == "offline") return "offline";
   if(gStatusCode == "off")
     {
      if(gOffReason != "") return "signed-out";
      if(PlanExpired(NowMs())) return "cant-confirm-plan";
      if(gAcctState == "taken") return "account-taken";
      if(gAcctState == "cap" || gAcctState == "new") return "new-account";
      return "signed-out";
     }
   return "counting";
  }

string HelpText()
  {
   return "Help: " + DG_SITE + "/help/" + HelpSlug() + "\n"
          "Every trade on this account is counted against your rules: this terminal, F9, one-click, phone and web terminal. "
          "Nothing is ever paused or closed. A trade that goes past a rule is marked.";
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
      case 0: if(Linked()) TakeBreak(false); break;
      case 1: if(Linked()) TakeBreak(true); break;
      case 2: gSetupDone = false; SavePrefs(); break;
      case 3: gTheme = (gTheme + 1) % 3; DGSetPalette(gTheme); SavePrefs(); break;
      case 4: gInfo = HelpText(); break;
      case 5: gInfo = ReportText(); break;
     }
  }

/// Returns true when the click was handled.
bool PanelClick(const string name)
  {
   if(StringFind(name, DG_PFX + "P_") != 0) return false;
   string n = StringSubstr(name, StringLen(DG_PFX));
   ObjectSetInteger(0, name, OBJPROP_STATE, false);
   gBridge.Touch();
   if(n == "P_MENU") { gMenu = !gMenu; gInfo = ""; }
   else if(n == "P_COLL") { gCollapsed = !gCollapsed; SavePrefs(); }
   else if(StringFind(n, "P_M") == 0 && StringLen(n) <= 5) MenuClick((int)StringToInteger(StringSubstr(n, 3)));
   else if(n == "P_BACK") gInfo = "";
   else if(n == "P_START") { gSetupDone = true; SavePrefs(); }
   else if(n == "P_PROTECT") { gProtect = true; gNextSync = 0; gResult = "Counting this account…"; }
   else if(n == "P_BANNER_OK") gBreakCard = "";
   else if(n == "P_BREAK") TakeBreak(false);
   else if(n == "P_DONE") TakeBreak(true);
   else if(n == "P_DETAILS") { gDetails = !gDetails; SavePrefs(); }
   else return true;
   BuildModel(NowMs());
   ComputeStatus(NowMs());
   RenderPanel(true);
   return true;
  }

#endif
