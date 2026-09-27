//+------------------------------------------------------------------+
//| DG_Spike.mq5                                                     |
//| Throwaway Phase 0 spike, not product code.                        |
//| Answers SPEC §17: Q3 (DEAL_REASON), Q4 (WebRequest and push on    |
//| a prop-firm build), Q7 (WebRequest in OnDeinit), Q8 (how long     |
//| WebRequest blocks), plus the popup + Place anyway flow on MT5.    |
//| Everything is written to the Experts tab and to                   |
//| MQL5\Files\DG_spike_log.txt                                        |
//+------------------------------------------------------------------+
#property copyright "DisciplineGuard spike"
#property version   "0.01"

#include <Trade\Trade.mqh>

input int    InpWaitSeconds   = 5;                                   // Popup wait, seconds (0-60)
input double InpLots          = 0.01;                                // Default lots
input long   InpMagic         = 7700001;                             // Magic number for panel orders
input int    InpTimeoutMs     = 1500;                                // WebRequest timeout, ms
input string InpOkUrl         = "https://httpbin.org/get";           // Q4/Q8: normal request
input string InpSlowUrl       = "https://httpbin.org/delay/5";       // Q8: slow response
input string InpBlackholeUrl  = "http://10.255.255.1/";              // Q8: blackholed IP
input string InpDnsFailUrl    = "https://dg-spike-nope.invalid/";    // Q8: DNS failure
input string InpTlsStallUrl   = "https://127.0.0.1:8765/";           // Q8: TLS stall (run stall_server.py)
input string InpDisallowedUrl = "https://example.org/";              // Q8: NOT in the allowed list
input string InpDeinitUrl     = "https://httpbin.org/post";          // Q7: request made from OnDeinit
input bool   InpAutoTest      = false;                               // Run every test by itself, then remove the EA

CTrade g_trade;
const string PFX     = "DGS_";
const string LOGFILE = "DG_spike_log.txt";

bool   g_pauseOpen  = false;
int    g_side       = 0;      // 1 buy, -1 sell
double g_lots       = 0;
ulong  g_openedMs   = 0;
int    g_waitMs     = 0;
int    g_autoStep   = 0;
ulong  g_autoNextMs = 0;

//--- logging ---------------------------------------------------------
void Log(const string msg)
  {
   string line = TimeToString(TimeLocal(), TIME_DATE | TIME_SECONDS) + "  " + msg;
   Print(line);
   int h = FileOpen(LOGFILE, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ);
   if(h != INVALID_HANDLE)
     {
      FileSeek(h, 0, SEEK_END);
      FileWriteString(h, line + "\r\n");
      FileClose(h);
     }
  }

//--- drawing helpers -------------------------------------------------
int S(const int px) { return (int)MathRound(px * TerminalInfoInteger(TERMINAL_SCREEN_DPI) / 96.0); }

void Common(const string n, const int x, const int y)
  {
   ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, S(x));
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, S(y));
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
  }

void Rect(const string name, const int x, const int y, const int w, const int h, const color bg, const color border)
  {
   string n = PFX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   Common(n, x, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, S(w));
   ObjectSetInteger(0, n, OBJPROP_YSIZE, S(h));
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, n, OBJPROP_COLOR, border);
  }

void Label(const string name, const string text, const int x, const int y, const int size, const color clr)
  {
   string n = PFX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   Common(n, x, y);
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, "Segoe UI");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clr);
  }

void Button(const string name, const string text, const int x, const int y, const int w, const int h, const color bg, const color fg)
  {
   string n = PFX + name;
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   Common(n, x, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, S(w));
   ObjectSetInteger(0, n, OBJPROP_YSIZE, S(h));
   ObjectSetString(0, n, OBJPROP_TEXT, text);
   ObjectSetString(0, n, OBJPROP_FONT, "Segoe UI");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
  }

void Edit(const string name, const string text, const int x, const int y, const int w, const int h)
  {
   string n = PFX + name;
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
      ObjectSetString(0, n, OBJPROP_TEXT, text);
     }
   Common(n, x, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, S(w));
   ObjectSetInteger(0, n, OBJPROP_YSIZE, S(h));
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_CENTER);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, clrWhite);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clrBlack);
  }

void Status(const string text) { ObjectSetString(0, PFX + "status", OBJPROP_TEXT, text); }

//--- panel -----------------------------------------------------------
void DrawPanel()
  {
   Rect("bg", 10, 30, 230, 160, C'30,34,45', C'60,64,75');
   Label("title", "DG spike panel", 20, 38, 10, clrWhite);
   Label("lotslbl", "Lots", 20, 68, 9, clrSilver);
   Edit("lots", DoubleToString(InpLots, 2), 70, 64, 80, 24);
   Button("buy", "Buy", 20, 96, 100, 30, C'38,166,154', clrWhite);
   Button("sell", "Sell", 130, 96, 100, 30, C'239,83,80', clrWhite);
   Button("net", "Net tests", 20, 134, 100, 24, C'70,74,85', clrWhite);
   Button("push", "Push test", 130, 134, 100, 24, C'70,74,85', clrWhite);
   Label("status", "Ready", 20, 166, 8, clrSilver);
   ChartRedraw();
  }

//--- the popup -------------------------------------------------------
void DrawPause()
  {
   string side = g_side > 0 ? "Buy" : "Sell";
   Rect("p_bg", 250, 30, 340, 170, C'245,246,248', C'200,200,205');
   Label("p_label", "PAUSE  ·  SPIKE", 266, 42, 8, clrGray);
   Label("p_head", "Check your plan before this trade.", 266, 60, 12, clrBlack);
   Label("p_order", side + " " + DoubleToString(g_lots, 2) + " " + _Symbol, 266, 88, 9, clrDimGray);
   Label("p_wait", "", 266, 110, 9, clrDimGray);
   Button("skip", "Skip this trade", 266, 146, 150, 36, C'41,98,255', clrWhite);
   Button("place", "Place anyway", 426, 146, 150, 36, C'215,215,220', clrGray);
   UpdatePause();
  }

void RemovePause() { ObjectsDeleteAll(0, PFX + "p_"); ObjectDelete(0, PFX + "skip"); ObjectDelete(0, PFX + "place"); ChartRedraw(); }

void UpdatePause()
  {
   if(!g_pauseOpen)
      return;
   long elapsed = (long)(GetTickCount64() - g_openedMs);
   long left = g_waitMs - elapsed;
   if(left > 0)
     {
      ObjectSetString(0, PFX + "p_wait", OBJPROP_TEXT, "Place anyway unlocks in " + IntegerToString((left + 999) / 1000) + " s");
      ObjectSetInteger(0, PFX + "place", OBJPROP_BGCOLOR, C'215,215,220');
      ObjectSetInteger(0, PFX + "place", OBJPROP_COLOR, clrGray);
     }
   else
     {
      ObjectSetString(0, PFX + "p_wait", OBJPROP_TEXT, "You can place it now if you still want to.");
      ObjectSetInteger(0, PFX + "place", OBJPROP_BGCOLOR, C'60,64,75');
      ObjectSetInteger(0, PFX + "place", OBJPROP_COLOR, clrWhite);
     }
   if(elapsed > 120000)
      ClosePause("timeout");
   ChartRedraw();
  }

void OpenPause(const int side)
  {
   if(g_pauseOpen)
     {
      Log("Click ignored: a pause is already open");
      return;
     }
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double lots = StringToDouble(ObjectGetString(0, PFX + "lots", OBJPROP_TEXT));
   if(step > 0)
      lots = MathFloor(lots / step + 1e-9) * step;
   if(lots < SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN))
     {
      Status("Lots below the symbol minimum");
      return;
     }
   g_side = side;
   g_lots = lots;
   g_waitMs = MathMax(0, MathMin(60, InpWaitSeconds)) * 1000;
   g_openedMs = GetTickCount64();
   g_pauseOpen = true;
   DrawPause();
   Log("PAUSE open: " + (side > 0 ? "Buy " : "Sell ") + DoubleToString(lots, 2) + " " + _Symbol + ", wait " + IntegerToString(g_waitMs) + " ms");
  }

void ClosePause(const string decision)
  {
   if(!g_pauseOpen)
      return;
   Log("PAUSE close: " + decision + " after " + IntegerToString((long)(GetTickCount64() - g_openedMs)) + " ms");
   g_pauseOpen = false;
   RemovePause();
   Status("Last: " + decision);
  }

void TryPlace()
  {
   if(!g_pauseOpen)
      return;
   long elapsed = (long)(GetTickCount64() - g_openedMs);
   if(elapsed < g_waitMs)
     {
      Log("Place anyway clicked at " + IntegerToString(elapsed) + " ms, before unlock: ignored");
      return;
     }
   int side = g_side;
   double lots = g_lots;
   ClosePause("place");
   g_trade.SetExpertMagicNumber((ulong)InpMagic);
   ulong t0 = GetTickCount64();
   bool ok = side > 0 ? g_trade.Buy(lots, _Symbol, 0, 0, 0, "DG spike")
                      : g_trade.Sell(lots, _Symbol, 0, 0, 0, "DG spike");
   long dt = (long)(GetTickCount64() - t0);
   string res = (ok ? "Placed" : "Not placed") + ": retcode " + IntegerToString(g_trade.ResultRetcode()) + " "
                + g_trade.ResultRetcodeDescription() + ", deal " + IntegerToString((long)g_trade.ResultDeal())
                + ", price " + DoubleToString(g_trade.ResultPrice(), _Digits) + ", send took " + IntegerToString(dt) + " ms";
   Log("ORDER " + res);
   Status(ok ? "Placed" : "Not placed: " + g_trade.ResultRetcodeDescription());
  }

//--- Q4 / Q8: network ------------------------------------------------
void TimedRequest(const string label, const string method, const string url, const int timeoutMs)
  {
   char data[];
   char result[];
   string resHeaders;
   if(method == "POST")
     {
      uchar body[];
      int n = StringToCharArray("{\"spike\":true}", body, 0, WHOLE_ARRAY, CP_UTF8) - 1; // drop the trailing zero
      ArrayResize(data, n);
      for(int i = 0; i < n; i++)
         data[i] = (char)body[i];
     }
   ResetLastError();
   ulong t0 = GetTickCount64();
   int code = WebRequest(method, url, "Content-Type: application/json\r\n", timeoutMs, data, result, resHeaders);
   long dt = (long)(GetTickCount64() - t0);
   int err = GetLastError();
   Log("NET " + label + " | " + method + " " + url + " | timeout " + IntegerToString(timeoutMs)
       + " ms | blocked " + IntegerToString(dt) + " ms | http " + IntegerToString(code) + " | error " + IntegerToString(err));
  }

void RunNetTests()
  {
   Status("Running net tests (chart freezes)...");
   ChartRedraw();
   Log("---- Net tests start ----");
   TimedRequest("ok", "GET", InpOkUrl, InpTimeoutMs);
   TimedRequest("slow response", "GET", InpSlowUrl, InpTimeoutMs);
   TimedRequest("blackholed IP", "GET", InpBlackholeUrl, InpTimeoutMs);
   TimedRequest("DNS failure", "GET", InpDnsFailUrl, InpTimeoutMs);
   TimedRequest("TLS stall", "GET", InpTlsStallUrl, InpTimeoutMs);
   TimedRequest("not allowed", "GET", InpDisallowedUrl, InpTimeoutMs);
   Log("---- Net tests end ----");
   Status("Net tests done. See log.");
  }

void PushTest()
  {
   Log("Push: notifications enabled in terminal = " + (TerminalInfoInteger(TERMINAL_NOTIFICATIONS_ENABLED) ? "yes" : "no"));
   ResetLastError();
   bool ok = SendNotification("DisciplineGuard spike: push test");
   Log("Push: SendNotification " + (ok ? "ok" : "failed") + ", error " + IntegerToString(GetLastError()));
   Status(ok ? "Push sent. Check your phone." : "Push failed. See log.");
  }

//--- events ----------------------------------------------------------
int OnInit()
  {
   string login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   Log("==== DG spike start ====");
   Log("Terminal: " + TerminalInfoString(TERMINAL_NAME) + " | " + TerminalInfoString(TERMINAL_COMPANY)
       + " | build " + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + " | DPI " + IntegerToString(TerminalInfoInteger(TERMINAL_SCREEN_DPI)));
   Log("Account: " + AccountInfoString(ACCOUNT_COMPANY) + " | " + AccountInfoString(ACCOUNT_SERVER)
       + " | ..." + StringSubstr(login, MathMax(0, StringLen(login) - 3)));
   Log("Trade allowed: terminal " + (TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ? "yes" : "no")
       + ", this EA " + (MQLInfoInteger(MQL_TRADE_ALLOWED) ? "yes" : "no")
       + ", account allows EAs " + (AccountInfoInteger(ACCOUNT_TRADE_EXPERT) ? "yes" : "no"));
   DrawPanel();
   g_autoNextMs = GetTickCount64() + 3000;
   EventSetMillisecondTimer(200);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Log("DEINIT reason " + IntegerToString(reason) + " (1 remove, 3 chart change, 4 chart close, 5 inputs, 7 template, 9 terminal close)");
   // Q7: can a request still complete while the EA is being removed?
   if(reason == REASON_PROGRAM || reason == REASON_REMOVE || reason == REASON_CHARTCLOSE || reason == REASON_TEMPLATE || reason == REASON_CLOSE)
      TimedRequest("Q7 OnDeinit", "POST", InpDeinitUrl, 1000);
   ObjectsDeleteAll(0, PFX);
   ChartRedraw();
  }

// Self-test: net tests, popup with an early and an on-time Place anyway, push, then remove (Q7).
void AutoTest()
  {
   if(GetTickCount64() < g_autoNextMs)
      return;
   switch(g_autoStep++)
     {
      case 0: Log("AUTO: start"); RunNetTests(); break;
      case 1: OpenPause(1); break;
      case 2: TryPlace(); break;                                  // before unlock: must be ignored
      case 3: g_autoNextMs = GetTickCount64() + g_waitMs + 300; return;
      case 4: TryPlace(); break;                                  // after unlock: sends the order
      case 5: PushTest(); break;
      case 6: Log("AUTO: done, removing EA (Q7)"); ExpertRemove(); break;
     }
   g_autoNextMs = GetTickCount64() + 1500;
  }

void OnTimer()
  {
   UpdatePause();
   if(InpAutoTest && g_autoStep <= 6)
      AutoTest();
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id == CHARTEVENT_OBJECT_CLICK && StringFind(sparam, PFX) == 0)
     {
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      string n = StringSubstr(sparam, StringLen(PFX));
      if(n == "buy")
         OpenPause(1);
      else if(n == "sell")
         OpenPause(-1);
      else if(n == "skip")
         ClosePause("skip");
      else if(n == "place")
         TryPlace();
      else if(n == "net")
         RunNetTests();
      else if(n == "push")
         PushTest();
      ChartRedraw();
     }
   else if(id == CHARTEVENT_KEYDOWN && g_pauseOpen && lparam == 27) // Esc skips
      ClosePause("skip (Esc)");
  }

// Q3: which source does MT5 report for each deal? Place trades from this panel,
// the desktop one-click buttons, the phone app and the web terminal.
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;
   if(!HistoryDealSelect(trans.deal))
     {
      Log("Q3 deal " + IntegerToString((long)trans.deal) + " could not be selected");
      return;
     }
   ENUM_DEAL_ENTRY  entry  = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   ENUM_DEAL_REASON reason = (ENUM_DEAL_REASON)HistoryDealGetInteger(trans.deal, DEAL_REASON);
   ENUM_DEAL_TYPE   type   = (ENUM_DEAL_TYPE)HistoryDealGetInteger(trans.deal, DEAL_TYPE);
   Log("Q3 deal #" + IntegerToString((long)trans.deal) + " " + HistoryDealGetString(trans.deal, DEAL_SYMBOL)
       + " " + EnumToString(type) + " " + DoubleToString(HistoryDealGetDouble(trans.deal, DEAL_VOLUME), 2)
       + " | " + EnumToString(entry) + " | " + EnumToString(reason)
       + " | magic " + IntegerToString(HistoryDealGetInteger(trans.deal, DEAL_MAGIC)));
  }
//+------------------------------------------------------------------+
